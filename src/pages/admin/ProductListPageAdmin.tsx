// src/pages/admin/ProductListPageAdmin.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useNavigate } from 'react-router-dom';
import { getCategories, updateMultipleVariantGroupStocks, updateMultipleSalesRoundStatuses, getWaitlistForRound, getReservedQuantitiesMap, deleteSalesRounds } from '../../firebase';
import { db } from '@/firebase/firebaseConfig';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Product, SalesRound, Category, SalesRoundStatus, Order, OrderItem, VariantGroup, StorageType } from '../../types';
import toast from 'react-hot-toast';
import { Plus, Edit, Filter, Search, ChevronDown, BarChart2, Trash2, PackageOpen, ChevronsLeft, ChevronsRight, AlertTriangle } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import './ProductListPageAdmin.css';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);

// ✅ [추가] Firebase Cloud Functions 관련 import
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { formatKRW } from '@/utils/number';
import { reportError, reportInfo } from '@/utils/logger';

// =================================================================
// 📌 타입 정의 및 헬퍼 함수
// =================================================================

interface DynamicStatus {
  text: string;
  className: string;
}

interface WaitlistInfo {
  userId: string;
  userName: string;
  quantity: number;
  timestamp: Timestamp;
}

// ✅ [추가] Cloud Function의 반환 타입을 위한 인터페이스
interface WaitlistProcessResult {
    convertedCount: number;
    failedCount: number;
}


const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) { if (isNaN(date.getTime())) return null; return date; }
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && date.seconds !== undefined) { return new Timestamp(date.seconds, date.nanoseconds || 0).toDate(); }
    if (typeof date === 'string') { const parsedDate = new Date(date); if (!isNaN(parsedDate.getTime())) return parsedDate; }
    if (typeof date === 'number' && isFinite(date)) { return new Date(date); }
    return null;
};

const getDeadlines = (round: SalesRound): { primaryEnd: dayjs.Dayjs | null, secondaryEnd: dayjs.Dayjs | null } => {
  const publishAt = safeToDate(round.publishAt);
  const pickupDate = safeToDate(round.pickupDate);
  const primaryEnd = publishAt 
    ? dayjs(publishAt).add(1, 'day').hour(13).minute(0).second(0)
    : round.deadlineDate ? dayjs(safeToDate(round.deadlineDate)) : null;
  const secondaryEnd = pickupDate 
    ? dayjs(pickupDate).hour(13).minute(0).second(0)
    : null;
  return { primaryEnd, secondaryEnd };
};

const getDynamicStatus = (round: SalesRound, remainingStock: number): DynamicStatus => {
  const isUnlimited = remainingStock === Infinity;
  if (!isUnlimited && remainingStock <= 0) {
    return { text: "매진", className: "sold-out" };
  }

  const now = dayjs();
  const { primaryEnd, secondaryEnd } = getDeadlines(round);
  const publishAtDate = safeToDate(round.publishAt);
  const pickupDate = safeToDate(round.pickupDate);
  const pickupDeadlineDate = safeToDate(round.pickupDeadlineDate);

  if (publishAtDate && now.isBefore(publishAtDate)) {
    return { text: "판매예정", className: "scheduled" };
  }
  if (primaryEnd && now.isBefore(primaryEnd)) {
    return { text: "공구예약중", className: "selling" };
  }
  if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, '[]')) {
    return { text: "추가예약중", className: "late-reservation" };
  }
  if(pickupDate && pickupDeadlineDate && now.isBetween(pickupDate, pickupDeadlineDate, null, '[]')) {
    return { text: "픽업중/현장판매", className: "pickup" };
  }
  if ((secondaryEnd && now.isAfter(secondaryEnd)) || (pickupDeadlineDate && now.isAfter(pickupDeadlineDate))) {
    return { text: "판매종료", className: "ended" };
  }

  switch (round.status) {
    case 'selling':
      return { text: "공구예약중", className: "selling" };
    case 'scheduled':
      return { text: "판매예정", className: "scheduled" };
    case 'ended':
      return { text: "판매종료", className: "ended" };
    default:
      return { text: "판매종료", className: "ended" };
  }
};

const formatDate = (dateInput: any) => {
    const date = safeToDate(dateInput);
    if (!date || !isFinite(date.getTime())) return '–';
    return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\.$/, '');
};

const formatDateShort = (dateInput: any) => {
    const date = safeToDate(dateInput);
    if (!date || !isFinite(date.getTime())) return '–';
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
};

const formatTimestamp = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const getEarliestExpirationDateForGroup = (variantGroup: VariantGroup): number => {
    const dates = variantGroup.items.map(i => i.expirationDate ? safeToDate(i.expirationDate)?.getTime() : undefined).filter((d): d is number => d !== undefined && d !== null);
    return dates.length > 0 ? Math.min(...dates) : Infinity;
};

const translateStorageType = (storageType: StorageType): string => {
    const typeMap: Record<StorageType, string> = { ROOM: '실온', COLD: '냉장', FROZEN: '냉동' };
    return typeMap[storageType] || storageType;
};

interface EnrichedVariantGroup extends VariantGroup {
    reservedQuantity: number;
    configuredStock: number;
    pickedUpQuantity: number;
    remainingStock: number;
    dynamicStatus: DynamicStatus;
}

interface EnrichedRoundItem {
  productId: string; productName: string; productImage: string; category: string; storageType: StorageType;
  round: SalesRound; uniqueId: string; enrichedVariantGroups: EnrichedVariantGroup[];
  dynamicStatus: DynamicStatus;
}

type SortableKeys = 'roundCreatedAt' | 'pickupDate' | 'productName' | 'category' | 'expirationDate';

function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try { const storedValue = localStorage.getItem(key); return storedValue ? JSON.parse(storedValue) : defaultValue; } 
    catch (error) { reportInfo('usePersistentState.readFail', `key=${key}`, { error: String(error) }); return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } 
    catch (error) { reportInfo('usePersistentState.writeFail', `key=${key}`, { error: String(error) }); }
  }, [key, state]);
  return [state, setState];
}

const PaginationControls: React.FC<{ currentPage: number; totalPages: number; onPageChange: (page: number) => void; itemsPerPage: number; onItemsPerPageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; totalItems: number; }> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, totalItems }) => {
    if (totalItems === 0) return null;
    return (
        <div className="pagination-container">
            <div className="pagination-left">
                <div className="items-per-page-selector"><label htmlFor="itemsPerPage">표시 개수:</label><select id="itemsPerPage" value={itemsPerPage} onChange={onItemsPerPageChange}><option value={10}>10개</option><option value={20}>20개</option><option value={50}>50개</option><option value={100}>100개</option></select></div>
            </div>
            <div className="pagination-center"><button onClick={() => onPageChange(1)} disabled={currentPage === 1} title="첫 페이지"><ChevronsLeft size={16} /></button><button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>이전</button><span className="page-info">{currentPage} / {totalPages}</span><button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>다음</button><button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} title="마지막 페이지"><ChevronsRight size={16} /></button></div>
            <div className="pagination-right"><span className="total-items-display">총 {totalItems}개 회차</span></div>
        </div>
    );
};


interface ProductAdminRowProps { item: EnrichedRoundItem; index: number; isExpanded: boolean; isSelected: boolean; editingStockId: string | null; stockInputs: Record<string, string>; onToggleExpansion: (id: string) => void; onSelectionChange: (id: string, checked: boolean) => void; onStockEditStart: (id: string, stock: number) => void; onStockEditSave: (id: string, currentItem: EnrichedRoundItem) => void; onSetStockInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>; onOpenWaitlistModal: (productId: string, roundId: string, variantGroupId: string, productName: string, roundName: string) => void; }
const ProductAdminRow: React.FC<ProductAdminRowProps> = ({ item, index, isExpanded, isSelected, editingStockId, stockInputs, onToggleExpansion, onSelectionChange, onStockEditStart, onStockEditSave, onSetStockInputs, onOpenWaitlistModal }) => {
    const navigate = useNavigate();
    const handleAddNewRound = () => navigate('/admin/products/add', { state: { productId: item.productId, productGroupName: item.productName, lastRound: item.round } });
    if (!item.enrichedVariantGroups || item.enrichedVariantGroups.length === 0) {
        return (<tr className="master-row error-row"><td><input type="checkbox" checked={isSelected} onChange={(e) => onSelectionChange(item.uniqueId, e.target.checked)} /></td><td>{index + 1}</td><td colSpan={12} style={{color: 'var(--danger-color)'}}>데이터 오류: 이 회차에 옵션 그룹이 없습니다. (ID: {item.uniqueId})</td><td><div className="action-buttons-wrapper"><button onClick={() => navigate(`/admin/products/edit/${item.productId}/${item.round.roundId}`)} className="admin-action-button"><Edit size={16}/></button></div></td></tr>);
    }
    const isExpandable = item.enrichedVariantGroups.length > 1;

    // 단일 옵션 상품 렌더링
    if (!isExpandable) {
        const vg = item.enrichedVariantGroups[0];
        const status = vg.dynamicStatus;
        const vgUniqueId = `${item.productId}_${item.round.roundId}_${vg.id}`;
        return (
          <tr className="master-row">
            <td><input type="checkbox" checked={isSelected} onChange={(e) => onSelectionChange(item.uniqueId, e.target.checked)} /></td>
            <td>{index + 1}</td>
            <td>{formatDate(item.round.createdAt)}</td>
            <td>{formatDateShort(item.round.pickupDate)}</td>
            <td>{item.category}</td>
            <td><span className={`storage-badge storage-${item.storageType}`}>{translateStorageType(item.storageType)}</span></td>
            <td><div className="product-name-cell-v2"><img src={item.productImage} alt={item.productName} className="product-thumbnail" /><div className="product-name-text"><span className="product-group-name">{item.productName}</span><span className="round-name-text">{item.round.roundName}</span></div></div></td>
            <td><span className={`status-badge ${status.className}`} title={`Status: ${status.text}`}>{status.text}</span></td>
            <td style={{textAlign: 'right'}}>{vg.items[0]?.price != null ? `${formatKRW(vg.items[0].price)} 원` : '–'}</td>
            <td>{formatDate(getEarliestExpirationDateForGroup(vg))}</td>
            <td className="quantity-cell">{`${vg.reservedQuantity} / `}{(item.round.waitlistCount ?? 0) > 0 ? (<button className="waitlist-count-button" onClick={() => onOpenWaitlistModal(item.productId, item.round.roundId, vg.id, item.productName, item.round.roundName)}>{item.round.waitlistCount ?? 0}</button>) : (item.round.waitlistCount ?? 0)}</td>
            <td className="quantity-cell">{vg.pickedUpQuantity}</td>
            <td className="stock-cell">
              {editingStockId === vgUniqueId ? (
                <input type="number" className="stock-input" value={stockInputs[vgUniqueId] || ''} onChange={(e) => onSetStockInputs(prev => ({...prev, [vgUniqueId]: e.target.value}))} onBlur={() => onStockEditSave(vgUniqueId, item)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') onStockEditSave(vgUniqueId, item); if (e.key === 'Escape') onStockEditStart('', 0); }} />
              ) : vg.configuredStock === -1 ? (
                <button className="stock-display-button unlimited-badge" onClick={() => onStockEditStart(vgUniqueId, vg.configuredStock)} title="재고 수량을 클릭하여 수정">무제한</button>
              ) : (
                <button className="stock-display-button" onClick={() => onStockEditStart(vgUniqueId, vg.configuredStock)} title="재고 수량을 클릭하여 수정">{vg.configuredStock}</button>
              )}
            </td>
            <td><div className="action-buttons-wrapper"><button onClick={() => navigate(`/admin/products/edit/${item.productId}/${item.round.roundId}`)} className="admin-action-button" title="이 판매 회차 정보를 수정합니다."><Edit size={16}/></button><button onClick={handleAddNewRound} className="admin-action-button" title="이 상품의 새 판매 회차를 추가합니다."><Plus size={16} /></button></div></td>
          </tr>
        );
    }

    // 다중 옵션 상품 렌더링 (마스터 행)
    const earliestOverallExpiration = useMemo(() => { const allDates = item.enrichedVariantGroups.flatMap(vg => vg.items.map(i => i.expirationDate ? safeToDate(i.expirationDate)?.getTime() : undefined).filter(Boolean) as number[]); return allDates.length > 0 ? Math.min(...allDates) : Infinity; }, [item.enrichedVariantGroups]);
    const roundStatus = item.dynamicStatus;
    return (
      <React.Fragment>
        <tr className="master-row expandable">
          <td><input type="checkbox" checked={isSelected} onChange={(e) => onSelectionChange(item.uniqueId, e.target.checked)} /></td>
          <td><div className="no-and-expander"><span>{index + 1}</span><button className="expand-button" onClick={() => onToggleExpansion(item.uniqueId)} title={isExpanded ? "하위 항목 접기" : "하위 항목 펼치기"}><ChevronDown size={20} className={`chevron-icon ${isExpanded ? 'expanded' : ''}`} /></button></div></td>
          <td>{formatDate(item.round.createdAt)}</td>
          <td>{formatDateShort(item.round.pickupDate)}</td>
          <td>{item.category}</td>
          <td><span className={`storage-badge storage-${item.storageType}`}>{translateStorageType(item.storageType)}</span></td>
          <td><div className="product-name-cell-v2"><img src={item.productImage} alt={item.productName} className="product-thumbnail" /><div className="product-name-text"><span className="product-group-name">{item.productName}</span><span className="round-name-text">{item.round.roundName}</span></div></div></td>
          <td><span className={`status-badge ${roundStatus.className}`} title={`Round Status: ${roundStatus.text}`}>{roundStatus.text}</span></td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td>{formatDate(earliestOverallExpiration)}</td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td><div className="action-buttons-wrapper"><button onClick={() => navigate(`/admin/products/edit/${item.productId}/${item.round.roundId}`)} className="admin-action-button" title="이 판매 회차 정보를 수정합니다."><Edit size={16}/></button><button onClick={handleAddNewRound} className="admin-action-button" title="이 상품의 새 판매 회차를 추가합니다."><Plus size={16} /></button></div></td>
        </tr>
        {/* 다중 옵션 상품 렌더링 (서브 행) */}
        {isExpanded && item.enrichedVariantGroups.map((subVg, vgIndex) => {
          const subVgUniqueId = `${item.productId}_${item.round.roundId}_${subVg.id}`;
          const subStatus = subVg.dynamicStatus;
          return (
              <tr key={subVgUniqueId} className="detail-row sub-row">
                  <td></td>
                  <td><span className="sub-row-no">{`${index + 1}-${vgIndex + 1}`}</span></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td className="sub-row-name"> └ {subVg.groupName}</td>
                  <td><span className={`status-badge ${subStatus.className}`} title={`Status: ${subStatus.text}`}>{subStatus.text}</span></td>
                  <td style={{textAlign: 'right'}}>{subVg.items[0]?.price != null ? `${formatKRW(subVg.items[0].price)} 원` : '–'}</td>
                  <td>{formatDate(getEarliestExpirationDateForGroup(subVg))}</td>
                  <td className="quantity-cell">{`${subVg.reservedQuantity} / `}{(item.round.waitlistCount ?? 0) > 0 ? (<button className="waitlist-count-button" onClick={() => onOpenWaitlistModal(item.productId, item.round.roundId, subVg.id, item.productName, item.round.roundName)}>{item.round.waitlistCount ?? 0}</button>) : (item.round.waitlistCount ?? 0)}</td>
                  <td className="quantity-cell">{subVg.pickedUpQuantity}</td>
                  <td className="stock-cell">
                      {editingStockId === subVgUniqueId ? (
                        <input type="number" className="stock-input" value={stockInputs[subVgUniqueId] || ''} onChange={(e) => onSetStockInputs(prev => ({...prev, [subVgUniqueId]: e.target.value}))} onBlur={() => onStockEditSave(subVgUniqueId, item)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') onStockEditSave(subVgUniqueId, item); if (e.key === 'Escape') onStockEditStart('', 0); }} />
                      ) : subVg.configuredStock === -1 ? (
                        <button className="stock-display-button unlimited-badge" onClick={() => onStockEditStart(subVgUniqueId, subVg.configuredStock)} title="재고 수량을 클릭하여 수정">무제한</button>
                      ) : (
                        <button className="stock-display-button" onClick={() => onStockEditStart(subVgUniqueId, subVg.configuredStock)} title="재고 수량을 클릭하여 수정">{subVg.configuredStock}</button>
                      )}
                  </td>
                  <td></td>
              </tr>
          );
        })}
      </React.Fragment>
    );
};

const WaitlistModal: React.FC<{ isOpen: boolean; onClose: () => void; data: { productId: string; roundId: string; variantGroupId: string; productName: string; roundName: string; } | null; onSuccess: () => void; }> = ({ isOpen, onClose, data, onSuccess }) => {
    const [waitlist, setWaitlist] = useState<WaitlistInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [stockToAdd, setStockToAdd] = useState('');
    
    const functions = getFunctions(getApp(), 'asia-northeast3');
    const addStockAndProcessWaitlistCallable = useMemo(() => httpsCallable<any, WaitlistProcessResult>(functions, 'addStockAndProcessWaitlist'), [functions]);

    useEffect(() => {
        if (isOpen && data) {
            setLoading(true); setError('');
            getWaitlistForRound(data.productId, data.roundId)
                .then((fetchedWaitlist: any[]) => {
                    const processedWaitlist: WaitlistInfo[] = fetchedWaitlist.map((item, index) => ({ userId: item.userId || `${item.userName}-${index}`, userName: item.userName, quantity: item.quantity, timestamp: item.timestamp, }));
                    setWaitlist(processedWaitlist);
                })
                .catch(() => setError('대기자 명단을 불러오는데 실패했습니다.'))
                .finally(() => setLoading(false));
        }
    }, [isOpen, data]);

    const handleConfirm = async () => {
        const stock = parseInt(stockToAdd, 10);
        if (!data || isNaN(stock) || stock <= 0) { toast.error('유효한 재고 수량을 입력하세요.'); return; }
        
        const payload = {
            productId: data.productId,
            roundId: data.roundId,
            variantGroupId: data.variantGroupId,
            additionalStock: stock,
        };
        
        const promise = addStockAndProcessWaitlistCallable(payload);

        toast.promise(promise, {
            loading: '대기자 예약 전환 처리 중...',
            success: (result: HttpsCallableResult<WaitlistProcessResult>) => {
                onSuccess();
                onClose();
                return `${result.data.convertedCount}명이 예약으로 전환되었습니다.`;
            },
            error: (err) => (err as Error).message || '처리 중 오류가 발생했습니다.',
        });
    };
    if (!isOpen || !data) return null;
    return (
        <div className="waitlist-modal-overlay" onClick={onClose}><div className="waitlist-modal-content" onClick={e => e.stopPropagation()}><div className="waitlist-modal-header"><h3>"{data.productName}" 대기자 명단</h3><span>({data.roundName})</span><button onClick={onClose} className="modal-close-button">&times;</button></div><div className="waitlist-modal-body">{loading && <div className="modal-inline-loader"><InlineSodomallLoader /></div>}{error && <p className="error-text">{error}</p>}{!loading && !error && (waitlist.length > 0 ? (<table><thead><tr><th>순번</th><th>신청자</th><th>신청수량</th><th>신청일시</th></tr></thead><tbody>{waitlist.map((entry, index) => (<tr key={entry.userId}><td>{index + 1}</td><td>{entry.userName}</td><td>{entry.quantity}</td><td>{formatTimestamp(entry.timestamp)}</td></tr>))}</tbody></table>) : <p>이 판매 회차의 대기자가 없습니다.</p>)}</div><div className="waitlist-modal-footer"><input type="number" value={stockToAdd} onChange={e => setStockToAdd(e.target.value)} placeholder="추가할 재고 수량" className="stock-add-input"/><button onClick={handleConfirm} className="stock-add-confirm-btn" disabled={!stockToAdd || parseInt(stockToAdd, 10) <= 0}>재고 추가 및 자동 전환</button></div></div></div>
    );
};

// =================================================================
// 📌 메인 컴포넌트
// =================================================================
interface PageDataState {
    allProducts: Product[];
    categories: Category[];
    reservedQuantitiesMap: Map<string, number>;
    pickedUpQuantitiesMap: Map<string, number>;
}

const ProductListPageAdmin: React.FC = () => {
  useDocumentTitle('상품 목록 관리');
  const [loading, setLoading] = useState(true);
  
  const [pageData, setPageData] = useState<PageDataState>({
    allProducts: [],
    categories: [],
    reservedQuantitiesMap: new Map(),
    pickedUpQuantitiesMap: new Map(),
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistentState('adminProductItemsPerPage', 20);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = usePersistentState<'rounds' | 'analysis'>('adminProductTab', 'rounds');
  const [searchQuery, setSearchQuery] = usePersistentState('adminProductSearch', '');
  const [filterCategory, setFilterCategory] = usePersistentState('adminProductCategory', 'all');
  const [filterStatus, setFilterStatus] = usePersistentState<string>('adminProductStatus', 'all');
  const [sortConfig, setSortConfig] = usePersistentState<{key: SortableKeys, direction: 'asc' | 'desc'}>('adminProductSort', { key: 'roundCreatedAt', direction: 'desc' });
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [currentWaitlistData, setCurrentWaitlistData] = useState<{ productId: string; roundId: string; variantGroupId: string; productName: string; roundName: string; } | null>(null);
  const navigate = useNavigate();

  const functions = getFunctions(getApp(), 'asia-northeast3');
  const addStockAndProcessWaitlistCallable = useMemo(() => httpsCallable<any, WaitlistProcessResult>(functions, 'addStockAndProcessWaitlist'), [functions]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
        const [categoriesData, reservedMapData, pickedUpOrdersData, productsSnapshot] = await Promise.all([
            getCategories(),
            getReservedQuantitiesMap(),
            getDocs(query(collection(db, 'orders'), where('status', '==', 'PICKED_UP'))),
            getDocs(query(collection(db, "products"))),
        ]);

        const allFetchedProducts = productsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
        
        const pickedUpMap = new Map<string, number>();
        pickedUpOrdersData.forEach(doc => {
            const order = doc.data() as Order;
            (order.items || []).forEach((item: OrderItem) => {
                const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
                pickedUpMap.set(key, (pickedUpMap.get(key) || 0) + item.quantity);
            });
        });

        setPageData({
            allProducts: allFetchedProducts,
            categories: categoriesData,
            reservedQuantitiesMap: reservedMapData,
            pickedUpQuantitiesMap: pickedUpMap,
        });

    } catch (error) {
         reportError('ProductListPageAdmin.fetchData', error);
         toast.error("데이터를 불러오는 중 오류가 발생했습니다.");
     } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const enrichedRounds = useMemo<EnrichedRoundItem[]>(() => {
    let flatRounds: EnrichedRoundItem[] = [];
    (pageData.allProducts || []).forEach(p => {
        (p.salesHistory || []).forEach(r => {
            if (!r.variantGroups || r.variantGroups.length === 0) {
                reportInfo('ProductListPageAdmin.dataAnomaly', '옵션 그룹 없음', { productId: p.id, roundId: r.roundId });
                flatRounds.push({
                    productId: p.id,
                    productName: p.groupName,
                    productImage: p.imageUrls?.[0] || '/placeholder.svg',
                    category: p.category || '미지정',
                    storageType: p.storageType,
                    round: r,
                    uniqueId: `${p.id}-${r.roundId}`,
                    enrichedVariantGroups: [], 
                    dynamicStatus: { text: "데이터 오류", className: "error" },
                });
                return; 
            }

            const enrichedVariantGroups: EnrichedVariantGroup[] = r.variantGroups.map(vg => {
                const key = `${p.id}-${r.roundId}-${vg.id}`;
                const reservedQuantity = pageData.reservedQuantitiesMap.get(key) || 0;
                const configuredStock = vg.totalPhysicalStock ?? -1;
                const remainingStock = configuredStock === -1 ? Infinity : configuredStock - reservedQuantity;
                const dynamicStatus = getDynamicStatus(r, remainingStock);
                return { ...vg, reservedQuantity, pickedUpQuantity: pageData.pickedUpQuantitiesMap.get(key) || 0, configuredStock, remainingStock, dynamicStatus };
            });

            const isAllSoldOut = enrichedVariantGroups.every(vg => vg.dynamicStatus.className === 'sold-out');
            const totalRemainingStock = enrichedVariantGroups.reduce((sum, vg) => sum + (vg.remainingStock === Infinity ? Infinity : vg.remainingStock), 0);
            const overallDynamicStatus = isAllSoldOut ? { text: '매진', className: 'sold-out' } : getDynamicStatus(r, totalRemainingStock);

            flatRounds.push({ 
                productId: p.id, 
                productName: p.groupName, 
                productImage: p.imageUrls?.[0] || '/placeholder.svg', 
                category: p.category || '미지정', 
                storageType: p.storageType, 
                round: r, 
                uniqueId: `${p.id}-${r.roundId}`, 
                enrichedVariantGroups,
                dynamicStatus: overallDynamicStatus,
            });
        });
    });

    if (searchQuery) flatRounds = flatRounds.filter(item => item.productName.toLowerCase().includes(searchQuery.toLowerCase()) || item.round.roundName.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterCategory !== 'all') flatRounds = flatRounds.filter(item => item.category === filterCategory);
    if (filterStatus !== 'all') {
      flatRounds = flatRounds.filter(item => 
          item.dynamicStatus.className === filterStatus || 
          item.enrichedVariantGroups.some(vg => vg.dynamicStatus.className === filterStatus)
      );
    }

    return flatRounds.sort((a, b) => {
        const key = sortConfig.key;
        let aVal: any; let bVal: any;
        if (key === 'roundCreatedAt') { aVal = safeToDate(a.round.createdAt)?.getTime() || 0; bVal = safeToDate(b.round.createdAt)?.getTime() || 0; }
        else if (key === 'pickupDate') { aVal = safeToDate(a.round.pickupDate)?.getTime() || 0; bVal = safeToDate(b.round.pickupDate)?.getTime() || 0; }
        else if (key === 'expirationDate') { 
            const aEarliestExp = a.enrichedVariantGroups.length > 0 ? Math.min(...a.enrichedVariantGroups.map(vg => getEarliestExpirationDateForGroup(vg))) : Infinity;
            const bEarliestExp = b.enrichedVariantGroups.length > 0 ? Math.min(...b.enrichedVariantGroups.map(vg => getEarliestExpirationDateForGroup(vg))) : Infinity;
            aVal = aEarliestExp; bVal = bEarliestExp;
            if (aVal === Infinity && bVal !== Infinity) return 1; if (bVal === Infinity && aVal !== Infinity) return -1; if (aVal === Infinity && bVal === Infinity) return 0;
        } else { aVal = a[key as keyof EnrichedRoundItem] ?? 0; bVal = b[key as keyof EnrichedRoundItem] ?? 0; }
        if (sortConfig.direction === 'asc') return aVal < bVal ? -1 : 1;
        return aVal > bVal ? -1 : 1;
    });
  }, [pageData, searchQuery, filterCategory, filterStatus, sortConfig]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterCategory, filterStatus, itemsPerPage]);
  const paginatedRounds = useMemo(() => { const startIndex = (currentPage - 1) * itemsPerPage; return enrichedRounds.slice(startIndex, startIndex + itemsPerPage); }, [enrichedRounds, currentPage, itemsPerPage]);
  useEffect(() => { const allExpandableIds = new Set(enrichedRounds.filter(item => item.enrichedVariantGroups.length > 1).map(item => item.uniqueId)); setExpandedRoundIds(allExpandableIds); }, [enrichedRounds]);
  const handleSortChange = (key: SortableKeys) => { setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' })); };
  const handleStockEditStart = (vgUniqueId: string, currentStock: number) => { setEditingStockId(vgUniqueId); setStockInputs(prev => ({...prev, [vgUniqueId]: currentStock === -1 ? '' : String(currentStock) })); };
  
  const handleStockEditSave = async (vgUniqueId: string, currentItem: EnrichedRoundItem) => {
    setEditingStockId(null);
    const newStockValue = stockInputs[vgUniqueId];
    if (newStockValue === undefined) return;

    const [productId, roundId, variantGroupId] = vgUniqueId.split('_');
    const newStock = parseInt(newStockValue, 10);
    if (isNaN(newStock) || (newStock < 0 && newStock !== -1)) {
        toast.error("재고는 0 이상의 숫자 또는 -1(무제한)만 입력 가능합니다.");
        return;
    }

    const variantGroup = currentItem.enrichedVariantGroups.find(vg => vg.id === variantGroupId);
    if (!variantGroup) {
        toast.error("재고를 업데이트할 상품 정보를 찾지 못했습니다.");
        return;
    }
    
    const originalStock = variantGroup.configuredStock;
    const stockDifference = newStock - originalStock;
    
    if (originalStock !== -1 && newStock !== -1 && stockDifference > 0) {
        const payload = {
            productId,
            roundId,
            variantGroupId,
            additionalStock: stockDifference,
        };
        const promise = addStockAndProcessWaitlistCallable(payload);

        await toast.promise(promise, {
            loading: '재고 추가 및 대기자 전환 처리 중...',
            success: (result: HttpsCallableResult<WaitlistProcessResult>) => {
                fetchData();
                if (result.data.convertedCount > 0) {
                    return `재고가 추가되고 ${result.data.convertedCount}명의 대기자가 예약으로 전환되었습니다.`;
                }
                return '재고가 성공적으로 업데이트되었습니다.';
            },
            error: (err) => (err as Error).message || '재고 처리 중 오류가 발생했습니다.',
        });
    } else {
        const promise = updateMultipleVariantGroupStocks([{ productId, roundId, variantGroupId, newStock }]);
        await toast.promise(promise, {
            loading: "재고 정보 업데이트 중...",
            success: "재고가 성공적으로 업데이트되었습니다!",
            error: "업데이트 중 오류가 발생했습니다.",
        });
        await fetchData();
    }
  };

  const toggleRowExpansion = (roundId: string) => { setExpandedRoundIds(prev => { const newSet = new Set(prev); if (newSet.has(roundId)) newSet.delete(roundId); else newSet.add(roundId); return newSet; }); };
  const handleSelectionChange = (id: string, isSelected: boolean) => { setSelectedItems(prev => { const newSet = new Set(prev); if (isSelected) newSet.add(id); else newSet.delete(id); return newSet; }); };
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.checked) { setSelectedItems(new Set(paginatedRounds.map(item => item.uniqueId))); } else { setSelectedItems(new Set()); } };
  
  const handleBulkAction = async () => {
    if (selectedItems.size === 0) { toast.error("선택된 항목이 없습니다."); return; }
    
    // ✅ [버그 수정] roundId에 '-'가 포함된 경우를 대비해, 첫 번째 '-'를 기준으로 파싱
    const updates = Array.from(selectedItems).map(id => {
        const separatorIndex = id.indexOf('-');
        if (separatorIndex === -1) {
             reportError('ProductListPageAdmin.bulkEnd.invalidId', new Error('invalid uniqueId'), { id });
             return null;
         }

        const productId = id.substring(0, separatorIndex);
        const roundId = id.substring(separatorIndex + 1);
        return { productId, roundId, newStatus: 'ended' as SalesRoundStatus };
    }).filter((item): item is { productId: string; roundId: string; newStatus: SalesRoundStatus } => item !== null);

    if (updates.length === 0) {
        toast.error("유효한 항목이 없습니다.");
        return;
    }

    const promise = updateMultipleSalesRoundStatuses(updates);
    await toast.promise(promise, { loading: `${updates.length}개 항목의 판매를 종료하는 중...`, success: "선택된 항목이 모두 판매 종료 처리되었습니다.", error: "일괄 작업 중 오류가 발생했습니다." });
    setSelectedItems(new Set()); fetchData(); 
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) { toast.error("삭제할 항목이 없습니다."); return; }

    toast((t) => (
        <div className="confirmation-toast-content" style={{maxWidth: '420px', textAlign: 'center'}}>
            <AlertTriangle size={44} style={{ color: 'var(--danger-color)', margin: '0 auto 1rem' }} />
            <h4 style={{fontSize: '1.2rem', fontWeight: 'bold'}}>선택 항목 영구 삭제</h4>
            <p style={{margin: '0.5rem 0 1rem'}}>
                정말로 선택한 <strong>{selectedItems.size}개</strong>의 판매 회차를 영구적으로 삭제하시겠습니까?
                <br/>
                <strong style={{color: 'var(--danger-color)'}}>이 작업은 되돌릴 수 없습니다.</strong>
            </p>
            <div className="toast-buttons" style={{display: 'flex', gap: '10px'}}>
                <button className="common-button button-secondary button-medium" style={{flex: 1}} onClick={() => toast.dismiss(t.id)}>취소</button>
                <button className="common-button button-danger button-medium" style={{flex: 1}} onClick={async () => {
                    toast.dismiss(t.id);
                    
                    // ✅ [버그 수정] roundId에 '-'가 포함된 경우를 대비해, 첫 번째 '-'를 기준으로 파싱
                    const deletions = Array.from(selectedItems).map(id => {
                        const separatorIndex = id.indexOf('-');
                        if (separatorIndex === -1) {
                            reportError('ProductListPageAdmin.bulkDelete.invalidId', new Error('invalid uniqueId'), { id });
                             return null;
                         }

                        const productId = id.substring(0, separatorIndex);
                        const roundId = id.substring(separatorIndex + 1);
                        return { productId, roundId };
                    }).filter((item): item is { productId: string; roundId: string } => item !== null);

                    if (deletions.length === 0) {
                        toast.error("삭제할 유효한 항목이 없습니다.");
                        return;
                    }

                    const promise = deleteSalesRounds(deletions);
                    await toast.promise(promise, {
                        loading: `${deletions.length}개 항목을 삭제하는 중...`,
                        success: "선택된 항목이 모두 삭제되었습니다.",
                        error: "일괄 삭제 중 오류가 발생했습니다."
                    });
                    setSelectedItems(new Set());
                    fetchData();
                }}>삭제 확인</button>
            </div>
        </div>
    ), { id: 'bulk-delete-confirm', duration: Infinity, position: 'top-center' });
  };
  
  const handleOpenWaitlistModal = (productId: string, roundId: string, variantGroupId: string, productName: string, roundName: string) => { setCurrentWaitlistData({ productId, roundId, variantGroupId, productName, roundName }); setIsWaitlistModalOpen(true); };
  const handleCloseWaitlistModal = () => { setIsWaitlistModalOpen(false); setCurrentWaitlistData(null); };
  const handleWaitlistSuccess = () => { fetchData(); };
  const isAllSelected = paginatedRounds.length > 0 && selectedItems.size >= paginatedRounds.length && paginatedRounds.every(item => selectedItems.has(item.uniqueId));
  
  if (loading) return <SodomallLoader />;

  return (
    <div className="admin-page-container product-list-admin-container">
      <header className="admin-page-header">
        <h1 className="admin-page-title"><PackageOpen size={28} /> 통합 판매 관리</h1>
        <button onClick={() => navigate('/admin/products/add')} className="admin-add-button" title="완전히 새로운 대표 상품을 시스템에 등록합니다."><Plus size={18}/> 신규 대표 상품 추가</button>
      </header>
      <div className="admin-tabs">
        <button className={`admin-tab-button ${activeTab === 'rounds' ? 'active' : ''}`} onClick={() => setActiveTab('rounds')}><PackageOpen size={16} /> 회차별 관리</button>
        <button className={`admin-tab-button ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}><BarChart2 size={16} /> 수익 분석</button>
      </div>
      <div className="admin-tab-content">
        {activeTab === 'rounds' ? (
           <>
            <div className="product-list-controls-v2">
                <div className="search-bar-wrapper"><Search size={18} className="search-icon"/><input type="text" placeholder="상품명 또는 회차명으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input"/></div>
                <div className="filter-sort-wrapper">
                    <div className="control-group"><Filter size={16} /><select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="control-select"><option value="all">모든 카테고리</option>{pageData.categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="control-select">
                        <option value="all">모든 상태</option>
                        <option value="selling">공구예약중</option>
                        <option value="late-reservation">추가예약중</option>
                        <option value="pickup">픽업중/현장판매</option>
                        <option value="sold-out">매진</option>
                        <option value="ended">판매종료</option>
                        <option value="scheduled">판매예정</option>
                    </select>
                    </div>
                </div>
                <div className="bulk-action-wrapper">
                    <button className="bulk-action-button" onClick={handleBulkAction} disabled={selectedItems.size === 0}><Trash2 size={16} /> 선택 항목 판매 종료</button>
                    <button className="bulk-action-button danger" onClick={handleBulkDelete} disabled={selectedItems.size === 0}><Trash2 size={16} /> 선택 항목 영구 삭제</button>
                </div>
            </div>
            <div className="admin-product-table-container">
              <table className="admin-product-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} title="전체 선택/해제"/></th>
                    <th>No.</th>
                    <th className="sortable-header" onClick={() => handleSortChange('roundCreatedAt')}>등록일 {sortConfig.key === 'roundCreatedAt' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th className="sortable-header" onClick={() => handleSortChange('pickupDate')}>픽업일 {sortConfig.key === 'pickupDate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th className="sortable-header" onClick={() => handleSortChange('category')}>카테고리 {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th>보관</th>
                    <th className="sortable-header" onClick={() => handleSortChange('productName')}>상품명 / 회차명 {sortConfig.key === 'productName' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th>상태</th>
                    <th>가격</th>
                    <th className="sortable-header" onClick={() => handleSortChange('expirationDate')}>유통기한 {sortConfig.key === 'expirationDate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th title="예약된 수량 / 전체 대기자 수">예약/대기</th>
                    <th title="픽업 완료된 수량">픽업</th>
                    <th>재고</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRounds.length > 0 ? ( paginatedRounds.map((item, index) => (<ProductAdminRow key={item.uniqueId} item={item} index={(currentPage - 1) * itemsPerPage + index} isExpanded={expandedRoundIds.has(item.uniqueId)} isSelected={selectedItems.has(item.uniqueId)} editingStockId={editingStockId} stockInputs={stockInputs} onToggleExpansion={toggleRowExpansion} onSelectionChange={handleSelectionChange} onStockEditStart={handleStockEditStart} onStockEditSave={handleStockEditSave} onSetStockInputs={setStockInputs} onOpenWaitlistModal={handleOpenWaitlistModal}/>)) ) : (
                    <tr><td colSpan={14} style={{textAlign: 'center', padding: '4rem', color: 'var(--text-color-light)'}}>표시할 판매 회차가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls currentPage={currentPage} totalPages={Math.ceil(enrichedRounds.length / itemsPerPage)} onPageChange={setCurrentPage} itemsPerPage={itemsPerPage} onItemsPerPageChange={(e) => setItemsPerPage(Number(e.target.value))} totalItems={enrichedRounds.length}/>
          </>
        ) : (
          <div className="placeholder-container"><h3>수익 분석 (준비중)</h3><p>이곳에서 상품별 원가, 판매가, 예약 수량을 기반으로 한 수익 및 수익률 분석 데이터를 볼 수 있습니다.</p><p>상품 데이터에 '원가(cost)' 필드를 추가하는 작업이 선행되어야 합니다.</p></div>
        )}
      </div>
      <WaitlistModal isOpen={isWaitlistModalOpen} onClose={handleCloseWaitlistModal} data={currentWaitlistData} onSuccess={handleWaitlistSuccess}/>
    </div>
  );
};

export default ProductListPageAdmin;