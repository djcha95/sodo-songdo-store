// src/pages/admin/ProductAddAdminPage.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { addProductWithFirstRound, addNewSalesRound, getCategories, searchProductsByName } from '../../firebase';
import type { Category, StorageType, SalesRound, Product, VariantGroup, ProductItem, SalesRoundStatus } from '../../types';
import { LoyaltyTier } from '@/types';
import toast from 'react-hot-toast';
// ✅ [수정] 사용하지 않는 Clock, Lock 아이콘 제거
import { Save, PlusCircle, X, Package, Box, SlidersHorizontal, Trash2, Info, FileText, AlertTriangle, Loader2, Users, ShieldCheck } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';
import SodomallLoader from '@/components/common/SodomallLoader';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import './ProductAddAdminPage.css';


// --- UI 타입 및 헬퍼 함수 ---
interface ProductItemUI { id: string; name: string; price: number | ''; limitQuantity: number | ''; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id:string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; expirationDate: Date | null; expirationDateInput: string; items: ProductItemUI[]; }

const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); const year = d.getFullYear(); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const day = d.getDate().toString().padStart(2, '0'); return `${year}-${month}-${day}`; };
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6) { const year = parseInt("20" + cleaned.substring(0, 2), 10); const month = parseInt(cleaned.substring(2, 4), 10) - 1; const day = parseInt(cleaned.substring(4, 6), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } if (cleaned.length === 8) { const year = parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(4, 6), 10) - 1; const day = parseInt(cleaned.substring(6, 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const formatNumberWithCommas = (value: number | ''): string => { if (value === '' || value === null) return ''; return Number(value).toLocaleString('ko-KR'); };
const parseFormattedNumber = (value: string): number | '' => { const parsed = parseInt(value.replace(/,/g, ''), 10); return isNaN(parsed) ? '' : parsed; };

const storageTypeOptions: { key: StorageType; name:string; className: string }[] = [{ key: 'ROOM', name: '실온', className: 'storage-btn-room' }, { key: 'FROZEN', name: '냉동', className: 'storage-btn-frozen' }, { key: 'COLD', name: '냉장', className: 'storage-btn-cold' }];
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];

// 파일 업로드 최대 크기 설정 (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ✅ [수정] LoyaltyTier 타입에 맞게 배열을 수정합니다. '공구의달인'이 타입에 없다면 제거해야 합니다.
// 만약 '공구의달인'이 실제 등급이라면 types.ts의 LoyaltyTier 타입에 추가해야 합니다.
const ALL_LOYALTY_TIERS: LoyaltyTier[] = ['공구의 신', '공구왕', '공구요정', '공구새싹'];
// --- 메인 컴포넌트 ---
const ProductAddAdminPage: React.FC = () => {
    useDocumentTitle('새 상품 등록');
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [mode, setMode] = useState<'newProduct' | 'newRound'>('newProduct');
    const [productType, setProductType] = useState<'single' | 'group'>('single');
    const [existingProductId, setExistingProductId] = useState<string | null>(null);
    const [pageTitle, setPageTitle] = useState('신규 대표 상품 등록');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);

    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMainCategory, setSelectedMainCategory] = useState('');

    const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [roundName, setRoundName] = useState('1차 판매');
    const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);
    
    const [publishDate, setPublishDate] = useState<Date>(() => new Date(new Date().setHours(14, 0, 0, 0)));
    const [pickupDate, setPickupDate] = useState<Date | null>(null);
    
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(null); // 1차 공구 마감
    const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null); // 2차 공구 마감

    const [isPrepaymentRequired, setIsPrepaymentRequired] = useState(false);
    
    const [isParticipationRestricted, setIsParticipationRestricted] = useState(false);
    const [allowedTiers, setAllowedTiers] = useState<LoyaltyTier[]>([]);

    const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

    const handleTierChange = (tier: LoyaltyTier) => {
        setAllowedTiers(prevTiers =>
            prevTiers.includes(tier) ? prevTiers.filter(t => t !== tier) : [...prevTiers, tier]
        );
    };

    useEffect(() => {
        const newDeadline = new Date(publishDate);
        const dayOfWeek = newDeadline.getDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday

        if (dayOfWeek === 6) { // Saturday
            newDeadline.setDate(newDeadline.getDate() + 2); // To Monday
        } else if (dayOfWeek === 0) { // Sunday
            newDeadline.setDate(newDeadline.getDate() + 1); // To Monday
        } else { // Weekdays
            newDeadline.setDate(newDeadline.getDate() + 1); // To next day
        }
        
        newDeadline.setHours(13, 0, 0, 0); // 오후 1시로 설정
        setDeadlineDate(newDeadline);
    }, [publishDate]);

    useEffect(() => {
        if (!pickupDate) {
            setPickupDeadlineDate(null);
            return;
        }
        const newPickupDeadline = new Date(pickupDate);
        newPickupDeadline.setHours(13, 0, 0, 0); // 픽업일 오후 1시
        setPickupDeadlineDate(newPickupDeadline);
    }, [pickupDate]);


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
                setIsPrepaymentRequired(lastRound.isPrepaymentRequired ?? false); 
                
                const lastAllowedTiers = lastRound.allowedTiers || [];
                if (lastAllowedTiers.length > 0) {
                    setIsParticipationRestricted(true);
                    setAllowedTiers(lastAllowedTiers);
                } else {
                    setIsParticipationRestricted(false);
                    setAllowedTiers([]);
                }
            }
        }
    }, [location.state]);

    useEffect(() => { if (mode === 'newProduct' && variantGroups.length === 0) { setVariantGroups([{ id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); } }, [mode, variantGroups.length]);
    useEffect(() => { (async () => { try { setCategories(await getCategories()); } catch (err) { toast.error("카테고리 정보를 불러오는 데 실패했습니다."); } })(); }, []);
    useEffect(() => { if (mode === 'newProduct' && productType === 'single') { setVariantGroups(prev => prev.length > 0 ? [{ ...prev[0], groupName: groupName }] : prev); } }, [groupName, productType, mode]);
    
    useEffect(() => {
        if (mode !== 'newProduct' || !groupName.trim()) {
            setSimilarProducts([]);
            return;
        }

        const handler = setTimeout(async () => {
            setIsCheckingDuplicates(true);
            try {
                const results = await searchProductsByName(groupName.trim());
                setSimilarProducts(results);
            } catch (error) {
                console.error("Error searching products:", error);
                setSimilarProducts([]);
            } finally {
                setIsCheckingDuplicates(false);
            }
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [groupName, mode]);


    const onDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return;
        }
        const { source, destination } = result;
        const newPreviews = Array.from(imagePreviews);
        const [reorderedPreview] = newPreviews.splice(source.index, 1);
        newPreviews.splice(destination.index, 0, reorderedPreview);
        setImagePreviews(newPreviews);
        const newFiles = Array.from(imageFiles);
        const [reorderedFile] = newFiles.splice(source.index, 1);
        newFiles.splice(destination.index, 0, reorderedFile);
        setImageFiles(newFiles);
    };

    const handleProductTypeChange = (newType: 'single' | 'group') => { if (productType === newType) return; if (productType === 'group' && newType === 'single') { toast.promise(new Promise<void>((resolve) => { setTimeout(() => { setVariantGroups((prev) => prev.slice(0, 1)); setProductType(newType); resolve(); }, 300); }), { loading: '변경 중...', success: '단일 상품으로 전환되었습니다.', error: '전환 실패' }); } else { setProductType(newType); }};
    
    const handleVariantGroupChange = useCallback((id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => { 
        setVariantGroups(prev => prev.map(vg => vg.id === id ? { ...vg, [field]: value } : vg)); 
    }, []);

    const handleGroupDateBlur = useCallback((id: string, dateStr: string) => {
        const parsedDate = parseDateString(dateStr);
        if (dateStr && !parsedDate) {
            toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)');
            return;
        }
        setVariantGroups(prev =>
            prev.map(vg =>
                vg.id === id
                    ? {
                        ...vg,
                        expirationDate: parsedDate,
                        expirationDateInput: parsedDate ? formatDateToYYYYMMDD(parsedDate) : dateStr,
                    }
                    : vg
            )
        );
    }, []);

    const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handlePriceChange = useCallback((vgId: string, itemId: string, value: string) => { const numericValue = parseFormattedNumber(value); setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, price: numericValue } : item) } : vg)); }, []);
    const addNewItem = useCallback((vgId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;

        const selectedFiles = Array.from(e.target.files);
        const validFiles: File[] = [];
        const rejectedReasons: string[] = [];

        selectedFiles.forEach(file => {
            if (file.type === 'image/gif') {
                rejectedReasons.push(`'${file.name}': GIF 파일은 업로드할 수 없습니다.`);
            } else if (file.size > MAX_FILE_SIZE) {
                rejectedReasons.push(`'${file.name}': 파일 크기가 너무 큽니다 (최대 5MB).`);
            } else {
                validFiles.push(file);
            }
        });

        if (rejectedReasons.length > 0) {
            toast.error(
                <div>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>일부 파일을 업로드할 수 없습니다:</p>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                        {rejectedReasons.map((reason, i) => <li key={i}>{reason}</li>)}
                    </ul>
                </div>, 
                { duration: 5000 }
            );
        }

        if (validFiles.length > 0) {
            setImageFiles(prev => [...prev, ...validFiles]);
            validFiles.forEach(file => {
                setImagePreviews(prev => [...prev, URL.createObjectURL(file)]);
            });
        }
        
        e.target.value = '';
    }, []);

    const removeImage = useCallback((index: number) => { const urlToRemove = imagePreviews[index]; const fileIndex = imageFiles.findIndex(f => URL.createObjectURL(f) === urlToRemove); setImagePreviews(p => p.filter((_, i) => i !== index)); if (fileIndex > -1) setImageFiles(p => p.filter((_, i) => i !== fileIndex)); URL.revokeObjectURL(urlToRemove); }, [imagePreviews, imageFiles]);
    
    const settingsSummary = useMemo(() => {
        const publishText = `${formatDateToYYYYMMDD(publishDate)} 오후 2시`;
        const deadlineText = deadlineDate ? `${formatToDateTimeLocal(deadlineDate).replace('T', ' ')} (1차)` : '미설정';
        const pickupText = pickupDate ? `${formatDateToYYYYMMDD(pickupDate)} 부터` : '미설정';
        const pickupDeadlineText = pickupDeadlineDate ? `${formatToDateTimeLocal(pickupDeadlineDate).replace('T', ' ')} (최종)` : '미설정';
        return { publishText, deadlineText, pickupText, pickupDeadlineText };
    }, [publishDate, deadlineDate, pickupDate, pickupDeadlineDate]);


    const getSalesRoundData = (status: SalesRoundStatus): Omit<SalesRound, 'roundId' | 'createdAt'> => {
        const finalPublishDate = new Date(publishDate);
        finalPublishDate.setHours(14, 0, 0, 0);

        return {
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
            publishAt: Timestamp.fromDate(finalPublishDate),
            deadlineDate: Timestamp.fromDate(deadlineDate!),
            pickupDate: Timestamp.fromDate(pickupDate!),
            pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
            isPrepaymentRequired: isPrepaymentRequired,
            waitlist: [],
            waitlistCount: 0,
            allowedTiers: isParticipationRestricted ? allowedTiers : [],
        };
    };

    const handleSubmit = async (isDraft: boolean = false) => {
        if (!isDraft) {
            if (mode === 'newProduct' && imageFiles.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; }
            if (!deadlineDate || !pickupDate) { toast.error('발행일과 픽업 시작일을 모두 설정해주세요.'); return; }
            if (isParticipationRestricted && allowedTiers.length === 0) {
                toast.error("'특정 등급만 참여'를 선택하셨습니다. 참여 가능한 등급을 1개 이상 선택해주세요.");
                return;
            }
        }
        setIsSubmitting(true);
        
        const submissionPromise = new Promise<void>(async (resolve, reject) => {
            try {
                const finalGroupName = (productType === 'group' || mode === 'newRound') ? groupName : (variantGroups[0]?.groupName || '단일 상품');
                const status: SalesRoundStatus = isDraft ? 'draft' : 'scheduled';
                const salesRoundToSave = getSalesRoundData(status);
                if (mode === 'newProduct') {
                    const productData: Omit<Product, 'id'|'createdAt'|'salesHistory'|'imageUrls'|'isArchived'> = {
                        groupName: finalGroupName.trim(), description: description.trim(), storageType: selectedStorageType,
                        category: categories.find(c => c.id === selectedMainCategory)?.name || '',
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
        <>
            <div className="product-add-page-wrapper smart-form">
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(false); }}>
                    <header className="product-add-header">
                        <h1>{pageTitle}</h1>
                        <div className="header-actions">
                            <button type="button" onClick={() => handleSubmit(true)} disabled={isSubmitting} className="draft-save-button"><FileText size={18} /> 임시저장</button>
                            <button type="submit" disabled={isSubmitting} className="save-button">
                                <Save size={18} />
                                {isSubmitting ? '저장 중...' : (mode === 'newProduct' ? '신규 상품 등록하기' : '새 회차 추가하기')}
                            </button>
                        </div>
                    </header>
                    <main className="main-content-grid-3-col-final">
                        <div className="form-section">
                            {/* --- 대표 상품 정보 섹션 (변경 없음) --- */}
                            <div className="form-section-title"><div className="title-text-group"><Package size={20} className="icon-color-product"/><h3>대표 상품 정보</h3></div><div className="product-type-toggle-inline"><button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}>단일</button><button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}>그룹</button></div></div>
                            <p className="section-subtitle">상품의 기본 정보와 첫 판매 회차 이름을 설정합니다.</p>

                            <div className="form-group with-validation">
                                <label>대표 상품명 *</label>
                                <div className="input-wrapper">
                                    <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="예: 무농약 블루베리" required disabled={mode === 'newRound'} />
                                    {isCheckingDuplicates && (
                                        <div className="input-spinner-wrapper">
                                            <Loader2 className="spinner-icon" />
                                        </div>
                                    )}
                                </div>
                                {similarProducts.length > 0 && (
                                    <div className="similar-products-warning">
                                        <AlertTriangle size={16} />
                                        <span>유사한 이름의 상품이 이미 존재합니다.</span>
                                        <ul>
                                            {similarProducts.map(p => (
                                                <li key={p.id}>
                                                    <Link to={`/admin/products/edit/${p.id}/${p.salesHistory[0]?.roundId}`} target="_blank">{p.groupName}</Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="form-group"><label>회차명 *</label><input type="text" value={roundName} onChange={e=>setRoundName(e.target.value)} placeholder="예: 1차 판매" required/></div>
                            <div className="form-group"><label>상세 설명</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="상품의 특징, 스토리 등을 작성해주세요."/></div>
                            {mode === 'newProduct' && <div className="form-group"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)}><option value="">대분류 선택</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="settings-option-group">{storageTypeOptions.map(opt=><button key={opt.key} type="button" className={`settings-option-btn ${opt.className} ${selectedStorageType===opt.key?'active':''}`} onClick={()=>setSelectedStorageType(opt.key)}>{opt.name}</button>)}</div></div>}

                            <div className="form-group">
                                <label>대표 이미지 *</label>
                                <DragDropContext onDragEnd={onDragEnd}>
                                    <Droppable droppableId="image-previews" direction="horizontal">
                                        {(provided) => (
                                            <div className="compact-image-uploader" {...provided.droppableProps} ref={provided.innerRef}>
                                                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/png, image/jpeg" style={{display:'none'}}/>
                                                {imagePreviews.map((p, i) => (
                                                    <Draggable key={p+i} draggableId={p+i.toString()} index={i}>
                                                        {(provided, snapshot) => (
                                                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`thumbnail-preview ${snapshot.isDragging ? 'dragging' : ''}`} style={{...provided.draggableProps.style}}>
                                                                <img src={p} alt={`미리보기 ${i+1}`}/>
                                                                <button type="button" onClick={() => removeImage(i)} className="remove-thumbnail-btn"><X size={10}/></button>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                                {imagePreviews.length < 10 && (<button type="button" onClick={()=>fileInputRef.current?.click()} className="add-thumbnail-btn"><PlusCircle size={20}/></button>)}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                            </div>
                        </div>
                        <div className="form-section">
                            {/* --- 판매 옵션 설정 섹션 (변경 없음) --- */}
                            <div className="form-section-title">
                                <div className="title-text-group">
                                    <Box size={20} className="icon-color-option"/>
                                    <h3>판매 옵션 설정 *</h3>
                                </div>
                            </div>
                            <p className="section-subtitle">실제 판매될 상품의 옵션과 가격, 재고 등을 설정합니다.</p>
                            {variantGroups.map(vg => (
                                <div className="variant-group-card" key={vg.id}>
                                    <div className="variant-group-header"><div className="form-group full-width"><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder={productType === 'group' ? "예: 얼큰소고기맛" : "상품명과 동일하게"} required /></div><div className="form-group"><label>그룹 총 재고</label><div className="stock-input-wrapper"><input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="비우면 무제한"/><span className="stock-unit-addon">{vg.stockUnitType || '개'}</span></div></div><div className="form-group"><label>유통기한</label>
                                        <input 
                                            type="text" 
                                            value={vg.expirationDateInput} 
                                            onChange={e => handleVariantGroupChange(vg.id, 'expirationDateInput', e.target.value)} 
                                            onBlur={e => handleGroupDateBlur(vg.id, e.target.value)} 
                                            placeholder="YYMMDD" 
                                            maxLength={8}
                                        />
                                    </div>{productType === 'group' && variantGroups.length > 1 && <button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-variant-group-btn"><Trash2 size={14}/></button>}</div>
                                    {vg.items.map(item => (
                                        <div className="option-item-section" key={item.id}>
                                            <div className="option-item-grid-2x2"><div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} placeholder="예: 1개" required/></div><div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="text" value={formatNumberWithCommas(item.price)} onChange={e=>handlePriceChange(vg.id, item.id, e.target.value)} placeholder="0" required/><span>원</span></div></div><div className="form-group-grid item-limit"><label className="tooltip-container"><span>구매 제한</span><Tippy content="한 고객이 이 옵션을 구매할 수 있는 최대 수량입니다."><Info size={14} style={{ marginLeft: '4px', cursor: 'help' }} /></Tippy></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음"/></div><div className="form-group-grid item-deduction"><label className="tooltip-container"><span>차감 단위 *</span><Tippy content="이 옵션 1개 판매 시, '그룹 총 재고'에서 차감될 수량입니다. (예: 1박스(12개입)은 12)"><Info size={14} style={{ marginLeft: '4px', cursor: 'help' }} /></Tippy></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} placeholder={item.isBundleOption ? "예: 12" : "1"} required/></div></div>
                                            {vg.items.length > 1 && <button type="button" onClick={()=>removeItem(vg.id,item.id)} className="remove-item-btn"><Trash2 size={14}/></button>}
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
                            <p className="section-subtitle">상품의 판매 시점 및 참여 조건을 설정합니다.</p>
                            
                            <div className="form-group">
                                <label>참여 조건 설정</label>
                                <div className="settings-option-group">
                                    <button
                                        type="button"
                                        className={`settings-option-btn ${!isParticipationRestricted ? 'active' : ''}`}
                                        onClick={() => setIsParticipationRestricted(false)}
                                    >
                                        <Users size={16} /> 모두 참여 가능
                                    </button>
                                    <button
                                        type="button"
                                        className={`settings-option-btn ${isParticipationRestricted ? 'active' : ''}`}
                                        onClick={() => setIsParticipationRestricted(true)}
                                    >
                                        <ShieldCheck size={16} /> 특정 등급만 참여
                                    </button>
                                </div>
                            </div>

                            {isParticipationRestricted && (
                                <div className="preorder-options active" style={{marginTop: '16px'}}>
                                    <div className="tier-checkbox-group">
                                        {ALL_LOYALTY_TIERS.map(tier => (
                                            <label key={tier} htmlFor={`tier-${tier}`}>
                                                <input
                                                    type="checkbox"
                                                    id={`tier-${tier}`}
                                                    value={tier}
                                                    checked={allowedTiers.includes(tier)}
                                                    onChange={() => handleTierChange(tier)}
                                                />
                                                {tier}
                                            </label>
                                        ))}
                                    </div>
                                    <p className="input-description" style={{marginTop: '12px'}}>
                                        선택된 등급의 회원에게만 이 상품이 노출되고 예약이 가능합니다.
                                    </p>
                                </div>
                            )}

                            <div className="form-group" style={{marginTop: '24px'}}>
                                <label className="preorder-toggle-label" style={{padding: 0, background: 'none'}}>
                                    <span>선입금 필수</span>
                                    <div className={`toggle-switch ${isPrepaymentRequired ? 'active' : ''}`} onClick={() => setIsPrepaymentRequired(!isPrepaymentRequired)}>
                                        <div className="toggle-handle"></div>
                                    </div>
                                </label>
                            </div>
                            
                            <div className="form-group">
                                <label>발행일 (오후 2시 공개)</label>
                                <input 
                                    type="date" 
                                    value={formatDateToYYYYMMDD(publishDate)} 
                                    onChange={e => {
                                        const newDate = new Date(e.target.value + 'T00:00:00');
                                        newDate.setHours(14, 0, 0, 0);
                                        setPublishDate(newDate);
                                    }} 
                                    required
                                />
                            </div>
                            
                            <div className="form-group">
                                <label>공동구매 마감일 (1차) *</label>
                                <input 
                                    type="datetime-local" 
                                    value={formatToDateTimeLocal(deadlineDate)} 
                                    onChange={e => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)} 
                                    required
                                />
                                <p className="input-description">
                                    발행일에 따라 자동 계산되며, 공휴일 등 필요시 수동 변경 가능합니다.
                                </p>
                            </div>

                            <div className="form-group">
                                <label>픽업 시작일 *</label>
                                <input 
                                    type="date" 
                                    value={pickupDate ? formatDateToYYYYMMDD(pickupDate) : ''} 
                                    onChange={e => setPickupDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} 
                                    required
                                />
                                <p className="input-description">
                                    최종 마감일은 픽업 시작일 오후 1시로 자동 설정됩니다.
                                </p>
                            </div>
                            
                            <div className="settings-summary-card">
                                <h4 className="summary-title"><Info size={16} /> 설정 요약</h4>
                                <ul>
                                    <li><strong>발행:</strong> {settingsSummary.publishText}</li>
                                    <li><strong>1차 마감:</strong> {settingsSummary.deadlineText}</li>
                                    <li><strong>픽업 시작:</strong> {settingsSummary.pickupText}</li>
                                    <li><strong>최종 마감:</strong> {settingsSummary.pickupDeadlineText}</li>
                                    <li><strong>참여 조건:</strong> {isParticipationRestricted ? `${allowedTiers.join(', ')} 등급만` : '모든 등급'}</li>
                                </ul>
                            </div>
                        </div>
                    </main>
                </form>
                {isSubmitting && <SodomallLoader message="상품 정보를 저장하고 있습니다..." />}
            </div>
        </>
    );
};

export default ProductAddAdminPage;