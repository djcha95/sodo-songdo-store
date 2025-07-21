// src/pages/admin/ProductListPageAdmin.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useNavigate } from 'react-router-dom';
import { getCategories, updateMultipleVariantGroupStocks, updateMultipleSalesRoundStatuses, getWaitlistForRound, addStockAndProcessWaitlist, getReservedQuantitiesMap } from '../../firebase';
import { db } from '@/firebase/firebaseConfig';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Product, SalesRound, Category, SalesRoundStatus, Order, OrderItem, VariantGroup, StorageType } from '../../types';
import toast from 'react-hot-toast';
import { Plus, Edit, Filter, Search, ChevronDown, BarChart2, Trash2, PackageOpen, ChevronsLeft, ChevronsRight } from 'lucide-react';
import SodamallLoader from '@/components/common/SodamallLoader';
import InlineSodamallLoader from '@/components/common/InlineSodamallLoader';
import './ProductListPageAdmin.css';

// =================================================================
// 헬퍼 함수 및 타입
// =================================================================

/** 대기자 명단 항목에 대한 타입 */
interface WaitlistInfo {
  userId: string;
  userName: string;
  quantity: number;
  timestamp: Timestamp;
}

const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) {
        if (isNaN(date.getTime())) return null;
        return date;
    }
    if (typeof date === 'number') {
        const d = new Date(date);
        if (isNaN(d.getTime())) return null;
        return d;
    }
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && date.seconds !== undefined && date.nanoseconds !== undefined) {
      return new Timestamp(date.seconds, date.nanoseconds).toDate();
    }
    if (typeof date === 'string') {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    return null;
};

const formatDate = (dateInput: any) => {
    const date = safeToDate(dateInput);
    if (!date || !isFinite(date.getTime())) return '–';
    return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\.$/, '');
};

const formatTimestamp = (timestamp: Timestamp) => {
  const date = timestamp.toDate();
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getEarliestExpirationDateForGroup = (variantGroup: VariantGroup): number => {
    const dates = variantGroup.items.map(i => i.expirationDate ? safeToDate(i.expirationDate)?.getTime() : undefined).filter((d): d is number => d !== undefined && d !== null);
    return dates.length > 0 ? Math.min(...dates) : Infinity;
};

const translateStatus = (status: SalesRoundStatus): string => {
    const statusMap: Record<SalesRoundStatus, string> = {
        selling: '판매중', scheduled: '판매예정', ended: '판매종료',
        sold_out: '품절', draft: '임시저장'
    };
    return statusMap[status] || status;
};

const translateStorageType = (storageType: StorageType): string => {
    const typeMap: Record<StorageType, string> = {
        ROOM: '실온', COLD: '냉장', FROZEN: '냉동'
    };
    return typeMap[storageType] || storageType;
};

const getVariantGroupStatus = (roundStatus: SalesRoundStatus, vg: EnrichedVariantGroup): SalesRoundStatus => {
    if (roundStatus === 'selling') {
        if (vg.remainingStock <= 0 && vg.remainingStock !== Infinity) return 'sold_out';
    }
    return roundStatus;
};

interface EnrichedVariantGroup extends VariantGroup {
    reservedQuantity: number;
    configuredStock: number;
    pickedUpQuantity: number;
    remainingStock: number;
}

interface EnrichedRoundItem {
  productId: string;
  productName: string;
  productImage: string;
  category: string;
  storageType: StorageType;
  round: SalesRound;
  uniqueId: string;
  enrichedVariantGroups: EnrichedVariantGroup[];
}

type SortableKeys = 'roundCreatedAt' | 'productName' | 'category' | 'expirationDate';

// =================================================================
// 커스텀 훅: 상태 저장
// =================================================================
function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) { console.warn(`Error reading localStorage key “${key}”:`, error); return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (error) { console.warn(`Error setting localStorage key “${key}”:`, error); }
  }, [key, state]);
  return [state, setState];
}

// =================================================================
// ✨ 페이지네이션 컨트롤 컴포넌트
// =================================================================
const PaginationControls: React.FC<{
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
    onItemsPerPageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    totalItems: number;
}> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, totalItems }) => {
    if (totalItems === 0) return null;
    return (
        <div className="pagination-container">
            <div className="pagination-left">
                <div className="items-per-page-selector">
                    <label htmlFor="itemsPerPage">표시 개수:</label>
                    <select id="itemsPerPage" value={itemsPerPage} onChange={onItemsPerPageChange}>
                        <option value={10}>10개</option>
                        <option value={20}>20개</option>
                        <option value={50}>50개</option>
                        <option value={100}>100개</option>
                    </select>
                </div>
            </div>
            <div className="pagination-center">
                <button onClick={() => onPageChange(1)} disabled={currentPage === 1} title="첫 페이지"><ChevronsLeft size={16} /></button>
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>이전</button>
                <span className="page-info">{currentPage} / {totalPages}</span>
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>다음</button>
                <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} title="마지막 페이지"><ChevronsRight size={16} /></button>
            </div>
            <div className="pagination-right">
                <span className="total-items-display">총 {totalItems}개 회차</span>
            </div>
        </div>
    );
};

// =================================================================
// ✨ Row를 위한 하위 컴포넌트
// =================================================================
interface ProductAdminRowProps {
    item: EnrichedRoundItem;
    index: number;
    isExpanded: boolean;
    isSelected: boolean;
    editingStockId: string | null;
    stockInputs: Record<string, string>;
    onToggleExpansion: (id: string) => void;
    onSelectionChange: (id: string, checked: boolean) => void;
    onStockEditStart: (id: string, stock: number) => void;
    onStockEditSave: (id: string) => void;
    onSetStockInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    onOpenWaitlistModal: (productId: string, roundId: string, variantGroupId: string, productName: string, roundName: string) => void;
}

const ProductAdminRow: React.FC<ProductAdminRowProps> = ({
    item, index, isExpanded, isSelected, editingStockId, stockInputs,
    onToggleExpansion, onSelectionChange, onStockEditStart, onStockEditSave, onSetStockInputs, onOpenWaitlistModal
}) => {
    const navigate = useNavigate();
    const isExpandable = item.enrichedVariantGroups.length > 1;

    // 단일 상품 행 렌더링
    if (!isExpandable) {
        const vg = item.enrichedVariantGroups[0];
        const status = getVariantGroupStatus(item.round.status, vg);
        const vgUniqueId = `${item.productId}_${item.round.roundId}_${vg.id}`;
        const isUnlimited = vg.configuredStock === -1;
        const rowClass = ["master-row", isUnlimited ? "unlimited-stock-warning" : ""].filter(Boolean).join(" ");
        
        return (
          <tr className={rowClass}>
            <td><input type="checkbox" checked={isSelected} onChange={(e) => onSelectionChange(item.uniqueId, e.target.checked)} /></td>
            <td>{index + 1}</td>
            <td>{formatDate(item.round.createdAt)}</td>
            <td>{item.category}</td>
            <td><span className={`storage-badge storage-${item.storageType}`}>{translateStorageType(item.storageType)}</span></td>
            <td>
              <div className="product-name-cell-v2">
                <img src={item.productImage} alt={item.productName} className="product-thumbnail" />
                <div className="product-name-text">
                  <span className="product-group-name">{item.productName}</span>
                  <span className="round-name-text">{item.round.roundName}</span>
                </div>
              </div>
            </td>
            <td><span className={`status-badge status-${status}`} title={`Status: ${status}`}>{translateStatus(status)}</span></td>
            <td style={{textAlign: 'right'}}>{vg.items[0]?.price.toLocaleString() ?? '–'} 원</td>
            <td>{formatDate(getEarliestExpirationDateForGroup(vg))}</td>
            <td className="quantity-cell">
              {`${vg.reservedQuantity} / `}
              {(item.round.waitlistCount ?? 0) > 0 ? (
                <button className="waitlist-count-button" onClick={() => onOpenWaitlistModal(item.productId, item.round.roundId, vg.id, item.productName, item.round.roundName)}>
                  {item.round.waitlistCount ?? 0}
                </button>
              ) : (
                item.round.waitlistCount ?? 0
              )}
            </td>
            <td className="quantity-cell">{vg.pickedUpQuantity}</td>
            <td className="stock-cell">
              {editingStockId === vgUniqueId ? (
                  <input type="number" className="stock-input" value={stockInputs[vgUniqueId] || ''} onChange={(e) => onSetStockInputs(prev => ({...prev, [vgUniqueId]: e.target.value}))} onBlur={() => onStockEditSave(vgUniqueId)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') onStockEditSave(vgUniqueId); if (e.key === 'Escape') onStockEditStart('', 0); }} />
              ) : (
                  <button className="stock-display-button" onClick={() => onStockEditStart(vgUniqueId, vg.configuredStock)} title="재고 수량을 클릭하여 수정. -1 입력 시 무제한">{vg.configuredStock === -1 ? '∞' : vg.configuredStock}</button>
              )}
            </td>
            <td><button onClick={() => navigate(`/admin/products/edit/${item.productId}/${item.round.roundId}`)} className="admin-action-button" title="이 판매 회차 정보를 수정합니다."><Edit size={16}/></button></td>
          </tr>
        );
    }
    
    const earliestOverallExpiration = useMemo(() => {
        const allDates = item.enrichedVariantGroups.flatMap(vg => vg.items.map(i => i.expirationDate ? safeToDate(i.expirationDate)?.getTime() : undefined).filter(Boolean) as number[]);
        return allDates.length > 0 ? Math.min(...allDates) : Infinity;
    }, [item.enrichedVariantGroups]);
    const roundStatus = item.round.status;

    return (
      <React.Fragment>
        <tr className="master-row expandable">
          <td><input type="checkbox" checked={isSelected} onChange={(e) => onSelectionChange(item.uniqueId, e.target.checked)} /></td>
          <td>
            <div className="no-and-expander">
              <span>{index + 1}</span>
              <button className="expand-button" onClick={() => onToggleExpansion(item.uniqueId)} title={isExpanded ? "하위 항목 접기" : "하위 항목 펼치기"}><ChevronDown size={20} className={`chevron-icon ${isExpanded ? 'expanded' : ''}`} /></button>
            </div>
          </td>
          <td>{formatDate(item.round.createdAt)}</td>
          <td>{item.category}</td>
          <td><span className={`storage-badge storage-${item.storageType}`}>{translateStorageType(item.storageType)}</span></td>
          <td>
            <div className="product-name-cell-v2">
              <img src={item.productImage} alt={item.productName} className="product-thumbnail" />
              <div className="product-name-text"><span className="product-group-name">{item.productName}</span><span className="round-name-text">{item.round.roundName}</span></div>
            </div>
          </td>
          <td><span className={`status-badge status-${roundStatus}`} title={`Round Status: ${roundStatus}`}>{translateStatus(roundStatus)}</span></td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td>{formatDate(earliestOverallExpiration)}</td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td style={{textAlign: 'center', color: 'var(--text-color-light)'}}>–</td>
          <td>
              <button onClick={() => navigate(`/admin/products/edit/${item.productId}/${item.round.roundId}`)} className="admin-action-button" title="이 판매 회차 정보를 수정합니다.">
                  <Edit size={16}/>
              </button>
          </td>
        </tr>
        {isExpanded && item.enrichedVariantGroups.map((subVg, vgIndex) => {
          const subVgUniqueId = `${item.productId}_${item.round.roundId}_${subVg.id}`;
          const subStatus = getVariantGroupStatus(item.round.status, subVg);
          const isSubUnlimited = subVg.configuredStock === -1;
          const subRowClasses = ["detail-row", "sub-row", isSubUnlimited ? "unlimited-stock-warning" : ""].filter(Boolean).join(" ");
          
          return (
              <tr key={subVgUniqueId} className={subRowClasses}>
                  <td></td>
                  <td><span className="sub-row-no">{`${index + 1}-${vgIndex + 1}`}</span></td>
                  <td></td><td></td><td></td>
                  <td className="sub-row-name"> └ {subVg.groupName}</td>
                  <td><span className={`status-badge status-${subStatus}`} title={`Status: ${subStatus}`}>{translateStatus(subStatus)}</span></td>
                  <td style={{textAlign: 'right'}}>{subVg.items[0]?.price.toLocaleString() ?? '–'} 원</td>
                  <td>{formatDate(getEarliestExpirationDateForGroup(subVg))}</td>
                  <td className="quantity-cell">
                    {`${subVg.reservedQuantity} / `}
                    {(item.round.waitlistCount ?? 0) > 0 ? (
                      <button className="waitlist-count-button" onClick={() => onOpenWaitlistModal(item.productId, item.round.roundId, subVg.id, item.productName, item.round.roundName)}>
                        {item.round.waitlistCount ?? 0}
                      </button>
                    ) : (
                      item.round.waitlistCount ?? 0
                    )}
                  </td>
                  <td className="quantity-cell">{subVg.pickedUpQuantity}</td>
                  <td className="stock-cell">
                      {editingStockId === subVgUniqueId ? (
                          <input type="number" className="stock-input" value={stockInputs[subVgUniqueId] || ''} onChange={(e) => onSetStockInputs(prev => ({...prev, [subVgUniqueId]: e.target.value}))} onBlur={() => onStockEditSave(subVgUniqueId)} autoFocus onKeyDown={(e) => { 
                              if (e.key === 'Enter') onStockEditSave(subVgUniqueId);
                              if (e.key === 'Escape') onStockEditStart('', 0); 
                          }} />
                      ) : (
                          <button className="stock-display-button" onClick={() => onStockEditStart(subVgUniqueId, subVg.configuredStock)} title="재고 수량을 클릭하여 수정. -1 입력 시 무제한">{subVg.configuredStock === -1 ? '∞' : subVg.configuredStock}</button>
                      )}
                  </td>
                  <td></td>
              </tr>
          );
        })}
      </React.Fragment>
    );
};

// =================================================================
// ✨ 대기자 명단 모달 컴포넌트
// =================================================================
const WaitlistModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    data: { productId: string; roundId: string; variantGroupId: string; productName: string; roundName: string; } | null;
    onSuccess: () => void;
}> = ({ isOpen, onClose, data, onSuccess }) => {
    const [waitlist, setWaitlist] = useState<WaitlistInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [stockToAdd, setStockToAdd] = useState('');

    useEffect(() => {
        if (isOpen && data) {
            setLoading(true);
            setError('');
            getWaitlistForRound(data.productId, data.roundId)
                .then((fetchedWaitlist: any[]) => {
                    const processedWaitlist: WaitlistInfo[] = fetchedWaitlist.map((item, index) => ({
                        userId: item.userId || `${item.userName}-${index}`,
                        userName: item.userName,
                        quantity: item.quantity,
                        timestamp: item.timestamp,
                    }));
                    setWaitlist(processedWaitlist);
                })
                .catch(() => setError('대기자 명단을 불러오는데 실패했습니다.'))
                .finally(() => setLoading(false));
        }
    }, [isOpen, data]);

    const handleConfirm = async () => {
        const stock = parseInt(stockToAdd, 10);
        if (!data || isNaN(stock) || stock <= 0) {
            toast.error('유효한 재고 수량을 입력하세요.');
            return;
        }

        const promise = addStockAndProcessWaitlist(data.productId, data.roundId, data.variantGroupId, stock);
        
        toast.promise(promise, {
            loading: '대기자 예약 전환 처리 중...',
            success: (result) => {
                onSuccess();
                onClose();
                return `${result.convertedCount}명이 예약으로 전환되었습니다.`;
            },
            error: '처리 중 오류가 발생했습니다.'
        });
    };
    
    if (!isOpen || !data) return null;

    return (
        <div className="waitlist-modal-overlay" onClick={onClose}>
            <div className="waitlist-modal-content" onClick={e => e.stopPropagation()}>
                <div className="waitlist-modal-header">
                    <h3>"{data.productName}" 대기자 명단</h3>
                    <span>({data.roundName})</span>
                    <button onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                <div className="waitlist-modal-body">
                    {loading && <div className="modal-inline-loader"><InlineSodamallLoader /></div>}
                    {error && <p className="error-text">{error}</p>}
                    {!loading && !error && (
                        waitlist.length > 0 ? (
                            <table>
                                <thead>
                                    <tr><th>순번</th><th>신청자</th><th>신청수량</th><th>신청일시</th></tr>
                                </thead>
                                <tbody>
                                    {waitlist.map((entry, index) => (
                                        <tr key={entry.userId}>
                                            <td>{index + 1}</td>
                                            <td>{entry.userName}</td>
                                            <td>{entry.quantity}</td>
                                            <td>{formatTimestamp(entry.timestamp)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p>이 판매 회차의 대기자가 없습니다.</p>
                    )}
                </div>
                <div className="waitlist-modal-footer">
                    <input type="number" value={stockToAdd} onChange={e => setStockToAdd(e.target.value)} placeholder="추가할 재고 수량" className="stock-add-input"/>
                    <button onClick={handleConfirm} className="stock-add-confirm-btn">재고 추가 및 자동 전환</button>
                </div>
            </div>
        </div>
    );
};


// =================================================================
// 메인 컴포넌트
// =================================================================
const ProductListPageAdmin: React.FC = () => {
  useDocumentTitle('상품 목록 관리');
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistentState('adminProductItemsPerPage', 20);

  const [reservedQuantitiesMap, setReservedQuantitiesMap] = useState<Map<string, number>>(new Map());
  const [pickedUpQuantitiesMap, setPickedUpQuantitiesMap] = useState<Map<string, number>>(new Map());
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [editingStockId, setEditingStockId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = usePersistentState<'rounds' | 'analysis'>('adminProductTab', 'rounds');
  const [searchQuery, setSearchQuery] = usePersistentState('adminProductSearch', '');
  const [filterCategory, setFilterCategory] = usePersistentState('adminProductCategory', 'all');
  const [filterStatus, setFilterStatus] = usePersistentState<SalesRoundStatus | 'all'>('adminProductStatus', 'all');
  const [sortConfig, setSortConfig] = usePersistentState<{key: SortableKeys, direction: 'asc' | 'desc'}>('adminProductSort', { key: 'roundCreatedAt', direction: 'desc' });
  
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [currentWaitlistData, setCurrentWaitlistData] = useState<{
    productId: string;
    roundId: string;
    variantGroupId: string;
    productName: string;
    roundName: string;
  } | null>(null);

  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
        const [categoriesData, reservedMapData, pickedUpOrdersData] = await Promise.all([
            getCategories(),
            getReservedQuantitiesMap(),
            getDocs(query(collection(db, 'orders'), where('status', '==', 'PICKED_UP'))),
        ]);

        // ✅ [수정] Firestore에서 모든 'products' 문서를 직접 가져옵니다.
        const productsQuery = query(collection(db, "products"));
        const productsSnapshot = await getDocs(productsQuery);
        const allFetchedProducts = productsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
        
        setAllProducts(allFetchedProducts);
        setCategories(categoriesData);
        setReservedQuantitiesMap(reservedMapData);

        const pickedUpMap = new Map<string, number>();
        pickedUpOrdersData.forEach(doc => {
            const order = doc.data() as Order;
            (order.items || []).forEach((item: OrderItem) => {
                const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
                pickedUpMap.set(key, (pickedUpMap.get(key) || 0) + item.quantity);
            });
        });
        setPickedUpQuantitiesMap(pickedUpMap);

    } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const enrichedRounds = useMemo<EnrichedRoundItem[]>(() => {
    let flatRounds: EnrichedRoundItem[] = [];
    (allProducts || []).forEach(p => {
        (p.salesHistory || []).forEach(r => {
            const enrichedVariantGroups: EnrichedVariantGroup[] = r.variantGroups.map(vg => {
                const key = `${p.id}-${r.roundId}-${vg.id}`;
                const reservedQuantity = reservedQuantitiesMap.get(key) || 0;
                const configuredStock = vg.totalPhysicalStock ?? -1;
                const remainingStock = configuredStock === -1 ? Infinity : configuredStock - reservedQuantity;

                return { 
                    ...vg, 
                    reservedQuantity,
                    pickedUpQuantity: pickedUpQuantitiesMap.get(key) || 0,
                    configuredStock,
                    remainingStock
                };
            });
            flatRounds.push({
                productId: p.id, productName: p.groupName, productImage: p.imageUrls?.[0] || '/placeholder.svg',
                category: p.category || '미지정', storageType: p.storageType, round: r, uniqueId: `${p.id}-${r.roundId}`, enrichedVariantGroups
            });
        });
    });

    if (searchQuery) flatRounds = flatRounds.filter(item => item.productName.toLowerCase().includes(searchQuery.toLowerCase()) || item.round.roundName.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterCategory !== 'all') flatRounds = flatRounds.filter(item => item.category === filterCategory);
    if (filterStatus !== 'all') {
      flatRounds = flatRounds.filter(item => 
        item.enrichedVariantGroups.some(vg => 
          getVariantGroupStatus(item.round.status, vg) === filterStatus
        )
      );
    }

    return flatRounds.sort((a, b) => {
        const key = sortConfig.key;
        let aVal: any; let bVal: any;
        if (key === 'roundCreatedAt') { aVal = safeToDate(a.round.createdAt)?.getTime() || 0; bVal = safeToDate(b.round.createdAt)?.getTime() || 0; } 
        else if (key === 'expirationDate') { 
            const aEarliestExp = a.enrichedVariantGroups.length > 0 ? Math.min(...a.enrichedVariantGroups.map(vg => getEarliestExpirationDateForGroup(vg))) : Infinity;
            const bEarliestExp = b.enrichedVariantGroups.length > 0 ? Math.min(...b.enrichedVariantGroups.map(vg => getEarliestExpirationDateForGroup(vg))) : Infinity;
            aVal = aEarliestExp;
            bVal = bEarliestExp;
            if (aVal === Infinity && bVal !== Infinity) return 1;
            if (bVal === Infinity && aVal !== Infinity) return -1;
            if (aVal === Infinity && bVal === Infinity) return 0;
        }
        else { aVal = a[key as keyof EnrichedRoundItem] ?? 0; bVal = b[key as keyof EnrichedRoundItem] ?? 0; }
        
        if (sortConfig.direction === 'asc') return aVal < bVal ? -1 : 1;
        return aVal > bVal ? -1 : 1;
    });
  }, [allProducts, reservedQuantitiesMap, pickedUpQuantitiesMap, searchQuery, filterCategory, filterStatus, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterStatus, itemsPerPage]);

  const paginatedRounds = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return enrichedRounds.slice(startIndex, startIndex + itemsPerPage);
  }, [enrichedRounds, currentPage, itemsPerPage]);

  useEffect(() => {
    const allExpandableIds = new Set(enrichedRounds.filter(item => item.enrichedVariantGroups.length > 1).map(item => item.uniqueId));
    setExpandedRoundIds(allExpandableIds);
  }, [enrichedRounds]);

  const handleSortChange = (key: SortableKeys) => {
    setSortConfig(prev => ({ 
      key, 
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' 
    }));
  };

  const handleStockEditStart = (vgUniqueId: string, currentStock: number) => {
    setEditingStockId(vgUniqueId);
    setStockInputs(prev => ({...prev, [vgUniqueId]: currentStock === -1 ? '-1' : String(currentStock) }));
  };

  const handleStockEditSave = async (vgUniqueId: string) => {
    const newStockValue = stockInputs[vgUniqueId];
    setEditingStockId(null); 
    if (newStockValue === undefined) return;

    const [productId, roundId, variantGroupId] = vgUniqueId.split('_');
    const newStock = parseInt(newStockValue, 10);

    if (isNaN(newStock) || (newStock < 0 && newStock !== -1)) {
      toast.error("재고는 0 이상의 숫자 또는 -1(무제한)만 입력 가능합니다.");
      return;
    }

    const promise = updateMultipleVariantGroupStocks([{ productId, roundId, variantGroupId, newStock }]);
    await toast.promise(promise, {
      loading: "재고 정보 업데이트 중...",
      success: "재고가 성공적으로 업데이트되었습니다!",
      error: "업데이트 중 오류가 발생했습니다.",
    });

    fetchData();
  };
  
  const toggleRowExpansion = (roundId: string) => {
    setExpandedRoundIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roundId)) newSet.delete(roundId);
      else newSet.add(roundId);
      return newSet;
    });
  };

  const handleSelectionChange = (id: string, isSelected: boolean) => {
    setSelectedItems(prev => {
        const newSet = new Set(prev);
        if (isSelected) newSet.add(id);
        else newSet.delete(id);
        return newSet;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
        setSelectedItems(new Set(enrichedRounds.map(item => item.uniqueId)));
    } else {
        setSelectedItems(new Set());
    }
  };

  const handleBulkAction = async () => {
    if (selectedItems.size === 0) {
      toast.error("선택된 항목이 없습니다.");
      return;
    }

    const updates = Array.from(selectedItems).map(id => {
        const [productId, roundId] = id.split('_'); 
        return { productId, roundId, newStatus: 'ended' as SalesRoundStatus };
    });
    
    const promise = updateMultipleSalesRoundStatuses(updates);

    await toast.promise(promise, {
        loading: `${selectedItems.size}개 항목의 판매를 종료하는 중...`,
        success: "선택된 항목이 모두 판매 종료 처리되었습니다.",
        error: "일괄 작업 중 오류가 발생했습니다."
    });

    setSelectedItems(new Set()); 
    fetchData(); 
  };

  const handleOpenWaitlistModal = (productId: string, roundId: string, variantGroupId: string, productName: string, roundName: string) => {
    setCurrentWaitlistData({ productId, roundId, variantGroupId, productName, roundName });
    setIsWaitlistModalOpen(true);
  };

  const handleCloseWaitlistModal = () => {
    setIsWaitlistModalOpen(false);
    setCurrentWaitlistData(null);
  };

  const handleWaitlistSuccess = () => {
    fetchData();
  };

  const isAllSelected = enrichedRounds.length > 0 && selectedItems.size === enrichedRounds.length;
  
  if (loading) return <SodamallLoader />;

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
                    <div className="control-group">
                        <Filter size={16} />
                        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="control-select"><option value="all">모든 카테고리</option>{categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select>
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="control-select"><option value="all">모든 상태</option><option value="selling">판매중</option><option value="scheduled">판매예정</option><option value="sold_out">품절</option><option value="ended">판매종료</option></select>
                    </div>
                </div>
                <div className="bulk-action-wrapper"><button className="bulk-action-button" onClick={handleBulkAction} disabled={selectedItems.size === 0}><Trash2 size={16} /> 선택 항목 판매 종료</button></div>
            </div>
            <div className="admin-product-table-container">
              <table className="admin-product-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} title="전체 선택/해제"/></th>
                    <th>No.</th>
                    <th className="sortable-header" onClick={() => handleSortChange('roundCreatedAt')}>등록일 {sortConfig.key === 'roundCreatedAt' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th className="sortable-header" onClick={() => handleSortChange('category')}>카테고리 {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th>보관</th>
                    <th className="sortable-header" onClick={() => handleSortChange('productName')}>상품명 / 회차명 {sortConfig.key === 'productName' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th>상태</th>
                    <th>가격</th>
                    <th className="sortable-header" onClick={() => handleSortChange('expirationDate')}>유통기한 {sortConfig.key === 'expirationDate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                    <th title="예약된 수량 / 전체 대기자 수">예약/대기</th>
                    <th title="픽업 완료된 수량">픽업</th>
                    <th title="클릭하여 재고 수정">재고</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRounds.length > 0 ? (
                    paginatedRounds.map((item, index) => (
                      <ProductAdminRow 
                        key={item.uniqueId}
                        item={item}
                        index={(currentPage - 1) * itemsPerPage + index}
                        isExpanded={expandedRoundIds.has(item.uniqueId)}
                        isSelected={selectedItems.has(item.uniqueId)}
                        editingStockId={editingStockId}
                        stockInputs={stockInputs}
                        onToggleExpansion={toggleRowExpansion}
                        onSelectionChange={handleSelectionChange}
                        onStockEditStart={handleStockEditStart}
                        onStockEditSave={handleStockEditSave}
                        onSetStockInputs={setStockInputs}
                        onOpenWaitlistModal={handleOpenWaitlistModal}
                      />
                    ))
                  ) : (
                    <tr><td colSpan={13} className="no-products-cell">표시할 판매 회차가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
                currentPage={currentPage}
                totalPages={Math.ceil(enrichedRounds.length / itemsPerPage)}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={(e) => setItemsPerPage(Number(e.target.value))}
                totalItems={enrichedRounds.length}
            />
          </>
        ) : (
          <div className="placeholder-container">
              <h3>수익 분석 (준비중)</h3>
              <p>이곳에서 상품별 원가, 판매가, 예약 수량을 기반으로 한 수익 및 수익률 분석 데이터를 볼 수 있습니다.</p>
              <p>상품 데이터에 '원가(cost)' 필드를 추가하는 작업이 선행되어야 합니다.</p>
          </div>
        )}
      </div>

      <WaitlistModal 
        isOpen={isWaitlistModalOpen} 
        onClose={handleCloseWaitlistModal} 
        data={currentWaitlistData}
        onSuccess={handleWaitlistSuccess}
      />
    </div>
  );
};

export default ProductListPageAdmin;