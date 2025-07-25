// src/pages/admin/SalesRoundEditPage.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useNavigate, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getProductById, updateSalesRound, getCategories, updateProductCoreInfo } from '../../firebase';
import type { Category, StorageType, Product, SalesRound, SalesRoundStatus, VariantGroup, ProductItem, LoyaltyTier } from '../../types';
import toast from 'react-hot-toast';
import { Save, PlusCircle, X, Package, Box, SlidersHorizontal, Trash2, Info, FileText, Clock, Lock } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import './ProductAddAdminPage.css';

// --- UI 상태 관리용 타입 정의 ---
interface ProductItemUI { id: string; name: string; price: number | ''; limitQuantity: number | ''; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id: string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; expirationDate: Date | null; expirationDateInput: string; items: ProductItemUI[]; }

// --- 헬퍼 함수 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); const year = d.getFullYear(); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const day = date.getDate().toString().padStart(2, '0'); return `${year}-${month}-${day}`; };
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6) { const year = parseInt("20" + cleaned.substring(0, 2), 10); const month = parseInt(cleaned.substring(2, 4), 10) - 1; const day = parseInt(cleaned.substring(4, 6), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } if (cleaned.length === 8) { const year = parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(4, 6), 10) - 1; const day = parseInt(cleaned.substring(6, 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const formatNumberWithCommas = (value: number | ''): string => { if (value === '' || value === null) return ''; return Number(value).toLocaleString('ko-KR'); };
const parseFormattedNumber = (value: string): number | '' => { const parsed = parseInt(value.replace(/,/g, ''), 10); return isNaN(parsed) ? '' : parsed; };

const storageTypeOptions: { key: StorageType; name:string; className: string }[] = [{ key: 'ROOM', name: '실온', className: 'storage-btn-room' }, { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' }, { key: 'COLD', name: '냉장', className: 'storage-btn-cold' }];


// --- 선주문 설정 모달 컴포넌트 ---
interface PreOrderSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isEnabled: boolean;
    setIsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    tiers: LoyaltyTier[];
    setTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>; 
}

const PreOrderSettingsModal: React.FC<PreOrderSettingsModalProps> = ({ isOpen, onClose, isEnabled, setIsEnabled, tiers, setTiers }) => {
    if (!isOpen) return null;

    const handleTierChange = (tier: LoyaltyTier) => {
        setTiers(prevTiers => 
            prevTiers.includes(tier) ? prevTiers.filter(t => t !== tier) : [...prevTiers, tier]
        );
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
                <div className="admin-modal-header">
                    <h4><Clock size={20}/> 선주문 설정</h4> 
                    <button onClick={onClose} className="admin-modal-close-button"><X size={24}/></button>
                </div>
                <div className="admin-modal-body">
                    <div className="preorder-toggle-label">
                        <span>선주문 기능 사용</span>
                        <div className={`toggle-switch ${isEnabled ? 'active' : ''}`} onClick={() => setIsEnabled(!isEnabled)}>
                            <div className="toggle-handle"></div>
                        </div>
                    </div>
                    {isEnabled && (
                        <div className="preorder-options active">
                            <p className="preorder-info">
                                <Info size={14} />
                                선택된 등급은 상품 업로드 직후부터 발행일 오후 2시까지 선주문이 가능합니다.
                            </p>
                            <div className="tier-checkbox-group">
                                {(['공구의 신', '공구왕'] as LoyaltyTier[]).map(tier => (
                                    <label key={tier} htmlFor={`modal-tier-${tier}`}>
                                        <input type="checkbox" id={`modal-tier-${tier}`} value={tier} checked={tiers.includes(tier)} onChange={() => handleTierChange(tier)} />
                                        {tier}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="admin-modal-footer">
                    <button onClick={onClose} className="modal-button primary">확인</button>
                </div>
            </div>
        </div>
    );
};

// ✨ [신규] 시크릿 상품 설정 모달 컴포넌트
interface SecretProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    isEnabled: boolean;
    setIsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    tiers: LoyaltyTier[];
    setTiers: React.Dispatch<React.SetStateAction<LoyaltyTier[]>>;
}

const SecretProductModal: React.FC<SecretProductModalProps> = ({ isOpen, onClose, isEnabled, setIsEnabled, tiers, setTiers }) => {
    const handleTierChange = (tier: LoyaltyTier) => {
        setTiers(prevTiers => 
            prevTiers.includes(tier) ? prevTiers.filter(t => t !== tier) : [...prevTiers, tier]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
                <div className="admin-modal-header">
                    <h4><Lock size={20}/> 시크릿 상품 설정</h4>
                    <button onClick={onClose} className="admin-modal-close-button"><X size={24}/></button>
                </div>
                <div className="admin-modal-body">
                    <div className="form-group">
                        <label className="preorder-toggle-label">
                            <span>시크릿 상품 기능 사용</span>
                            <div className={`toggle-switch ${isEnabled ? 'active' : ''}`} onClick={() => setIsEnabled(!isEnabled)}>
                                <div className="toggle-handle"></div>
                            </div>
                        </label>
                    </div>
                    {isEnabled && (
                        <div className="preorder-options active">
                            <p className="preorder-info">
                                <Info size={14} />
                                선택된 등급의 고객에게만 이 상품이 노출됩니다.
                            </p>
                            <div className="tier-checkbox-group">
                                {(['공구의 신', '공구왕'] as LoyaltyTier[]).map(tier => (
                                    <label key={tier} htmlFor={`secret-tier-${tier}`}>
                                        <input type="checkbox" id={`secret-tier-${tier}`} value={tier} checked={tiers.includes(tier)} onChange={() => handleTierChange(tier)} />
                                        {tier}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="admin-modal-footer">
                    <button onClick={onClose} className="modal-button primary">확인</button>
                </div>
            </div>
        </div>
    );
};


// --- 메인 컴포넌트 ---
const SalesRoundEditPage: React.FC = () => {
    useDocumentTitle('상품 수정');
    const { productId, roundId } = useParams<{ productId: string; roundId: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [productType, setProductType] = useState<'single' | 'group'>('single');
    const [categories, setCategories] = useState<Category[]>([]);
    
    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMainCategory, setSelectedMainCategory] = useState('');
    const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
    const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
    const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);

    const [roundName, setRoundName] = useState('');
    const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]); 
    const [scheduledAt, setScheduledAt] = useState<Date>(new Date());
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
    const [pickupDay, setPickupDay] = useState<Date | null>(null);
    const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);
    const [isPrepaymentRequired, setIsPrepaymentRequired] = useState(false);

    const [isPreOrderModalOpen, setIsPreOrderModalOpen] = useState(false);
    const [isPreOrderEnabled, setIsPreOrderEnabled] = useState(true);
    const [preOrderTiers, setPreOrderTiers] = useState<LoyaltyTier[]>([]);

    // ✨ [신규] 시크릿 상품 관련 상태
    const [isSecretProductModalOpen, setIsSecretProductModalOpen] = useState(false);
    const [isSecretProductEnabled, setIsSecretProductEnabled] = useState(false);
    const [secretTiers, setSecretTiers] = useState<LoyaltyTier[]>([]);

    const initialRoundData = useRef<SalesRound | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!productId || !roundId) { toast.error("상품 또는 회차 ID가 없습니다."); navigate('/admin/products'); return; }
            setIsLoading(true);
            try {
                const [product, fetchedCategories] = await Promise.all([getProductById(productId), getCategories()]);
                if (!product) { toast.error("상품을 찾을 수 없습니다."); navigate('/admin/products'); return; }
                const round = product.salesHistory.find(r => r.roundId === roundId);
                if (!round) { toast.error("판매 회차를 찾을 수 없습니다."); navigate('/admin/products'); return; }
                
                initialRoundData.current = round;

                setCategories(fetchedCategories);
                setGroupName(product.groupName);
                setDescription(product.description);
                setSelectedStorageType(product.storageType);
                const mainCat = fetchedCategories.find(c => c.name === product.category);
                if (mainCat) { setSelectedMainCategory(mainCat.id); }
                setInitialImageUrls(product.imageUrls || []);
                setCurrentImageUrls(product.imageUrls || []);
                setImagePreviews(product.imageUrls || []);
                setProductType((round.variantGroups?.length || 0) > 1 || (round.variantGroups?.[0]?.groupName !== product.groupName) ? 'group' : 'single');
                setRoundName(round.roundName);

                const mappedVGs: VariantGroupUI[] = (round.variantGroups || []).map((vg: VariantGroup) => {
                    const groupExpirationDate = vg.items[0]?.expirationDate?.toDate() || null;
                    return {
                        id: vg.id || generateUniqueId(), groupName: vg.groupName, totalPhysicalStock: vg.totalPhysicalStock ?? '', stockUnitType: vg.stockUnitType,
                        expirationDate: groupExpirationDate, expirationDateInput: groupExpirationDate ? formatDateToYYYYMMDD(groupExpirationDate) : '',
                        items: (vg.items || []).map((item: ProductItem) => ({ id: item.id || generateUniqueId(), name: item.name, price: item.price, limitQuantity: item.limitQuantity ?? '', deductionAmount: item.stockDeductionAmount, isBundleOption: ['묶음', '박스', '곽', '세트', '팩', '봉지'].some(k => item.name.includes(k)) }))
                    };
                });
                setVariantGroups(mappedVGs);
                setScheduledAt(round.publishAt.toDate());
                setDeadlineDate(round.deadlineDate.toDate());
                setPickupDay(round.pickupDate.toDate());
                setPickupDeadlineDate(round.pickupDeadlineDate?.toDate() || null);
                setIsPrepaymentRequired(round.isPrepaymentRequired ?? false);

                if (round.preOrderTiers !== undefined && round.preOrderTiers.length > 0) {
                    setIsPreOrderEnabled(true);
                    setPreOrderTiers(round.preOrderTiers);
                } else if (round.preOrderTiers === undefined) {
                    setIsPreOrderEnabled(true);
                    setPreOrderTiers(['공구의 신', '공구왕']);
                } else {
                    setIsPreOrderEnabled(false);
                    setPreOrderTiers([]);
                }

                // ✨ [신규] 불러온 데이터로 시크릿 상품 상태 초기화
                setIsSecretProductEnabled(!!round.secretForTiers && round.secretForTiers.length > 0);
                setSecretTiers(round.secretForTiers || []);

            } catch (err) { toast.error("정보를 불러오는 데 실패했습니다."); console.error(err); } 
            finally { setIsLoading(false); }
        };
        fetchData();
    }, [productId, roundId, navigate]);

    useEffect(() => { if (!pickupDay) { setPickupDeadlineDate(null); return; } const newPickupDeadline = new Date(pickupDay); if (selectedStorageType === 'ROOM' || selectedStorageType === 'FROZEN') { newPickupDeadline.setDate(newPickupDeadline.getDate() + 1); } setPickupDeadlineDate(newPickupDeadline); }, [pickupDay, selectedStorageType]);

    const handleProductTypeChange = useCallback((newType: 'single' | 'group') => { if (productType === newType) return; if (productType === 'group' && newType === 'single') { toast.promise(new Promise<void>((resolve) => { setTimeout(() => { setVariantGroups((prev) => prev.slice(0, 1)); setProductType(newType); resolve(); }, 300); }), { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' }); } else { setProductType(newType); } }, [productType]);
    const handleVariantGroupChange = useCallback((id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => {
        setVariantGroups(prev =>
            prev.map(vg => (vg.id === id ? { ...vg, [field]: value } : vg))
        );
    }, []);

    const handleGroupDateBlur = useCallback((id: string, dateStr: string) => { const parsedDate = parseDateString(dateStr); if (dateStr && !parsedDate) { toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)'); return; } handleVariantGroupChange(id, 'expirationDate', parsedDate); handleVariantGroupChange(id, 'expirationDateInput', parsedDate ? formatDateToYYYYMMDD(parsedDate) : '');}, [handleVariantGroupChange]);
    const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = ['묶음', '박스', '곽', '세트', '팩', '봉지'].some(k => String(value).includes(k)) || !['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'].some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => { const numericValue = parseFormattedNumber(value); setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, price: numericValue } : item) } : vg)); }, []);
    const addNewItem = useCallback((vgId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; const files = Array.from(e.target.files); setNewImageFiles(prev => [...prev, ...files]); files.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)])); e.target.value = ''; }, []);
    const removeImage = useCallback((indexToRemove: number) => { const urlToRemove = imagePreviews[indexToRemove]; if (!urlToRemove) return; if (urlToRemove.startsWith('blob:')) { URL.revokeObjectURL(urlToRemove); setNewImageFiles(prev => prev.filter(f => URL.createObjectURL(f) !== urlToRemove)); } else { setCurrentImageUrls(prev => prev.filter(u => u !== urlToRemove)); } setImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove)); }, [imagePreviews]);

    const settingsSummary = useMemo(() => { const publishText = `예약 발행 (${formatToDateTimeLocal(scheduledAt).replace('T', ' ')})`; const deadlineText = deadlineDate ? `${formatToDateTimeLocal(deadlineDate).replace('T', ' ')} 까지` : '미설정'; const pickupText = pickupDay ? `${formatDateToYYYYMMDD(pickupDay)} 부터` : '미설정'; return { publishText, deadlineText, pickupText }; }, [scheduledAt, deadlineDate, pickupDay]);

    const handleSubmit = async (isDraft: boolean = false) => {
        if (!productId || !roundId) return;
        if (!isDraft) { if (imagePreviews.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; } if (!deadlineDate || !pickupDay || !pickupDeadlineDate) { toast.error('공구 마감일, 픽업 시작일, 픽업 마감일을 모두 설정해주세요.'); return; } }
        setIsSubmitting(true);
        try {
            const productDataToUpdate: Partial<Omit<Product, 'id' | 'salesHistory'>> = { groupName: groupName.trim(), description: description.trim(), storageType: selectedStorageType, category: categories.find(c => c.id === selectedMainCategory)?.name || '' };
            await updateProductCoreInfo(productId, productDataToUpdate, newImageFiles, currentImageUrls, initialImageUrls);
            
            const status: SalesRoundStatus = isDraft ? 'draft' : 'scheduled';
            
            const publishDateTime = new Date(scheduledAt);
            publishDateTime.setHours(14, 0, 0, 0);
            
            const preOrderEndDateTime = isPreOrderEnabled ? publishDateTime : null;

            const salesRoundToUpdate = {
                roundName: roundName.trim(), status,
                variantGroups: variantGroups.map(vg => ({
                    id: vg.id, groupName: productType === 'single' ? groupName.trim() : vg.groupName,
                    totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock),
                    stockUnitType: vg.stockUnitType,
                    items: vg.items.map(item => ({
                        id: item.id, name: item.name, price: Number(item.price) || 0, stock: -1,
                        limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                        expirationDate: vg.expirationDate ? Timestamp.fromDate(vg.expirationDate) : null,
                        stockDeductionAmount: Number(item.deductionAmount) || 1,
                    })),
                })),
                publishAt: Timestamp.fromDate(publishDateTime),
                deadlineDate: Timestamp.fromDate(deadlineDate!),
                pickupDate: Timestamp.fromDate(pickupDay!),
                pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
                isPrepaymentRequired: isPrepaymentRequired,
                preOrderTiers: isPreOrderEnabled ? preOrderTiers : [],
                preOrderEndDate: preOrderEndDateTime ? Timestamp.fromDate(preOrderEndDateTime) : undefined,
                secretForTiers: isSecretProductEnabled ? secretTiers : [], // ✨ [신규] 시크릿 상품 정보 저장
            };
            await updateSalesRound(productId, roundId, salesRoundToUpdate as any);
            toast.success(isDraft ? "수정 내용이 임시저장되었습니다." : "상품 정보가 성공적으로 수정되었습니다.");
            navigate('/admin/products');
        } catch (err) { toast.error(`수정 중 오류가 발생했습니다: ${(err as Error).message}`);
        } finally { setIsSubmitting(false); }
    };
  
    if (isLoading) return <SodomallLoader message="상품 정보를 불러오는 중입니다..." />;

    return (
        <>
            <PreOrderSettingsModal
                isOpen={isPreOrderModalOpen}
                onClose={() => setIsPreOrderModalOpen(false)}
                isEnabled={isPreOrderEnabled}
                setIsEnabled={setIsPreOrderEnabled}
                tiers={preOrderTiers}
                setTiers={setPreOrderTiers} 
            />
            {/* ✨ [신규] 시크릿 상품 모달 렌더링 */}
            <SecretProductModal
                isOpen={isSecretProductModalOpen}
                onClose={() => setIsSecretProductModalOpen(false)}
                isEnabled={isSecretProductEnabled}
                setIsEnabled={setIsSecretProductEnabled}
                tiers={secretTiers}
                setTiers={setSecretTiers}
            />
            <div className="product-add-page-wrapper smart-form">
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(false); }}>
                    <header className="product-add-header">
                        <h1>판매 회차 수정</h1>
                        <div className="header-actions">
                            <button type="button" onClick={() => handleSubmit(true)} disabled={isSubmitting} className="draft-save-button"><FileText size={18} /> 임시저장</button>
                            <button type="submit" disabled={isSubmitting} className="save-button">
                                {isSubmitting ? <InlineSodomallLoader /> : <Save size={18} />}
                                수정 내용 저장
                            </button>
                        </div>
                    </header>
                    <main className="main-content-grid-3-col-final">
                     <div className="form-section">
                        <div className="form-section-title"><div className="title-text-group"><Package size={20} className="icon-color-product"/><h3>대표 상품 정보</h3></div><div className="product-type-toggle-inline"><button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}>단일</button><button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}>그룹</button></div></div>
                        <p className="section-subtitle">상품의 기본 정보는 모든 판매 회차에 공통 적용됩니다.</p>
                        <div className="form-group"><label>대표 상품명 *</label><input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} required/></div>
                        <div className="form-group"><label>상세 설명</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}/></div>
                        <div className="form-group"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)}><option value="">대분류 선택</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="storage-type-select">{storageTypeOptions.map(opt=><button key={opt.key} type="button" className={`${opt.className} ${selectedStorageType===opt.key?'active':''}`} onClick={()=>setSelectedStorageType(opt.key)}>{opt.name}</button>)}</div></div>
                        <div className="form-group"><label>대표 이미지 *</label><div className="compact-image-uploader"><input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{display:'none'}}/>{imagePreviews.map((p,i) => (<div key={p+i} className="thumbnail-preview"><img src={p} alt=""/><button type="button" onClick={() => removeImage(i)} className="remove-thumbnail-btn"><X size={10}/></button></div>))}{imagePreviews.length < 10 && (<button type="button" onClick={()=>fileInputRef.current?.click()} className="add-thumbnail-btn"><PlusCircle size={20}/></button>)}</div></div>
                    </div>

                    <div className="form-section">
                        <div className="form-section-title"><div className="title-text-group"><Box size={20} className="icon-color-option"/><h3>판매 옵션 수정 *</h3></div></div>
                        <p className="section-subtitle">현재 수정 중인 판매 회차에만 적용되는 옵션입니다.</p>
                        <div className="form-group"><label>회차명 *</label><input type="text" value={roundName} onChange={e=>setRoundName(e.target.value)} required/></div>
                        {variantGroups.map(vg => (
                            <div className="variant-group-card" key={vg.id}>
                                <div className="variant-group-header">
                                    <div className="form-group full-width"><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder="하위 상품 그룹명" required /></div>
                                    <div className="form-group"><label>그룹 총 재고</label><div className="stock-input-wrapper"><input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="비우면 무제한"/><span className="stock-unit-addon">{vg.stockUnitType || '개'}</span></div></div>
                                    <div className="form-group"><label>유통기한</label><input type="text" value={vg.expirationDateInput} onChange={e=>handleVariantGroupChange(vg.id, 'expirationDateInput', e.target.value)} onBlur={e => handleGroupDateBlur(vg.id, e.target.value)} placeholder="YYMMDD" maxLength={8}/></div>
                                    {productType === 'group' && (<button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-variant-group-btn" disabled={variantGroups.length <= 1} title={variantGroups.length <= 1 ? "마지막 그룹은 삭제할 수 없습니다." : "그룹 삭제"}><Trash2 size={16}/></button>)}
                                </div>
                                {vg.items.map(item => (
                                    <div className="option-item-section" key={item.id}>
                                        <div className="option-item-grid-2x2"><div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} required/></div><div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="text" value={formatNumberWithCommas(item.price)} onChange={e=>handlePriceChange(vg.id, item.id, e.target.value)} required/><span>원</span></div></div><div className="form-group-grid item-limit"><label className="tooltip-container"><span>구매 제한</span><span className="tooltip-text">한 고객이 이 옵션을 구매할 수 있는 최대 수량입니다.</span></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/></div><div className="form-group-grid item-deduction"><label className="tooltip-container"><span>차감 단위 *</span><span className="tooltip-text">이 옵션 1개 판매 시, '그룹 총 재고'에서 차감될 수량입니다.</span></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} required/></div></div>
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

                    <div className="form-section sticky-section">
                        <div className="form-section-title">
                            <div className="title-text-group">
                                <SlidersHorizontal size={20} className="icon-color-settings"/>
                                <h3>발행 및 기간 설정</h3>
                            </div>
                        </div>
                        <p className="section-subtitle">상품의 판매 시점 및 기간을 설정합니다.</p>
                        
                        {/* ✨ [수정] 새로운 버튼 그룹 UI 적용 */}
                        <div className="form-group">
                            <label>예약 옵션</label>
                            <div className="settings-option-group">
                                <Tippy content="선입금 필수 상품으로 설정합니다.">
                                    <button
                                        type="button"
                                        className={`settings-option-btn ${isPrepaymentRequired ? 'active' : ''}`}
                                        onClick={() => setIsPrepaymentRequired(!isPrepaymentRequired)}
                                    >
                                        <Save size={16} /> 선입금
                                    </button>
                                </Tippy>
                                <Tippy content="선주문 설정을 엽니다.">
                                    <button
                                        type="button"
                                        className={`settings-option-btn ${isPreOrderEnabled ? 'active' : ''}`}
                                        onClick={() => setIsPreOrderModalOpen(true)}
                                    >
                                        <Clock size={16} /> 선주문
                                    </button>
                                </Tippy>
                                <Tippy content="시크릿 상품 설정을 엽니다.">
                                    <button
                                        type="button"
                                        className={`settings-option-btn ${isSecretProductEnabled ? 'active' : ''}`}
                                        onClick={() => setIsSecretProductModalOpen(true)}
                                    >
                                        <Lock size={16} /> 시크릿
                                    </button>
                                </Tippy>
                            </div>
                        </div>
                        
                        <div className="form-group">
                            <label>발행일 (오후 2시 공개)</label>
                            <input 
                                type="date" 
                                value={formatDateToYYYYMMDD(scheduledAt)} 
                                onChange={e => {
                                    const newDate = new Date(e.target.value + 'T00:00:00');
                                    newDate.setHours(14, 0, 0, 0);
                                    setScheduledAt(newDate);
                                }} 
                                required
                            />
                            <p className="input-description">선택한 날짜 오후 2시에 모든 고객에게 공개됩니다.</p>
                        </div>

                        <div className="form-group"><label>공동구매 마감일 *</label><input type="datetime-local" value={formatToDateTimeLocal(deadlineDate)} onChange={e=>setDeadlineDate(e.target.value?new Date(e.target.value):null)} required/></div>
                        <div className="form-group"><label>픽업 시작일 *</label><input type="date" value={pickupDay ? formatDateToYYYYMMDD(pickupDay) : ''} onChange={e=>setPickupDay(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                        <div className="form-group"><label>픽업 마감일 *</label><input type="date" value={pickupDeadlineDate ? formatDateToYYYYMMDD(pickupDeadlineDate) : ''} onChange={e=>setPickupDeadlineDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                        <div className="settings-summary-card"><h4 className="summary-title"><Info size={16} /> 설정 요약</h4><ul><li><strong>발행:</strong> {settingsSummary.publishText}</li><li><strong>마감:</strong> {settingsSummary.deadlineText}</li><li><strong>픽업:</strong> {settingsSummary.pickupText}</li></ul></div>
                    </div>
                </main>
            </form>
            {isSubmitting && <SodomallLoader message="수정 내용을 저장하고 있습니다..." />}
        </div>
        </>
    );
};

export default SalesRoundEditPage;