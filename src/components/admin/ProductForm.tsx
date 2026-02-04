// src/components/admin/ProductForm.tsx

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

import {
  addProductWithFirstRound,
  addNewSalesRound,
  searchProductsByName,
  getProductById,
  updateSalesRound,
  updateProductCoreInfo,
  functions,
  getReservedQuantitiesMap,
  uploadImages,
} from '@/firebase';

import { httpsCallable } from 'firebase/functions';

import type {
  StorageType,
  Product,
  SalesRound,
  SalesRoundStatus,
  VariantGroup,
  ProductItem,
  LoyaltyTier,
  SourceType,
} from '@/shared/types';

import {
  Save,
  PlusCircle,
  X,
  Package,
  Box,
  SlidersHorizontal,
  Trash2,
  Info,
  FileText,
  Clock,
  AlertTriangle,
  Loader2,
  Gift,
} from 'lucide-react';

import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';

import SodomallLoader from '@/components/common/SodomallLoader';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import ProductFormWizard from './ProductFormWizard';
import ProductPreview from './ProductPreview';
import { useAutoSave } from '@/hooks/useAutoSave';
import { validateProductForm, getFieldError } from '@/utils/formValidation';
import useCategories from '@/hooks/useCategories';

import '@/pages/admin/ProductAddAdminPage.css';
import { formatKRW, parseKRW } from '@/utils/number';
import { toYmd, toDateTimeLocal, fromYmd } from '@/utils/date';
import { reportError } from '@/utils/logger';

export type ProductFormMode = 'newProduct' | 'newRound' | 'editRound';

interface ProductFormProps {
  mode: ProductFormMode;
  productId?: string;
  roundId?: string;
  initialState?: {
    productGroupName: string;
    lastRound?: SalesRound;
  };
}

interface ProductItemUI {
  id: string;
  name: string;
  price: number | '';
  limitQuantity: number | '';
  deductionAmount: number | '';
  isBundleOption?: boolean;
  originalPrice?: number | '';
}

interface VariantGroupUI {
  id: string;
  groupName: string;
  totalPhysicalStock: number | '';
  stockUnitType: string;
  expirationDate: Date | null;
  items: ProductItemUI[];
}

// -------------------- helpers --------------------
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);

const convertToDate = (dateSource: any): Date | null => {
  if (!dateSource) return null;
  if (dateSource instanceof Date) return dateSource;
  if (typeof dateSource.toDate === 'function') return dateSource.toDate();
  if (
    typeof dateSource === 'object' &&
    (
      (dateSource.seconds !== undefined && dateSource.nanoseconds !== undefined) ||
      (dateSource._seconds !== undefined && dateSource._nanoseconds !== undefined)
    )
  ) {
    // ✅ Firestore Timestamp가 직렬화될 때 {seconds,nanoseconds} 또는 {_seconds,_nanoseconds} 둘 다 케어
    const seconds = typeof dateSource.seconds === 'number' ? dateSource.seconds : dateSource._seconds;
    const nanos = typeof dateSource.nanoseconds === 'number' ? dateSource.nanoseconds : dateSource._nanoseconds;
    if (typeof seconds === 'number' && typeof nanos === 'number') {
      return new Timestamp(seconds, nanos).toDate();
    }
  }
  const d = new Date(dateSource);
  if (!isNaN(d.getTime())) return d;
  return null;
};

// -------------------- date rules --------------------
// ✅ 발행일 기준 "다음날 13:00" (단, 토요일 발행이면 월요일 13:00)
const computeDefaultDeadlineFromPublish = (publishAt: Date): Date => {
  const publishDay = dayjs(publishAt);
  let target = publishDay.add(1, 'day');
  // 다음날이 일요일이면(=토요일 발행) 월요일로
  if (target.day() === 0) {
    target = target.add(1, 'day');
  }
  return target.hour(13).minute(0).second(0).millisecond(0).toDate();
};

// ✅ 픽업 마감일 계산 (냉장/신선은 당일, 실온/냉동은 +1일)
// ✅ 금요일 픽업 + 2일 상품(실온/냉동)은 다음 주 월요일로 보정
const computePickupDeadlineFromPickupDate = (
  pickupDate: Date,
  storageType: StorageType
): Date => {
  const base = dayjs(pickupDate);
  let target = base;

  if (storageType === 'ROOM' || storageType === 'FROZEN') {
    target = base.day() === 5 ? base.add(3, 'day') : base.add(1, 'day');
  }

  return target.hour(13).minute(0).second(0).millisecond(0).toDate();
};

const normalizeNumberInput = (v: string): number | '' => {
  if (v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  return n;
};

const storageTypeOptions: { key: StorageType; name: string; className: string }[] = [
  { key: 'ROOM', name: '실온', className: 'storage-btn-room' },
  { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' },
  { key: 'COLD', name: '냉장', className: 'storage-btn-cold' },
  { key: 'FRESH', name: '신선', className: 'storage-btn-fresh' },
];

const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];

const ALL_LOYALTY_TIERS: LoyaltyTier[] = [
  '공구의 신',
  '공구왕',
  '공구요정',
  '공구새싹',
  '공구초보',
];

const AUTO_CATEGORY_STORAGE_KEY = 'autoCategoryRules';

type AutoCategoryRule = {
  name: string;
  keywords: string[];
};

const normalizeCategoryId = (name: string) =>
  name
    .trim()
    .replace(/[\/\\?#%]/g, '-')
    .replace(/\s+/g, '');

const DEFAULT_AUTO_CATEGORY_RULES: AutoCategoryRule[] = [
  {
    name: '신선식품 / 정육 / 수산',
    keywords: [
      '삼겹살', '목살', '항정', '갈비', '한우', '소고기', '돼지고기', '닭', '막창',
      '대하', '장어', '생선', '오징어',
    ],
  },
  {
    name: '간편식 / 밀키트 / 국·탕',
    keywords: [
      '만두', '국', '탕', '찌개', '밀키트', '볶음밥', '떡볶이', '피자', '핫도그', '우동', '냉면',
    ],
  },
  {
    name: '간식 / 디저트 / 베이커리',
    keywords: [
      '과자', '초콜릿', '젤리', '쿠키', '케이크', '떡', '약과', '아이스크림',
    ],
  },
  {
    name: '음료 / 커피 / 차',
    keywords: [
      '콜라', '사이다', '커피', '차', '콤부차', '주스', '음료',
    ],
  },
  {
    name: '건강식품 / 영양제',
    keywords: [
      '루테인', '오메가', '홍삼', '유산균', '비타민', '단백질', '밀크씨슬', '알부민',
    ],
  },
  {
    name: '뷰티 / 화장품 / 퍼스널케어',
    keywords: [
      '샴푸', '바디워시', '화장품', '크림', '앰플', '마스크팩', '선크림', '향수',
    ],
  },
  {
    name: '생활·청소·주방',
    keywords: [
      '세제', '휴지', '키친타올', '수세미', '탈취', '방향제', '곰팡이', '청소',
    ],
  },
  {
    name: '소형가전 / 생활기기',
    keywords: [
      '가전', '에어프라이어', '전자레인지', '믹서', '블렌더', '청소기', '선풍기', '가습기',
    ],
  },
  {
    name: '주류 / 와인 / 하이볼',
    keywords: [
      '와인', '위스키', '하이볼', '맥주', '소주',
    ],
  },
];

const loadAutoCategoryRules = (): AutoCategoryRule[] => {
  try {
    const raw = localStorage.getItem(AUTO_CATEGORY_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_CATEGORY_RULES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_AUTO_CATEGORY_RULES;
    const sanitized = parsed
      .map((item) => ({
        name: typeof item?.name === 'string' ? item.name.trim() : '',
        keywords: Array.isArray(item?.keywords)
          ? item.keywords.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim())
          : [],
      }))
      .filter((item) => item.name && item.keywords.length > 0);
    return sanitized.length > 0 ? sanitized : DEFAULT_AUTO_CATEGORY_RULES;
  } catch {
    return DEFAULT_AUTO_CATEGORY_RULES;
  }
};

const resolveAutoCategory = (name: string, rules: AutoCategoryRule[]) => {
  const lower = name.trim().toLowerCase();
  if (!lower) return { categoryId: null as string | null, label: '미분류' };
  for (const rule of rules) {
    const matched = rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (matched) {
      return { categoryId: normalizeCategoryId(rule.name), label: rule.name };
    }
  }
  return { categoryId: null as string | null, label: '미분류' };
};

// -------------------- modal --------------------
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPreOrderEnabled: boolean;
  setIsPreOrderEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  preOrderTiers: LoyaltyTier[];
  setPreOrderTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isPreOrderEnabled,
  setIsPreOrderEnabled,
  preOrderTiers,
  setPreOrderTiers,
}) => {
  if (!isOpen) return null;

  const handlePreOrderTierChange = (tier: LoyaltyTier) => {
    setPreOrderTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h4>
            <SlidersHorizontal size={20} /> 등급별 판매 설정
          </h4>
          <button onClick={onClose} className="admin-modal-close-button">
            <X size={24} />
          </button>
        </div>

        <div className="admin-modal-body">
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="preorder-toggle-label">
              <span>
                <Clock size={16} /> 선주문 기능 사용
              </span>

              <div
                className={`toggle-switch ${isPreOrderEnabled ? 'active' : ''}`}
                onClick={() => setIsPreOrderEnabled((v) => !v)}
                role="button"
                tabIndex={0}
              >
                <div className="toggle-handle" />
              </div>
            </label>

            {isPreOrderEnabled && (
              <div className="preorder-options active">
                <p className="preorder-info">
                  <Info size={14} />
                  선택된 등급은 상품 발행일 오후 2시까지 선주문이 가능합니다.
                </p>

                <div className="tier-checkbox-group">
                  {ALL_LOYALTY_TIERS.map((tier) => (
                    <label key={`preorder-${tier}`} htmlFor={`preorder-tier-${tier}`}>
                      <input
                        type="checkbox"
                        id={`preorder-tier-${tier}`}
                        value={tier}
                        checked={preOrderTiers.includes(tier)}
                        onChange={() => handlePreOrderTierChange(tier)}
                      />
                      {tier}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="admin-modal-footer">
          <button onClick={onClose} className="modal-button primary">
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

interface AutoCategoryRuleModalProps {
  isOpen: boolean;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}

const AutoCategoryRuleModal: React.FC<AutoCategoryRuleModalProps> = ({
  isOpen,
  value,
  onChange,
  onSave,
  onReset,
  onClose,
}) => {
  if (!isOpen) return null;
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h4>
            <SlidersHorizontal size={20} /> 자동 카테고리 키워드 편집
          </h4>
        </div>
        <div className="admin-modal-body">
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            형식: [{'{ "name": "카테고리명", "keywords": ["키워드1", "키워드2"] }'}]
          </p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={14}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
        <div className="admin-modal-footer">
          <button type="button" onClick={onReset} className="ghost">
            기본값 복원
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="ghost">
              닫기
            </button>
            <button type="button" onClick={onSave}>
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// -------------------- component --------------------
const ProductForm: React.FC<ProductFormProps> = ({
  mode,
  productId,
  roundId,
  initialState,
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(mode === 'editRound' || mode === 'newRound');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pageTitle, setPageTitle] = useState('새 상품 등록');
  const [submitButtonText, setSubmitButtonText] = useState('신규 상품 등록하기');

  const [initialProduct, setInitialProduct] = useState<Partial<Product> | null>(null);
  const [initialRound, setInitialRound] = useState<Partial<SalesRound> | null>(null);

  const [productType, setProductType] = useState<'single' | 'group'>('single');
  const [groupName, setGroupName] = useState('');

  const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
  const [creationDate, setCreationDate] = useState<Date>(new Date());

  // 대표 이미지
  const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [previewUrlToFile, setPreviewUrlToFile] = useState<Map<string, File>>(new Map());

  // 판매 회차
  const [roundName, setRoundName] = useState('1차 판매');
  const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);
  const [initialReservedMap, setInitialReservedMap] = useState<Map<string, number>>(new Map());

  const [publishDate, setPublishDate] = useState<Date>(() => new Date(new Date().setHours(14, 0, 0, 0)));
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [pickupDate, setPickupDate] = useState<Date | null>(null);
  const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);

  const [isPrepaymentRequired, setIsPrepaymentRequired] = useState(false);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPreOrderEnabled, setIsPreOrderEnabled] = useState(true);
  const [preOrderTiers, setPreOrderTiers] = useState<LoyaltyTier[]>(['공구의 신', '공구왕']);

  const { categories: categoryDocs } = useCategories();

  // 중복 검색
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // 추가 정보(대표 상품 공통)
  const [categories, setCategories] = useState<string[]>([]);
  const [composition, setComposition] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isCategoryManual, setIsCategoryManual] = useState(false);
  const [autoCategoryRules, setAutoCategoryRules] = useState<AutoCategoryRule[]>(() =>
    typeof window === 'undefined' ? DEFAULT_AUTO_CATEGORY_RULES : loadAutoCategoryRules()
  );
  const [autoCategoryRuleText, setAutoCategoryRuleText] = useState(
    JSON.stringify(
      typeof window === 'undefined' ? DEFAULT_AUTO_CATEGORY_RULES : loadAutoCategoryRules(),
      null,
      2
    )
  );
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // 이벤트 타입
  const [eventType, setEventType] = useState<'NONE' | 'CHUSEOK' | 'ANNIVERSARY' | 'CHRISTMAS' | 'PREMIUM' | 'SEOLLAL'>('NONE');

  // Wizard 단계 관리
  const [currentStep, setCurrentStep] = useState(0);
  const wizardSteps = [
    { id: 'basic', title: '기본 정보', description: '상품명, 이미지', icon: <Package size={20} /> },
    { id: 'options', title: '판매 옵션', description: '가격, 재고, 옵션', icon: <Box size={20} /> },
    { id: 'schedule', title: '발행 설정', description: '날짜, 이벤트, 조건', icon: <Clock size={20} /> },
    { id: 'review', title: '최종 확인', description: '미리보기 및 검증', icon: <Info size={20} /> },
  ];

  // 자동 저장
  const formData = useMemo(() => ({
    groupName,
    imageUrls: imagePreviews.filter(p => !p.startsWith('blob:')),
    composition,
    categories,
    categoryId,
    selectedStorageType,
    variantGroups,
    roundName,
    publishDate,
    deadlineDate,
    pickupDate,
    pickupDeadlineDate,
    isPrepaymentRequired,
    eventType,
  }), [
    groupName, imagePreviews, composition, categories, categoryId,
    selectedStorageType, variantGroups, roundName,
    publishDate, deadlineDate, pickupDate, pickupDeadlineDate,
    isPrepaymentRequired, eventType,
  ]);

  const { manualSave, restore, clear: clearAutoSave } = useAutoSave({
    key: `product_form_${mode}_${productId || 'new'}`,
    data: formData,
    enabled: mode === 'newProduct' || mode === 'newRound',
  });

  const autoSuggestion = useMemo(
    () => resolveAutoCategory(groupName, autoCategoryRules),
    [groupName, autoCategoryRules]
  );

  useEffect(() => {
    if (!isCategoryManual) {
      setCategoryId(autoSuggestion.categoryId);
    }
  }, [autoSuggestion.categoryId, isCategoryManual]);

  const handleApplyAutoCategory = useCallback(() => {
    setIsCategoryManual(false);
    setCategoryId(autoSuggestion.categoryId);
  }, [autoSuggestion.categoryId]);

  const handleSaveAutoRules = useCallback(() => {
    try {
      const parsed = JSON.parse(autoCategoryRuleText);
      if (!Array.isArray(parsed)) throw new Error('규칙 형식이 올바르지 않습니다.');
      const sanitized: AutoCategoryRule[] = parsed
        .map((item) => ({
          name: typeof item?.name === 'string' ? item.name.trim() : '',
          keywords: Array.isArray(item?.keywords)
            ? item.keywords.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim())
            : [],
        }))
        .filter((item) => item.name && item.keywords.length > 0);
      if (sanitized.length === 0) throw new Error('유효한 규칙이 없습니다.');
      setAutoCategoryRules(sanitized);
      localStorage.setItem(AUTO_CATEGORY_STORAGE_KEY, JSON.stringify(sanitized));
      toast.success('자동 카테고리 규칙이 저장되었습니다.');
      setIsRuleModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? '규칙 저장에 실패했습니다.');
    }
  }, [autoCategoryRuleText]);

  const handleResetAutoRules = useCallback(() => {
    const text = JSON.stringify(DEFAULT_AUTO_CATEGORY_RULES, null, 2);
    setAutoCategoryRuleText(text);
    setAutoCategoryRules(DEFAULT_AUTO_CATEGORY_RULES);
    localStorage.setItem(AUTO_CATEGORY_STORAGE_KEY, text);
    toast.success('기본 규칙으로 복원했습니다.');
  }, []);

  // 검증
  const validation = useMemo(() => {
    const firstPrice = variantGroups[0]?.items[0]?.price || '';
    return validateProductForm({
      groupName,
      composition,
      imageUrls: imagePreviews, // blob URL도 포함하여 검증 (업로드된 이미지도 유효한 것으로 간주)
      selectedStorageType,
      variantGroups,
      deadlineDate,
      pickupDate,
      pickupDeadlineDate,
    });
  }, [groupName, composition, imagePreviews, selectedStorageType, variantGroups, deadlineDate, pickupDate, pickupDeadlineDate]);

  // 진행률 계산
  const progress = useMemo(() => {
    const totalFields = 9;
    let completedFields = 0;

    if (groupName.trim()) completedFields++;
    if (composition.trim()) completedFields++;
    if (imagePreviews.length > 0) completedFields++;
    if (variantGroups.length > 0) completedFields++;
    if (variantGroups.every(vg => vg.items.length > 0 && vg.items.every(i => i.name && i.price))) completedFields++;
    if (deadlineDate) completedFields++;
    if (pickupDate) completedFields++;
    if (pickupDeadlineDate) completedFields++;
    if (validation.isValid) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  }, [groupName, composition, imagePreviews, variantGroups, deadlineDate, pickupDate, pickupDeadlineDate, validation.isValid]);

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S: 저장
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!isSubmitting) {
          handleSubmit(false);
        }
      }
      // Ctrl+Shift+S: 임시저장
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        if (!isSubmitting) {
          handleSubmit(true);
        }
      }
      // Ctrl+Shift+A: 자동 저장
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        manualSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting]);

  // 페이지 떠나기 전 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (progress > 0 && progress < 100) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [progress]);

  // -------------------- page title --------------------
  useEffect(() => {
    switch (mode) {
      case 'newProduct': {
        setPageTitle('신규 대표 상품 등록');
        setSubmitButtonText('신규 상품 등록하기');

        if (initialState?.productGroupName) {
          setGroupName(initialState.productGroupName);
          setVariantGroups((prev) => {
            const next = [...prev];
            if (next[0]) next[0].groupName = initialState.productGroupName;
            return next;
          });
        }
        break;
      }
      case 'newRound': {
        setPageTitle(`'${initialState?.productGroupName || ''}' 새 회차 추가`);
        setSubmitButtonText('새 회차 추가하기');
        break;
      }
      case 'editRound': {
        setPageTitle('판매 회차 수정');
        setSubmitButtonText('수정 내용 저장');
        break;
      }
    }
  }, [mode, initialState?.productGroupName]);

  // -------------------- fetch data (newRound/editRound) --------------------
  useEffect(() => {
    const fetchData = async () => {
      if (!productId && mode !== 'newProduct') return;

      setIsLoading(true);
      try {
        const [reservedMapData, productData] = await Promise.all([
          mode === 'editRound' && productId ? getReservedQuantitiesMap() : Promise.resolve(new Map<string, number>()),
          productId ? getProductById(productId) : Promise.resolve(null),
        ]);

        if (mode === 'editRound') {
          setInitialReservedMap(reservedMapData);
        }

        const product = productData;

        if (productId && !product) {
          toast.error('상품을 찾을 수 없습니다.');
          navigate('/admin/products');
          return;
        }

        if (product) {
          // 공통 대표정보
          if (mode === 'editRound' || mode === 'newRound') {
            setInitialProduct({
              groupName: product.groupName,
              description: product.description,
              storageType: product.storageType,
              categories: (product as any).categories || [],
              composition: (product as any).composition || '',
              extraInfo: (product as any).extraInfo || '',
            });
          }

          setGroupName(product.groupName);
          setSelectedStorageType(product.storageType);

          setCategories((product as any).categories || []);
          setCategoryId((product as any).categoryId ?? null);
          setIsCategoryManual(Boolean((product as any).categoryId));
          setComposition((product as any).composition || '');
          setExtraInfo((product as any).extraInfo || '');

          if ((product as any).createdAt) {
            setCreationDate(convertToDate((product as any).createdAt) || new Date());
          }

          // 이미지
          setInitialImageUrls(product.imageUrls || []);
          setCurrentImageUrls(product.imageUrls || []);
          setImagePreviews(product.imageUrls || []);
        }

        const salesHistory: SalesRound[] = Array.isArray((product as any)?.salesHistory)
          ? (product as any).salesHistory
          : [];

        let roundToLoad: SalesRound | undefined;

        if (mode === 'editRound' && roundId && product) {
          roundToLoad = salesHistory.find((r) => r.roundId === roundId);

          if (!roundToLoad) {
            toast.error('판매 회차를 찾을 수 없습니다.');
            navigate(`/admin/products/edit/${productId}`);
            return;
          }

          setPageTitle(`'${product.groupName}' 회차 수정`);
          setInitialRound(JSON.parse(JSON.stringify(roundToLoad)));
        } else if (mode === 'newRound' && product) {
          roundToLoad = initialState?.lastRound || salesHistory[0];

          if (roundToLoad) {
            const roundNumMatch = roundToLoad.roundName.match(/\d+/);
            const newRoundNumber = roundNumMatch ? parseInt(roundNumMatch[0], 10) + 1 : salesHistory.length + 1;
            setRoundName(`${newRoundNumber}차 판매`);

            const prevRoundData = roundToLoad as SalesRound;

            // ✅ 날짜는 복사하지 않고 기본값 유지(발행일=오늘 14시)
            setIsPrepaymentRequired(prevRoundData.isPrepaymentRequired ?? false);
            setIsPreOrderEnabled(!!(prevRoundData.preOrderTiers && prevRoundData.preOrderTiers.length > 0));
            setPreOrderTiers(prevRoundData.preOrderTiers || ['공구의 신', '공구왕']);
          } else {
            setRoundName('1차 판매');
          }
        }

        if (roundToLoad && product) {
          const roundData = roundToLoad as SalesRound & {
            preOrderTiers?: LoyaltyTier[];
            eventType?: 'NONE' | 'CHUSEOK' | 'ANNIVERSARY' | 'CHRISTMAS' | 'PREMIUM' | 'SEOLLAL';
          };

          if (mode === 'editRound') setRoundName(roundData.roundName);

          setProductType(
            ((roundData.variantGroups?.length || 0) > 1) ||
              (roundData.variantGroups?.[0]?.groupName !== product.groupName)
              ? 'group'
              : 'single'
          );

          setEventType((roundData.eventType || 'NONE') as any);

          const mappedVGs: VariantGroupUI[] = (roundData.variantGroups || []).map((vg: VariantGroup) => {
            const expirationDate = convertToDate(vg.items?.[0]?.expirationDate);

            let displayStock: number | '' = vg.totalPhysicalStock ?? '';

            if (mode === 'editRound' && productId && roundId) {
              const key = `${productId}-${roundId}-${vg.id}`;
              const reservedCount = reservedMapData.get(key) || 0;
              const configuredStock = vg.totalPhysicalStock ?? -1;

              // 무제한(-1)은 입력 칸 비움
              displayStock = configuredStock === -1 ? '' : Math.max(0, configuredStock - reservedCount);
            } else if (mode === 'newRound') {
              // 새 회차는 재고 비움
              displayStock = '';
            }

            return {
              id: vg.id,
              groupName: vg.groupName ?? '',
              totalPhysicalStock: displayStock,
              stockUnitType: vg.stockUnitType ?? '개',
              expirationDate,
              items: (vg.items || []).map((item: ProductItem & { originalPrice?: number }) => ({
                id: item.id,
                name: item.name ?? '',
                price: typeof item.price === 'number' ? item.price : '',
                originalPrice: typeof (item as any).originalPrice === 'number' ? (item as any).originalPrice : '',
                limitQuantity: item.limitQuantity ?? '',
                deductionAmount: item.stockDeductionAmount ?? 1,
                isBundleOption: bundleUnitKeywords.some((k) => String(item.name ?? '').includes(k)),
              })),
            };
          });

          if (mode === 'newRound' && mappedVGs.length === 0) {
            mappedVGs.push({
              id: generateUniqueId(),
              groupName: product.groupName,
              totalPhysicalStock: '',
              stockUnitType: '개',
              expirationDate: null,
              items: [
                {
                  id: generateUniqueId(),
                  name: '',
                  price: '',
                  limitQuantity: '',
                  deductionAmount: 1,
                  isBundleOption: false,
                  originalPrice: '',
                },
              ],
            });
          }

          setVariantGroups(mappedVGs);

          if (mode === 'editRound') {
            setPublishDate(convertToDate((roundData as any).publishAt) || new Date());
            const loadedPublish = convertToDate((roundData as any).publishAt) || new Date();

            const loadedDeadline =
              convertToDate((roundData as any).deadlineDate) ||
              convertToDate((roundData as any).deadlineAt);

            // ✅ deadlineDate가 비어있으면 발행일 기준 자동 규칙으로 채움(덮어쓰지 않음)
            setDeadlineDate(loadedDeadline || computeDefaultDeadlineFromPublish(loadedPublish));

            // ✅ pickupDate가 비어있으면 arrivalDate(레거시/고객용)도 fallback
            const loadedPickup =
              convertToDate((roundData as any).pickupDate) ||
              convertToDate((roundData as any).arrivalDate);
            const loadedPickupDeadline = convertToDate((roundData as any).pickupDeadlineDate);

            setPickupDate(loadedPickup);

            // ✅ [보정] 기존 데이터가 비어있는 경우에만 보관타입 기반으로 자동 채움 (덮어쓰지 않음)
            if (!loadedPickupDeadline && loadedPickup) {
              const st = product.storageType;
              setPickupDeadlineDate(computePickupDeadlineFromPickupDate(loadedPickup, st));
            } else {
              setPickupDeadlineDate(loadedPickupDeadline);
            }
          }

          setIsPrepaymentRequired(roundData.isPrepaymentRequired ?? false);
          setIsPreOrderEnabled(roundData.preOrderTiers ? roundData.preOrderTiers.length > 0 : true);
          setPreOrderTiers(roundData.preOrderTiers || ['공구의 신', '공구왕']);
        }
      } catch (err) {
        reportError('ProductForm.fetchData', err);
        toast.error('양식 데이터를 불러오는 데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (mode === 'editRound' || mode === 'newRound') fetchData();
  }, [mode, productId, roundId, navigate, initialState]);

  // 자동 저장 복구 (초기 로드 시)
  useEffect(() => {
    if (mode === 'newProduct' || mode === 'newRound') {
      const saved = restore();
      
      // 저장된 데이터가 실제로 의미 있는지 확인 (빈 데이터인지 체크)
      const hasMeaningfulData = saved && (
        (saved.groupName && saved.groupName.trim()) ||
        (saved.composition && saved.composition.trim()) ||
        (saved.variantGroups && saved.variantGroups.length > 0 && saved.variantGroups.some((vg: any) => 
          vg.items && vg.items.length > 0 && vg.items.some((item: any) => 
            (item.name && item.name.trim()) || (typeof item.price === 'number' && item.price > 0)
          )
        )) ||
        (saved.imageUrls && saved.imageUrls.length > 0)
      );
      
      if (hasMeaningfulData && window.confirm('이전에 작성하던 내용이 있습니다. 복구하시겠습니까?')) {
        if (saved.groupName) setGroupName(saved.groupName);
        if (saved.composition) setComposition(saved.composition);
        if (saved.categories) setCategories(saved.categories);
        if (saved.categoryId !== undefined) {
          setCategoryId(saved.categoryId ?? null);
          setIsCategoryManual(Boolean(saved.categoryId));
        }
        if (saved.selectedStorageType) setSelectedStorageType(saved.selectedStorageType);
        if (saved.variantGroups) setVariantGroups(saved.variantGroups);
        if (saved.roundName) setRoundName(saved.roundName);
        if (saved.publishDate) setPublishDate(new Date(saved.publishDate));
        if (saved.deadlineDate) setDeadlineDate(new Date(saved.deadlineDate));
        if (saved.pickupDate) setPickupDate(new Date(saved.pickupDate));
        if (saved.pickupDeadlineDate) setPickupDeadlineDate(new Date(saved.pickupDeadlineDate));
        if (saved.isPrepaymentRequired !== undefined) setIsPrepaymentRequired(saved.isPrepaymentRequired);
        if (saved.eventType) setEventType(saved.eventType);
        toast.success('이전 작성 내용이 복구되었습니다.');
      } else if (saved && !hasMeaningfulData) {
        // 의미 없는 데이터는 자동으로 삭제
        clearAutoSave();
      }
    }
  }, [mode, restore, clearAutoSave]);

  // -------------------- init empty for newProduct --------------------
  useEffect(() => {
    if (mode !== 'newProduct') return;
    if (variantGroups.length > 0) return;

    setVariantGroups([
      {
        id: generateUniqueId(),
        groupName: '',
        totalPhysicalStock: '',
        stockUnitType: '개',
        expirationDate: null,
        items: [
          {
            id: generateUniqueId(),
            name: '',
            price: '',
            limitQuantity: '',
            deductionAmount: 1,
            isBundleOption: false,
            originalPrice: '',
          },
        ],
      },
    ]);
  }, [mode, variantGroups.length]);

  // -------------------- auto deadline from publishDate (non-event) --------------------
  useEffect(() => {
    // ✅ 수정 모드에서는 기존 날짜를 유지해야 하므로 자동 계산하지 않음
    if (mode === 'editRound') return;
    
    if (eventType === 'CHUSEOK' || eventType === 'ANNIVERSARY' || eventType === 'PREMIUM' || eventType === 'CHRISTMAS' || eventType === 'SEOLLAL') return;

    const baseDate = dayjs(publishDate);
    let deadline = baseDate.add(1, 'day');

    // 일요일이면 월요일 13시로
    if (deadline.day() === 0) {
      deadline = deadline.add(1, 'day');
    }

    const finalDeadline = deadline.hour(13).minute(0).second(0).millisecond(0).toDate();
    setDeadlineDate(finalDeadline);
  }, [publishDate, eventType, mode]);

  // -------------------- pickup deadline auto --------------------
  useEffect(() => {
    // ✅ 수정 모드에서는 기존 날짜를 유지해야 하므로 자동 계산하지 않음
    if (mode === 'editRound') return;
    
    if (!pickupDate) {
      setPickupDeadlineDate(null);
      return;
    }

    setPickupDeadlineDate(computePickupDeadlineFromPickupDate(pickupDate, selectedStorageType));
  }, [pickupDate, selectedStorageType, mode]);

  // -------------------- single mode sync groupName to first VG --------------------
  useEffect(() => {
    if (productType === 'single' && variantGroups.length > 0) {
      setVariantGroups((prev) => {
        const first = prev[0];
        if (first && first.groupName !== groupName) {
          const cp = [...prev];
          cp[0] = { ...first, groupName };
          return cp;
        }
        return prev;
      });
    }
  }, [groupName, productType, variantGroups.length]);

  // -------------------- duplicate search (newProduct only) --------------------
  useEffect(() => {
    if (mode !== 'newProduct' || !groupName.trim()) {
      setSimilarProducts([]);
      return;
    }

    const handler = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      try {
        setSimilarProducts(await searchProductsByName(groupName.trim()));
      } catch (e) {
        reportError('ProductForm.searchProductsByName', e);
      } finally {
        setIsCheckingDuplicates(false);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [groupName, mode]);

  // -------------------- handlers --------------------
  const handleProductTypeChange = useCallback(
    (newType: 'single' | 'group') => {
      if (productType === newType) return;

      if (productType === 'group' && newType === 'single') {
        toast.promise(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              setVariantGroups((prev) => prev.slice(0, 1));
              setProductType(newType);
              resolve();
            }, 300);
          }),
          { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' }
        );
      } else {
        setProductType(newType);
      }
    },
    [productType]
  );

  const handleVariantGroupChange = useCallback(
    (id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => {
      setVariantGroups((prev) => prev.map((vg) => (vg.id === id ? { ...vg, [field]: value } : vg)));
    },
    []
  );

  const addNewVariantGroup = useCallback(() => {
    setVariantGroups((prev) => [
      ...prev,
      {
        id: generateUniqueId(),
        groupName: '',
        totalPhysicalStock: '',
        stockUnitType: '개',
        expirationDate: null,
        items: [
          {
            id: generateUniqueId(),
            name: '',
            price: '',
            limitQuantity: '',
            deductionAmount: 1,
            isBundleOption: false,
            originalPrice: '',
          },
        ],
      },
    ]);
  }, []);

  const removeVariantGroup = useCallback(
    (id: string) => {
      if (variantGroups.length > 1) {
        setVariantGroups((prev) => prev.filter((vg) => vg.id !== id));
      } else {
        toast.error('최소 1개의 하위 그룹이 필요합니다.');
      }
    },
    [variantGroups.length]
  );

  const handleItemChange = useCallback(
    (vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'>, value: any) => {
      setVariantGroups((prev) =>
        prev.map((vg) =>
          vg.id === vgId
            ? {
                ...vg,
                items: vg.items.map((item) => {
                  if (item.id !== itemId) return item;
                  const updated: ProductItemUI = { ...item, [field]: value } as any;

                  if (field === 'name') {
                    const str = String(value ?? '');
                    const isBundle =
                      bundleUnitKeywords.some((k) => str.includes(k)) ||
                      !singleUnitKeywords.some((k) => str.includes(k));
                    updated.isBundleOption = isBundle;
                    updated.deductionAmount = isBundle ? item.deductionAmount : 1;
                  }
                  return updated;
                }),
              }
            : vg
        )
      );
    },
    []
  );

  const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => {
    const numericValue = parseKRW(value);
    setVariantGroups((prev) =>
      prev.map((vg) =>
        vg.id === vgId
          ? { ...vg, items: vg.items.map((item) => (item.id === itemId ? { ...item, price: numericValue } : item)) }
          : vg
      )
    );
  }, []);

  const handleOriginalPriceChange = useCallback((vgId: string, itemId: string, value: string) => {
    const numericValue = parseKRW(value);
    setVariantGroups((prev) =>
      prev.map((vg) =>
        vg.id === vgId
          ? {
              ...vg,
              items: vg.items.map((item) => (item.id === itemId ? { ...item, originalPrice: numericValue } : item)),
            }
          : vg
      )
    );
  }, []);

  const addNewItem = useCallback((vgId: string) => {
    setVariantGroups((prev) =>
      prev.map((vg) =>
        vg.id === vgId
          ? {
              ...vg,
              items: [
                ...vg.items,
                {
                  id: generateUniqueId(),
                  name: '',
                  price: '',
                  limitQuantity: '',
                  deductionAmount: 1,
                  isBundleOption: false,
                  originalPrice: '',
                },
              ],
            }
          : vg
      )
    );
  }, []);

  const removeItem = useCallback((vgId: string, itemId: string) => {
    setVariantGroups((prev) =>
      prev.map((vg) =>
        vg.id === vgId
          ? vg.items.length > 1
            ? { ...vg, items: vg.items.filter((i) => i.id !== itemId) }
            : vg
          : vg
      )
    );
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;

      const raw = Array.from(e.target.files);
      const gifCount = raw.filter((f) => f.type === 'image/gif').length;
      const files = raw.filter((f) => f.type !== 'image/gif');

      if (gifCount > 0) {
        toast.error('GIF 파일은 사용할 수 없습니다. PNG 또는 JPEG로 등록해 주세요.');
      }
      if (files.length === 0) return;

      setNewImageFiles((prev) => [...prev, ...files]);

      // 새 blob URL 생성 및 상태 업데이트
      const newUrls: string[] = [];
      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        newUrls.push(url);
      });

      // 이미지 프리뷰 추가
      setImagePreviews((prev) => [...prev, ...newUrls]);

      // URL-to-File 매핑 업데이트
      setPreviewUrlToFile((prevMap) => {
        const nextMap = new Map(prevMap);
        files.forEach((file, index) => {
          nextMap.set(newUrls[index], file);
        });
        return nextMap;
      });

      e.target.value = '';
    },
    []
  );

  const removeImage = useCallback(
    (indexToRemove: number) => {
      const urlToRemove = imagePreviews[indexToRemove];
      if (!urlToRemove) return;

      if (urlToRemove.startsWith('blob:')) {
        const fileToRemove = previewUrlToFile.get(urlToRemove) || null;
        if (fileToRemove) {
          setNewImageFiles((prev) => prev.filter((f) => f !== fileToRemove));
          const nextMap = new Map(previewUrlToFile);
          nextMap.delete(urlToRemove);
          setPreviewUrlToFile(nextMap);
        }
        URL.revokeObjectURL(urlToRemove);
      } else {
        setCurrentImageUrls((prev) => prev.filter((u) => u !== urlToRemove));
      }

      setImagePreviews((prev) => prev.filter((_, i) => i !== indexToRemove));
    },
    [imagePreviews, previewUrlToFile]
  );

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;

    const reorderedPreviews = Array.from(imagePreviews);
    const [movedPreview] = reorderedPreviews.splice(source.index, 1);
    reorderedPreviews.splice(destination.index, 0, movedPreview);
    setImagePreviews(reorderedPreviews);

    if (mode === 'editRound' || mode === 'newRound') {
      const reorderedUrls = Array.from(currentImageUrls);
      const [movedUrl] = reorderedUrls.splice(source.index, 1);
      if (typeof movedUrl !== 'undefined') {
        reorderedUrls.splice(destination.index, 0, movedUrl);
        setCurrentImageUrls(reorderedUrls);
      }
    }
  };

  // -------------------- summary --------------------
  const settingsSummary = useMemo(() => {
    const publishDateTime = new Date(publishDate);
    publishDateTime.setHours(14, 0, 0, 0);
    const publishText = `${toYmd(publishDateTime)} 오후 2시`;

    const deadlineText = deadlineDate ? toDateTimeLocal(deadlineDate).replace('T', ' ') : '미설정';
    const pickupText = pickupDate ? toYmd(pickupDate) : '미설정';
    const pickupDeadlineText = pickupDeadlineDate ? toYmd(pickupDeadlineDate) : '미설정';

    const participationText = '모두 참여 가능';

    return { publishText, deadlineText, pickupText, pickupDeadlineText, participationText };
  }, [publishDate, deadlineDate, pickupDate, pickupDeadlineDate]);

  // -------------------- submit --------------------
  const handleSubmit = async (isDraft: boolean = false) => {
    setIsSubmitting(true);

    // 구성 필수(임시저장 제외)
    if (!isDraft && !composition.trim()) {
      toast.error('상품 구성을 입력해주세요.');
      setIsSubmitting(false);
      return;
    }

    const MIN_YEAR = 2020;
    const MAX_YEAR = 2100;

    const isValidDateRange = (d: Date | null, fieldName: string) => {
      if (!d) return true;
      const year = d.getFullYear();
      const ok = year >= MIN_YEAR && year <= MAX_YEAR;
      if (!ok) toast.error(`${fieldName}의 날짜(${year}년)가 유효한 범위를 벗어났습니다. 다시 확인해주세요.`);
      return ok;
    };

    const allDates = [
      { date: deadlineDate, name: '마감일' },
      { date: pickupDate, name: '픽업 시작일' },
      { date: pickupDeadlineDate, name: '픽업 마감일' },
      ...variantGroups.map((vg, i) => ({ date: vg.expirationDate, name: `옵션 ${i + 1}의 유통기한` })),
    ];

    for (const { date, name } of allDates) {
      if (!isValidDateRange(date, name)) {
        setIsSubmitting(false);
        return;
      }
    }

    if (!isDraft) {
      // imagePreviews에 이미지가 하나라도 있으면 통과
      if (imagePreviews.length === 0) {
        toast.error('대표 이미지를 1개 이상 등록해주세요.');
        setIsSubmitting(false);
        return;
      }

      if (!deadlineDate || !pickupDate || !pickupDeadlineDate) {
        toast.error('공구 마감일, 픽업 시작일, 픽업 마감일을 모두 설정해주세요.');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const status: SalesRoundStatus = isDraft ? 'draft' : 'scheduled';

      const finalPublishDate = new Date(publishDate);
      finalPublishDate.setHours(14, 0, 0, 0);

      const salesRoundData = {
        roundName: roundName.trim(),
        status,
        eventType: eventType === 'NONE' ? null : eventType,
        sourceType: (eventType === 'PREMIUM' ? 'SONGDOPICK_ONLY' : 'SODOMALL') as SourceType,

        variantGroups: variantGroups.map((vg) => {
          let finalTotalPhysicalStock: number | null;

          const newStockFromInput = vg.totalPhysicalStock;

          if (mode === 'editRound' && productId && roundId) {
            const key = `${productId}-${roundId}-${vg.id}`;
            const initialReserved = initialReservedMap.get(key) || 0;

            if (newStockFromInput === '' || (typeof newStockFromInput === 'number' && newStockFromInput < 0)) {
              finalTotalPhysicalStock = -1;
            } else {
              finalTotalPhysicalStock = Number(newStockFromInput) + initialReserved;
            }
          } else {
            finalTotalPhysicalStock = newStockFromInput === '' ? null : Number(newStockFromInput);
          }

          return {
            id: vg.id || generateUniqueId(),
            groupName: productType === 'single' ? groupName.trim() : vg.groupName.trim(),
            totalPhysicalStock: finalTotalPhysicalStock,
            stockUnitType: vg.stockUnitType,
            items: vg.items.map((item) => ({
              id: item.id || generateUniqueId(),
              name: item.name,
              price: Number(item.price) || 0,
              originalPrice:
                typeof (item as any).originalPrice === 'number' || (typeof (item as any).originalPrice === 'string' && (item as any).originalPrice !== '')
                  ? Number((item as any).originalPrice)
                  : null,
              stock: -1,
              limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
              expirationDate: vg.expirationDate ? Timestamp.fromDate(vg.expirationDate) : null,
              stockDeductionAmount: Number(item.deductionAmount) || 1,
            })),
          };
        }),

        publishAt: finalPublishDate as any,
        deadlineDate: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
        pickupDate: pickupDate ? Timestamp.fromDate(pickupDate) : null,
        pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,

        isPrepaymentRequired,
        allowedTiers: ALL_LOYALTY_TIERS,
        preOrderTiers: isPreOrderEnabled ? preOrderTiers : [],
      };

      // 대표 상품 공통 데이터
      const productDataToUpdate: Partial<Omit<Product, 'id' | 'salesHistory'>> = {
        groupName: groupName.trim(),
        description: '', // 상품 설명 필드 제거됨 (빈 문자열로 유지)
        storageType: selectedStorageType,
        ...( { categories } as any ),
        ...( { categoryId } as any ),
        ...( { composition: composition.trim() } as any ),
        ...( { extraInfo: extraInfo.trim() ? extraInfo.trim() : null } as any ),
      };

      // 이미지 URL 병합
      const existingUrls = imagePreviews.filter((p) => !p.startsWith('blob:'));
      const filesToUpload = imagePreviews
        .filter((p) => p.startsWith('blob:'))
        .map((p) => previewUrlToFile.get(p))
        .filter((f): f is File => !!f);

      let finalImageUrls = existingUrls;

      // 업로드가 필요하면 업로드 후 URL 합치기
      if (filesToUpload.length > 0) {
        const toastId = toast.loading('이미지 업로드 중...');
        const targetIdForPath = productId || 'temp';
        // 신규 상품은 productId 만든 뒤 업로드하므로 여기서는 newProduct 처리에서 업로드함
        toast.dismiss(toastId);
        if (mode !== 'newProduct') {
          const uploadedUrls = await uploadImages(filesToUpload, `products/${targetIdForPath}`);
          finalImageUrls = [...existingUrls, ...uploadedUrls];
        }
      }

      // -------------------- mode branching --------------------
      if (mode === 'newProduct') {
        // 1) product + first round 생성
        const res = await addProductWithFirstRound(productDataToUpdate as any, salesRoundData as any, creationDate); // ✅ 3 args
        const newProductId = res?.productId;

        if (!newProductId) throw new Error('신규 상품 ID 생성에 실패했습니다.');

        // 2) 이미지 업로드(신규는 여기서)
        if (imagePreviews.length > 0) {
          const uploadedUrls = await uploadImages(filesToUpload.length ? filesToUpload : newImageFiles, `products/${newProductId}`);
          finalImageUrls = [...existingUrls, ...uploadedUrls].filter(Boolean);
        }

        // 3) core info 저장(이미지 URL 포함)
        await updateProductCoreInfo(newProductId, productDataToUpdate as any, finalImageUrls); // ✅ 3 args

        toast.success(isDraft ? '상품이 임시저장되었습니다.' : '신규 상품이 성공적으로 등록되었습니다.');
        clearAutoSave(); // 자동 저장 데이터 삭제
        navigate('/admin/products');
        return;
      }

      if (mode === 'newRound' && productId) {
        // 새 회차에서도 대표 정보 + 이미지 업데이트 가능
        // 업로드는 여기서 (productId 존재)
        if (filesToUpload.length > 0) {
          const toastId = toast.loading('새 이미지 업로드 중...');
          const uploadedUrls = await uploadImages(filesToUpload, `products/${productId}`);
          finalImageUrls = [...existingUrls, ...uploadedUrls];
          toast.dismiss(toastId);
        }

        await updateProductCoreInfo(productId, productDataToUpdate as any, finalImageUrls); // ✅ 3 args
        await addNewSalesRound(productId, salesRoundData as any);

        toast.success(isDraft ? '새 회차가 임시저장되었습니다.' : '새로운 판매 회차가 추가되었습니다.');
        clearAutoSave(); // 자동 저장 데이터 삭제
        navigate('/admin/products');
        return;
      }

      if (mode === 'editRound' && productId && roundId) {
        const changes: string[] = [];
        const storageTypeMap: Record<StorageType, string> = {
          ROOM: '실온',
          COLD: '냉장',
          FROZEN: '냉동',
          FRESH: '신선',
        };

        if (initialProduct?.groupName !== groupName.trim()) changes.push('상품명 변경');
        if (initialProduct?.storageType !== selectedStorageType) {
          changes.push(`보관 방법: ${storageTypeMap[initialProduct?.storageType!]} -> ${storageTypeMap[selectedStorageType]}`);
        }

        if (initialRound?.roundName !== salesRoundData.roundName) changes.push(`회차명: ${initialRound?.roundName} -> ${salesRoundData.roundName}`);
        if (toYmd(convertToDate((initialRound as any)?.pickupDate)) !== toYmd(convertToDate((salesRoundData as any)?.pickupDate))) changes.push('픽업 시작일 변경');
        if (toYmd(convertToDate((initialRound as any)?.pickupDeadlineDate)) !== toYmd(convertToDate((salesRoundData as any)?.pickupDeadlineDate))) changes.push('픽업 마감일 변경');
        if (JSON.stringify((initialRound as any)?.variantGroups) !== JSON.stringify((salesRoundData as any)?.variantGroups)) changes.push('가격/옵션 정보 변경');

        if (changes.length > 0 && !isDraft) {
          try {
            const notifyUsersOfProductUpdate = httpsCallable(functions, 'notifyUsersOfProductUpdate');
            await notifyUsersOfProductUpdate({
              productId,
              roundId,
              productName: groupName.trim(),
              changes: [...new Set(changes)],
            });
            toast.success('상품 정보 변경 알림을 발송했습니다.');
          } catch (err) {
            reportError('notifyUsersOfProductUpdate call failed', err);
            toast.error('변경 알림 발송에 실패했습니다.');
          }
        }

        // 이미지 업로드 (productId 존재)
        if (filesToUpload.length > 0) {
          const toastId = toast.loading('새 이미지 업로드 중...');
          const uploadedUrls = await uploadImages(filesToUpload, `products/${productId}`);
          finalImageUrls = [...existingUrls, ...uploadedUrls];
          toast.dismiss(toastId);
        }

        await updateProductCoreInfo(productId, productDataToUpdate as any, finalImageUrls); // ✅ 3 args
        await updateSalesRound(productId, roundId, salesRoundData as any);

        toast.success(isDraft ? '수정 내용이 임시저장되었습니다.' : '상품 정보가 성공적으로 수정되었습니다.');
        clearAutoSave(); // 자동 저장 데이터 삭제
        navigate('/admin/products');
        return;
      }

      toast.error('저장 모드/식별자 정보가 올바르지 않습니다.');
    } catch (err) {
      toast.error(`저장 중 오류가 발생했습니다: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // cleanup blob urls
  useEffect(() => {
    return () => {
      imagePreviews.forEach((p) => {
        if (p.startsWith('blob:')) URL.revokeObjectURL(p);
      });
    };
  }, [imagePreviews]);

  if (isLoading) return <SodomallLoader message="상품 정보를 불러오는 중입니다..." />;

  return (
    <>
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        isPreOrderEnabled={isPreOrderEnabled}
        setIsPreOrderEnabled={setIsPreOrderEnabled}
        preOrderTiers={preOrderTiers}
        setPreOrderTiers={setPreOrderTiers}
      />
      <AutoCategoryRuleModal
        isOpen={isRuleModalOpen}
        value={autoCategoryRuleText}
        onChange={setAutoCategoryRuleText}
        onSave={handleSaveAutoRules}
        onReset={handleResetAutoRules}
        onClose={() => setIsRuleModalOpen(false)}
      />

      <div className="product-add-page-wrapper smart-form">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (currentStep === wizardSteps.length - 1) {
              handleSubmit(false);
            } else {
              setCurrentStep(prev => Math.min(prev + 1, wizardSteps.length - 1));
            }
          }}
        >
          <header className="product-add-header">
            <div className="header-left">
              <h1>{pageTitle}</h1>
              <div className="progress-indicator">
                <span className="progress-text">{progress}%</span>
                <div className="progress-bar-mini">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
            
            {/* 작은 위자드 인디케이터 */}
            <div className="header-wizard-mini">
              <ProductFormWizard
                steps={wizardSteps}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
                onNext={() => {
                  if (currentStep < wizardSteps.length - 1) {
                    setCurrentStep(prev => prev + 1);
                  }
                }}
                onPrevious={() => {
                  if (currentStep > 0) {
                    setCurrentStep(prev => prev - 1);
                  }
                }}
                canGoNext={
                  currentStep < wizardSteps.length - 1 && (
                    (currentStep === 0 && groupName.trim() && composition.trim() && imagePreviews.length > 0) ||
                    (currentStep === 1 && variantGroups.length > 0 && variantGroups.every(vg => vg.items.length > 0)) ||
                    (currentStep === 2 && deadlineDate && pickupDate && pickupDeadlineDate) ||
                    currentStep === 3
                  )
                }
                canGoPrevious={currentStep > 0}
                progress={progress}
                variant="compact"
              />
            </div>

            <div className="header-actions">
              <button
                type="button"
                onClick={manualSave}
                className="auto-save-button"
                title="수동 저장 (Ctrl+Shift+A)"
              >
                💾 저장됨
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                className="draft-save-button"
                title="임시저장 (Ctrl+Shift+S)"
              >
                <FileText size={14} /> 임시저장
              </button>

              <button 
                type="submit" 
                disabled={
                  isSubmitting || 
                  (currentStep < wizardSteps.length - 1 && (
                    // 각 단계별로 필요한 검증만 체크
                    (currentStep === 0 && (!groupName.trim() || !composition.trim() || imagePreviews.length === 0)) ||
                    (currentStep === 1 && (variantGroups.length === 0 || !variantGroups.every(vg => 
                      vg.items.length > 0 && 
                      vg.items.every(item => item.name.trim() && typeof item.price === 'number' && item.price > 0)
                    ))) ||
                    (currentStep === 2 && (!deadlineDate || !pickupDate || !pickupDeadlineDate))
                  )) ||
                  (currentStep === wizardSteps.length - 1 && !validation.isValid)
                } 
                className="save-button"
                title="저장 (Ctrl+S)"
              >
                {isSubmitting ? <SodomallLoader /> : <Save size={14} />}
                {currentStep === wizardSteps.length - 1 ? submitButtonText : '다음 단계'}
              </button>
            </div>
          </header>

          <main className="main-content-grid-with-preview">
            {/* 왼쪽: 폼 영역 */}
            <div className="form-content-area">
            {/* 단계별 컨텐츠 */}
            {currentStep === 0 && (
              <>
            {/* 대표 상품 정보 */}
            <div className="form-section">
              <div className="form-section-title">
                <div className="title-text-group">
                  <Package size={20} className="icon-color-product" />
                  <h3>대표 상품 정보</h3>
                </div>

                {mode === 'newProduct' && (
                  <div className="product-type-toggle-inline">
                    <button
                      type="button"
                      className={productType === 'single' ? 'active' : ''}
                      onClick={() => handleProductTypeChange('single')}
                    >
                      단일
                    </button>
                    <button
                      type="button"
                      className={productType === 'group' ? 'active' : ''}
                      onClick={() => handleProductTypeChange('group')}
                    >
                      그룹
                    </button>
                  </div>
                )}
              </div>

              <p className="section-subtitle">상품의 기본 정보는 모든 판매 회차에 공통 적용됩니다.</p>

              <div className="form-group with-validation">
                <label>대표 상품명 *</label>
                {getFieldError('groupName', validation) && (
                  <div className={`field-error ${getFieldError('groupName', validation)?.type}`}>
                    {getFieldError('groupName', validation)?.message}
                  </div>
                )}
                <div className="input-wrapper">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    required
                    className={getFieldError('groupName', validation) ? 'has-error' : ''}
                  />
                  {isCheckingDuplicates && (
                    <div className="input-spinner-wrapper">
                      <Loader2 className="spinner-icon" />
                    </div>
                  )}
                </div>

                {mode === 'newProduct' && similarProducts.length > 0 && (
                  <div className="similar-products-warning">
                    <span>
                      <AlertTriangle size={16} /> 유사한 이름의 상품이 이미 존재합니다. 새 회차로 추가하시겠어요?
                    </span>
                    <ul>
                      {similarProducts.map((p) => (
                        <li key={p.id} className="similar-product-item">
                          <span>{p.groupName}</span>
                          <button
                            type="button"
                            className="add-round-for-similar-btn"
                            onClick={() =>
                              navigate('/admin/products/add', {
                                state: {
                                  productId: p.id,
                                  productGroupName: p.groupName,
                                  lastRound: (p as any).salesHistory?.[0],
                                },
                              })
                            }
                          >
                            이 상품에 새 회차 추가
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>카테고리(자동 분류)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={categoryId ?? ''}
                    onChange={(e) => {
                      const next = e.target.value || null;
                      setCategoryId(next);
                      setIsCategoryManual(true);
                    }}
                    style={{ minWidth: 240 }}
                  >
                    <option value="">미분류</option>
                    {categoryDocs.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}{cat.isActive ? '' : ' (비활성)'}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={handleApplyAutoCategory}>
                    자동 적용
                  </button>
                  <button type="button" className="ghost" onClick={() => setIsRuleModalOpen(true)}>
                    키워드 편집
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  자동 추천: {autoSuggestion.label}
                </div>
              </div>

              <div className="form-group">
                <label>구성 *</label>
                {getFieldError('composition', validation) && (
                  <div className={`field-error ${getFieldError('composition', validation)?.type}`}>
                    {getFieldError('composition', validation)?.message}
                  </div>
                )}
                <textarea
                  value={composition}
                  onChange={(e) => setComposition(e.target.value)}
                  placeholder={`예)\n- 인절미 1kg\n- 콩고물 100g`}
                  rows={4}
                  className={getFieldError('composition', validation) ? 'has-error' : ''}
                />
              </div>

              <div className="form-group">
                <label>기타정보 (선택)</label>
                <textarea
                  value={extraInfo}
                  onChange={(e) => setExtraInfo(e.target.value)}
                  placeholder={`예)\n- 냉동보관\n- 유통기한: 2026.10.20`}
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>보관타입</label>
                <div className="settings-option-group">
                  {storageTypeOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`settings-option-btn ${opt.className} ${selectedStorageType === opt.key ? 'active' : ''}`}
                      onClick={() => setSelectedStorageType(opt.key)}
                      disabled={!(mode === 'editRound' || mode === 'newProduct' || mode === 'newRound')}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>대표 이미지 *</label>
                {getFieldError('imageUrls', validation) && (
                  <div className={`field-error ${getFieldError('imageUrls', validation)?.type}`}>
                    {getFieldError('imageUrls', validation)?.message}
                  </div>
                )}

                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="image-previews" direction="horizontal">
                    {(provided) => (
                      <div
                        className="compact-image-uploader"
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple
                          accept="image/png, image/jpeg"
                          style={{ display: 'none' }}
                          disabled={!(mode === 'editRound' || mode === 'newProduct' || mode === 'newRound')}
                        />

                        {imagePreviews.map((p, i) => (
                          <Draggable
                            key={p + i}
                            draggableId={p + i.toString()}
                            index={i}
                            isDragDisabled={!(mode === 'editRound' || mode === 'newProduct' || mode === 'newRound')}
                          >
                            {(provided2, snapshot) => (
                              <div
                                ref={provided2.innerRef}
                                {...provided2.draggableProps}
                                {...provided2.dragHandleProps}
                                className={`thumbnail-preview ${snapshot.isDragging ? 'dragging' : ''}`}
                                style={{ ...provided2.draggableProps.style }}
                              >
                                <img src={p} alt={`미리보기 ${i + 1}`} />
                                <button
                                  type="button"
                                  onClick={() => removeImage(i)}
                                  className="remove-thumbnail-btn"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        ))}

                        {provided.placeholder}

                        {imagePreviews.length < 10 &&
                          (mode === 'editRound' || mode === 'newProduct' || mode === 'newRound') && (
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="add-thumbnail-btn"
                            >
                              <PlusCircle size={20} />
                            </button>
                          )}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                {mode === 'newRound' && (
                  <p className="input-description">
                    새 회차 추가 시에는 대표 정보(이름, 설명, 이미지 등)도 함께 수정할 수 있습니다.
                  </p>
                )}
              </div>
            </div>

              </>
            )}

            {currentStep === 1 && (
              <>
            {/* 판매 옵션 */}
            <div className="form-section">
              <div className="form-section-title">
                <div className="title-text-group">
                  <Box size={20} className="icon-color-option" />
                  <h3>판매 옵션 *</h3>
                </div>
              </div>
              <p className="section-subtitle">현재 회차에만 적용되는 옵션, 가격, 재고 등을 설정합니다.</p>

              <div className="form-group">
                <label>회차명</label>
                <input type="text" value={roundName} onChange={(e) => setRoundName(e.target.value)} required />
              </div>

              {variantGroups.map((vg) => (
                <div className="variant-group-card" key={vg.id}>
                  <div className="variant-group-header">
                    <div className="form-group full-width">
                      <label>하위 상품 그룹명 *</label>
                      <input
                        type="text"
                        value={vg.groupName}
                        onChange={(e) => handleVariantGroupChange(vg.id, 'groupName', e.target.value)}
                        placeholder={productType === 'group' ? '예: 얼큰소고기맛' : '상품명과 동일하게'}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        <Tippy
                          content={
                            mode === 'editRound'
                              ? '현재 남은 재고 수량입니다. 여기에 추가할 수량을 더해서 입력하면 됩니다.'
                              : '판매 기간 전체에 적용될 물리적인 재고 수량입니다. 비워두면 무제한 판매됩니다.'
                          }
                        >
                          <span>{mode === 'editRound' ? '남은 재고' : '총 재고'}</span>
                        </Tippy>
                      </label>

                      <div className="stock-input-wrapper">
                        <input
                          type="number"
                          value={vg.totalPhysicalStock}
                          onChange={(e) => handleVariantGroupChange(vg.id, 'totalPhysicalStock', normalizeNumberInput(e.target.value))}
                          placeholder="무제한"
                        />
                        <span className="stock-unit-addon">{vg.stockUnitType || '개'}</span>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>유통기한</label>
                      <input
                        type="date"
                        className="date-input-native"
                        value={toYmd(vg.expirationDate)}
                        onChange={(e) => handleVariantGroupChange(vg.id, 'expirationDate', fromYmd(e.target.value))}
                      />
                    </div>

                    {productType === 'group' && (
                      <button
                        type="button"
                        onClick={() => removeVariantGroup(vg.id)}
                        className="remove-variant-group-btn"
                        disabled={variantGroups.length <= 1}
                        title={variantGroups.length <= 1 ? '마지막 그룹은 삭제할 수 없습니다.' : '그룹 삭제'}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {vg.items.map((item) => (
                    <div className="option-item-section" key={item.id}>
                      <div className="option-item-grid-2x2">
                        <div className="form-group-grid item-name">
                          <label>선택지 *</label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleItemChange(vg.id, item.id, 'name', e.target.value)}
                            required
                          />
                        </div>

                        {eventType === 'PREMIUM' && (
                          <div className="form-group-grid item-price">
                            <label className="tooltip-container">
                              <span>정상가 (선택)</span>
                            </label>
                            <div className="price-input-wrapper" style={{ background: '#f9f9f9' }}>
                              <input
                                type="text"
                                placeholder="정가"
                                value={formatKRW((item as any).originalPrice || '')}
                                onChange={(e) => handleOriginalPriceChange(vg.id, item.id, e.target.value)}
                              />
                              <span style={{ color: '#aaa' }}>원</span>
                            </div>
                          </div>
                        )}

                        <div className="form-group-grid item-price">
                          <label>판매가 *</label>
                          <div className="price-input-wrapper">
                            <input
                              type="text"
                              value={formatKRW(typeof item.price === 'number' ? item.price : '')}
                              onChange={(e) => handlePriceChange(vg.id, item.id, e.target.value)}
                              required
                            />
                            <span>원</span>
                          </div>
                        </div>

                        <div className="form-group-grid item-limit">
                          <label className="tooltip-container">
                            <span>구매 제한</span>
                          </label>
                          <input
                            type="number"
                            value={item.limitQuantity}
                            onChange={(e) => handleItemChange(vg.id, item.id, 'limitQuantity', normalizeNumberInput(e.target.value))}
                            placeholder="없음"
                          />
                        </div>

                        <div className="form-group-grid item-deduction">
                          <label className="tooltip-container">
                            <span>차감 단위 *</span>
                          </label>
                          <input
                            type="number"
                            value={item.deductionAmount}
                            onChange={(e) => handleItemChange(vg.id, item.id, 'deductionAmount', normalizeNumberInput(e.target.value))}
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(vg.id, item.id)}
                        className="remove-item-btn"
                        disabled={vg.items.length <= 1}
                        title={vg.items.length <= 1 ? '마지막 옵션은 삭제할 수 없습니다.' : '옵션 삭제'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  <div className="option-item-actions">
                    <button type="button" onClick={() => addNewItem(vg.id)} className="add-item-btn">
                      구매 옵션 추가
                    </button>
                  </div>
                </div>
              ))}

              <div className="variant-controls-footer">
                <div className="add-group-btn-wrapper">
                  {productType === 'group' && variantGroups.length < 5 && (
                    <button type="button" onClick={addNewVariantGroup} className="add-group-btn">
                      하위 상품 그룹 추가
                    </button>
                  )}
                </div>
              </div>
            </div>

              </>
            )}

            {currentStep === 2 && (
              <>
            {/* 발행/기간 설정 */}
            <div className="form-section">
              <div className="form-section-title">
                <div className="title-text-group">
                  <SlidersHorizontal size={20} className="icon-color-settings" />
                  <h3>발행 및 기간 설정</h3>
                </div>
              </div>

              <p className="section-subtitle">상품의 판매 시점 및 조건을 설정합니다.</p>

              <div className="form-group">
                <label>이벤트 타입</label>
                <div className="input-with-icon">
                  <Gift size={16} className="input-icon" />
                  <select
                    value={eventType}
                    onChange={(e) =>
                      setEventType(e.target.value as any)
                    }
                  >
                    <option value="NONE">일반 상품</option>
                    <option value="CHUSEOK">🌕 추석 특집</option>
                    <option value="SEOLLAL">🧧 설날 특집</option>
                    <option value="ANNIVERSARY">🎉 1주년 기념 🎉</option>
                    <option value="CHRISTMAS">🎁 크리스마스 특집 🎁</option>
                    <option value="PREMIUM">👑 프리미엄 (베리맘/럭셔리)</option>
                  </select>
                </div>

                {eventType === 'PREMIUM' && (
                  <p className="input-description" style={{ color: '#d4af37', fontWeight: 600 }}>
                    * 프리미엄 선택 시 '송도픽 단독'으로 자동 분류되며, 일반 목록에는 노출되지 않습니다.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label>판매 옵션</label>
                <div className="settings-option-group">
                  <Tippy content="선입금 필수 상품으로 설정합니다.">
                    <button
                      type="button"
                      className={`settings-option-btn ${isPrepaymentRequired ? 'active' : ''}`}
                      onClick={() => setIsPrepaymentRequired((v) => !v)}
                    >
                      <Save size={16} /> 선입금
                    </button>
                  </Tippy>

                  <Tippy content="선주문 등 판매 조건을 설정합니다.">
                    <button
                      type="button"
                      className={`settings-option-btn ${(isPreOrderEnabled && preOrderTiers.length > 0) ? 'active' : ''}`}
                      onClick={() => setIsSettingsModalOpen(true)}
                    >
                      <SlidersHorizontal size={16} /> 등급 설정
                    </button>
                  </Tippy>
                </div>
              </div>

              <div className="form-group">
                <label>발행일 (오후 2시 공개)</label>
                <input
                  type="date"
                  value={toYmd(publishDate)}
                  onChange={(e) => setPublishDate(fromYmd(e.target.value) ?? new Date())}
                  required
                />
                {mode !== 'editRound' && <p className="input-description">선택한 날짜 오후 2시에 공개됩니다.</p>}
              </div>

              <div className="form-group">
                <label>공동구매 마감일 *</label>
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(deadlineDate)}
                  onChange={(e) => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)}
                  required
                />
              </div>

              <div className="form-group">
                <label>픽업 시작일 *</label>
                <input
                  type="date"
                  value={toYmd(pickupDate)}
                  onChange={(e) => setPickupDate(fromYmd(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label>픽업 마감일 *</label>
                <input
                  type="date"
                  value={toYmd(pickupDeadlineDate)}
                  onChange={(e) => setPickupDeadlineDate(fromYmd(e.target.value))}
                  required
                />
              </div>

              <div className="settings-summary-card">
                <h4 className="summary-title">
                  <Info size={16} /> 설정 요약
                </h4>
                <ul>
                  <li>
                    <strong>발행:</strong> {settingsSummary.publishText}
                  </li>
                  <li>
                    <strong>공구 마감:</strong> {settingsSummary.deadlineText}
                  </li>
                  <li>
                    <strong>픽업:</strong> {settingsSummary.pickupText} - {settingsSummary.pickupDeadlineText}
                  </li>
                  <li>
                    <strong>참여 조건:</strong> {settingsSummary.participationText}
                  </li>
                </ul>
              </div>
            </div>
              </>
            )}

            {currentStep === 3 && (
              <div className="form-section review-section">
                <h3>최종 확인</h3>
                <div className="validation-summary">
                  {validation.errors.length > 0 && (
                    <div className="validation-errors">
                      <h4>❌ 필수 항목 오류 ({validation.errors.length}개)</h4>
                      <ul>
                        {validation.errors.map((error, i) => (
                          <li key={i}>{error.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="validation-warnings">
                      <h4>⚠️ 경고 ({validation.warnings.length}개)</h4>
                      <ul>
                        {validation.warnings.map((warning, i) => (
                          <li key={i}>{warning.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validation.isValid && validation.warnings.length === 0 && (
                    <div className="validation-success">
                      <h4>✅ 모든 항목이 올바르게 입력되었습니다!</h4>
                      <p>저장 버튼을 눌러 상품을 등록하세요.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* 오른쪽: 미리보기 영역 */}
            <div className="preview-content-area">
              <ProductPreview
                groupName={groupName}
                description=""
                imageUrls={imagePreviews}
                price={typeof variantGroups[0]?.items[0]?.price === 'number' ? variantGroups[0].items[0].price : ''}
                roundName={roundName}
                publishDate={publishDate}
                pickupDate={pickupDate}
                storageType={selectedStorageType}
                composition={composition}
                categories={categories}
                extraInfo={extraInfo}
                expirationDate={variantGroups[0]?.expirationDate || null}
                variantGroups={variantGroups}
              />
            </div>
          </main>
        </form>

        {isSubmitting && <SodomallLoader message="저장 중입니다..." />}
      </div>
    </>
  );
};

export default ProductForm;
