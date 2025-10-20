// src/components/admin/ProductForm.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  addProductWithFirstRound,
  addNewSalesRound,
  getCategories,
  searchProductsByName,
  getProductById,
  updateSalesRound,
  updateProductCoreInfo,
  functions,
  getReservedQuantitiesMap,
  uploadImages, // ✅ [추가] 이미지 업로드 서비스 import
} from '@/firebase';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
// ✅ [수정] 올바른 경로에서 모든 타입을 가져옵니다.
import type {
  Category,
  StorageType,
  Product,
  SalesRound,
  SalesRoundStatus,
  VariantGroup,
  ProductItem,
  LoyaltyTier
} from '@/shared/types';
import toast from 'react-hot-toast';
import {
  Save, PlusCircle, X, Package, Box, SlidersHorizontal, Trash2, Info,
  FileText, Clock, Lock, AlertTriangle, Loader2, CalendarPlus, Bot, Tag, Gift
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';

// ✅ [수정] 중복된 import를 하나로 합칩니다.
import SodomallLoader from '@/components/common/SodomallLoader';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import '@/pages/admin/ProductAddAdminPage.css';
import { formatKRW, parseKRW } from '@/utils/number';
import { toYmd, toDateTimeLocal, fromYmd } from '@/utils/date';
import { reportError } from '@/utils/logger';
import dayjs from 'dayjs';

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
  id: string; name: string; price: number | '';
  limitQuantity: number | ''; deductionAmount: number | '';
  isBundleOption?: boolean;
}
interface VariantGroupUI {
  id: string; groupName: string; totalPhysicalStock: number | '';
  stockUnitType: string; expirationDate: Date | null;
  items: ProductItemUI[];
}

interface AIParsedData {
  productType: 'single' | 'group';
  storageType: StorageType;
  categoryName: string | null;
  groupName: string | null;
  cleanedDescription: string | null;
  hashtags?: string[];
  variantGroups: {
    groupName: string | null;
    totalPhysicalStock: number | null;
    expirationDate: string | null; // YYYY-MM-DD
    pickupDate: string | null;     // YYYY-MM-DD
    items: { name: string; price: number; stockDeductionAmount: number; }[];
  }[];
}

// --- 헬퍼 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);

const parseDateStringToDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString) return null;
  let date = new Date(dateString);
  if (!isNaN(date.getTime()) && date.getFullYear() > 1970) return date;

  const cleaned = String(dateString).replace(/[^0-9]/g, '');
  let year: number, month: number, day: number;

  if (cleaned.length === 8) {
    year = parseInt(cleaned.substring(0, 4), 10);
    month = parseInt(cleaned.substring(4, 6), 10) - 1;
    day = parseInt(cleaned.substring(6, 8), 10);
  } else if (cleaned.length === 6) {
    const tempYear = parseInt(cleaned.substring(0, 2), 10);
    year = 2000 + tempYear;
    month = parseInt(cleaned.substring(2, 4), 10) - 1;
    day = parseInt(cleaned.substring(4, 6), 10);
  } else {
    return null;
  }
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const finalDate = new Date(year, month, day);
  if (finalDate.getFullYear() === year && finalDate.getMonth() === month && finalDate.getDate() === day) {
    return finalDate;
  }
  return null;
};

const convertToDate = (dateSource: any): Date | null => {
  if (!dateSource) return null;
  if (dateSource instanceof Date) return dateSource;
  if (typeof dateSource.toDate === 'function') return dateSource.toDate();
  if (typeof dateSource === 'object' && dateSource.seconds !== undefined && dateSource.nanoseconds !== undefined) {
    return new Timestamp(dateSource.seconds, dateSource.nanoseconds).toDate();
  }
  const d = new Date(dateSource);
  if (!isNaN(d.getTime())) return d;
  return null;
};

const storageTypeOptions: { key: StorageType; name: string; className: string }[] = [
  { key: 'ROOM', name: '실온', className: 'storage-btn-room' },
  { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' },
  { key: 'COLD', name: '냉장', className: 'storage-btn-cold' },
  { key: 'FRESH', name: '신선', className: 'storage-btn-fresh' }
];
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALL_LOYALTY_TIERS: LoyaltyTier[] = ['공구의 신', '공구왕', '공구요정', '공구새싹', '공구초보'];

// --- 모달 ---
interface SettingsModalProps {
  isOpen: boolean; onClose: () => void;
  isPreOrderEnabled: boolean; setIsPreOrderEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  preOrderTiers: LoyaltyTier[]; setPreOrderTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>;
  isSecretProductEnabled: boolean; setIsSecretProductEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  secretTiers: LoyaltyTier[]; setSecretTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>;
}
const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, isPreOrderEnabled, setIsPreOrderEnabled,
  preOrderTiers, setPreOrderTiers, isSecretProductEnabled, setIsSecretProductEnabled,
  secretTiers, setSecretTiers
}) => {
  if (!isOpen) return null;
  const handlePreOrderTierChange = (tier: LoyaltyTier) => {
    setPreOrderTiers(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]);
  };
  const handleSecretTierChange = (tier: LoyaltyTier) => {
    setSecretTiers(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]);
  };
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h4><SlidersHorizontal size={20}/> 등급별 판매 설정</h4>
          <button onClick={onClose} className="admin-modal-close-button"><X size={24}/></button>
        </div>
        <div className="admin-modal-body">
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="preorder-toggle-label">
              <span><Clock size={16} /> 선주문 기능 사용</span>
              <div className={`toggle-switch ${isPreOrderEnabled ? 'active' : ''}`} onClick={() => setIsPreOrderEnabled(!isPreOrderEnabled)}>
                <div className="toggle-handle"></div>
              </div>
            </label>
            {isPreOrderEnabled && (
              <div className="preorder-options active">
                <p className="preorder-info"><Info size={14} />선택된 등급은 상품 발행일 오후 2시까지 선주문이 가능합니다.</p>
                <div className="tier-checkbox-group">
                  {ALL_LOYALTY_TIERS.map(tier => (
                    <label key={`preorder-${tier}`} htmlFor={`preorder-tier-${tier}`}>
                      <input type="checkbox" id={`preorder-tier-${tier}`} value={tier}
                        checked={preOrderTiers.includes(tier as LoyaltyTier)}
                        onChange={() => handlePreOrderTierChange(tier as LoyaltyTier)} />
                      {tier}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="preorder-toggle-label">
              <span><Lock size={16} /> 시크릿 상품 (등급 제한)</span>
              <div className={`toggle-switch ${isSecretProductEnabled ? 'active' : ''}`} onClick={() => setIsSecretProductEnabled(!isSecretProductEnabled)}>
                <div className="toggle-handle"></div>
              </div>
            </label>
            {isSecretProductEnabled && (
              <div className="preorder-options active">
                <p className="preorder-info"><Info size={14} />선택된 등급의 고객에게만 이 상품이 노출됩니다.</p>
                <div className="tier-checkbox-group">
                  {ALL_LOYALTY_TIERS.map(tier => (
                    <label key={`secret-${tier}`} htmlFor={`secret-tier-${tier}`}>
                      <input type="checkbox" id={`secret-tier-${tier}`} value={tier}
                        checked={secretTiers.includes(tier)}
                        onChange={() => handleSecretTierChange(tier)} />
                      {tier}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="admin-modal-footer">
          <button onClick={onClose} className="modal-button primary">확인</button>
        </div>
      </div>
    </div>
  );
};

// --- 본 컴포넌트 ---
const ProductForm: React.FC<ProductFormProps> = ({ mode, productId, roundId, initialState }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(mode === 'editRound' || mode === 'newRound');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageTitle, setPageTitle] = useState('새 상품 등록');
  const [submitButtonText, setSubmitButtonText] = useState('신규 상품 등록하기');

  const [initialProduct, setInitialProduct] = useState<Partial<Product> | null>(null);
  const [initialRound, setInitialRound] = useState<Partial<SalesRound> | null>(null);

  const [productType, setProductType] = useState<'single' | 'group'>('single');
  const [categories, setCategories] = useState<Category[]>([]);
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [selectedMainCategory, setSelectedMainCategory] = useState('');
  const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
  const [creationDate, setCreationDate] = useState<Date>(new Date());

  const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [previewUrlToFile, setPreviewUrlToFile] = useState<Map<string, File>>(new Map());

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
  const [isSecretProductEnabled, setIsSecretProductEnabled] = useState(false);
  const [secretTiers, setSecretTiers] = useState<LoyaltyTier[]>([]);

  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isParsingWithAI, setIsParsingWithAI] = useState(false);
  const [eventType, setEventType] = useState<'NONE' | 'CHUSEOK'>('NONE');


  useEffect(() => {
    switch (mode) {
      case 'newProduct':
        setPageTitle('신규 대표 상품 등록');
        setSubmitButtonText('신규 상품 등록하기');
        if (initialState?.productGroupName) {
          setGroupName(initialState.productGroupName);
          setVariantGroups(prev => {
            const newVgs = [...prev];
            if (newVgs[0]) newVgs[0].groupName = initialState.productGroupName;
            return newVgs;
          });
        }
        break;
      case 'newRound':
        setPageTitle(`'${initialState?.productGroupName || ''}' 새 회차 추가`);
        setSubmitButtonText('새 회차 추가하기');
        break;
      case 'editRound':
        setPageTitle('판매 회차 수정');
        setSubmitButtonText('수정 내용 저장');
        break;
    }
  }, [mode, initialState?.productGroupName]);

  useEffect(() => {
    // ✅ [수정] fetchData가 카테고리를 독립적으로 불러와 처리하도록 변경 (setCategories 호출)
    const fetchData = async () => {
      if (!productId && mode !== 'newProduct') return;
      
      setIsLoading(true);
      try {
        const [categoriesData, reservedMapData, productData] = await Promise.all([
            getCategories(),
            mode === 'editRound' && productId ? getReservedQuantitiesMap() : Promise.resolve(new Map<string, number>()),
            productId ? getProductById(productId) : Promise.resolve(null),
        ]);

        // ✅ [추가] 카테고리 상태를 여기서 설정하여 다른 로직에서 안전하게 사용 가능하도록 함
        setCategories(categoriesData);

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
            if (mode === 'editRound') {
                setInitialProduct({
                    groupName: product.groupName,
                    description: product.description,
                    hashtags: product.hashtags,
                    storageType: product.storageType,
                    category: product.category,
                });
            }

            setGroupName(product.groupName);
            setDescription(product.description);
            setHashtags(product.hashtags || []);
            setSelectedStorageType(product.storageType);
            if (product.createdAt) setCreationDate(convertToDate(product.createdAt) || new Date());
            
            // ✅ [최종 수정] categoriesData가 null/undefined일 경우 빈 배열([])을 사용하도록 합니다.
            const categoriesArray = categoriesData || [];
            
            // 🚨 [강화된 방어 로직]: product가 존재하고, category 필드 값이 존재할 때만 find를 시도합니다.
            if (product.category) {
              const mainCat = categoriesArray.find(c => c.name === product.category);
              if (mainCat) setSelectedMainCategory(mainCat.id);
            }
            
            setInitialImageUrls(product.imageUrls || []);
            setCurrentImageUrls(product.imageUrls || []);
            setImagePreviews(product.imageUrls || []);
        }

        const salesHistory: SalesRound[] = Array.isArray((product as any)?.salesHistory)
  ? (product as any).salesHistory
  : [];

let roundToLoad: SalesRound | undefined;
if (mode === 'editRound' && roundId && product) {
  roundToLoad = salesHistory.find(r => r.roundId === roundId);
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
    const newRoundNumber = roundNumMatch ? parseInt(roundNumMatch[0], 10) + 1 : (salesHistory.length + 1);
    setRoundName(`${newRoundNumber}차 판매`);
  } else {
    setRoundName('1차 판매');
  }
}


        if (roundToLoad && product) {
          const roundData = roundToLoad as SalesRound & { preOrderTiers?: LoyaltyTier[]; allowedTiers?: LoyaltyTier[] };
          if (mode === 'editRound') setRoundName(roundData.roundName);
          setProductType(((roundData.variantGroups?.length || 0) > 1) ||
            (roundData.variantGroups?.[0]?.groupName !== product.groupName) ? 'group' : 'single');
          setEventType((roundData.eventType || 'NONE') as 'NONE' | 'CHUSEOK');

const mappedVGs: VariantGroupUI[] = (roundData.variantGroups || []).map((vg: VariantGroup) => {
            const expirationDate = convertToDate(vg.items?.[0]?.expirationDate);

            let displayStock: number | '' = vg.totalPhysicalStock ?? '';
            if (mode === 'editRound' && roundId) {
                const key = `${productId}-${roundId}-${vg.id}`;
                const reservedCount = reservedMapData.get(key) || 0;
                const configuredStock = vg.totalPhysicalStock ?? -1;

                // ⛑️ [수정] Yi Dan의 제안대로 무제한 재고(-1)일 경우 ''(빈칸)으로 표시되도록 수정
                displayStock = (configuredStock === -1) ? '' : Math.max(0, configuredStock - reservedCount);
                
            } else if (mode === 'newRound' && salesHistory[0]?.variantGroups) {
              displayStock = '';
            }

            return {
              id: vg.id,
              // ⛑️ 문자열 필드는 기본값 ''로
              groupName: vg.groupName ?? '',
              totalPhysicalStock: displayStock,
              // ⛑️ 문자열 필드 기본값
              stockUnitType: vg.stockUnitType ?? '개',
              expirationDate,
              items: (vg.items || []).map((item: ProductItem) => ({
                id: item.id,
                // ⛑️ 문자열 필드 안전값
                name: item.name ?? '',
                // ⛑️ (핵심) price가 undefined면 ''로 (formatKRW와 text input 모두 안전)
                price: (typeof item.price === 'number') ? item.price : '',
                // 이미 방어 로직이 적용된 부분
                limitQuantity: item.limitQuantity ?? '',
                deductionAmount: item.stockDeductionAmount ?? 1,
                isBundleOption: bundleUnitKeywords.some(k => String(item.name ?? '').includes(k)),
              })),
            };
          });          setVariantGroups(mappedVGs);

          if (mode === 'editRound') {
            setPublishDate(convertToDate(roundData.publishAt) || new Date());
            setDeadlineDate(convertToDate(roundData.deadlineDate));
            setPickupDate(convertToDate(roundData.pickupDate));
            setPickupDeadlineDate(convertToDate(roundData.pickupDeadlineDate));
          } else if (mode === 'newRound') {
            // 새 회차의 날짜는 초기화하거나 마지막 회차의 날짜를 복사 (현재 로직 유지)
            // 여기서는 기존 데이터를 사용하지 않고, 기본값이나 자동 계산된 값을 사용하도록 조정할 수 있으나, 
            // 현재 코드는 'newRound' 모드일 때 날짜를 복사하지 않고 기본값(아래 useEffect)을 따르는 것으로 보입니다.
          }
          setIsPrepaymentRequired(roundData.isPrepaymentRequired ?? false);
          setIsPreOrderEnabled(roundData.preOrderTiers ? roundData.preOrderTiers.length > 0 : true);
          setPreOrderTiers(roundData.preOrderTiers || ['공구의 신', '공구왕']);
          const secretForTiers = roundData.allowedTiers;
          setIsSecretProductEnabled(!!secretForTiers && secretForTiers.length < ALL_LOYALTY_TIERS.length);
          setSecretTiers(secretForTiers || []);
        }
      } catch (err) {
        reportError('ProductForm.fetchData', err);
        toast.error('양식 데이터를 불러오는 데 실패했습니다.');
      } finally { setIsLoading(false); }
    };
    if (mode === 'editRound' || mode === 'newRound') fetchData();
  }, [mode, productId, roundId, navigate, initialState]);

  useEffect(() => {
    // ✅ [수정] 기존에 분리되어 있던 카테고리 로딩 로직을 fetchData로 옮겼으므로,
    // 새 상품 등록 시 초기화 로직만 남깁니다.
    if (mode === 'newProduct' && variantGroups.length === 0) {
      setVariantGroups([{
        id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개',
        expirationDate: null,
        items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }]
      }]);
    }
  }, [mode, variantGroups.length]);

  useEffect(() => {
    if (mode === 'editRound' || eventType === 'CHUSEOK') return;

    const baseDate = dayjs(publishDate);
    let deadline = baseDate.add(1, 'day');

    const dayOfWeek = deadline.day();

    if (dayOfWeek === 6) {
      deadline = deadline.add(2, 'day');
    } else if (dayOfWeek === 0) {
      deadline = deadline.add(1, 'day');
    }

    const finalDeadline = deadline.hour(13).minute(0).second(0).millisecond(0).toDate();

    setDeadlineDate(finalDeadline);
  }, [publishDate, mode, eventType]);

  useEffect(() => {
    if (!pickupDate) { setPickupDeadlineDate(null); return; }
    const newPickupDeadline = new Date(pickupDate);
    if (selectedStorageType === 'ROOM' || selectedStorageType === 'FROZEN') {
      newPickupDeadline.setDate(newPickupDeadline.getDate() + 1);
    }
    newPickupDeadline.setHours(13, 0, 0, 0);
    setPickupDeadlineDate(newPickupDeadline);
  }, [pickupDate, selectedStorageType]);

  useEffect(() => {
    if (productType === 'single' && variantGroups.length > 0) {
      setVariantGroups(prev => {
        const first = prev[0];
        if (first && first.groupName !== groupName) {
          const cp = [...prev];
          cp[0] = { ...first, groupName };
          return cp;
        }
        return prev;
      });
    }
  }, [groupName, productType]);

  useEffect(() => {
    if (mode !== 'newProduct' || !groupName.trim()) { setSimilarProducts([]); return; }
    const handler = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      try { setSimilarProducts(await searchProductsByName(groupName.trim())); }
      catch (e) { reportError('ProductForm.searchProductsByName', e); }
      finally { setIsCheckingDuplicates(false); }
    }, 500);
    return () => clearTimeout(handler);
  }, [groupName, mode]);

  const handleProductTypeChange = useCallback((newType: 'single' | 'group') => {
    if (productType === newType) return;
    if (productType === 'group' && newType === 'single') {
      toast.promise(new Promise<void>((resolve) => {
        setTimeout(() => {
          setVariantGroups(prev => prev.slice(0, 1));
          setProductType(newType);
          resolve();
        }, 300);
      }), { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' });
    } else setProductType(newType);
  }, [productType]);

  const handleVariantGroupChange = useCallback((id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => {
    setVariantGroups(prev => prev.map(vg => (vg.id === id ? { ...vg, [field]: value } : vg)));
  }, []);

  const addNewVariantGroup = useCallback(() => {
    setVariantGroups(prev => [...prev, {
      id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개',
      expirationDate: null,
      items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }]
    }]);
  }, []);
  const removeVariantGroup = useCallback((id: string) => {
    if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id));
    else toast.error('최소 1개의 하위 그룹이 필요합니다.');
  }, [variantGroups.length]);

  const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'>, value: any) => {
    setVariantGroups(prev => prev.map(vg => vg.id === vgId ? {
      ...vg,
      items: vg.items.map(item => {
        if (item.id !== itemId) return item;
        const updated = { ...item, [field]: value } as ProductItemUI;
        if (field === 'name') {
          const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k));
          updated.isBundleOption = isBundle;
          updated.deductionAmount = isBundle ? item.deductionAmount : 1;
        }
        return updated;
      })
    } : vg));
  }, []);
    const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => {
     const numericValue = parseKRW(value);
      setVariantGroups(prev => prev.map(vg => vg.id === vgId ? {
      ...vg,
      items: vg.items.map(item => item.id === itemId ? { ...item, price: numericValue } : item)
    } : vg));
  }, []);
  const addNewItem = useCallback((vgId: string) => {
    setVariantGroups(prev => prev.map(vg => vg.id === vgId ? {
      ...vg,
      items: [...vg.items, { id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }]
    } : vg));
  }, []);
  const removeItem = useCallback((vgId: string, itemId: string) => {
    setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (
      vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg
    ) : vg));
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter((file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`'${file.name}' 파일 크기가 너무 큽니다 (최대 5MB).`);
        return false;
      }
      return true;
    });

    setNewImageFiles(prev => [...prev, ...files]);

    setImagePreviews(prev => {
      const next = [...prev];
      const nextMap = new Map(previewUrlToFile);
      files.forEach((file: File) => {
        const url = URL.createObjectURL(file);
        next.push(url);
        nextMap.set(url, file);
      });
      setPreviewUrlToFile(nextMap);
      return next;
    });

    e.target.value = '';
  }, [previewUrlToFile]);

  const removeImage = useCallback((indexToRemove: number) => {
    const urlToRemove = imagePreviews[indexToRemove];
    if (!urlToRemove) return;

    if (urlToRemove.startsWith('blob:')) {
      const fileToRemove = previewUrlToFile.get(urlToRemove) || null;
      if (fileToRemove) {
        setNewImageFiles(prev => prev.filter(f => f !== fileToRemove));
        const nextMap = new Map(previewUrlToFile);
        nextMap.delete(urlToRemove);
        setPreviewUrlToFile(nextMap);
      }
      URL.revokeObjectURL(urlToRemove);
    } else {
      setCurrentImageUrls(prev => prev.filter(u => u !== urlToRemove));
    }
    setImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
  }, [imagePreviews, previewUrlToFile]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;
    const reorderedPreviews = Array.from(imagePreviews);
    const [movedPreview] = reorderedPreviews.splice(source.index, 1);
    reorderedPreviews.splice(destination.index, 0, movedPreview);
    setImagePreviews(reorderedPreviews);

    if (mode === 'editRound') {
      const reorderedUrls = Array.from(currentImageUrls);
      const [movedUrl] = reorderedUrls.splice(source.index, 1);
      if (typeof movedUrl !== 'undefined') {
        reorderedUrls.splice(destination.index, 0, movedUrl);
        setCurrentImageUrls(reorderedUrls);
      }
    }
  };

const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = hashtagInput.trim().replace(/#/g, '');
      if (newTag && hashtags.length < 4 && !hashtags.includes(`#${newTag}`)) {
        setHashtags([...hashtags, `#${newTag}`]);
      }
      setHashtagInput('');
    }
};

const removeHashtag = (tagToRemove: string) => {
    setHashtags(hashtags.filter(tag => tag !== tagToRemove));
};

const applyParsed = (data: any) => {
  if (!data || typeof data !== 'object') {
    throw new Error('AI 응답 포맷이 올바르지 않습니다.');
  }

  if (data.groupName) setGroupName(String(data.groupName));
  if (data.cleanedDescription) setDescription(String(data.cleanedDescription));
  if (Array.isArray(data.hashtags)) {
    setHashtags(data.hashtags.slice(0, 4).map((tag: string) => tag.startsWith('#') ? tag : `#${tag}`));
  }
  if (data.storageType) setSelectedStorageType(data.storageType as StorageType);
  if (data.productType === 'single' || data.productType === 'group') {
    setProductType(data.productType);
  }

  if (data.categoryName && Array.isArray(categories) && categories.length > 0) {
    const found = categories.find(c => c.name === data.categoryName);
    if (found) {
      setSelectedMainCategory(found.id);
      toast.success(`'${found.name}' 카테고리 자동 선택`);
    } else {
      toast.error(`추천 카테고리 '${data.categoryName}'를 목록에서 찾을 수 없습니다.`);
    }
  }

  const firstVg = data.variantGroups?.[0];
  if (firstVg?.pickupDate) {
    const d = parseDateStringToDate(firstVg.pickupDate);
    if (d) setPickupDate(d);
  }

  if (Array.isArray(data.variantGroups) && data.variantGroups.length > 0) {
    const newVgs: VariantGroupUI[] = data.variantGroups.map((vg: any) => {
      const exp = parseDateStringToDate(vg.expirationDate);
      const items: ProductItemUI[] = Array.isArray(vg.items) && vg.items.length > 0
        ? vg.items.map((it: any) => ({
            id: generateUniqueId(),
            name: String(it.name ?? ''),
            price: typeof it.price === 'number' ? it.price : '',
            limitQuantity: '',
            deductionAmount: it.stockDeductionAmount ?? 1,
            isBundleOption: bundleUnitKeywords.some(k => String(it.name ?? '').includes(k)),
          }))
        : [{
            id: generateUniqueId(), name: '', price: '',
            limitQuantity: '', deductionAmount: 1, isBundleOption: false,
          }];
      return {
        id: generateUniqueId(),
        groupName: String(vg.groupName ?? data.groupName ?? ''),
        totalPhysicalStock: vg.totalPhysicalStock ?? '',
        stockUnitType: '개',
        expirationDate: exp,
        items,
      };
    });
    setVariantGroups(newVgs);
  } else {
    setVariantGroups([{
      id: generateUniqueId(),
      groupName: String(data.groupName ?? ''),
      totalPhysicalStock: '', stockUnitType: '개',
      expirationDate: null,
      items: [{
        id: generateUniqueId(), name: '', price: '',
        limitQuantity: '', deductionAmount: 1, isBundleOption: false,
      }],
    }]);
  }
};

const handleAIParse = async () => {
  if (!description?.trim()) {
    toast.error('먼저 상세 설명란에 분석할 내용을 붙여넣어 주세요.');
    return;
  }
  const payload = {
    text: description,
    categories: (categories ?? []).map(c => c.name),
  };

  setIsParsingWithAI(true);
  try {
    const callable = httpsCallable(functions, 'parseProductText');
    const res = await callable(payload) as HttpsCallableResult<any>;
    const data = res.data;
    applyParsed(data);
    toast.success('AI 분석 완료! 자동 입력 내용을 확인해주세요.');
  } catch (err: any) {
    const errorMessage = err?.details?.message || err.message || 'AI 분석 중 오류가 발생했습니다.';
    const finalMessage = `AI 분석 실패: ${errorMessage}`;
    toast.error(finalMessage);
    reportError('ProductForm.handleAIParse', err);
  } finally {
    setIsParsingWithAI(false);
  }
};

const settingsSummary = useMemo(() => {
   const publishDateTime = new Date(publishDate);
   publishDateTime.setHours(14, 0, 0, 0);
    const publishText = `${toYmd(publishDateTime)} 오후 2시`;
    const deadlineText = deadlineDate ? toDateTimeLocal(deadlineDate).replace('T', ' ') : '미설정';
    const pickupText = pickupDate ? toYmd(pickupDate) : '미설정';
    const pickupDeadlineText = pickupDeadlineDate ? toYmd(pickupDeadlineDate) : '미설정';
   const participationText = isSecretProductEnabled ? `${secretTiers.join(', ')} 등급만` : '모두 참여 가능';
   return { publishText, deadlineText, pickupText, pickupDeadlineText, participationText };
 }, [publishDate, deadlineDate, pickupDate, pickupDeadlineDate, isSecretProductEnabled, secretTiers]);

  const handleSubmit = async (isDraft: boolean = false) => {
    setIsSubmitting(true);

    const MIN_YEAR = 2020, MAX_YEAR = 2100;
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
      ...variantGroups.map((vg, i) => ({ date: vg.expirationDate, name: `옵션 ${i + 1}의 유통기한` }))
    ];
    for (const { date, name } of allDates) {
      if (!isValidDateRange(date, name)) { setIsSubmitting(false); return; }
    }

    if (!isDraft) {
      if (mode !== 'newRound' && imagePreviews.length === 0) { toast.error('대표 이미지를 1개 이상 등록해주세요.'); setIsSubmitting(false); return; }
      if (isDraft === false && (!deadlineDate || !pickupDate || !pickupDeadlineDate)) { toast.error('공구 마감일, 픽업 시작일, 픽업 마감일을 모두 설정해주세요.'); setIsSubmitting(false); return; }
      if (isSecretProductEnabled && secretTiers.length === 0) { toast.error('시크릿 상품을 활성화했습니다. 참여 가능한 등급을 1개 이상 선택해주세요.'); setIsSubmitting(false); return; }
    }

    try {
      const status: SalesRoundStatus = isDraft ? 'draft' : 'scheduled';
      const finalPublishDate = new Date(publishDate);
      finalPublishDate.setHours(14, 0, 0, 0);

      const salesRoundData = {
        roundName: roundName.trim(),
        status,
        eventType: eventType === 'NONE' ? null : eventType,
        variantGroups: variantGroups.map(vg => {
          let finalTotalPhysicalStock: number | null;
          const newStockFromInput = vg.totalPhysicalStock;

          if (mode === 'editRound' && productId && roundId) {
            const key = `${productId}-${roundId}-${vg.id}`;
            const initialReserved = initialReservedMap.get(key) || 0;

            if (newStockFromInput === '' || newStockFromInput < 0) {
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
            items: vg.items.map(item => ({
              id: item.id || generateUniqueId(),
              name: item.name,
              price: (Number(item.price) || 0),
              stock: -1,
              limitQuantity: (item.limitQuantity === '' ? null : Number(item.limitQuantity)),
              expirationDate: vg.expirationDate ? Timestamp.fromDate(vg.expirationDate) : null,
              stockDeductionAmount: Number(item.deductionAmount) || 1
            }))
          };
        }),
        publishAt: Timestamp.fromDate(finalPublishDate),
        deadlineDate: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
        pickupDate: pickupDate ? Timestamp.fromDate(pickupDate) : null,
        pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
        isPrepaymentRequired: isPrepaymentRequired,
        allowedTiers: isSecretProductEnabled ? secretTiers : ALL_LOYALTY_TIERS,
        preOrderTiers: isPreOrderEnabled ? preOrderTiers : []
      };

      if (mode === 'newProduct') {
        const productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived'> & { hashtags?: string[] } = {
          groupName: groupName.trim(),
          description: description.trim(),
          hashtags: hashtags,
          storageType: selectedStorageType,
          category: categories.find(c => c.id === selectedMainCategory)?.name || '',
          encoreCount: 0, encoreRequesterIds: []
        };
        // ✅ [수정] 이미지 업로드 로직 추가
        const res = await addProductWithFirstRound(productData as any, salesRoundData as any, newImageFiles, creationDate);
        if (newImageFiles.length > 0) {
    const newProductId = res.productId;
    if (newProductId) {
        const toastId = toast.loading('이미지 업로드 중...');
        const uploadedUrls = await uploadImages(newImageFiles, `products/${newProductId}`);
        // ❗ [수정] 이미지 URL을 올바른 파라미터(finalImageUrls)에 담아 전달합니다.
        await updateProductCoreInfo(newProductId, {}, [], uploadedUrls, []);
        toast.dismiss(toastId);
    }
}
        toast.success(isDraft ? '상품이 임시저장되었습니다.' : '신규 상품이 성공적으로 등록되었습니다.');

      } else if (mode === 'newRound' && productId) {
        await addNewSalesRound(productId, salesRoundData as any);
        toast.success(isDraft ? '새 회차가 임시저장되었습니다.' : '새로운 판매 회차가 추가되었습니다.');
      
      } else if (mode === 'editRound' && productId && roundId) {

        const changes: string[] = [];
        const currentCategoryName = categories.find(c => c.id === selectedMainCategory)?.name || '';
        const storageTypeMap = { ROOM: '실온', COLD: '냉장', FROZEN: '냉동', FRESH: '신선' };

        if (initialProduct?.groupName !== groupName.trim()) changes.push(`상품명 변경`);
        if (initialProduct?.description !== description.trim()) changes.push(`상세 설명 변경`);
        if (initialProduct?.storageType !== selectedStorageType) changes.push(`보관 방법: ${storageTypeMap[initialProduct?.storageType!]} -> ${storageTypeMap[selectedStorageType]}`);
        if (initialProduct?.category !== currentCategoryName) changes.push(`카테고리: ${initialProduct?.category} -> ${currentCategoryName}`);

        if (initialRound?.roundName !== salesRoundData.roundName) changes.push(`회차명: ${initialRound?.roundName} -> ${salesRoundData.roundName}`);
        if (toYmd(convertToDate(initialRound?.pickupDate)) !== toYmd(convertToDate(salesRoundData.pickupDate))) changes.push(`픽업 시작일 변경`);
        if (toYmd(convertToDate(initialRound?.pickupDeadlineDate)) !== toYmd(convertToDate(salesRoundData.pickupDeadlineDate))) changes.push(`픽업 마감일 변경`);
        if (JSON.stringify(initialRound?.variantGroups) !== JSON.stringify(salesRoundData.variantGroups)) changes.push('가격/옵션 정보 변경');

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

        const productDataToUpdate: Partial<Omit<Product, 'id' | 'salesHistory'>> & { hashtags?: string[] } = {
          groupName: groupName.trim(),
          description: description.trim(),
          hashtags: hashtags,
          storageType: selectedStorageType,
          category: categories.find(c => c.id === selectedMainCategory)?.name || ''
        };

        // ✅ [수정] 이미지 업로드 및 URL 병합 로직
        const existingUrls = imagePreviews.filter(p => !p.startsWith('blob:'));
        const filesToUpload = imagePreviews
          .filter(p => p.startsWith('blob:'))
          .map(p => previewUrlToFile.get(p))
          .filter((f): f is File => !!f);

        let finalImageUrls = existingUrls;
        if (filesToUpload.length > 0) {
            const toastId = toast.loading('새 이미지 업로드 중...');
            const uploadedUrls = await uploadImages(filesToUpload, `products/${productId}`);
            finalImageUrls = [...existingUrls, ...uploadedUrls];
            toast.dismiss(toastId);
        }

        await updateProductCoreInfo(productId, productDataToUpdate, filesToUpload, finalImageUrls, initialImageUrls);
        await updateSalesRound(productId, roundId, salesRoundData as any);

        toast.success(isDraft ? '수정 내용이 임시저장되었습니다.' : '상품 정보가 성공적으로 수정되었습니다.');
      }
      navigate('/admin/products');
    } catch (err) {
      toast.error(`저장 중 오류가 발생했습니다: ${(err as Error).message}`);
    } finally { setIsSubmitting(false); }
  };

  useEffect(() => {
    return () => {
      imagePreviews.forEach(p => { if (p.startsWith('blob:')) URL.revokeObjectURL(p); });
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
        isSecretProductEnabled={isSecretProductEnabled}
        setIsSecretProductEnabled={setIsSecretProductEnabled}
        secretTiers={secretTiers}
        setSecretTiers={setSecretTiers}
      />
      <div className="product-add-page-wrapper smart-form">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(false); }}>
          <header className="product-add-header">
            <h1>{pageTitle}</h1>
            <div className="header-actions">
              <button type="button" onClick={() => handleSubmit(true)} disabled={isSubmitting} className="draft-save-button">
                <FileText size={18} /> 임시저장
              </button>
              <button type="submit" disabled={isSubmitting} className="save-button">
                {isSubmitting ? <SodomallLoader /> : <Save size={18} />}
                {submitButtonText}
              </button>
            </div>
          </header>

          <main className="main-content-grid-3-col-final">
            <div className="form-section">
              <div className="form-section-title">
                <div className="title-text-group">
                  <Package size={20} className="icon-color-product"/><h3>대표 상품 정보</h3>
                </div>
                {mode === 'newProduct' && (
                  <div className="product-type-toggle-inline">
                    <button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}>단일</button>
                    <button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}>그룹</button>
                  </div>
                )}
              </div>
              <p className="section-subtitle">상품의 기본 정보는 모든 판매 회차에 공통 적용됩니다.</p>

              <div className="form-group with-validation">
                <label>대표 상품명 *</label>
                <div className="input-wrapper">
                  <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} required disabled={mode !== 'newProduct' && mode !== 'editRound'} />
                  {isCheckingDuplicates && <div className="input-spinner-wrapper"><Loader2 className="spinner-icon" /></div>}
                </div>
                {mode === 'newProduct' && similarProducts.length > 0 && (
                  <div className="similar-products-warning">
                    <span><AlertTriangle size={16} /> 유사한 이름의 상품이 이미 존재합니다. 새 회차로 추가하시겠어요?</span>
                    <ul>
                      {similarProducts.map(p => (
                        <li key={p.id} className="similar-product-item">
                          <span>{p.groupName}</span>
                          <button
                            type="button"
                            className="add-round-for-similar-btn"
                            onClick={() => navigate('/admin/products/add', {
                              state: { productId: p.id, productGroupName: p.groupName, lastRound: p.salesHistory[0] }
                            })}
                          >
                            이 상품에 새 회차 추가
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {mode === 'newProduct' && (
                <div className="form-group">
                  <label>상품 등록일</label>
                  <div className="input-with-icon">
                    <CalendarPlus size={16} className="input-icon" />
                    <input type="date" value={toYmd(creationDate)} onChange={e => setCreationDate(fromYmd(e.target.value) ?? new Date())} required />
                  </div>
                  <p className="input-description">상품이 시스템에 등록된 것으로 표시될 날짜입니다.</p>
                </div>
              )}

              <div className="form-group">
                <label>상세 설명</label>
                <div className="description-wrapper">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={8} placeholder="이곳에 상품 안내문을 붙여넣고 [AI로 채우기] 버튼을 눌러보세요." />
                  <button type="button" className="ai-parse-button" onClick={handleAIParse} disabled={isParsingWithAI}>
                    {isParsingWithAI ? <Loader2 className="spinner-icon" /> : <Bot size={16} />}
                    {isParsingWithAI ? '분석 중...' : 'AI로 채우기'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>해시태그 (최대 4개)</label>
                <div className="hashtag-input-container">
                  <div className="hashtag-display-area">
                    {hashtags.map((tag) => (
                      <div key={tag} className="hashtag-pill">
                        {tag}
                        <button type="button" onClick={() => removeHashtag(tag)}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                  {hashtags.length < 4 && (
                    <input
                      type="text"
                      className="hashtag-input"
                      value={hashtagInput}
                      onChange={(e) => setHashtagInput(e.target.value)}
                      onKeyDown={handleHashtagKeyDown}
                      placeholder="태그 입력 후 Enter..."
                      disabled={mode !== 'editRound' && mode !== 'newProduct'}
                    />
                  )}
                </div>
                <p className="input-description">상품을 잘 나타내는 검색용 태그를 추가해보세요.</p>
              </div>

              <div className="form-group">
                <label>카테고리/보관타입</label>
                <div className="category-select-wrapper">
                  <select value={selectedMainCategory} onChange={e => setSelectedMainCategory(e.target.value)} disabled={mode !== 'editRound' && mode !== 'newProduct'}>
                    <option value="">대분류 선택</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="settings-option-group">
                  {storageTypeOptions.map(opt =>
                    <button key={opt.key} type="button"
                      className={`settings-option-btn ${opt.className} ${selectedStorageType === opt.key ? 'active' : ''}`}
                      onClick={() => setSelectedStorageType(opt.key)}
                      disabled={mode !== 'editRound' && mode !== 'newProduct'}>
                      {opt.name}
                    </button>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>대표 이미지 *</label>
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="image-previews" direction="horizontal">
                    {(provided) => (
                      <div className="compact-image-uploader" {...provided.droppableProps} ref={provided.innerRef}>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple
                          accept="image/png, image/jpeg"
                          style={{ display: 'none' }}
                          disabled={mode !== 'editRound' && mode !== 'newProduct'}
                        />
                        {imagePreviews.map((p, i) => (
                          <Draggable key={p + i} draggableId={p + i.toString()} index={i} isDragDisabled={mode !== 'editRound' && mode !== 'newProduct'}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`thumbnail-preview ${snapshot.isDragging ? 'dragging' : ''}`}
                                style={{ ...provided.draggableProps.style }}
                              >
                                <img src={p} alt={`미리보기 ${i + 1}`} />
                                {mode !== 'newRound' && (
                                  <button type="button" onClick={() => removeImage(i)} className="remove-thumbnail-btn">
                                    <X size={10} />
                                  </button>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {imagePreviews.length < 10 && (mode === 'editRound' || mode === 'newProduct') && (
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="add-thumbnail-btn">
                            <PlusCircle size={20} />
                          </button>
                        )}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                {mode === 'newRound' && <p className="input-description">새 회차 추가 시에는 대표 정보(이름, 설명, 이미지 등)도 함께 수정할 수 있습니다.</p>}
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">
                <div className="title-text-group"><Box size={20} className="icon-color-option" /><h3>판매 옵션 *</h3></div>
              </div>
              <p className="section-subtitle">현재 회차에만 적용되는 옵션, 가격, 재고 등을 설정합니다.</p>
              <div className="form-group"><label>회차명</label><input type="text" value={roundName} onChange={e => setRoundName(e.target.value)} required /></div>

             {variantGroups.map(vg => (
                <div className="variant-group-card" key={vg.id}>
                  <div className="variant-group-header">
                    <div className="form-group full-width">
                      <label>하위 상품 그룹명 *</label>
                      <input type="text" value={vg.groupName} onChange={e => handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder={productType === 'group' ? '예: 얼큰소고기맛' : '상품명과 동일하게'} required />
                    </div>
                    <div className="form-group">
                      <label>
                        <Tippy content={mode === 'editRound' ? "현재 남은 재고 수량입니다. 여기에 추가할 수량을 더해서 입력하면 됩니다." : "판매 기간 전체에 적용될 물리적인 재고 수량입니다. 비워두면 무제한 판매됩니다."}>
                          <span>{mode === 'editRound' ? '남은 재고' : '총 재고'}</span>
                        </Tippy>
                      </label>
                      <div className="stock-input-wrapper">
                        <input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="무제한" />
                        <span className="stock-unit-addon">{(vg.stockUnitType || '개')}</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>유통기한</label>
                      <input
                        type="date"
                        className="date-input-native"
                        value={toYmd(vg.expirationDate)}
                        onChange={e => handleVariantGroupChange(vg.id, 'expirationDate', fromYmd(e.target.value))}
                      />
                    </div>
                    {productType === 'group' && (
                      <button type="button" onClick={() => removeVariantGroup(vg.id)} className="remove-variant-group-btn" disabled={variantGroups.length <= 1} title={variantGroups.length <= 1 ? '마지막 그룹은 삭제할 수 없습니다.' : '그룹 삭제'}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {vg.items.map(item => (
                    <div className="option-item-section" key={item.id}>
                      <div className="option-item-grid-2x2">
                        <div className="form-group-grid item-name">
                          <label>선택지 *</label>
                          <input type="text" value={item.name} onChange={e => handleItemChange(vg.id, item.id, 'name', e.target.value)} required />
                        </div>
                        <div className="form-group-grid item-price">
                          <label>가격 *</label>
                          <div className="price-input-wrapper">
                            <input
  type="text"
  value={formatKRW(typeof item.price === 'number' ? item.price : '')}
  onChange={e => handlePriceChange(vg.id, item.id, e.target.value)}
  required
/>
                            <span>원</span>
                          </div>
                        </div>
                        <div className="form-group-grid item-limit">
                          <label className="tooltip-container"><span>구매 제한</span></label>
                          <input type="number" value={item.limitQuantity} onChange={e => handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/>
                        </div>
                        <div className="form-group-grid item-deduction">
                          <label className="tooltip-container"><span>차감 단위 *</span></label>
                          <input type="number" value={item.deductionAmount} onChange={e => handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} required />
                        </div>
                      </div>
                      <button type="button" onClick={() => removeItem(vg.id, item.id)} className="remove-item-btn" disabled={vg.items.length <= 1} title={vg.items.length <= 1 ? '마지막 옵션은 삭제할 수 없습니다.' : '옵션 삭제'}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  <div className="option-item-actions">
                    <button type="button" onClick={() => addNewItem(vg.id)} className="add-item-btn">구매 옵션 추가</button>
                  </div>
                </div>
              ))}

              <div className="variant-controls-footer">
                <div className="add-group-btn-wrapper">
                  {productType === 'group' && variantGroups.length < 5 && (
                    <button type="button" onClick={addNewVariantGroup} className="add-group-btn">하위 상품 그룹 추가</button>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section sticky-section">
              <div className="form-section-title">
                <div className="title-text-group"><SlidersHorizontal size={20} className="icon-color-settings" /><h3>발행 및 기간 설정</h3></div>
              </div>
              <p className="section-subtitle">상품의 판매 시점 및 조건을 설정합니다.</p>

              <div className="form-group">
                <label>이벤트 타입</label>
                <div className="input-with-icon">
                  <Gift size={16} className="input-icon" />
                  <select value={eventType} onChange={e => setEventType(e.target.value as 'NONE' | 'CHUSEOK')}>
                    <option value="NONE">일반 상품</option>
                    <option value="CHUSEOK">🌕 추석 특집</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>판매 옵션</label>
                <div className="settings-option-group">
                  <Tippy content="선입금 필수 상품으로 설정합니다.">
                    <button type="button" className={`settings-option-btn ${isPrepaymentRequired ? 'active' : ''}`} onClick={() => setIsPrepaymentRequired(!isPrepaymentRequired)}>
                      <Save size={16} /> 선입금
                    </button>
                  </Tippy>
                  <Tippy content="선주문, 등급별 노출 등 판매 조건을 설정합니다.">
                    <button type="button" className={`settings-option-btn ${(isPreOrderEnabled && preOrderTiers.length > 0) || isSecretProductEnabled ? 'active' : ''}`} onClick={() => setIsSettingsModalOpen(true)}>
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
                  onChange={e => setPublishDate(fromYmd(e.target.value) ?? new Date())}
                  required
                />
                {mode !== 'editRound' && <p className="input-description">선택한 날짜 오후 2시에 공개됩니다.</p>}
              </div>

              <div className="form-group">
                <label>공동구매 마감일 *</label>
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(deadlineDate)}
                  onChange={e => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)}
                  required
                />
              </div>

              <div className="form-group">
                <label>픽업 시작일 *</label>
                <input
                  type="date"
                  value={toYmd(pickupDate)}
                  onChange={e => setPickupDate(fromYmd(e.target.value))}
                  required={true}
                />
              </div>

              <div className="form-group">
                <label>픽업 마감일 *</label>
                <input
                  type="date"
                  value={toYmd(pickupDeadlineDate)}
                  onChange={e => setPickupDeadlineDate(fromYmd(e.target.value))}
                  required={true}
                />
              </div>

              <div className="settings-summary-card">
                <h4 className="summary-title"><Info size={16} /> 설정 요약</h4>
                <ul>
                  <li><strong>발행:</strong> {settingsSummary.publishText}</li>
                  <li><strong>공구 마감:</strong> {settingsSummary.deadlineText}</li>
                  <li><strong>픽업:</strong> {settingsSummary.pickupText} - {settingsSummary.pickupDeadlineText}</li>
                  <li><strong>참여 조건:</strong> {settingsSummary.participationText}</li>
                </ul>
              </div>
            </div>
          </main>
        </form>
        {isSubmitting && <SodomallLoader message="저장 중입니다..." />}
      </div>
    </>
  );
};

export default ProductForm;
