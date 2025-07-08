// src/pages/admin/SalesRoundEditPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getProductById, updateSalesRound } from '../../firebase';
import type { SalesRound, VariantGroup as VariantGroupType, ProductItem as ProductItemType, SalesRoundStatus } from '../../types';
import toast from 'react-hot-toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Save, Loader, HelpCircle, Box, Trash2, PlusCircle, X } from 'lucide-react';
import './ProductAddAdminPage.css'; // 상품 추가/수정 페이지는 스타일 공유

// --- UI 상태 관리용 타입 정의 ---
interface ProductItemUI { id: string; name: string; price: number | ''; stock: number | ''; limitQuantity: number | ''; expirationDate: Date | null; expirationDateInput: string; deductionAmount: number | ''; isBundleOption?: boolean; }
interface VariantGroupUI { id: string; groupName: string; totalPhysicalStock: number | ''; stockUnitType: string; items: ProductItemUI[]; }

// --- 헬퍼 함수 및 상수 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);
const formatToDateTimeLocal = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const formatDateToYYYYMMDD = (date: Date | null): string => { if (!date) return ''; const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseDateString = (dateString: string): Date | null => { if (!dateString) return null; const cleaned = dateString.replace(/[^0-9]/g, ''); if (cleaned.length === 6 || cleaned.length === 8) { const year = cleaned.length === 6 ? parseInt(cleaned.substring(0, 2), 10) + 2000 : parseInt(cleaned.substring(0, 4), 10); const month = parseInt(cleaned.substring(cleaned.length === 6 ? 2 : 4, cleaned.length === 6 ? 4 : 6), 10) - 1; const day = parseInt(cleaned.substring(cleaned.length === 6 ? 4 : 6, cleaned.length === 6 ? 6 : 8), 10); const date = new Date(year, month, day); if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date; } return null; };
const Tooltip = ({ text }: { text: string }) => (<div className="tooltip-wrapper"><HelpCircle size={14} /><div className="tooltip-content">{text}</div></div>);

const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개'];

// --- 메인 컴포넌트 ---
const SalesRoundEditPage: React.FC = () => {
    const { productId, roundId } = useParams<{ productId: string; roundId: string }>();
    const navigate = useNavigate();

    // 상태 선언
    const [productName, setProductName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [roundName, setRoundName] = useState('');
    const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);
    const [status, setStatus] = useState<SalesRoundStatus>('draft');
    const [publishAt, setPublishAt] = useState<Date | null>(null);
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
    const [pickupDay, setPickupDay] = useState<Date | null>(null);

    // 데이터 로딩 및 폼 채우기
    useEffect(() => {
        if (!productId || !roundId) { toast.error("주소 정보가 올바르지 않습니다."); navigate('/admin/products'); return; }
        
        const fetchData = async () => {
            try {
                const product = await getProductById(productId);
                if (product) {
                    const roundToEdit = product.salesHistory.find(r => r.roundId === roundId);
                    if (roundToEdit) {
                        setProductName(product.groupName);
                        setRoundName(roundToEdit.roundName);
                        setStatus(roundToEdit.status);
                        setPublishAt(roundToEdit.publishAt.toDate());
                        setDeadlineDate(roundToEdit.deadlineDate.toDate());
                        setPickupDay(roundToEdit.pickupDate.toDate());

                        const mappedVGs: VariantGroupUI[] = roundToEdit.variantGroups.map((vg: VariantGroupType) => ({
                            id: vg.id || generateUniqueId(),
                            groupName: vg.groupName, totalPhysicalStock: vg.totalPhysicalStock ?? '', stockUnitType: vg.stockUnitType,
                            items: (vg.items || []).map((item: ProductItemType) => ({
                                id: item.id || generateUniqueId(), name: item.name, price: item.price, stock: item.stock === -1 ? '' : item.stock,
                                limitQuantity: item.limitQuantity ?? '',
                                expirationDate: item.expirationDate?.toDate() || null,
                                expirationDateInput: item.expirationDate ? formatDateToYYYYMMDD(item.expirationDate.toDate()) : '',
                                deductionAmount: item.stockDeductionAmount, isBundleOption: bundleUnitKeywords.some(k => item.name.includes(k))
                            }))
                        }));
                        setVariantGroups(mappedVGs);
                    } else { toast.error("수정할 판매 회차를 찾을 수 없습니다."); navigate(`/admin/products/history/${productId}`); }
                } else { toast.error("상품을 찾을 수 없습니다."); navigate('/admin/products'); }
            } catch (err) { toast.error("정보를 불러오는 중 오류가 발생했습니다."); console.error(err);
            } finally { setIsLoading(false); }
        };
        fetchData();
    }, [productId, roundId, navigate]);

    // 핸들러 함수들
    const handleVariantGroupChange = useCallback((id: string, field: keyof VariantGroupUI, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === id ? { ...vg, [field]: value } : vg)); }, []);
    const removeVariantGroup = useCallback((id: string) => { if (variantGroups.length > 1) setVariantGroups(prev => prev.filter(vg => vg.id !== id)); else toast.error("최소 1개의 하위 그룹이 필요합니다."); }, [variantGroups.length]);
    const handleItemChange = useCallback((vgId: string, itemId: string, field: keyof Omit<ProductItemUI, 'isBundleOption'|'expirationDate'|'expirationDateInput'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { const updatedItem = { ...item, [field]: value }; if (field === 'name') { const isBundle = bundleUnitKeywords.some(k => String(value).includes(k)) || !singleUnitKeywords.some(k => String(value).includes(k)); updatedItem.isBundleOption = isBundle; updatedItem.deductionAmount = isBundle ? item.deductionAmount : 1;} return updatedItem; } return item; }) } : vg)); }, []);
    const handleExpirationDateChange = useCallback((vgId: string, itemId: string, dateStr: string) => { const parsedDate = parseDateString(dateStr); setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDateInput: dateStr, expirationDate: parsedDate } : item) } : vg));}, []);
    const addNewItem = useCallback((vgId: string, isBundle: boolean) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: isBundle ? '' : 1, isBundleOption: isBundle }] } : vg)); }, []);
    const removeItem = useCallback((vgId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === vgId ? (vg.items.length > 1 ? { ...vg, items: vg.items.filter(item => item.id !== itemId) } : vg) : vg)); }, []);
    
    // 수정 제출 핸들러
    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!productId || !roundId) return;
        if (!deadlineDate || !pickupDay || !publishAt) { toast.error("모든 날짜 필드를 설정해주세요."); return; }

        setIsSaving(true);
        const updatedRoundData: Partial<Omit<SalesRound, 'roundId'|'createdAt'>> = {
            roundName: roundName.trim(), status,
            publishAt: Timestamp.fromDate(publishAt), deadlineDate: Timestamp.fromDate(deadlineDate), pickupDate: Timestamp.fromDate(pickupDay),
            pickupDeadlineDate: Timestamp.fromDate(new Date(pickupDay.getTime() + (24 * 60 * 60 * 1000 - 1))),
            variantGroups: variantGroups.map(vg => ({
                id: vg.id, groupName: vg.groupName, totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock), stockUnitType: vg.stockUnitType,
                items: vg.items.map(item => ({
                    id: item.id, name: item.name, price: Number(item.price) || 0, stock: item.stock === '' ? -1 : Number(item.stock),
                    limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                    expirationDate: item.expirationDate ? Timestamp.fromDate(item.expirationDate) : null,
                    stockDeductionAmount: Number(item.deductionAmount) || 1,
                })),
            })),
        };

        try {
            await updateSalesRound(productId, roundId, updatedRoundData);
            toast.success("판매 회차 정보가 수정되었습니다.");
            navigate(`/admin/products/history/${productId}`);
        } catch (error) { toast.error("수정 중 오류가 발생했습니다."); console.error(error);
        } finally { setIsSaving(false); }
    };

    if (isLoading) return <LoadingSpinner />;
    
    return (
        <div className="product-add-page-wrapper smart-form">
            <form onSubmit={handleUpdate}>
                <header className="product-add-header">
                    <div><h1>{productName}</h1><p className="admin-page-subtitle">{roundName} (회차 수정)</p></div>
                    <button type="submit" disabled={isSaving} className="save-button">{isSaving ? <Loader size={18} className="spin"/> : <Save size={18} />}{isSaving ? '저장 중...' : '수정 내용 저장'}</button>
                </header>
                <main className="main-content-grid-1-col">
                    <div className="form-column">
                        <div className="form-section"><h3 className="form-section-title">회차 정보</h3><div className="form-group"><label>회차명 *</label><input type="text" value={roundName} onChange={e => setRoundName(e.target.value)} required /></div><div className="form-group"><label>판매 상태 *</label><select value={status} onChange={e => setStatus(e.target.value as SalesRoundStatus)} className="control-select" style={{width: '100%'}}><option value="selling">판매중</option><option value="scheduled">예정</option><option value="ended">종료</option><option value="sold_out">품절</option><option value="draft">임시저장</option></select></div></div>
                        <div className="form-section"><h3 className="form-section-title"><Box size={18}/> 판매 옵션 설정 *</h3>
                            {variantGroups.map(vg => (<div className="item-card-new" key={vg.id} style={{position: 'relative', border: '1px solid #d0d7de', marginBottom: '16px'}}><div className="form-group compact" style={{borderBottom:'1px solid #e9ecef', paddingBottom:16, marginBottom:16}}><label>하위 상품 그룹명 *</label><input type="text" value={vg.groupName} onChange={e=>handleVariantGroupChange(vg.id, 'groupName', e.target.value)} required/></div>
                            {vg.items.map(item => (<div className="item-card-new" key={item.id} style={{border:'1px solid #f1f3f5', padding:16, marginBottom:12, position:'relative'}}><div className="item-grid-2rows"><div className="form-group-grid item-name"><label>선택지 *</label><input type="text" value={item.name} onChange={e=>handleItemChange(vg.id, item.id, 'name', e.target.value)} required/></div><div className="form-group-grid item-price"><label>가격 *</label><div className="price-input-wrapper"><input type="number" value={item.price} onChange={e=>handleItemChange(vg.id, item.id, 'price', e.target.value)} required/><span>원</span></div></div><div className="form-group-grid item-expiry"><label>유통기한</label><input type="text" value={item.expirationDateInput} onChange={e=>handleExpirationDateChange(vg.id, item.id, e.target.value)} maxLength={8}/></div><div className="form-group-grid item-stock"><label><span>재고</span> <Tooltip text="품목별 재고. 비워두면 무제한." /></label><input type="number" value={item.stock} onChange={e=>handleItemChange(vg.id, item.id, 'stock', e.target.value)}/></div><div className="form-group-grid item-deduction-amount"><label><span>단위당 기준 재고 *</span> <Tooltip text="1개 판매 시 총 재고에서 차감될 수량." /></label><input type="number" value={item.deductionAmount} onChange={e=>handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} required/></div><div className="form-group-grid item-limit"><label><span>1인 구매 제한</span> <Tooltip text="고객 1명당 구매 최대 수량." /></label><input type="number" value={item.limitQuantity} onChange={e=>handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)}/></div></div>{vg.items.length > 1 && <button type="button" onClick={()=>removeItem(vg.id,item.id)} className="remove-item-btn-new"><Trash2 size={14}/></button>}</div>))}
                            <div style={{display:'flex',gap:10,marginTop:12}}><button type="button" onClick={()=>addNewItem(vg.id, false)} className="add-item-btn-new" style={{flex:1, borderStyle:'dashed'}}><PlusCircle size={16}/>낱개 옵션 +</button><button type="button" onClick={()=>addNewItem(vg.id, true)} className="add-item-btn-new" style={{flex:1, borderStyle:'dashed'}}><PlusCircle size={16}/>묶음 옵션 +</button></div>
                            {variantGroups.length > 1 && <button type="button" onClick={() => removeVariantGroup(vg.id)} className="remove-item-btn-new" style={{top: '16px', right: '16px'}}><X size={16}/></button>}
                            </div>))}
                        </div>
                        <div className="form-section">
                            <h3 className="form-section-title">기간 설정</h3>
                            <div className="form-group"><label>발행일 (시작일)</label><input type="datetime-local" value={formatToDateTimeLocal(publishAt)} onChange={e => setPublishAt(e.target.value ? new Date(e.target.value) : null)} required/></div>
                            <div className="form-group"><label>공구 마감일</label><input type="datetime-local" value={formatToDateTimeLocal(deadlineDate)} onChange={e => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)} required/></div>
                            <div className="form-group"><label>픽업 시작일</label><input type="date" value={pickupDay ? formatDateToYYYYMMDD(pickupDay) : ''} onChange={e => setPickupDay(e.target.value ? new Date(e.target.value) : null)} required/></div>
                        </div>
                    </div>
                </main>
            </form>
        </div>
    );
};

export default SalesRoundEditPage;