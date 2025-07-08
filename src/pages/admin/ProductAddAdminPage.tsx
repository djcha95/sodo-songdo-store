// src/pages/admin/ProductAddAdminPage.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { addProductWithFirstRound, addNewSalesRound, getCategories } from '../../firebase';
import type { Category, StorageType, SalesRound, Product, VariantGroup as VariantGroupType, ProductItem as ProductItemType, SalesRoundStatus } from '../../types';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Save, PlusCircle, X, Camera, Loader, Package, HelpCircle, Box, BookMarked, SlidersHorizontal, Trash2, LayoutGrid } from 'lucide-react';
import './ProductAddAdminPage.css';

// --- UI 상태 관리용 타입 정의 ---
interface ProductItemUI { id: string; name: string; price: number | ''; stock: number | ''; limitQuantity: number | ''; expirationDate: Date | null; expirationDateInput: string; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id: string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; items: ProductItemUI[]; }

// --- 헬퍼 함수 및 상수 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6 || cleaned.length === 8) { const year = cleaned.length === 6 ? parseInt(cleaned.substring(0, 2), 10) + 2000 : parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(cleaned.length === 6 ? 2 : 4, cleaned.length === 6 ? 4 : 6), 10) - 1; const day = parseInt(cleaned.substring(cleaned.length === 6 ? 4 : 6, cleaned.length === 6 ? 6 : 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const Tooltip = ({ text }: { text: string }) => (<div className="tooltip-wrapper"><HelpCircle size={14} /><div className="tooltip-content">{text}</div></div>);
const LoadingSpinner = () => (<div className="loading-overlay"><Loader size={48} className="spin" /> <p>잠시만 기다려 주세요...</p></div>);

const storageTypeOptions: { key: StorageType; name:string; }[] = [{ key: 'ROOM', name: '실온' }, { key: 'FROZEN', name: '냉동' }, { key: 'COLD', name: '냉장' }];
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];

const getSmartDeadline = (): Date => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const nextDay = new Date(now);
    nextDay.setHours(13, 0, 0, 0);

    if (dayOfWeek >= 1 && dayOfWeek <= 4) { // 월요일 ~ 목요일
        nextDay.setDate(now.getDate() + 1);
    } else { // 금, 토, 일
        const daysUntilMonday = dayOfWeek === 5 ? 3 : (dayOfWeek === 6 ? 2 : 1);
        nextDay.setDate(now.getDate() + daysUntilMonday);
    }
    return nextDay;
};

// --- 메인 컴포넌트 ---
const ProductAddAdminPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 상태 선언
    const [mode, setMode] = useState<'newProduct' | 'newRound'>('newProduct');
    const [productType, setProductType] = useState<'single' | 'group'>('single');
    const [existingProductId, setExistingProductId] = useState<string | null>(null);
    const [pageTitle, setPageTitle] = useState('신규 대표 상품 등록');
    const [submitButtonText, setSubmitButtonText] = useState('신규 상품 등록하기');
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
    const [publishOption, setPublishOption] = useState<'draft' | 'now' | 'schedule'>('now');
    const [scheduledAt, setScheduledAt] = useState<Date>(() => new Date(new Date().setHours(13, 0, 0, 0)));
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(() => getSmartDeadline());
    const [pickupDay, setPickupDay] = useState<Date | null>(null);
    
    // 모드 감지 및 데이터 미리 채우기
    useEffect(() => {
        const { productId, productGroupName, lastRound } = location.state || {};
        if (productId) {
            setMode('newRound');
            setExistingProductId(productId);
            setPageTitle(`'${productGroupName}' 새 회차 추가`);
            setSubmitButtonText('새 회차 추가하기');
            toast(`'${productGroupName}' 상품에 새 판매 회차를 추가합니다.`, { icon: 'ℹ️' });

            if (lastRound) {
                // ✅ [개선] 회차명 자동 생성 로직
                const roundNumMatch = lastRound.roundName.match(/\d+/);
                const newRoundNumber = roundNumMatch ? parseInt(roundNumMatch[0], 10) + 1 : 2;
                setRoundName(`${newRoundNumber}차 판매`);

                // 기존 옵션 불러오기
                const mappedVGs: VariantGroupUI[] = (lastRound.variantGroups || []).map((vg: VariantGroupType) => ({
                    id: generateUniqueId(), groupName: vg.groupName, totalPhysicalStock: vg.totalPhysicalStock ?? '', stockUnitType: vg.stockUnitType,
                    items: (vg.items || []).map((item: ProductItemType) => ({
                        id: generateUniqueId(), name: item.name, price: item.price, stock: item.stock === -1 ? '' : item.stock, limitQuantity: item.limitQuantity ?? '',
                        expirationDate: item.expirationDate?.toDate() || null, expirationDateInput: item.expirationDate ? formatDateToYYYYMMDD(item.expirationDate.toDate()) : '',
                        deductionAmount: item.stockDeductionAmount, isBundleOption: bundleUnitKeywords.some(k => item.name.includes(k))
                    }))
                }));
                setVariantGroups(mappedVGs);
            }
        }
    }, [location.state]);

    // ... 이하 나머지 코드는 변경 없음 ...
    useEffect(() => { if (mode === 'newProduct' && variantGroups.length === 0) { setVariantGroups([{ id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', items: [{ id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: 1, isBundleOption: false }] }]); } }, [mode, variantGroups.length]);
    useEffect(() => { (async () => { try { setCategories(await getCategories()); } catch (err) { toast.error("카테고리 정보를 불러오는 데 실패했습니다."); } })(); }, []);
    useEffect(() => { const category = categories.find(c => c.id === selectedMainCategory); setAvailableSubCategories(category ? category.subCategories : []); setSelectedSubCategory(''); }, [selectedMainCategory, categories]);

    useEffect(() => {
        if (mode === 'newProduct' && productType === 'single') {
            setVariantGroups(prev => {
                if (prev.length > 0) {
                    const newVGs = [...prev];
                    newVGs[0] = { ...newVGs[0], groupName: groupName };
                    return newVGs;
                }
                return prev;
            });
        }
    }, [groupName, productType, mode]);
    const handleProductTypeChange = (newType: 'single' | 'group') => { if (productType === newType) return; if (productType === 'group' && newType === 'single') { toast((t) => (<div><p>그룹 상품을 단일 상품으로 변경 시, 첫 번째 그룹을 제외한 나머지 정보는 삭제됩니다. 계속하시겠습니까?</p><div style={{textAlign:'right'}}><button onClick={() => { setVariantGroups((prev) => prev.slice(0, 1)); setProductType(newType); toast.dismiss(t.id); }}>확인</button><button onClick={() => toast.dismiss(t.id)}>취소</button></div></div>), { duration: 6000 }); } else { setProductType(newType); }};
    const handleVariantGroupChange = useCallback((id: string, field: keyof VariantGroupUI, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === id ? { ...vg, [field]: value } : vg)); }, []);
    const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', items: [{ id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption' | 'expirationDate' | 'expirationDateInput'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handleExpirationDateChange = useCallback((vgId: string, itemId: string, dateStr: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDateInput: dateStr } : item) } : vg));}, []);
    const handleExpirationDateKeyDown = useCallback((vgId: string, itemId: string, e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); const input = e.target as HTMLInputElement; const parsedDate = parseDateString(input.value); if (parsedDate) { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDate: parsedDate, expirationDateInput: formatDateToYYYYMMDD(parsedDate) } : item) } : vg)); } else { toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)'); input.select(); } } }, []);
    const addNewItem = useCallback((vgId: string, isBundle: boolean) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: isBundle ? '' : 1, isBundleOption: isBundle }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; const files = Array.from(e.target.files); setImageFiles(prev => [...prev, ...files]); files.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)])); e.target.value = ''; }, []);
    const removeImage = useCallback((index: number) => { const urlToRemove = imagePreviews[index]; setImagePreviews(p => p.filter((_, i) => i !== index)); const fileIndex = imageFiles.findIndex(f => URL.createObjectURL(f) === urlToRemove); if(fileIndex > -1) setImageFiles(p => p.filter((_, i) => i !== fileIndex)); URL.revokeObjectURL(urlToRemove); }, [imagePreviews, imageFiles]);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === 'newProduct' && imageFiles.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; }
        if (!deadlineDate || !pickupDay) { toast.error('공구 마감일과 픽업 시작일을 모두 설정해주세요.'); return; }
        
        setIsSubmitting(true);
        const finalGroupName = (productType === 'group' || mode === 'newRound') ? groupName : (variantGroups[0]?.groupName || '단일 상품');
        const status: SalesRoundStatus = publishOption === 'now' ? 'selling' : (publishOption === 'schedule' ? 'scheduled' : 'draft');
        const salesRoundToSave: Omit<SalesRound, 'roundId' | 'createdAt'> = {
            roundName: roundName.trim(), status,
            variantGroups: variantGroups.map(vg => ({
                id: generateUniqueId(),
                groupName: (productType === 'single' && mode === 'newProduct') ? finalGroupName : vg.groupName,
                totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock),
                stockUnitType: vg.stockUnitType,
                items: vg.items.map(item => ({
                    id: generateUniqueId(), name: item.name, price: Number(item.price) || 0, stock: item.stock === '' ? -1 : Number(item.stock),
                    limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                    expirationDate: item.expirationDate ? Timestamp.fromDate(item.expirationDate) : null,
                    stockDeductionAmount: Number(item.deductionAmount) || 1,
                })),
            })),
            publishAt: Timestamp.fromDate(publishOption === 'schedule' ? scheduledAt : new Date()),
            deadlineDate: Timestamp.fromDate(deadlineDate), pickupDate: Timestamp.fromDate(pickupDay),
            pickupDeadlineDate: Timestamp.fromDate(new Date(pickupDay.getTime() + (24 * 60 * 60 * 1000 - 1))),
        };
        try {
            if (mode === 'newProduct') {
                const productData: Omit<Product, 'id'|'createdAt'|'salesHistory'|'imageUrls'|'isArchived'> = {
                    groupName: finalGroupName.trim(), description: description.trim(), storageType: selectedStorageType,
                    category: categories.find(c => c.id === selectedMainCategory)?.name || '', subCategory: selectedSubCategory || '',
                    encoreCount: 0, encoreRequesterIds: [],
                };
                await addProductWithFirstRound(productData, salesRoundToSave, imageFiles);
                toast.success("신규 상품과 첫 회차가 성공적으로 등록되었습니다.");
            } else if (mode === 'newRound' && existingProductId) {
                await addNewSalesRound(existingProductId, salesRoundToSave);
                toast.success("새로운 판매 회차가 성공적으로 추가되었습니다.");
            }
            navigate('/admin/products');
        } catch (err) { toast.error(`저장 중 오류가 발생했습니다: ${(err as Error).message}`);
        } finally { setIsSubmitting(false); }
    };
  
    return (
        <div className="product-add-page-wrapper smart-form">
            <form onSubmit={handleSubmit}>
                <header className="product-add-header"><h1>{pageTitle}</h1><button type="submit" disabled={isSubmitting} className="save-button">{isSubmitting ? <Loader size={18} className="spin" /> : <Save size={18} />} {isSubmitting ? '저장 중...' : submitButtonText}</button></header>
                <main className="main-content-grid-3-col">
                    {mode === 'newProduct' && (
                        <div className="form-column col-left">
                            <div className="form-section"><h3 className="form-section-title"><Package size={18}/> 대표 상품 정보</h3><div className="product-type-toggle"><button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}><Package size={16}/> 단일 상품</button><button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}><LayoutGrid size={16}/> 그룹 상품</button></div><div className="form-group compact"><label>대표 상품명 *</label><input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="예: 무농약 블루베리 500g" required/></div><div className="form-group compact"><label>상세 설명</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="상품의 특징, 스토리, 주의사항 등을 작성해주세요."/></div></div>
                            <div className="form-section"><h3 className="form-section-title"><ImageIcon size={18}/> 대표 이미지 *</h3><div className="image-upload-box"><input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{display:'none'}}/>{imagePreviews.length > 0 ? <div className="image-previews-grid-new">{imagePreviews.map((p,i) => <div key={p+i} className="image-preview-item"><img src={p} alt=""/><button type="button" onClick={() => removeImage(i)} className="remove-image-btn-new"><X size={12}/></button></div>)}{imagePreviews.length < 10 && <button type="button" onClick={()=>fileInputRef.current?.click()} className="add-image-btn"><PlusCircle size={24}/></button>}</div> : <div className="image-dropzone" onClick={()=>fileInputRef.current?.click()}><Camera size={48}/><span>클릭하여 이미지 추가</span></div>}</div></div>
                        </div>
                    )}
                    <div className="form-column col-center">
                        <div className="form-section"><h3 className="form-section-title"><BookMarked size={18}/> {mode === 'newProduct' ? '첫 번째' : '새로운'} 판매 회차 정보</h3><div className="form-group compact"><label>회차명 *</label><input type="text" value={roundName} onChange={e=>setRoundName(e.target.value)} placeholder="예: 1차 판매, 주말 반짝 특가" required/></div></div>
                        <div className="form-section"><h3 className="form-section-title"><Box size={18}/> 판매 옵션 설정 *</h3>
                        {variantGroups.map(vg => (
                            <div className="item-card-new" key={vg.id} style={{border:'1px solid #d0d7de', marginBottom:16}}>
                                {productType === 'group' && (<div className="form-group compact" style={{borderBottom:'1px solid #e9ecef', paddingBottom:16, marginBottom:16}}><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder="예: GAP 인증 블루베리" required /></div>)}
                                {vg.items.map(item => (
                                    <div className="item-card-new" key={item.id} style={{border:'1px solid #f1f3f5', padding:16, marginBottom:12, position:'relative'}}>
                                        <div className="item-grid-2rows">
                                            <div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} placeholder={item.isBundleOption ? "예: 2팩 묶음" : "예: 1팩 (500g)"} required/></div>
                                            <div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="number" value={item.price} onChange={e=>handleItemChange(vg.id, item.id, 'price', e.target.value)} placeholder="0" required/><span>원</span></div></div>
                                            <div className="form-group-grid item-expiry"><label>유통기한</label><input type="text" value={item.expirationDateInput} onChange={e=>handleExpirationDateChange(vg.id, item.id, e.target.value)} onKeyDown={e => handleExpirationDateKeyDown(vg.id, item.id, e)} placeholder="YYMMDD 또는 YYYYMMDD" maxLength={8}/></div>
                                            <div className="form-group-grid item-stock"><label><span>재고</span><Tooltip text="품목별 재고. 비워두면 무제한."/></label><input type="number" value={item.stock} onChange={e=>handleItemChange(vg.id, item.id, 'stock', e.target.value)} placeholder="무제한"/></div>
                                            <div className="form-group-grid item-deduction-amount"><label><span>단위당 기준 재고 *</span><Tooltip text="1개 판매 시 총 재고에서 차감될 수량."/></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} placeholder={item.isBundleOption ? "예: 2" : "1"} required/></div>
                                            <div className="form-group-grid item-limit"><label><span>1인 구매 제한</span><Tooltip text="고객 1명당 구매 최대 수량."/></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/></div>
                                        </div>
                                        {vg.items.length > 1 && <button type="button" onClick={()=>removeItem(vg.id,item.id)} className="remove-item-btn-new"><Trash2 size={14}/></button>}
                                    </div>
                                ))}
                                <div style={{display:'flex',gap:10,marginTop:12}}><button type="button" onClick={()=>addNewItem(vg.id, false)} className="add-item-btn-new" style={{flex:1, borderStyle:'dashed'}}>낱개 옵션 +</button><button type="button" onClick={()=>addNewItem(vg.id, true)} className="add-item-btn-new" style={{flex:1, borderStyle:'dashed'}}>묶음 옵션 +</button></div>
                                {productType === 'group' && variantGroups.length > 1 && <button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-item-btn-new" style={{top:8, right:8}}><X size={14}/></button>}
                            </div>
                        ))}
                        {productType === 'group' && variantGroups.length < 5 && <button type="button" onClick={addNewVariantGroup} className="add-item-btn-new" style={{marginTop:20}}>하위 상품 그룹 추가</button>}
                        </div>
                    </div>
                    <div className="form-column col-right">
                        <div className="form-section sticky-section">
                            <h3 className="form-section-title"><SlidersHorizontal size={18}/> 발행 및 기간 설정</h3>
                            {mode === 'newProduct' && <div className="form-group compact"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)}><option value="">대분류</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={selectedSubCategory} onChange={e=>setSelectedSubCategory(e.target.value)} disabled={availableSubCategories.length===0}><option value="">소분류</option>{availableSubCategories.map(s=><option key={s} value={s}>{s}</option>)}</select></div><div className="storage-type-select" style={{marginTop:8}}>{storageTypeOptions.map(opt=><button key={opt.key} type="button" className={selectedStorageType===opt.key?'active':''} onClick={()=>setSelectedStorageType(opt.key)}>{opt.name}</button>)}</div></div>}
                            <div className="form-group compact"><label>발행 옵션</label><div className="publish-option-group-new"><label><input type="radio" value="now" checked={publishOption==='now'} onChange={()=>setPublishOption('now')}/><span>즉시 발행</span></label><label><input type="radio" value="schedule" checked={publishOption==='schedule'} onChange={()=>setPublishOption('schedule')}/><span>예약</span></label><label><input type="radio" value="draft" checked={publishOption==='draft'} onChange={()=>setPublishOption('draft')}/><span>임시저장</span></label></div></div>
                            {publishOption === 'schedule' && <div className="form-group compact"><label>발행 예약 시간</label><input type="datetime-local" value={formatToDateTimeLocal(scheduledAt)} onChange={e=>setScheduledAt(new Date(e.target.value))}/></div>}
                            <div className="form-group compact"><label>공구 마감 *</label><input type="datetime-local" value={formatToDateTimeLocal(deadlineDate)} onChange={e=>setDeadlineDate(e.target.value?new Date(e.target.value):null)} required/></div>
                            <div className="form-group compact"><label>픽업 시작일 *</label><input type="date" value={pickupDay ? formatDateToYYYYMMDD(pickupDay) : ''} onChange={e=>setPickupDay(e.target.value?new Date(e.target.value):null)} required/></div>
                        </div>
                    </div>
                </main>
            </form>
            {isSubmitting && <LoadingSpinner />}
        </div>
    );
};

export default ProductAddAdminPage;