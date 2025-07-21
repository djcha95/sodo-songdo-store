// src/pages/admin/ProductAddAdminPage.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { addProductWithFirstRound, addNewSalesRound, getCategories, searchProductsByName } from '../../firebase';
import type { Category, StorageType, SalesRound, Product, VariantGroup, ProductItem, SalesRoundStatus } from '../../types';
import { LoyaltyTier } from '@/types';
import toast from 'react-hot-toast';
import { Save, PlusCircle, X, Package, Box, SlidersHorizontal, Trash2, Info, FileText, AlertTriangle, Loader2, Clock, Lock } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';
import SodamallLoader from '@/components/common/SodamallLoader';
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

const getSmartDeadline = (): Date => {
    const now = new Date();
    const deadline = new Date(now);
    deadline.setHours(13, 0, 0, 0);
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 6) { deadline.setDate(now.getDate() + 2); }
    else { deadline.setDate(now.getDate() + 1); }
    return deadline;
};

// 파일 업로드 최대 크기 설정 (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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
    const handleTierChange = (tier: LoyaltyTier) => {
        setTiers(prevTiers =>
            prevTiers.includes(tier) ? prevTiers.filter(t => t !== tier) : [...prevTiers, tier]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="admin-modal-header">
                    <h4><Clock size={20}/> 선주문 설정</h4>
                    <button onClick={onClose} className="admin-modal-close-button"><X size={20}/></button>
                </div>
                <div className="admin-modal-body">
                    <div className="form-group">
                        <label className="preorder-toggle-label">
                            <span>선주문 기능 사용</span>
                            <div className={`toggle-switch ${isEnabled ? 'active' : ''}`} onClick={() => setIsEnabled(!isEnabled)}>
                                <div className="toggle-handle"></div>
                            </div>
                        </label>
                    </div>
                    {isEnabled && (
                        <div className="preorder-options active">
                            <p className="preorder-info">
                                <Info size={14} />
상품 업로드 직후부터 발행일 오후 2시까지 선주문이 가능합니다                            </p>
                            <div className="tier-checkbox-group">
                                {(['공구의 신', '공구왕'] as LoyaltyTier[]).map(tier => (
                                    <label key={tier} htmlFor={`modal-tier-${tier}`}>
                                        <input
                                            type="checkbox"
                                            id={`modal-tier-${tier}`}
                                            value={tier}
                                            checked={tiers.includes(tier)}
                                            onChange={() => handleTierChange(tier)}
                                        />
                                        {tier}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="admin-modal-footer">
                    <button className="modal-button primary" onClick={onClose}>확인</button>
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
    const [scheduledAt, setScheduledAt] = useState<Date>(() => new Date(new Date().setHours(14, 0, 0, 0)));
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(() => getSmartDeadline());
    const [pickupDay, setPickupDay] = useState<Date | null>(null);
    const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);
    const [isPrepaymentRequired, setIsPrepaymentRequired] = useState(false);

    const [isPreOrderModalOpen, setIsPreOrderModalOpen] = useState(false);
    const [isPreOrderEnabled, setIsPreOrderEnabled] = useState(true);
    const [preOrderTiers, setPreOrderTiers] = useState<LoyaltyTier[]>(['공구의 신', '공구왕']);

    // ✨ [신규] 시크릿 상품 관련 상태
    const [isSecretProductModalOpen, setIsSecretProductModalOpen] = useState(false);
    const [isSecretProductEnabled, setIsSecretProductEnabled] = useState(false);
    const [secretTiers, setSecretTiers] = useState<LoyaltyTier[]>([]);

    const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

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
                setIsPreOrderEnabled(lastRound.preOrderTiers && lastRound.preOrderTiers.length > 0);
                setPreOrderTiers(lastRound.preOrderTiers || []);
                // ✨ [수정] 기존 회차의 시크릿 정보 불러오기 (새 회차 추가 시에도 유지)
                setIsSecretProductEnabled(!!lastRound.secretForTiers && lastRound.secretForTiers.length > 0);
                setSecretTiers(lastRound.secretForTiers || []);
            }
        }
    }, [location.state]);

    useEffect(() => { if (mode === 'newProduct' && variantGroups.length === 0) { setVariantGroups([{ id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', expirationDate: null, expirationDateInput: '', items: [{ id: generateUniqueId(), name: '', price: '', limitQuantity: '', deductionAmount: 1, isBundleOption: false }] }]); } }, [mode, variantGroups.length]);
    useEffect(() => { (async () => { try { setCategories(await getCategories()); } catch (err) { toast.error("카테고리 정보를 불러오는 데 실패했습니다."); } })(); }, []);

    useEffect(() => { if (mode === 'newProduct' && productType === 'single') { setVariantGroups(prev => prev.length > 0 ? [{ ...prev[0], groupName: groupName }] : prev); } }, [groupName, productType, mode]);

    useEffect(() => {
        if (!pickupDay) { setPickupDeadlineDate(null); return; }
        const newPickupDeadline = new Date(pickupDay);
        // [수정] 자정으로 설정 (date만 사용하므로 시간 정보는 0으로)
        newPickupDeadline.setHours(0, 0, 0, 0); 
        if (selectedStorageType === 'ROOM' || selectedStorageType === 'FROZEN') { newPickupDeadline.setDate(newPickupDeadline.getDate() + 1); }
        setPickupDeadlineDate(newPickupDeadline);
    }, [pickupDay, selectedStorageType]);


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
    const handleVariantGroupChange = useCallback((id: string, field: keyof Omit<VariantGroupUI, 'items'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === id ? { ...vg, [field]: value } : vg)); }, []);
    const handleGroupDateBlur = useCallback((id: string, dateStr: string) => { const parsedDate = parseDateString(dateStr); if (dateStr && !parsedDate) { toast.error('유효하지 않은 날짜 형식입니다. (예: 250715 또는 20250715)'); return; } handleVariantGroupChange(id, 'expirationDate', parsedDate); handleVariantGroupChange(id, 'expirationDateInput', parsedDate ? formatDateToYYYYMMDD(parsedDate) : '');}, [handleVariantGroupChange]);
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
    const settingsSummary = useMemo(() => { const publishText = `예약 발행 (${formatToDateTimeLocal(scheduledAt).replace('T', ' ')})`; const deadlineText = deadlineDate ? `${formatToDateTimeLocal(deadlineDate).replace('T', ' ')} 까지` : '미설정'; const pickupText = pickupDay ? `${formatDateToYYYYMMDD(pickupDay)} 부터` : '미설정'; return { publishText, deadlineText, pickupText }; }, [scheduledAt, deadlineDate, pickupDay]);

    const getSalesRoundData = (status: SalesRoundStatus): Omit<SalesRound, 'roundId' | 'createdAt'> => {
        const publishDate = new Date(scheduledAt);
        publishDate.setHours(14, 0, 0, 0);

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
            publishAt: Timestamp.fromDate(publishDate),
            deadlineDate: Timestamp.fromDate(deadlineDate!),
            pickupDate: Timestamp.fromDate(pickupDay!),
            pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
            isPrepaymentRequired: isPrepaymentRequired,
            waitlist: [],
            waitlistCount: 0,
            preOrderTiers: isPreOrderEnabled ? preOrderTiers : [],
            preOrderEndDate: isPreOrderEnabled ? Timestamp.fromDate(publishDate) : undefined, 
            secretForTiers: isSecretProductEnabled ? secretTiers : [], // ✨ [수정] 시크릿 상품 정보 저장
        };
    };

    const handleSubmit = async (isDraft: boolean = false) => {
        if (!isDraft) {
            if (mode === 'newProduct' && imageFiles.length === 0) { toast.error("대표 이미지를 1개 이상 등록해주세요."); return; }
            if (!deadlineDate || !pickupDay || !pickupDeadlineDate) { toast.error('공구 마감일, 픽업 시작일, 픽업 마감일을 모두 설정해주세요.'); return; }
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
                            {mode === 'newProduct' && <div className="form-group"><label>카테고리/보관타입</label><div className="category-select-wrapper"><select value={selectedMainCategory} onChange={e=>setSelectedMainCategory(e.target.value)}><option value="">대분류 선택</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="settings-option-group">{/* CSS 변경으로 인한 클래스 변경 */}{storageTypeOptions.map(opt=><button key={opt.key} type="button" className={`settings-option-btn ${opt.className} ${selectedStorageType===opt.key?'active':''}`} onClick={()=>setSelectedStorageType(opt.key)}>{opt.name}</button>)}</div></div>}

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
                            <div className="form-section-title">
                                <div className="title-text-group">
                                    <Box size={20} className="icon-color-option"/>
                                    <h3>판매 옵션 설정 *</h3>
                                </div>
                            </div>
                            <p className="section-subtitle">실제 판매될 상품의 옵션과 가격, 재고 등을 설정합니다.</p>
                            {variantGroups.map(vg => (
                                <div className="variant-group-card" key={vg.id}>
                                    <div className="variant-group-header"><div className="form-group full-width"><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder={productType === 'group' ? "예: 얼큰소고기맛" : "상품명과 동일하게"} required /></div><div className="form-group"><label>그룹 총 재고</label><div className="stock-input-wrapper"><input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="비우면 무제한"/><span className="stock-unit-addon">{vg.stockUnitType || '개'}</span></div></div><div className="form-group"><label>유통기한</label><input type="text" value={vg.expirationDateInput} onChange={e=>handleGroupDateBlur(vg.id, e.target.value)} onBlur={e => handleGroupDateBlur(vg.id, e.target.value)} placeholder="YYMMDD" maxLength={8}/></div>{productType === 'group' && variantGroups.length > 1 && <button type="button" onClick={()=>removeVariantGroup(vg.id)} className="remove-variant-group-btn"><Trash2 size={14}/></button>}</div>
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
                            <p className="section-subtitle">상품의 판매 시점 및 기간을 설정합니다.</p>
                            
                            <div className="form-group">
                                <label>예약 옵션</label>
                                <div className="settings-option-group"> {/* reservation-options-group -> settings-option-group */}
                                    <Tippy content="선입금 필수 상품으로 설정합니다.">
                                        <button type="button" className={`settings-option-btn ${isPrepaymentRequired ? 'active' : ''}`} onClick={() => setIsPrepaymentRequired(!isPrepaymentRequired)}>
                                            <Save size={16} /> 선입금
                                        </button>
                                    </Tippy>
                                    <Tippy content="선주문 설정을 엽니다.">
                                        <button type="button" className={`settings-option-btn ${isPreOrderEnabled ? 'active' : ''}`} onClick={() => setIsPreOrderModalOpen(true)}>
                                            <Clock size={16} /> 선주문
                                        </button>
                                    </Tippy>
                                    {/* ✨ [수정] 시크릿 상품 설정 버튼 클래스 변경 */}
                                    <Tippy content="시크릿 상품 설정을 엽니다.">
                                        <button type="button" className={`settings-option-btn ${isSecretProductEnabled ? 'active' : ''}`} onClick={() => setIsSecretProductModalOpen(true)}>
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
                {isSubmitting && <SodamallLoader message="상품 정보를 저장하고 있습니다..." />}
            </div>
        </>
    );
};

export default ProductAddAdminPage;