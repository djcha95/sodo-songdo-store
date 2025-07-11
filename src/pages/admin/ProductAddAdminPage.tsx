// src/pages/admin/ProductAddAdminPage.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { addProductWithFirstRound, addNewSalesRound, getCategories } from '../../firebase';
import type { Category, StorageType, SalesRound, Product, VariantGroup, ProductItem, SalesRoundStatus } from '../../types';
import toast from 'react-hot-toast';
import { Save, PlusCircle, X, Loader, Package, Box, SlidersHorizontal, Trash2, Info, FileText } from 'lucide-react';
import './ProductAddAdminPage.css';

// --- UI 상태 관리용 타입 정의 ---
interface ProductItemUI { id: string; name: string; price: number | ''; limitQuantity: number | ''; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id: string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; expirationDate: Date | null; expirationDateInput: string; items: ProductItemUI[]; }

// --- 헬퍼 함수 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); const year = d.getFullYear(); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const day = d.getDate().toString().padStart(2, '0'); return `${year}-${month}-${day}`; };
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6) { const year = parseInt("20" + cleaned.substring(0, 2), 10); const month = parseInt(cleaned.substring(2, 4), 10) - 1; const day = parseInt(cleaned.substring(4, 6), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } if (cleaned.length === 8) { const year = parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(4, 6), 10) - 1; const day = parseInt(cleaned.substring(6, 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const formatNumberWithCommas = (value: number | ''): string => { if (value === '' || value === null) return ''; return Number(value).toLocaleString('ko-KR'); };
const parseFormattedNumber = (value: string): number | '' => { const parsed = parseInt(value.replace(/,/g, ''), 10); return isNaN(parsed) ? '' : parsed; };

const LoadingSpinner = () => (<div className="loading-overlay"><Loader size={48} className="spin" /> <p>잠시만 기다려 주세요...</p></div>);
const storageTypeOptions: { key: StorageType; name:string; className: string }[] = [{ key: 'ROOM', name: '실온', className: 'storage-btn-room' }, { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' }, { key: 'COLD', name: '냉장', className: 'storage-btn-cold' }];
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];

const getSmartDeadline = (): Date => {
    const now = new Date();
    const deadline = new Date(now);
    deadline.setHours(13, 0, 0, 0);
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 6) { deadline.setDate(now.getDate() + 2); } 
    else { deadline.setDate(now.getDate() + 1); }
    return deadline;
};

// --- 메인 컴포넌트 ---
const ProductAddAdminPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [mode, setMode] = useState<'newProduct' | 'newRound'>('newProduct');
    const [productType, setProductType] = useState<'single' | 'group'>('single');
    const [existingProductId, setExistingProductId] = useState<string | null>(null);
    const [pageTitle, setPageTitle] = useState('신규 대표 상품 등록');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);
    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMainCategory, setSelectedMainCategory] = useState('');
    const [selectedSubCategory, setSelectedSubCategory] = useState('');
    const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [roundName, setRoundName] = useState('1차 판매');
    const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);
    const [publishOption, setPublishOption] = useState<'now' | 'schedule'>('now');
    const [scheduledAt, setScheduledAt] = useState<Date>(() => new Date(new Date().setHours(13, 0, 0, 0)));
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(() => getSmartDeadline());
    const [pickupDay, setPickupDay] = useState<Date | null>(null);
    const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);

    useEffect(() => {
        const { productId, productGroupName, lastRound } = location.state || {};
        if (productId) {
            setMode('newRound'); setExistingProductId(productId); setPageTitle(`'${productGroupName}' 새 회차 추가`);
            if (lastRound) {
                const roundNumMatch = lastRound.roundName.match(/\d+/); const newRoundNumber = roundNumMatch ? parseInt(roundNumMatch[0], 10) + 1 : 2;
                setRoundName(`${newRoundNumber}차 판매`);
                const mappedVGs: VariantGroupUI[] = (lastRound.variantGroups || []).map((vg: VariantGroup) => ({
                    id: generateUniqueId(), groupName: vg.groupName, totalPhysicalStock: vg.totalPhysicalStock ?? '', stockUnitType: vg.stockUnitType,
                    expirationDate: vg.items[0]?.expirationDate?.toDate() || null, expirationDateInput: vg.items[0]?.expirationDate ? formatDateToYYYYMMDD(vg.items[0].expirationDate.toDate()) : '',
                    items: (vg.items || []).map((item: ProductItem) => ({ id: generateUniqueId(), name: item.name, price: item.price, limitQuantity: item.limitQuantity ?? '', deductionAmount: item.stockDeductionAmount, isBundleOption: bundleUnitKeywords.some(k => item.name.includes(k)) }))
                }));
                setVariantGroups(mappedVGs);
            }
        }
    }, [location.state]);

    useEffect(() => { if (mode === 'newProduct' && variantGroups.length === 0) { setVariantGroups([{ id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); } }, [mode, variantGroups.length]);
    useEffect(() => { (async () => { try { setCategories(await getCategories()); } catch (err) { toast.error("카테고리 정보를 불러오는 데 실패했습니다."); } })(); }, []);
    useEffect(() => { const category = categories.find(c => c.id === selectedMainCategory); setAvailableSubCategories(category ? category.subCategories : []); setSelectedSubCategory(''); }, [selectedMainCategory, categories]);
    useEffect(() => { if (mode === 'newProduct' && productType === 'single') { setVariantGroups(prev => prev.length > 0 ? [{ ...prev[0], groupName: groupName }] : prev); } }, [groupName, productType, mode]);
    
    useEffect(() => {
        if (!pickupDay) { setPickupDeadlineDate(null); return; }
        const newPickupDeadline = new Date(pickupDay);
        if (selectedStorageType === 'ROOM' || selectedStorageType === 'FROZEN') { newPickupDeadline.setDate(newPickupDeadline.getDate() + 1); }
        setPickupDeadlineDate(newPickupDeadline);
    }, [pickupDay, selectedStorageType]);

    const handleProductTypeChange = (newType: 'single' | 'group') => { if (productType === newType) return; if (productType === 'group' && newType === 'single') { toast.promise(new Promise<void>((resolve) => { setTimeout(() => { setVariantGroups((prev) => prev.slice(0, 1)); setProductType(newType); resolve(); }, 300); }), { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' }); } else { setProductType(newType); }};
    const handleVariantGroupChange = useCallback((id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === id ? { ...vg, [field]: value } : vg)); }, []);
    const handleGroupDateBlur = useCallback((id: string, dateStr: string) => { const parsedDate = parseDateString(dateStr); if (dateStr && !parsedDate) { toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)'); return; } handleVariantGroupChange(id, 'expirationDate', parsedDate); handleVariantGroupChange(id, 'expirationDateInput', parsedDate ? formatDateToYYYYMMDD(parsedDate) : '');}, [handleVariantGroupChange]);
    const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => { const numericValue = parseFormattedNumber(value); setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, price: numericValue } : item) } : vg)); }, []);
    const addNewItem = useCallback((vgId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; const files = Array.from(e.target.files); setImageFiles(prev => [...prev, ...files]); files.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)])); e.target.value = ''; }, []);
    const removeImage = useCallback((index: number) => { const urlToRemove = imagePreviews[index]; const fileIndex = imageFiles.findIndex(f => URL.createObjectURL(f) === urlToRemove); setImagePreviews(p => p.filter((_, i) => i !== index)); if (fileIndex > -1) setImageFiles(p => p.filter((_, i) => i !== fileIndex)); URL.revokeObjectURL(urlToRemove); }, [imagePreviews, imageFiles]);
    const settingsSummary = useMemo(() => { const publishText = publishOption === 'now' ? '즉시 발행' : `예약 발행 (${formatToDateTimeLocal(scheduledAt).replace('T', ' ')})`; const deadlineText = deadlineDate ? `${formatToDateTimeLocal(deadlineDate).replace('T', ' ')} 까지` : '미설정'; const pickupText = pickupDay ? `${formatDateToYYYYMMDD(pickupDay)} 부터` : '미설정'; return { publishText, deadlineText, pickupText }; }, [publishOption, scheduledAt, deadlineDate, pickupDay]);

    const getSalesRoundData = (status: SalesRoundStatus): Omit<SalesRound, 'roundId' | 'createdAt'> => ({
        roundName: roundName.trim(), status,
        variantGroups: variantGroups.map(vg => ({
            id: generateUniqueId(), groupName: (productType === 'single' && mode === 'newProduct') ? groupName.trim() : vg.groupName,
            totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock),
            stockUnitType: vg.stockUnitType,
            items: vg.items.map(item => ({
                id: generateUniqueId(), name: item.name, price: Number(item.price) || 0, stock: -1, 
                limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                expirationDate: vg.expirationDate ? Timestamp.fromDate(vg.expirationDate) : null,
                stockDeductionAmount: Number(item.deductionAmount) || 1,
            })),
        })),
        publishAt: Timestamp.fromDate(status === 'scheduled' ? scheduledAt : new Date()),
        deadlineDate: Timestamp.fromDate(deadlineDate!),
        pickupDate: Timestamp.fromDate(pickupDay!),
        pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
        waitlist: [],
        waitlistCount: 0,
    });

    const handleSubmit = async (isDraft: boolean = false) => {
        if (!isDraft) { 
            if (mode === 'newProduct' && imageFiles.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; } 
            if (!deadlineDate || !pickupDay || !pickupDeadlineDate) { toast.error('공구 마감일, 픽업 시작일, 픽업 마감일을 모두 설정해주세요.'); return; } 
        }
        setIsSubmitting(true);
        const submissionPromise = new Promise<void>(async (resolve, reject) => {
            try {
                const finalGroupName = (productType === 'group' || mode === 'newRound') ? groupName : (variantGroups[0]?.groupName || '단일 상품');
                const status: SalesRoundStatus = isDraft ? 'draft' : (publishOption === 'now' ? 'selling' : 'scheduled');
                const salesRoundToSave = getSalesRoundData(status);
                if (mode === 'newProduct') {
                    const productData: Omit<Product, 'id'|'createdAt'|'salesHistory'|'imageUrls'|'isArchived'> = {
                        groupName: finalGroupName.trim(), description: description.trim(), storageType: selectedStorageType,
                        category: categories.find(c => c.id === selectedMainCategory)?.name || '', subCategory: selectedSubCategory || '',
                        encoreCount: 0, encoreRequesterIds: [],
                    };
                    await addProductWithFirstRound(productData, salesRoundToSave, imageFiles);
                } else if (mode === 'newRound' && existingProductId) {
                    await addNewSalesRound(existingProductId, salesRoundToSave);
                }
                resolve();
            } catch (err) { reject(err); }
        });
        toast.promise(submissionPromise, {
            loading: '저장 중입니다...',
            success: () => {
                setIsSubmitting(false); navigate('/admin/products');
                if (mode === 'newProduct') { return isDraft ? "상품이 임시저장되었습니다." : "신규 상품과 첫 회차가 성공적으로 등록되었습니다."; }
                return isDraft ? "새 회차가 임시저장되었습니다." : "새로운 판매 회차가 성공적으로 추가되었습니다.";
            },
            error: (err) => { setIsSubmitting(false); return `저장 실패: ${(err as Error).message}`; }
        });
    };
 
    return (
        <div className="product-add-page-wrapper smart-form">
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(false); }}>
                <header className="product-add-header"><h1>{pageTitle}</h1><div className="header-actions"><button type="button" onClick={() => handleSubmit(true)} disabled={isSubmitting} className="draft-save-button"><FileText size={18} /> 임시저장</button><button type="submit" disabled={isSubmitting} className="save-button">{isSubmitting ? <Loader size={18} className="spin" /> : <Save size={18} />} {isSubmitting ? '저장 중...' : (mode === 'newProduct' ? '신규 상품 등록하기' : '새 회차 추가하기')}</button></div></header>
                <main className="main-content-grid-3-col-final">
                    <div className="form-section">
                        <div className="form-section-title"><div className="title-text-group"><Package size={20} className="icon-color-product"/><h3>대표 상품 정보</h3></div><div className="product-type-toggle-inline"><button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}>단일</button><button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}>그룹</button></div></div>
                        <p className="section-subtitle">상품의 기본 정보와 첫 판매 회차 이름을 설정합니다.</p>
                        <div className="form-group"><label>대표 상품명 *</label><input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="예: 무농약 블루베리" required/></div>
                        <div className="form-group"><label>회차명 *</label><input type="text" value={roundName} onChange={e=>setRoundName(e.target.value)} placeholder="예: 1차 판매" required/></div>
                        <div className="form-group"><label>상세 설명</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="상품의 특징, 스토리 등을 작성해주세요."/></div>
                        {mode === 'newProduct' && <div className="form-group"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)}><option value="">대분류</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={selectedSubCategory} onChange={e=>setSelectedSubCategory(e.target.value)} disabled={availableSubCategories.length===0}><option value="">소분류</option>{availableSubCategories.map(s=><option key={s} value={s}>{s}</option>)}</select></div><div className="storage-type-select">{storageTypeOptions.map(opt=><button key={opt.key} type="button" className={`${opt.className} ${selectedStorageType===opt.key?'active':''}`} onClick={()=>setSelectedStorageType(opt.key)}>{opt.name}</button>)}</div></div>}
                        <div className="form-group"><label>대표 이미지 *</label><div className="compact-image-uploader"><input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{display:'none'}}/>{imagePreviews.map((p,i) => (<div key={p+i} className="thumbnail-preview"><img src={p} alt=""/><button type="button" onClick={() => removeImage(i)} className="remove-thumbnail-btn"><X size={10}/></button></div>))}{imagePreviews.length < 10 && (<button type="button" onClick={()=>fileInputRef.current?.click()} className="add-thumbnail-btn"><PlusCircle size={20}/></button>)}</div></div>
                    </div>
                    <div className="form-section">
                        <div className="form-section-title"><div className="title-text-group"><Box size={20} className="icon-color-option"/><h3>판매 옵션 설정 *</h3></div></div><p className="section-subtitle">실제 판매될 상품의 옵션과 가격, 재고 등을 설정합니다.</p>
                        {variantGroups.map(vg => (
                            <div className="variant-group-card" key={vg.id}>
                                <div className="variant-group-header"><div className="form-group full-width"><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder={productType === 'group' ? "예: 얼큰소고기맛" : "상품명과 동일하게"} required /></div><div className="form-group"><label>그룹 총 재고</label><div className="stock-input-wrapper"><input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="비우면 무제한"/><span className="stock-unit-addon">{vg.stockUnitType || '개'}</span></div></div><div className="form-group"><label>유통기한</label><input type="text" value={vg.expirationDateInput} onChange={e=>handleVariantGroupChange(vg.id, 'expirationDateInput', e.target.value)} onBlur={e => handleGroupDateBlur(vg.id, e.target.value)} placeholder="YYMMDD" maxLength={8}/></div>{productType === 'group' && variantGroups.length > 1 && <button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-variant-group-btn"><Trash2 size={14}/></button>}</div>
                                {vg.items.map(item => (
                                    <div className="option-item-section" key={item.id}>
                                        <div className="option-item-grid-2x2"><div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} placeholder="예: 1개" required/></div><div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="text" value={formatNumberWithCommas(item.price)} onChange={e=>handlePriceChange(vg.id, item.id, e.target.value)} placeholder="0" required/><span>원</span></div></div><div className="form-group-grid item-limit"><label className="tooltip-container"><span>구매 제한</span><span className="tooltip-text">한 고객이 이 옵션을 구매할 수 있는 최대 수량입니다.</span></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/></div><div className="form-group-grid item-deduction"><label className="tooltip-container"><span>차감 단위 *</span><span className="tooltip-text">이 옵션 1개 판매 시, '그룹 총 재고'에서 차감될 수량입니다. (예: 1박스(12개입)은 12)</span></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} placeholder={item.isBundleOption ? "예: 12" : "1"} required/></div></div>
                                        {vg.items.length > 1 && <button type="button" onClick={()=>removeItem(vg.id,item.id)} className="remove-item-btn"><Trash2 size={14}/></button>}
                                    </div>
                                ))}
                                <div className="option-item-actions"><button type="button" onClick={()=>addNewItem(vg.id)} className="add-item-btn">구매 옵션 추가</button></div>
                            </div>
                        ))}
                        <div className="add-group-btn-wrapper">{productType === 'group' && variantGroups.length < 5 && <button type="button" onClick={addNewVariantGroup} className="add-group-btn">하위 상품 그룹 추가</button>}</div>
                    </div>
                    <div className="form-section sticky-section">
                        <div className="form-section-title"><div className="title-text-group"><SlidersHorizontal size={20} className="icon-color-settings"/><h3>발행 및 기간 설정</h3></div></div><p className="section-subtitle">상품의 판매 시점 및 기간을 설정합니다.</p>
                        <div className="form-group"><label>발행 옵션</label><div className="publish-option-buttons"><button type="button" className={publishOption==='now'?'active':''} onClick={()=>setPublishOption('now')}><span>즉시 발행</span></button><button type="button" className={publishOption==='schedule'?'active':''} onClick={()=>setPublishOption('schedule')}><span>예약 발행</span></button></div></div>
                        {publishOption === 'schedule' && <div className="form-group"><label>발행 예약 시간</label><input type="datetime-local" value={formatToDateTimeLocal(scheduledAt)} onChange={e=>setScheduledAt(new Date(e.target.value))}/></div>}
                        <div className="form-group"><label>공동구매 마감일 *</label><input type="datetime-local" value={formatToDateTimeLocal(deadlineDate)} onChange={e=>setDeadlineDate(e.target.value?new Date(e.target.value):null)} required/></div>
                        <div className="form-group"><label>픽업 시작일 *</label><input type="date" value={pickupDay ? formatDateToYYYYMMDD(pickupDay) : ''} onChange={e=>setPickupDay(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                        <div className="form-group"><label>픽업 마감일 *</label><input type="date" value={pickupDeadlineDate ? formatDateToYYYYMMDD(pickupDeadlineDate) : ''} onChange={e=>setPickupDeadlineDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} required/></div>
                        <div className="settings-summary-card"><h4 className="summary-title"><Info size={16} /> 설정 요약</h4><ul><li><strong>발행:</strong> {settingsSummary.publishText}</li><li><strong>마감:</strong> {settingsSummary.deadlineText}</li><li><strong>픽업:</strong> {settingsSummary.pickupText}</li></ul></div>
                    </div>
                </main>
            </form>
            {isSubmitting && <LoadingSpinner />}
        </div>
    );
};

export default ProductAddAdminPage;