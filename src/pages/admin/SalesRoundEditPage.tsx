// src/pages/admin/SalesRoundEditPage.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getProductById, updateSalesRound, getCategories, updateProductCoreInfo } from '../../firebase';
// 1. SalesRoundStatus 타입 추가, 사용하지 않는 타입 제거
import type { Category, StorageType, SalesRound, Product, SalesRoundStatus } from '../../types';
import toast from 'react-hot-toast';
// 2. 사용하지 않는 LayoutGrid 제거
import { Image as ImageIcon, Save, PlusCircle, X, Loader, Package, Box, SlidersHorizontal, Trash2, Info, UploadCloud, FileText } from 'lucide-react';
import './ProductAddAdminPage.css'; // 상품 등록 페이지와 동일한 스타일 사용

// --- UI 상태 관리용 타입 정의 ---
interface ProductItemUI { id: string; name: string; price: number | ''; stock: number | ''; limitQuantity: number | ''; expirationDate: Date | null; expirationDateInput: string; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id: string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; items: ProductItemUI[]; }

// --- 헬퍼 함수 (상품 등록 페이지와 동일) ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6) { const year = parseInt("20" + cleaned.substring(0, 2), 10); const month = parseInt(cleaned.substring(2, 4), 10) - 1; const day = parseInt(cleaned.substring(4, 6), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } if (cleaned.length === 8) { const year = parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(4, 6), 10) - 1; const day = parseInt(cleaned.substring(6, 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const formatNumberWithCommas = (value: number | ''): string => { if (value === '' || value === null) return ''; return Number(value).toLocaleString('ko-KR'); };
const parseFormattedNumber = (value: string): number | '' => { const parsed = parseInt(value.replace(/,/g, ''), 10); return isNaN(parsed) ? '' : parsed; };
const LoadingSpinner = () => (<div className="loading-overlay"><Loader size={48} className="spin" /> <p>잠시만 기다려 주세요...</p></div>);
const storageTypeOptions: { key: StorageType; name:string; className: string }[] = [{ key: 'ROOM', name: '실온', className: 'storage-btn-room' }, { key: 'COLD', name: '냉장', className: 'storage-btn-cold' }, { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' }];
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];

// --- 메인 컴포넌트 ---
const SalesRoundEditPage: React.FC = () => {
    const { productId, roundId } = useParams<{ productId: string; roundId: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- 상태 선언 ---
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [productType, setProductType] = useState<'single' | 'group'>('single');
    const [categories, setCategories] = useState<Category[]>([]);
    
    // 대표 상품 정보
    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMainCategory, setSelectedMainCategory] = useState('');
    const [selectedSubCategory, setSelectedSubCategory] = useState('');
    const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
    const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);
    const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
    const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);

    // 판매 회차 정보
    const [roundName, setRoundName] = useState('');
    const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);
    const [publishOption, setPublishOption] = useState<'now' | 'schedule'>('now');
    const [scheduledAt, setScheduledAt] = useState<Date>(new Date());
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
    const [pickupDay, setPickupDay] = useState<Date | null>(null);
    
    // --- 데이터 로딩 ---
    useEffect(() => {
        const fetchData = async () => {
            if (!productId || !roundId) {
                toast.error("상품 또는 회차 ID가 없습니다.");
                navigate('/admin/products');
                return;
            }
            setIsLoading(true);
            try {
                const [product, fetchedCategories] = await Promise.all([getProductById(productId), getCategories()]);
                if (!product) { toast.error("상품을 찾을 수 없습니다."); navigate('/admin/products'); return; }
                const round = product.salesHistory.find(r => r.roundId === roundId);
                if (!round) { toast.error("판매 회차를 찾을 수 없습니다."); navigate('/admin/products'); return; }
                
                setCategories(fetchedCategories);
                setGroupName(product.groupName);
                setDescription(product.description);
                setSelectedStorageType(product.storageType);
                const mainCat = fetchedCategories.find(c => c.name === product.category);
                if (mainCat) {
                    setSelectedMainCategory(mainCat.id);
                    if (product.subCategory) setSelectedSubCategory(product.subCategory);
                }
                setInitialImageUrls(product.imageUrls || []);
                setCurrentImageUrls(product.imageUrls || []);
                setImagePreviews(product.imageUrls || []);
                setProductType((round.variantGroups?.length || 0) > 1 || (round.variantGroups?.[0]?.groupName !== product.groupName) ? 'group' : 'single');
                setRoundName(round.roundName);
                const mappedVGs: VariantGroupUI[] = (round.variantGroups || []).map((vg) => ({
                    id: vg.id || generateUniqueId(),
                    groupName: vg.groupName,
                    totalPhysicalStock: vg.totalPhysicalStock ?? '',
                    stockUnitType: vg.stockUnitType,
                    items: (vg.items || []).map((item) => ({
                        id: item.id || generateUniqueId(),
                        name: item.name,
                        price: item.price,
                        stock: item.stock === -1 ? '' : item.stock,
                        limitQuantity: item.limitQuantity ?? '',
                        expirationDate: item.expirationDate?.toDate() || null,
                        expirationDateInput: item.expirationDate ? formatDateToYYYYMMDD(item.expirationDate.toDate()) : '',
                        deductionAmount: item.stockDeductionAmount,
                        isBundleOption: bundleUnitKeywords.some(k => item.name.includes(k))
                    }))
                }));
                setVariantGroups(mappedVGs);
                setPublishOption(round.status === 'selling' ? 'now' : 'schedule');
                setScheduledAt(round.publishAt.toDate());
                setDeadlineDate(round.deadlineDate.toDate());
                setPickupDay(round.pickupDate.toDate());

            } catch (err) { toast.error("정보를 불러오는 데 실패했습니다."); console.error(err); } 
            finally { setIsLoading(false); }
        };
        fetchData();
    }, [productId, roundId, navigate]);

    useEffect(() => { const category = categories.find(c => c.id === selectedMainCategory); setAvailableSubCategories(category ? category.subCategories : []); if (category && !category.subCategories.includes(selectedSubCategory)) { setSelectedSubCategory(''); } }, [selectedMainCategory, categories, selectedSubCategory]);

    const handleProductTypeChange = useCallback((newType: 'single' | 'group') => { if (productType === newType) return; if (productType === 'group' && newType === 'single') { toast.promise(new Promise<void>((resolve) => { setTimeout(() => { setVariantGroups((prev) => prev.slice(0, 1)); setProductType(newType); resolve(); }, 300); }), { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' }); } else { setProductType(newType); } }, [productType]);
    const handleVariantGroupChange = useCallback((id: string, field: keyof VariantGroupUI, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === id ? { ...vg, [field]: value } : vg)); }, []);
    const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', items: [{ id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption' | 'expirationDate' | 'expirationDateInput' | 'price'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => { const numericValue = parseFormattedNumber(value); setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, price: numericValue } : item) } : vg)); }, []);
    const handleExpirationDateChange = useCallback((vgId: string, itemId: string, dateStr: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDateInput: dateStr } : item) } : vg));}, []);
    const handleExpirationDateBlur = useCallback((vgId: string, itemId: string, dateStr: string) => { const parsedDate = parseDateString(dateStr); if (dateStr && !parsedDate) { toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)'); return; } setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDate: parsedDate, expirationDateInput: parsedDate ? formatDateToYYYYMMDD(parsedDate) : '' } : item) } : vg)); }, []);
    const addNewItem = useCallback((vgId: string, isBundle: boolean) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: isBundle ? '' : 1, isBundleOption: isBundle }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; const files = Array.from(e.target.files); setNewImageFiles(prev => [...prev, ...files]); files.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)])); e.target.value = ''; }, []);
    const removeImage = useCallback((indexToRemove: number) => { const urlToRemove = imagePreviews[indexToRemove]; if (!urlToRemove) return; if (urlToRemove.startsWith('blob:')) { URL.revokeObjectURL(urlToRemove); setNewImageFiles(prev => prev.filter(f => URL.createObjectURL(f) !== urlToRemove)); } else { setCurrentImageUrls(prev => prev.filter(u => u !== urlToRemove)); } setImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove)); }, [imagePreviews]);

    const settingsSummary = useMemo(() => {
        const publishText = publishOption === 'now' ? '즉시 발행' : `예약 발행 (${formatToDateTimeLocal(scheduledAt).replace('T', ' ')})`;
        const deadlineText = deadlineDate ? `${formatToDateTimeLocal(deadlineDate).replace('T', ' ')} 까지` : '미설정';
        const pickupText = pickupDay ? `${formatDateToYYYYMMDD(pickupDay)} 부터` : '미설정';
        return { publishText, deadlineText, pickupText };
    }, [publishOption, scheduledAt, deadlineDate, pickupDay]);

    const handleSubmit = async (isDraft: boolean = false) => {
        if (!productId || !roundId) return;
        if (!isDraft) {
            if (imagePreviews.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; }
            if (!deadlineDate || !pickupDay) { toast.error('공구 마감일과 픽업 시작일을 모두 설정해주세요.'); return; }
        }
        
        setIsSubmitting(true);
        try {
            // 1. 대표 상품 정보 업데이트
            const productDataToUpdate: Partial<Omit<Product, 'id' | 'salesHistory'>> = {
                groupName: groupName.trim(), description: description.trim(), storageType: selectedStorageType,
                category: categories.find(c => c.id === selectedMainCategory)?.name || '', subCategory: selectedSubCategory || '',
            };
            await updateProductCoreInfo(productId, productDataToUpdate, newImageFiles, currentImageUrls, initialImageUrls);

            // 2. 판매 회차 정보 업데이트
            const status: SalesRoundStatus = isDraft ? 'draft' : (publishOption === 'now' ? 'selling' : 'scheduled');
            const salesRoundToUpdate: Omit<SalesRound, 'roundId' | 'createdAt'> = {
                roundName: roundName.trim(), status,
                variantGroups: variantGroups.map(vg => ({
                    id: vg.id, groupName: productType === 'single' ? groupName.trim() : vg.groupName,
                    totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock),
                    stockUnitType: vg.stockUnitType,
                    items: vg.items.map(item => ({
                        id: item.id, name: item.name, price: Number(item.price) || 0,
                        stock: item.stock === '' ? -1 : Number(item.stock),
                        limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                        expirationDate: item.expirationDate ? Timestamp.fromDate(item.expirationDate) : null,
                        stockDeductionAmount: Number(item.deductionAmount) || 1,
                    })),
                })),
                // 3. null 가능성 오류 해결
                publishAt: Timestamp.fromDate(status === 'scheduled' ? scheduledAt : new Date()),
                deadlineDate: Timestamp.fromDate(deadlineDate!),
                pickupDate: Timestamp.fromDate(pickupDay!),
                pickupDeadlineDate: Timestamp.fromDate(new Date(pickupDay!.getTime() + (24 * 60 * 60 * 1000 - 1))),
            };
        
            await updateSalesRound(productId, roundId, salesRoundToUpdate);
            toast.success(isDraft ? "수정 내용이 임시저장되었습니다." : "상품 정보가 성공적으로 수정되었습니다.");
            navigate('/admin/products');
        } catch (err) { toast.error(`수정 중 오류가 발생했습니다: ${(err as Error).message}`);
        } finally { setIsSubmitting(false); }
    };
  
    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="product-add-page-wrapper smart-form">
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(false); }}>
                <header className="product-add-header">
                    <h1>판매 회차 수정</h1>
                    <div className="header-actions">
                        <button type="button" onClick={() => handleSubmit(true)} disabled={isSubmitting} className="draft-save-button"><FileText size={18} /> 임시저장</button>
                        <button type="submit" disabled={isSubmitting} className="save-button">{isSubmitting ? <Loader size={18} className="spin" /> : <Save size={18} />} 수정 내용 저장</button>
                    </div>
                </header>
                <main className="main-content-grid-2x2">
                    <div className="form-column-2x2-left">
                        <div className="form-section">
                            <div className="form-section-title"><div className="title-text-group"><Package size={20} className="icon-color-product"/><h3>대표 상품 정보</h3></div><div className="product-type-toggle-inline"><button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}>단일</button><button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}>그룹</button></div></div>
                            <p className="section-subtitle">대표 상품의 이름, 설명 등은 모든 판매 회차에 공통 적용됩니다.</p>
                            <div className="form-group"><label>대표 상품명 *</label><input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} required/></div>
                            <div className="form-group"><label>상세 설명</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}/></div>
                        </div>
                        <div className="form-section">
                            <div className="form-section-title"><div className="title-text-group"><ImageIcon size={20} className="icon-color-image"/><h3>대표 이미지 *</h3></div></div>
                            <p className="section-subtitle">모든 판매 회차에 공통으로 사용될 이미지입니다.</p>
                            <div className="image-upload-area" onClick={()=>!imagePreviews.length && fileInputRef.current?.click()}><input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{display:'none'}}/>{imagePreviews.length > 0 ? (<div className="image-previews-grid-final">{imagePreviews.map((p,i) => (<div key={p+i} className="image-preview-item"><img src={p} alt=""/><button type="button" onClick={() => removeImage(i)} className="remove-image-btn"><X size={12}/></button></div>))}{imagePreviews.length < 10 && (<button type="button" onClick={()=>fileInputRef.current?.click()} className="add-image-btn-final"><PlusCircle size={24}/><span>추가</span></button>)}</div>) : (<div className="dropzone-prompt"><UploadCloud size={48}/><p>클릭 또는 드래그하여 업로드</p></div>)}</div>
                        </div>
                    </div>
                    <div className="form-column-2x2-right">
                        <div className="form-section">
                            <div className="form-section-title"><div className="title-text-group"><Box size={20} className="icon-color-option"/><h3>판매 옵션 수정 *</h3></div></div>
                            <p className="section-subtitle">현재 수정 중인 판매 회차에만 적용되는 옵션입니다.</p>
                            <div className="form-group"><label>회차명 *</label><input type="text" value={roundName} onChange={e=>setRoundName(e.target.value)} required/></div>
                            {variantGroups.map(vg => (
                                <div className="variant-group-card" key={vg.id}>
                                    {productType === 'group' && (<div className="variant-group-header"><div className="form-group full-width"><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} required /></div>{variantGroups.length > 1 && <button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-variant-group-btn"><X size={14}/></button>}</div>)}
                                    {vg.items.map(item => (
                                        <div className="option-item-card" key={item.id}>
                                            <div className="option-item-grid-final">
                                                <div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} required/></div>
                                                <div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="text" value={formatNumberWithCommas(item.price)} onChange={e=>handlePriceChange(vg.id, item.id, e.target.value)} required/><span>원</span></div></div>
                                                <div className="form-group-grid item-expiry"><label>유통기한</label><input type="text" value={item.expirationDateInput} onChange={e=>handleExpirationDateChange(vg.id, item.id, e.target.value)} onBlur={e => handleExpirationDateBlur(vg.id, item.id, e.target.value)} placeholder="YYMMDD" maxLength={8}/></div>
                                                <div className="form-group-grid item-stock"><label className="tooltip-container"><span>재고</span><span className="tooltip-text">품목별 재고. 비워두면 무제한 판매됩니다.</span></label><input type="number" value={item.stock} onChange={e=>handleItemChange(vg.id, item.id, 'stock', e.target.value)} placeholder="무제한"/></div>
                                                <div className="form-group-grid item-limit"><label className="tooltip-container"><span>구매 제한</span><span className="tooltip-text">한 고객이 이 옵션을 구매할 수 있는 최대 수량입니다.</span></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/></div>
                                                <div className="form-group-grid item-deduction"><label className="tooltip-container"><span>차감 재고 *</span><span className="tooltip-text">이 옵션 1개 판매 시, 그룹의 '총 재고'에서 차감될 수량입니다.</span></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} required/></div>
                                            </div>
                                            {vg.items.length > 1 && <button type="button" onClick={()=>removeItem(vg.id,item.id)} className="remove-item-btn"><Trash2 size={14}/></button>}
                                        </div>
                                    ))}
                                    <div className="option-item-actions"><button type="button" onClick={()=>addNewItem(vg.id, false)} className="add-item-btn">낱개 옵션 +</button><button type="button" onClick={()=>addNewItem(vg.id, true)} className="add-item-btn">묶음 옵션 +</button></div>
                                </div>
                            ))}
                            {productType === 'group' && variantGroups.length < 5 && <button type="button" onClick={addNewVariantGroup} className="add-group-btn">하위 상품 그룹 추가</button>}
                        </div>
                        <div className="form-section sticky-section">
                            <div className="form-section-title"><div className="title-text-group"><SlidersHorizontal size={20} className="icon-color-settings"/><h3>발행 및 기간 설정</h3></div></div>
                            <p className="section-subtitle">상품의 분류, 보관 타입과 판매 시점 및 기간을 설정합니다.</p>
                            <div className="form-group"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)}><option value="">대분류</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={selectedSubCategory} onChange={e=>setSelectedSubCategory(e.target.value)} disabled={availableSubCategories.length===0}><option value="">소분류</option>{availableSubCategories.map(s=><option key={s} value={s}>{s}</option>)}</select></div><div className="storage-type-select">{storageTypeOptions.map(opt=><button key={opt.key} type="button" className={`${opt.className} ${selectedStorageType===opt.key?'active':''}`} onClick={()=>setSelectedStorageType(opt.key)}>{opt.name}</button>)}</div></div>
                            <div className="form-group"><label>발행 옵션</label><div className="publish-option-buttons"><button type="button" className={publishOption==='now'?'active':''} onClick={()=>setPublishOption('now')}><span>즉시 발행</span></button><button type="button" className={publishOption==='schedule'?'active':''} onClick={()=>setPublishOption('schedule')}><span>예약 발행</span></button></div></div>
                            {publishOption === 'schedule' && <div className="form-group"><label>발행 예약 시간</label><input type="datetime-local" value={formatToDateTimeLocal(scheduledAt)} onChange={e=>setScheduledAt(new Date(e.target.value))}/></div>}
                            <div className="form-group"><label>공동구매 마감일 *</label><input type="datetime-local" value={formatToDateTimeLocal(deadlineDate)} onChange={e=>setDeadlineDate(e.target.value?new Date(e.target.value):null)} required/></div>
                            <div className="form-group"><label>픽업 시작일 *</label><input type="date" value={pickupDay ? formatDateToYYYYMMDD(pickupDay) : ''} onChange={e=>setPickupDay(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                            <div className="settings-summary-card">
                                <h4 className="summary-title"><Info size={16} /> 설정 요약</h4>
                                <ul><li><strong>발행:</strong> {settingsSummary.publishText}</li><li><strong>마감:</strong> {settingsSummary.deadlineText}</li><li><strong>픽업:</strong> {settingsSummary.pickupText}</li></ul>
                            </div>
                        </div>
                    </div>
                </main>
            </form>
            {isSubmitting && <LoadingSpinner />}
        </div>
    );
};

export default SalesRoundEditPage;