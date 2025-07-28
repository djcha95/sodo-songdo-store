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
    updateProductCoreInfo
} from '@/firebase';
import type { Category, StorageType, Product, SalesRound, SalesRoundStatus, VariantGroup, ProductItem, LoyaltyTier } from '@/types';
import toast from 'react-hot-toast';
import { Save, PlusCircle, X, Package, Box, SlidersHorizontal, Trash2, Info, FileText, Clock, Lock, AlertTriangle, Loader2, CalendarPlus } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';

import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import '@/pages/admin/ProductAddAdminPage.css';

// --- 타입 정의 ---
export type ProductFormMode = 'newProduct' | 'newRound' | 'editRound';

interface ProductFormProps {
    mode: ProductFormMode;
    productId?: string;
    roundId?: string;
    initialState?: { // 새 회차 추가 시 초기 데이터를 받기 위함
        productGroupName: string;
        lastRound?: SalesRound;
    }
}

interface ProductItemUI { id: string; name: string; price: number | ''; limitQuantity: number | ''; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id: string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; expirationDate: Date | null; expirationDateInput: string; items: ProductItemUI[]; }

// --- 헬퍼 함수 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); const year = d.getFullYear(); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const day = d.getDate().toString().padStart(2, '0'); return `${year}-${month}-${day}`; };
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6) { const year = parseInt("20" + cleaned.substring(0, 2), 10); const month = parseInt(cleaned.substring(2, 4), 10) - 1; const day = parseInt(cleaned.substring(4, 6), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } if (cleaned.length === 8) { const year = parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(4, 6), 10) - 1; const day = parseInt(cleaned.substring(6, 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const formatNumberWithCommas = (value: number | ''): string => { if (value === '' || value === null) return ''; return Number(value).toLocaleString('ko-KR'); };
const parseFormattedNumber = (value: string): number | '' => { const parsed = parseInt(value.replace(/,/g, ''), 10); return isNaN(parsed) ? '' : parsed; };

// ✅ [추가] 다양한 형태의 날짜 데이터를 안전하게 Date 객체로 변환하는 헬퍼 함수
const convertToDate = (dateSource: any): Date | null => {
    if (!dateSource) return null;
    if (dateSource instanceof Date) return dateSource;
    if (typeof dateSource.toDate === 'function') return dateSource.toDate(); // Firestore Timestamp
    if (typeof dateSource === 'object' && dateSource.seconds !== undefined && dateSource.nanoseconds !== undefined) {
        return new Timestamp(dateSource.seconds, dateSource.nanoseconds).toDate(); // Serialized Timestamp
    }
    const d = new Date(dateSource);
    if (!isNaN(d.getTime())) return d;
    return null;
};


const storageTypeOptions: { key: StorageType; name:string; className: string }[] = [{ key: 'ROOM', name: '실온', className: 'storage-btn-room' }, { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' }, { key: 'COLD', name: '냉장', className: 'storage-btn-cold' }];
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALL_LOYALTY_TIERS: LoyaltyTier[] = ['공구의 신', '공구왕', '공구요정', '공구새싹'];


// --- 모달 컴포넌트 (통합 및 개선) ---
interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    
    isPreOrderEnabled: boolean;
    setIsPreOrderEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    preOrderTiers: LoyaltyTier[];
    setPreOrderTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>;
    
    isSecretProductEnabled: boolean;
    setIsSecretProductEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    secretTiers: LoyaltyTier[];
    setSecretTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isPreOrderEnabled, setIsPreOrderEnabled, preOrderTiers, setPreOrderTiers, isSecretProductEnabled, setIsSecretProductEnabled, secretTiers, setSecretTiers }) => {
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
                    {/* 선주문 설정 */}
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
                                            <input type="checkbox" id={`preorder-tier-${tier}`} value={tier} checked={preOrderTiers.includes(tier as LoyaltyTier)} onChange={() => handlePreOrderTierChange(tier as LoyaltyTier)} />
                                            {tier}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 시크릿 상품(참여 등급 제한) 설정 */}
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
                                            <input type="checkbox" id={`secret-tier-${tier}`} value={tier} checked={secretTiers.includes(tier)} onChange={() => handleSecretTierChange(tier)} />
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


// --- 메인 폼 컴포넌트 ---
const ProductForm: React.FC<ProductFormProps> = ({ mode, productId, roundId, initialState }) => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- 상태 관리 ---
    const [isLoading, setIsLoading] = useState(mode === 'editRound' || mode === 'newRound');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pageTitle, setPageTitle] = useState('새 상품 등록');
    const [submitButtonText, setSubmitButtonText] = useState('신규 상품 등록하기');
    
    // 대표 상품 정보
    const [productType, setProductType] = useState<'single' | 'group'>('single');
    const [categories, setCategories] = useState<Category[]>([]);
    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMainCategory, setSelectedMainCategory] = useState('');
    const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
    const [creationDate, setCreationDate] = useState<Date>(new Date());
    
    // 이미지
    const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
    const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);

    // 판매 회차 정보
    const [roundName, setRoundName] = useState('1차 판매');
    const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);
    
    // 기간 설정
    const [publishDate, setPublishDate] = useState<Date>(() => new Date(new Date().setHours(14, 0, 0, 0)));
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
    const [pickupDate, setPickupDate] = useState<Date | null>(null);
    const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);

    // 옵션 설정
    const [isPrepaymentRequired, setIsPrepaymentRequired] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isPreOrderEnabled, setIsPreOrderEnabled] = useState(true);
    const [preOrderTiers, setPreOrderTiers] = useState<LoyaltyTier[]>(['공구의 신', '공구왕']);
    const [isSecretProductEnabled, setIsSecretProductEnabled] = useState(false);
    const [secretTiers, setSecretTiers] = useState<LoyaltyTier[]>([]);
    
    // 중복 검사
    const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
    
    // --- useEffect 훅 ---

    // 모드에 따라 페이지 제목, 버튼 텍스트 설정
    useEffect(() => {
        switch (mode) {
            case 'newProduct':
                setPageTitle('신규 대표 상품 등록');
                setSubmitButtonText('신규 상품 등록하기');
                if (initialState?.productGroupName) {
                    setGroupName(initialState.productGroupName);
                    setVariantGroups(prev => {
                        const newVgs = [...prev];
                        if (newVgs[0]) {
                            newVgs[0].groupName = initialState.productGroupName;
                        }
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

    // 데이터 로딩 (수정, 새 회차 모드)
    useEffect(() => {
        const fetchData = async () => {
            if (!productId) return;
            setIsLoading(true);
            try {
                const product = await getProductById(productId);
                if (!product) {
                    toast.error("상품을 찾을 수 없습니다.");
                    navigate('/admin/products');
                    return;
                }

                setGroupName(product.groupName);
                setDescription(product.description);
                setSelectedStorageType(product.storageType);
                if (product.createdAt) {
                    setCreationDate(convertToDate(product.createdAt) || new Date());
                }
                const mainCat = (await getCategories()).find(c => c.name === product.category);
                if (mainCat) setSelectedMainCategory(mainCat.id);
                setInitialImageUrls(product.imageUrls || []);
                setCurrentImageUrls(product.imageUrls || []);
                setImagePreviews(product.imageUrls || []);
                
                let roundToLoad: SalesRound | undefined;
                if(mode === 'editRound' && roundId) {
                    roundToLoad = product.salesHistory.find(r => r.roundId === roundId);
                     if (!roundToLoad) {
                        toast.error("판매 회차를 찾을 수 없습니다.");
                        navigate(`/admin/products/edit/${productId}`);
                        return;
                    }
                    setPageTitle(`'${product.groupName}' 회차 수정`); 
                } else if (mode === 'newRound') {
                    roundToLoad = initialState?.lastRound || product.salesHistory[0]; // ✅ 전달받은 lastRound 우선 사용
                    if (roundToLoad) {
                        const roundNumMatch = roundToLoad.roundName.match(/\d+/);
                        const newRoundNumber = roundNumMatch ? parseInt(roundNumMatch[0], 10) + 1 : 2;
                        setRoundName(`${newRoundNumber}차 판매`);
                    }
                }

                if (roundToLoad) {
                    const roundData = roundToLoad as SalesRound & { preOrderTiers?: LoyaltyTier[]; secretForTiers?: LoyaltyTier[] };
                    
                    setRoundName(mode === 'editRound' ? roundData.roundName : roundName);
                    setProductType((roundData.variantGroups?.length || 0) > 1 || (roundData.variantGroups?.[0]?.groupName !== product.groupName) ? 'group' : 'single');
                    
                    // ✅ [수정] 날짜 변환 로직에 convertToDate 헬퍼 함수 사용
                    const mappedVGs: VariantGroupUI[] = (roundData.variantGroups || []).map((vg: VariantGroup) => {
                        const expirationDate = convertToDate(vg.items[0]?.expirationDate);
                        return {
                            id: generateUniqueId(),
                            groupName: vg.groupName,
                            totalPhysicalStock: vg.totalPhysicalStock ?? '',
                            stockUnitType: vg.stockUnitType,
                            expirationDate: expirationDate,
                            expirationDateInput: expirationDate ? formatDateToYYYYMMDD(expirationDate) : '',
                            items: (vg.items || []).map((item: ProductItem) => ({
                                id: generateUniqueId(),
                                name: item.name,
                                price: item.price,
                                limitQuantity: item.limitQuantity ?? '',
                                deductionAmount: item.stockDeductionAmount,
                                isBundleOption: bundleUnitKeywords.some(k => item.name.includes(k))
                            }))
                        };
                    });
                    setVariantGroups(mappedVGs);
                    
                    if(mode === 'editRound') {
                        setPublishDate(convertToDate(roundData.publishAt) || new Date());
                        setDeadlineDate(convertToDate(roundData.deadlineDate));
                        setPickupDate(convertToDate(roundData.pickupDate));
                        setPickupDeadlineDate(convertToDate(roundData.pickupDeadlineDate));
                    }
                    
                    setIsPrepaymentRequired(roundData.isPrepaymentRequired ?? false);
                    setIsPreOrderEnabled(roundData.preOrderTiers ? roundData.preOrderTiers.length > 0 : true);
                    setPreOrderTiers(roundData.preOrderTiers || ['공구의 신', '공구왕']);
                    setIsSecretProductEnabled(!!roundData.secretForTiers && roundData.secretForTiers.length > 0);
                    setSecretTiers(roundData.secretForTiers || []);
                }

            } catch (err) {
                console.error("Error fetching data for form:", err);
                toast.error("양식 데이터를 불러오는 데 실패했습니다.");
            } finally {
                setIsLoading(false);
            }
        };

        if (mode === 'editRound' || mode === 'newRound') {
            fetchData();
        }
    }, [mode, productId, roundId, navigate, roundName, initialState]);

    // 카테고리 로딩 & 초기 VariantGroup 설정
    useEffect(() => {
        getCategories().then(setCategories).catch(() => toast.error("카테고리 정보를 불러오는 데 실패했습니다."));
        if (mode === 'newProduct' && variantGroups.length === 0) {
            setVariantGroups([{ id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]);
        }
    }, [mode, variantGroups.length]);

    // 날짜 자동 계산 (마감일)
    useEffect(() => {
        if (mode === 'editRound') return; 
        const newDeadline = new Date(publishDate);
        const dayOfWeek = newDeadline.getDay();
        if (dayOfWeek === 6) newDeadline.setDate(newDeadline.getDate() + 2);
        else if (dayOfWeek === 0) newDeadline.setDate(newDeadline.getDate() + 1);
        else newDeadline.setDate(newDeadline.getDate() + 1);
        newDeadline.setHours(13, 0, 0, 0);
        setDeadlineDate(newDeadline);
    }, [publishDate, mode]);

    // 보관 타입에 따라 픽업 마감일 자동 계산
    useEffect(() => {
        if (!pickupDate) {
            setPickupDeadlineDate(null);
            return;
        }
        const newPickupDeadline = new Date(pickupDate);
        if (selectedStorageType === 'ROOM' || selectedStorageType === 'FROZEN') {
            newPickupDeadline.setDate(newPickupDeadline.getDate() + 1);
        }
        newPickupDeadline.setHours(13, 0, 0, 0);
        setPickupDeadlineDate(newPickupDeadline);
    }, [pickupDate, selectedStorageType]);
    
    // 단일 상품일 경우, 대표 상품명과 하위 상품 그룹명을 연동
    useEffect(() => {
        if (productType === 'single' && variantGroups.length > 0) {
            setVariantGroups(prev => {
                const firstGroup = prev[0];
                if (firstGroup && firstGroup.groupName !== groupName) {
                    const newVgs = [...prev];
                    newVgs[0] = { ...firstGroup, groupName: groupName };
                    return newVgs;
                }
                return prev;
            });
        }
    }, [groupName, productType]);

    // 중복 상품명 검사
    useEffect(() => {
        if (mode !== 'newProduct' || !groupName.trim()) {
            setSimilarProducts([]);
            return;
        }
        const handler = setTimeout(async () => {
            setIsCheckingDuplicates(true);
            try {
                setSimilarProducts(await searchProductsByName(groupName.trim()));
            } catch (error) {
                console.error("Error searching products:", error);
            } finally {
                setIsCheckingDuplicates(false);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [groupName, mode]);


    // --- 핸들러 함수들 (useCallback으로 최적화) ---
    const handleProductTypeChange = useCallback((newType: 'single' | 'group') => { if (productType === newType) return; if (productType === 'group' && newType === 'single') { toast.promise(new Promise<void>((resolve) => { setTimeout(() => { setVariantGroups((prev) => prev.slice(0, 1)); setProductType(newType); resolve(); }, 300); }), { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' }); } else { setProductType(newType); } }, [productType]);
    const handleVariantGroupChange = useCallback((id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => { setVariantGroups(prev => prev.map(vg => (vg.id === id ? { ...vg, [field]: value } : vg))); }, []);
    const handleGroupDateBlur = useCallback((id: string, dateStr: string) => { const parsedDate = parseDateString(dateStr); if (dateStr && !parsedDate) { toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)'); return; } handleVariantGroupChange(id, 'expirationDate', parsedDate); handleVariantGroupChange(id, 'expirationDateInput', parsedDate ? formatDateToYYYYMMDD(parsedDate) : dateStr);}, [handleVariantGroupChange]);
    const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => { const numericValue = parseFormattedNumber(value); setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, price: numericValue } : item) } : vg)); }, []);
    const addNewItem = useCallback((vgId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files).filter(file => {
            if (file.size > MAX_FILE_SIZE) {
                toast.error(`'${file.name}' 파일 크기가 너무 큽니다 (최대 5MB).`);
                return false;
            }
            return true;
        });
        setNewImageFiles(prev => [...prev, ...files]);
        files.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)]));
        e.target.value = '';
    }, []);

    const removeImage = useCallback((indexToRemove: number) => {
        const urlToRemove = imagePreviews[indexToRemove];
        if (!urlToRemove) return;
        if (urlToRemove.startsWith('blob:')) {
            URL.revokeObjectURL(urlToRemove);
            setNewImageFiles(prev => prev.filter(f => URL.createObjectURL(f) !== urlToRemove));
        } else {
            setCurrentImageUrls(prev => prev.filter(u => u !== urlToRemove));
        }
        setImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
    }, [imagePreviews]);

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { source, destination } = result;
        
        const reorderedPreviews = Array.from(imagePreviews);
        const [movedPreview] = reorderedPreviews.splice(source.index, 1);
        reorderedPreviews.splice(destination.index, 0, movedPreview);
        setImagePreviews(reorderedPreviews);

        if(mode === 'newProduct') {
            const reorderedFiles = Array.from(newImageFiles);
            const [movedFile] = reorderedFiles.splice(source.index, 1);
            reorderedFiles.splice(destination.index, 0, movedFile);
            setNewImageFiles(reorderedFiles);
        }
    };
    
    const settingsSummary = useMemo(() => {
        const publishDateTime = new Date(publishDate);
        publishDateTime.setHours(14,0,0,0);

        const publishText = `${formatDateToYYYYMMDD(publishDateTime)} 오후 2시`;
        const deadlineText = deadlineDate ? formatToDateTimeLocal(deadlineDate).replace('T', ' ') : '미설정';
        const pickupText = pickupDate ? formatDateToYYYYMMDD(pickupDate) : '미설정';
        const pickupDeadlineText = pickupDeadlineDate ? formatDateToYYYYMMDD(pickupDeadlineDate) : '미설정';
        const participationText = isSecretProductEnabled ? `${secretTiers.join(', ')} 등급만` : '모두 참여 가능';

        return { publishText, deadlineText, pickupText, pickupDeadlineText, participationText };
    }, [publishDate, deadlineDate, pickupDate, pickupDeadlineDate, isSecretProductEnabled, secretTiers]);


    // --- 제출 로직 ---
    const handleSubmit = async (isDraft: boolean = false) => {
        if (!isDraft) {
            if (mode !== 'newRound' && imagePreviews.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; }
            if (!deadlineDate || !pickupDate || !pickupDeadlineDate) { toast.error('공구 마감일, 픽업 시작일, 픽업 마감일을 모두 설정해주세요.'); return; }
            if (isSecretProductEnabled && secretTiers.length === 0) { toast.error("시크릿 상품을 활성화했습니다. 참여 가능한 등급을 1개 이상 선택해주세요."); return; }
        }
        setIsSubmitting(true);

        try {
            const status: SalesRoundStatus = isDraft ? 'draft' : 'scheduled';
            const finalPublishDate = new Date(publishDate);
            finalPublishDate.setHours(14, 0, 0, 0);

            const salesRoundData = {
                roundName: roundName.trim(), status,
                variantGroups: variantGroups.map(vg => ({
                    id: (mode === 'editRound' && vg.id.length < 15) ? vg.id : generateUniqueId(),
                    groupName: productType === 'single' ? groupName.trim() : vg.groupName.trim(),
                    totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock),
                    stockUnitType: vg.stockUnitType,
                    items: vg.items.map(item => ({
                        id: (mode === 'editRound' && item.id.length < 15) ? item.id : generateUniqueId(),
                        name: item.name, price: Number(item.price) || 0, stock: -1,
                        limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                        expirationDate: vg.expirationDate ? Timestamp.fromDate(vg.expirationDate) : null,
                        stockDeductionAmount: Number(item.deductionAmount) || 1,
                    })),
                })),
                publishAt: Timestamp.fromDate(finalPublishDate),
                deadlineDate: Timestamp.fromDate(deadlineDate!),
                pickupDate: Timestamp.fromDate(pickupDate!),
                pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
                isPrepaymentRequired: isPrepaymentRequired,
                allowedTiers: isSecretProductEnabled ? secretTiers : ALL_LOYALTY_TIERS.concat(['주의 요망']),
                preOrderTiers: isPreOrderEnabled ? preOrderTiers : [],
            };

            if (mode === 'newProduct') {
                const productData: Omit<Product, 'id'|'createdAt'|'salesHistory'|'imageUrls'|'isArchived'> = {
                    groupName: groupName.trim(), description: description.trim(), storageType: selectedStorageType,
                    category: categories.find(c => c.id === selectedMainCategory)?.name || '',
                    encoreCount: 0, encoreRequesterIds: [],
                };
                await addProductWithFirstRound(productData, salesRoundData as any, newImageFiles, creationDate);
                toast.success(isDraft ? "상품이 임시저장되었습니다." : "신규 상품이 성공적으로 등록되었습니다.");
            } else if (mode === 'newRound' && productId) {
                await addNewSalesRound(productId, salesRoundData as any);
                toast.success(isDraft ? "새 회차가 임시저장되었습니다." : "새로운 판매 회차가 추가되었습니다.");
            } else if (mode === 'editRound' && productId && roundId) {
                const productDataToUpdate: Partial<Omit<Product, 'id' | 'salesHistory'>> = { 
                    groupName: groupName.trim(), description: description.trim(), storageType: selectedStorageType, 
                    category: categories.find(c => c.id === selectedMainCategory)?.name || '' 
                };
                await updateProductCoreInfo(productId, productDataToUpdate, newImageFiles, currentImageUrls, initialImageUrls);
                await updateSalesRound(productId, roundId, salesRoundData as any);
                toast.success(isDraft ? "수정 내용이 임시저장되었습니다." : "상품 정보가 성공적으로 수정되었습니다.");
            }

            navigate('/admin/products');
        } catch (err) {
            toast.error(`저장 중 오류가 발생했습니다: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };


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
                            <button type="button" onClick={() => handleSubmit(true)} disabled={isSubmitting} className="draft-save-button"><FileText size={18} /> 임시저장</button>
                            <button type="submit" disabled={isSubmitting} className="save-button">
                                {isSubmitting ? <InlineSodomallLoader /> : <Save size={18} />}
                                {submitButtonText}
                            </button>
                        </div>
                    </header>
                    <main className="main-content-grid-3-col-final">
                        {/* --- 대표 상품 정보 섹션 --- */}
                        <div className="form-section">
                            <div className="form-section-title">
                                <div className="title-text-group"><Package size={20} className="icon-color-product"/><h3>대표 상품 정보</h3></div>
                                {mode === 'newProduct' && <div className="product-type-toggle-inline"><button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}>단일</button><button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}>그룹</button></div>}
                            </div>
                            <p className="section-subtitle">상품의 기본 정보는 모든 판매 회차에 공통 적용됩니다.</p>
                            
                            <div className="form-group with-validation">
                                <label>대표 상품명 *</label>
                                <div className="input-wrapper">
                                    <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} required disabled={mode !== 'newProduct'} />
                                    {isCheckingDuplicates && <div className="input-spinner-wrapper"><Loader2 className="spinner-icon" /></div>}
                                </div>
                                {mode === 'newProduct' && similarProducts.length > 0 && (
                                    <div className="similar-products-warning">
                                        <AlertTriangle size={16} />
                                        <span>유사한 이름의 상품이 이미 존재합니다. 새 회차로 추가하시겠어요?</span>
                                        <ul>
                                            {similarProducts.map(p => (
                                                <li key={p.id} className="similar-product-item">
                                                    <span>{p.groupName}</span>
                                                    <button type="button" className="add-round-for-similar-btn" onClick={() => navigate('/admin/products/add', { state: { productId: p.id, productGroupName: p.groupName, lastRound: p.salesHistory[0] } })}>
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
                                        <input 
                                            type="date" 
                                            value={formatDateToYYYYMMDD(creationDate)} 
                                            onChange={e => setCreationDate(new Date(e.target.value + 'T00:00:00'))}
                                            required 
                                        />
                                    </div>
                                    <p className="input-description">상품이 시스템에 등록된 것으로 표시될 날짜입니다.</p>
                                </div>
                            )}

                            <div className="form-group"><label>상세 설명</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} disabled={mode === 'newRound'}/></div>
                            <div className="form-group"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)} disabled={mode === 'newRound'}><option value="">대분류 선택</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                                <div className="settings-option-group">
                                    {storageTypeOptions.map(opt => 
                                        <button 
                                            key={opt.key} 
                                            type="button" 
                                            className={`settings-option-btn ${opt.className} ${selectedStorageType===opt.key?'active':''}`} 
                                            onClick={()=>setSelectedStorageType(opt.key)} 
                                            disabled={mode === 'newRound'}>
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
                                                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/png, image/jpeg" style={{display:'none'}} disabled={mode === 'newRound'}/>
                                                {imagePreviews.map((p, i) => (
                                                    <Draggable key={p+i} draggableId={p+i.toString()} index={i} isDragDisabled={mode==='newRound'}>
                                                        {(provided, snapshot) => (
                                                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`thumbnail-preview ${snapshot.isDragging ? 'dragging' : ''}`} style={{...provided.draggableProps.style}}>
                                                                <img src={p} alt={`미리보기 ${i+1}`}/>
                                                                {mode !== 'newRound' && <button type="button" onClick={() => removeImage(i)} className="remove-thumbnail-btn"><X size={10}/></button>}
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                                {imagePreviews.length < 10 && mode !== 'newRound' && (<button type="button" onClick={()=>fileInputRef.current?.click()} className="add-thumbnail-btn"><PlusCircle size={20}/></button>)}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                                {mode === 'newRound' && <p className="input-description">대표 상품 정보(이미지 포함)는 '회차 수정' 페이지에서만 변경할 수 있습니다.</p>}
                            </div>
                        </div>

                        {/* --- 판매 옵션 섹션 --- */}
                        <div className="form-section">
                            <div className="form-section-title"><div className="title-text-group"><Box size={20} className="icon-color-option"/><h3>판매 옵션 *</h3></div></div>
                            <p className="section-subtitle">현재 회차에만 적용되는 옵션, 가격, 재고 등을 설정합니다.</p>
                            <div className="form-group"><label>회차명 *</label><input type="text" value={roundName} onChange={e=>setRoundName(e.target.value)} required/></div>
                            {variantGroups.map(vg => (
                            <div className="variant-group-card" key={vg.id}>
                                <div className="variant-group-header">
                                    <div className="form-group full-width"><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder={productType === 'group' ? "예: 얼큰소고기맛" : "상품명과 동일하게"} required /></div>
                                    <div className="form-group"><label>그룹 총 재고</label><div className="stock-input-wrapper"><input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="비우면 무제한"/><span className="stock-unit-addon">{vg.stockUnitType || '개'}</span></div></div>
                                    <div className="form-group"><label>유통기한</label><input type="text" value={vg.expirationDateInput} onChange={e=>handleVariantGroupChange(vg.id, 'expirationDateInput', e.target.value)} onBlur={e => handleGroupDateBlur(vg.id, e.target.value)} placeholder="YYMMDD" maxLength={8}/></div>
                                    {productType === 'group' && (<button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-variant-group-btn" disabled={variantGroups.length <= 1} title={variantGroups.length <= 1 ? "마지막 그룹은 삭제할 수 없습니다." : "그룹 삭제"}><Trash2 size={16}/></button>)}
                                </div>
                                {vg.items.map(item => (
                                    <div className="option-item-section" key={item.id}>
                                        <div className="option-item-grid-2x2"><div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} required/></div><div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="text" value={formatNumberWithCommas(item.price)} onChange={e=>handlePriceChange(vg.id, item.id, e.target.value)} required/><span>원</span></div></div><div className="form-group-grid item-limit"><label className="tooltip-container"><span>구매 제한</span></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/></div><div className="form-group-grid item-deduction"><label className="tooltip-container"><span>차감 단위 *</span></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} required/></div></div>
                                        <button type="button" onClick={()=>removeItem(vg.id,item.id)} className="remove-item-btn" disabled={vg.items.length <= 1} title={vg.items.length <= 1 ? "마지막 옵션은 삭제할 수 없습니다." : "옵션 삭제"}><Trash2 size={14}/></button>
                                    </div>
                                ))}
                                <div className="option-item-actions"><button type="button" onClick={()=>addNewItem(vg.id)} className="add-item-btn">구매 옵션 추가</button></div>
                            </div>
                            ))}
                            <div className="variant-controls-footer">
                                <div className="add-group-btn-wrapper">
                                    {productType === 'group' && variantGroups.length < 5 && 
                                        <button type="button" onClick={addNewVariantGroup} className="add-group-btn">하위 상품 그룹 추가</button>
                                    }
                                </div>
                            </div>
                        </div>
                        
                        {/* --- 발행 및 기간 설정 섹션 --- */}
                        <div className="form-section sticky-section">
                            <div className="form-section-title"><div className="title-text-group"><SlidersHorizontal size={20} className="icon-color-settings"/><h3>발행 및 기간 설정</h3></div></div>
                            <p className="section-subtitle">상품의 판매 시점 및 조건을 설정합니다.</p>
                            
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
                                <input type="date" value={formatDateToYYYYMMDD(publishDate)} onChange={e => { const newDate = new Date(e.target.value + 'T00:00:00'); setPublishDate(newDate);}} required/>
                                { mode !== 'editRound' && <p className="input-description">선택한 날짜 오후 2시에 공개됩니다.</p> }
                            </div>
                            <div className="form-group"><label>공동구매 마감일 *</label><input type="datetime-local" value={formatToDateTimeLocal(deadlineDate)} onChange={e=>setDeadlineDate(e.target.value?new Date(e.target.value):null)} required/></div>
                            <div className="form-group"><label>픽업 시작일 *</label><input type="date" value={pickupDate ? formatDateToYYYYMMDD(pickupDate) : ''} onChange={e=>setPickupDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                            <div className="form-group"><label>픽업 마감일 *</label><input type="date" value={pickupDeadlineDate ? formatDateToYYYYMMDD(pickupDeadlineDate) : ''} onChange={e=>setPickupDeadlineDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                            
                            <div className="settings-summary-card">
                                <h4 className="summary-title"><Info size={16} /> 설정 요약</h4>
                                <ul>
                                    <li><strong>발행:</strong> {settingsSummary.publishText}</li>
                                    <li><strong>마감:</strong> {settingsSummary.deadlineText}</li>
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