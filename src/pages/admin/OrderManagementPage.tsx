// src/pages/admin/OrderManagementPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import toast from 'react-hot-toast';
import {
    getAllOrdersForAdmin,
    deleteOrder,
    updateOrderNotes,
    toggleOrderBookmark,
    updateMultipleOrderStatuses // ✅ [수정] updateOrderStatusAndLoyalty -> updateMultipleOrderStatuses
} from '../../firebase';
import type { Order, OrderItem, OrderStatus } from '../../types';
import { Timestamp } from 'firebase/firestore';
import SodamallLoader from '@/components/common/SodamallLoader';
import { Filter, Search, Trash2, Star, ArrowUpDown, DollarSign, Clock, PackageCheck, UserX, PackageX, AlertTriangle, BadgeCheck, Zap, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './OrderManagementPage.css';

// --- 타입 정의 ---
interface FlattenedOrderRow {
    orderId: string;
    isBookmarked: boolean;
    createdAt: Timestamp | null;
    customerName: string;
    customerPhone: string | null;
    itemName: string;
    quantity: number;
    displayQuantity: string;
    subTotal: number;
    pickupDate: Timestamp | null;
    pickedUpAt: Timestamp | null;
    prepaidAt: Timestamp | null;
    status: OrderStatus;
    notes: string;
    originalOrder: Order;
    uniqueRowKey: string;
}

// --- Helper Functions ---
const formatPhoneLast4 = (phone?: string | null): string => {
    if (!phone || phone.length < 4) return '-';
    return phone.slice(-4);
};

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '-';
  const date = timestamp.toDate();
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
};

const formatDateWithDay = (timestamp: any): string => {
  if (!timestamp || !timestamp.toDate) return '-';
  const date = timestamp.toDate();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${month}/${day} (${dayOfWeek})`;
};

const formatCurrency = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`;

// --- Status Configuration ---
const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; className: string; sortOrder: number }> = {
    PICKED_UP: { label: '픽업 완료', icon: <PackageCheck size={14} />, className: 'status-picked-up', sortOrder: 0 },
    PREPAID: { label: '선입금', icon: <DollarSign size={14} />, className: 'status-prepaid', sortOrder: 1 },
    CANCELED: { label: '예약 취소', icon: <PackageX size={14} />, className: 'status-canceled', sortOrder: 2 },
    RESERVED: { label: '예약 확정', icon: <Clock size={14} />, className: 'status-reserved', sortOrder: 3 },
    NO_SHOW: { label: '노쇼', icon: <UserX size={14} />, className: 'status-no-show', sortOrder: 4 },
    COMPLETED: { label: '처리 완료', icon: <PackageCheck size={14} />, className: 'status-completed', sortOrder: 5 },
};

const getDisplayStatusInfo = (order: Order) => {
    const now = new Date();
    if (order.status === 'PICKED_UP' && order.pickedUpAt && order.pickupDeadlineDate && order.pickedUpAt instanceof Timestamp && order.pickupDeadlineDate instanceof Timestamp && order.pickedUpAt.toDate() > order.pickupDeadlineDate.toDate()) {
        return { ...ORDER_STATUS_CONFIG.PICKED_UP, badge: <span className="status-extra-badge late-pickup"><BadgeCheck size={12} /> 늦은 픽업</span> };
    }
    if ((order.status === 'RESERVED' || order.status === 'PREPAID') && order.pickupDeadlineDate && order.pickupDeadlineDate instanceof Timestamp && order.pickupDeadlineDate.toDate() < now) {
        return { ...ORDER_STATUS_CONFIG.NO_SHOW, badge: <span className="status-extra-badge no-show-pending"><AlertTriangle size={12} /> 미수령</span> };
    }
    return { ...ORDER_STATUS_CONFIG[order.status], badge: null };
};

// --- Editable Notes Component ---
const EditableNote: React.FC<{ order: Order; onSave: (id: string, notes: string) => void }> = ({ order, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [note, setNote] = useState(order.notes || '');

    const handleSave = () => {
        if (note !== order.notes) { onSave(order.id, note); }
        setIsEditing(false);
    };

    return (
        <div className="notes-display" onClick={() => setIsEditing(true)}>
            {isEditing ? (
                <textarea className="notes-textarea" value={note} onChange={(e) => setNote(e.target.value)} onBlur={handleSave} autoFocus />
            ) : (
                order.notes || <span className="notes-placeholder">비고 입력...</span>
            )}
        </div>
    );
};

// --- Table Row Component ---
interface OrderTableRowProps {
    row: FlattenedOrderRow;
    index: number;
    onStatusChange: (order: Order, newStatus: OrderStatus) => void;
    onSaveNote: (orderId: string, notes: string) => void;
    onToggleBookmark: (order: Order) => void;
    onDeleteOrder: (orderId: string, customerName: string) => void;
}

const OrderTableRow = React.memo(({ row, index, onStatusChange, onSaveNote, onToggleBookmark, onDeleteOrder }: OrderTableRowProps) => {
    return (
        <tr key={row.uniqueRowKey} className={row.isBookmarked ? 'bookmarked-row' : ''}>
            <td className="cell-center">{index + 1}</td>
            <td>{formatTimestamp(row.createdAt)}</td>
            <td>{row.customerName}</td>
            <td className="cell-center">{formatPhoneLast4(row.customerPhone)}</td>
            <td title={row.itemName}>{row.itemName}</td>
            <td className="cell-center">{row.displayQuantity}</td>
            <td className="price-cell">{formatCurrency(row.subTotal)}</td>
            <td>{formatDateWithDay(row.pickupDate)}</td>
            <td>{formatTimestamp(row.pickedUpAt)}</td>
            <td>{formatTimestamp(row.prepaidAt)}</td>
            <td>
                <div className="status-cell-content">
                    <select
                        value={row.status}
                        onChange={(e) => onStatusChange(row.originalOrder, e.target.value as OrderStatus)}
                        className={`status-select ${ORDER_STATUS_CONFIG[row.status].className}`}
                    >
                        {Object.entries(ORDER_STATUS_CONFIG).map(([statusKey, { label }]) => (
                            <option key={statusKey} value={statusKey}>{label}</option>
                        ))}
                    </select>
                    {getDisplayStatusInfo(row.originalOrder).badge}
                </div>
            </td>
            <td><EditableNote order={row.originalOrder} onSave={onSaveNote} /></td>
            <td className="action-cell cell-center">
                <button
                    onClick={() => onToggleBookmark(row.originalOrder)}
                    className={`action-button bookmark-button ${row.isBookmarked ? 'bookmarked' : ''}`}
                    title="북마크"
                >
                    <Star size={16} fill={row.isBookmarked ? 'currentColor' : 'none'}/>
                </button>
            </td>
            <td className="action-cell cell-center">
                <button
                    onClick={() => onDeleteOrder(row.originalOrder.id, row.customerName)}
                    className="action-button delete-button"
                    title="예약 삭제"
                >
                    <Trash2 size={16} />
                </button>
            </td>
        </tr>
    );
});


// --- ✅ [개선] 페이지네이션 컴포넌트 ---
interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
    onItemsPerPageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    totalItems: number;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    itemsPerPage,
    onItemsPerPageChange,
    totalItems,
}) => {
    
    if (totalItems === 0) return null;

    const getPageNumbers = () => {
        const pageNumbers: (number | string)[] = [];
        const maxPagesToShow = 10;
        const pageBuffer = Math.floor((maxPagesToShow - 2) / 2);

        if (totalPages <= maxPagesToShow) {
            for (let i = 1; i <= totalPages; i++) {
                pageNumbers.push(i);
            }
        } else {
            pageNumbers.push(1);
            if (currentPage > pageBuffer + 2) {
                pageNumbers.push('...');
            }

            let start = Math.max(2, currentPage - pageBuffer);
            let end = Math.min(totalPages - 1, currentPage + pageBuffer);

            if (currentPage < pageBuffer + 2) {
                end = maxPagesToShow - 2;
            }
            if (currentPage > totalPages - (pageBuffer + 1)) {
                start = totalPages - (maxPagesToShow - 3);
            }

            for (let i = start; i <= end; i++) {
                pageNumbers.push(i);
            }

            if (currentPage < totalPages - (pageBuffer + 1)) {
                pageNumbers.push('...');
            }
            pageNumbers.push(totalPages);
        }
        return pageNumbers;
    };
    
    const pageNumbers = getPageNumbers();

    return (
        <div className="pagination-container">
            <div className="pagination-left">
                <div className="items-per-page-selector">
                    <label htmlFor="itemsPerPage">표시 개수:</label>
                    <select id="itemsPerPage" value={itemsPerPage} onChange={onItemsPerPageChange}>
                        <option value={20}>20개</option>
                        <option value={50}>50개</option>
                        <option value={100}>100개</option>
                    </select>
                </div>
            </div>

            <div className="pagination-center">
                <button onClick={() => onPageChange(1)} disabled={currentPage === 1} title="첫 페이지">
                    <ChevronsLeft size={16} />
                </button>
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} title="이전 페이지">
                    이전
                </button>
                {pageNumbers.map((page, index) =>
                    typeof page === 'number' ? (
                        <button
                            key={index}
                            onClick={() => onPageChange(page)}
                            className={currentPage === page ? 'active' : ''}
                        >
                            {page}
                        </button>
                    ) : (
                        <span key={index} className="pagination-ellipsis">
                            {page}
                        </span>
                    )
                )}
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} title="다음 페이지">
                    다음
                </button>
                <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} title="마지막 페이지">
                    <ChevronsRight size={16} />
                </button>
            </div>

            <div className="pagination-right">
                <span className="total-items-display">총 {totalItems}건</span>
            </div>
        </div>
    );
};


// --- Main Component ---
const OrderManagementPage: React.FC = () => {
    useDocumentTitle('예약 통합 관리');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: 'all', searchQuery: '', showBookmarkedOnly: false });
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            try {
                const fetchedOrders = await getAllOrdersForAdmin();
                setOrders(fetchedOrders);
            } catch (error) {
                toast.error("예약 목록을 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);
    
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, itemsPerPage]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFilters(prev => ({ ...prev, [name]: checked }));
        } else {
            setFilters(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleStatusChange = useCallback(async (order: Order, newStatus: OrderStatus) => {
        if (order.status === newStatus) return;
        
        const originalOrderState = { ...order };
        const updatedOrder = { ...order, status: newStatus };
        setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
        
        const toastId = toast.loading(`${order.customerInfo.name}님의 주문 처리 중...`);
        try {
            // ✅ [수정] 옛날 함수 호출을 새 함수 호출로 변경
            await updateMultipleOrderStatuses([order.id], newStatus);
            
            toast.success('성공적으로 처리되었습니다.', { id: toastId });
        } catch (error) {
            setOrders(prev => prev.map(o => o.id === order.id ? originalOrderState : o));
            toast.error('처리 중 오류가 발생했습니다.', { id: toastId });
        }
    }, []);

    const handleDeleteOrder = useCallback((orderId: string, customerName: string) => {
        toast((t) => (
            <div className="custom-toast-container">
                <p className="toast-message"><b>{customerName}</b>님의 예약을<br/>정말 삭제하시겠습니까?</p>
                <div className="toast-button-group">
                    <button className="toast-button toast-button-cancel" onClick={() => toast.dismiss(t.id)}>취소</button>
                    <button
                        className="toast-button toast-button-confirm"
                        onClick={() => {
                            toast.dismiss(t.id);
                            const deleteAction = async () => await deleteOrder(orderId);
                            toast.promise(deleteAction(), {
                                loading: '예약 삭제 중...',
                                success: () => {
                                    setOrders(prev => prev.filter(o => o.id !== orderId));
                                    return '예약이 성공적으로 삭제되었습니다.';
                                },
                                error: () => `예약 삭제에 실패했습니다.`,
                            });
                        }}
                    >삭제</button>
                </div>
            </div>
        ), { duration: 6000, position: 'top-center' });
    }, []);

    const handleSaveNote = useCallback(async (orderId: string, notes: string) => {
        const originalNotes = orders.find(o => o.id === orderId)?.notes || '';
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes } : o));
        try {
            await toast.promise(updateOrderNotes(orderId, notes), { loading: '메모 저장 중...', success: '메모가 저장되었습니다.', error: '메모 저장에 실패했습니다.' });
        } catch (error) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: originalNotes } : o));
        }
    }, [orders]);

    const handleToggleBookmark = useCallback(async (order: Order) => {
        const newIsBookmarked = !order.isBookmarked;
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isBookmarked: newIsBookmarked } : o));
        try {
            await toggleOrderBookmark(order.id, newIsBookmarked)
        } catch (error) {
            toast.error("북마크 변경에 실패했습니다.")
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isBookmarked: !newIsBookmarked } : o));
        }
    }, []);

    const filteredAndSortedRows = useMemo(() => {
        const filtered = orders.filter(order => {
            const statusMatch = filters.status === 'all' || order.status === filters.status;
            const searchMatch = filters.searchQuery === '' ||
                order.customerInfo.name.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
                (order.customerInfo.phone && order.customerInfo.phone.includes(filters.searchQuery)) ||
                (order.items || []).some(item =>
                    (item.productName && item.productName.toLowerCase().includes(filters.searchQuery.toLowerCase())) ||
                    (item.itemName && item.itemName.toLowerCase().includes(filters.searchQuery.toLowerCase())) ||
                    (item.variantGroupName && item.variantGroupName.toLowerCase().includes(filters.searchQuery.toLowerCase()))
                );
            const bookmarkMatch = !filters.showBookmarkedOnly || order.isBookmarked;
            return statusMatch && searchMatch && bookmarkMatch;
        });

        const flattened: FlattenedOrderRow[] = [];
        filtered.forEach(order => {
            (order.items || []).forEach((item: OrderItem, itemIndex: number) => {
                let displayName = item.productName || '';
                if (item.variantGroupName && item.variantGroupName !== item.productName) {
                    displayName += ` - ${item.variantGroupName}`;
                }
                if (item.itemName) {
                    displayName += ` (${item.itemName})`;
                }

                let displayQuantity = `${item.quantity}`;
                const deductionAmount = item.stockDeductionAmount || 1;
                if (deductionAmount > 1) {
                    const totalUnits = item.quantity * deductionAmount;
                    displayQuantity = `${item.quantity}(${totalUnits})`;
                }

                flattened.push({
                    orderId: order.id,
                    isBookmarked: order.isBookmarked || false,
                    createdAt: order.createdAt instanceof Timestamp ? order.createdAt : null,
                    customerName: order.customerInfo.name,
                    customerPhone: order.customerInfo.phone || null,
                    itemName: displayName.trim(),
                    quantity: item.quantity,
                    displayQuantity,
                    subTotal: item.unitPrice * item.quantity,
                    pickupDate: order.pickupDate instanceof Timestamp ? order.pickupDate : null,
                    pickedUpAt: order.pickedUpAt instanceof Timestamp ? order.pickedUpAt : null,
                    prepaidAt: order.prepaidAt instanceof Timestamp ? order.prepaidAt : null,
                    status: order.status,
                    notes: order.notes || '',
                    originalOrder: order,
                    uniqueRowKey: `${order.id}-${item.itemId || itemIndex}`
                });
            });
        });

        if (sortConfig !== null) {
            flattened.sort((a, b) => {
                let aValue: any, bValue: any;
                const { key, direction } = sortConfig;
                if (key === 'status') { aValue = ORDER_STATUS_CONFIG[a.status]?.sortOrder ?? 99; bValue = ORDER_STATUS_CONFIG[b.status]?.sortOrder ?? 99; }
                else if (key === 'customerName') { aValue = a.customerName; bValue = b.customerName; }
                else if (['createdAt', 'pickupDate', 'pickedUpAt', 'prepaidAt'].includes(key)) { aValue = (a[key as keyof FlattenedOrderRow] as Timestamp)?.toMillis() || 0; bValue = (b[key as keyof FlattenedOrderRow] as Timestamp)?.toMillis() || 0; }
                else { aValue = a[key as keyof FlattenedOrderRow]; bValue = b[key as keyof FlattenedOrderRow]; }
                if (aValue < bValue) return direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return flattened;
    }, [orders, filters, sortConfig]);

    const paginatedRows = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredAndSortedRows.slice(startIndex, endIndex);
    }, [filteredAndSortedRows, currentPage, itemsPerPage]);


    if (loading) return <SodamallLoader message="예약 목록을 불러오는 중..." />;

    return (
        <div className="admin-page-container order-management-container">
            <header className="admin-page-header">
                <h1 className="admin-page-title">예약 통합 관리</h1>
                <button className="quick-check-button">
                    <Zap size={16} />
                    빠른 예약확인
                </button>
            </header>
            <div className="list-controls-v3">
                <div className="search-bar-wrapper-v2">
                    <Search size={20} className="search-icon-v2" />
                    <input type="text" name="searchQuery" placeholder="고객명, 전화번호, 품목으로 검색..." value={filters.searchQuery} onChange={handleFilterChange} className="search-input-v2" />
                </div>
                <div className="filter-sort-wrapper">
                    <div className="control-group-v2">
                        <Filter size={16} />
                        <select name="status" value={filters.status} onChange={handleFilterChange} className="control-select-v2">
                            <option value="all">모든 상태</option>
                            {Object.entries(ORDER_STATUS_CONFIG).map(([status, { label }]) => ( <option key={status} value={status}>{label}</option> ))}
                        </select>
                    </div>
                    <label className="bookmark-filter-label">
                        <input type="checkbox" name="showBookmarkedOnly" checked={filters.showBookmarkedOnly} onChange={handleFilterChange} />
                        <Star size={14} className="bookmark-icon-label" fill={filters.showBookmarkedOnly ? 'currentColor' : 'none'}/>북마크만
                    </label>
                </div>
            </div>
            <div className="admin-table-container">
                <table className="admin-table excel-style">
                    <thead>
                        <tr>
                            <th className="cell-center" style={{ width: 'var(--table-col-번호-width)' }}>No</th>
                            <th style={{ width: 'var(--table-col-주문일시-width)' }}><div className="sortable-header" onClick={() => handleSort('createdAt')}><span>예약일시</span><ArrowUpDown size={12} /></div></th>
                            <th style={{ width: 'var(--table-col-고객명-width)' }}><div className="sortable-header" onClick={() => handleSort('customerName')}><span>고객명</span><ArrowUpDown size={12} /></div></th>
                            <th className="cell-center" style={{ width: 'var(--table-col-전화번호-width)' }}>전화번호</th>
                            <th style={{ width: 'var(--table-col-품목-width)' }}>품목</th>
                            <th className="cell-center" style={{ width: 'var(--table-col-수량-width)' }}>수량</th>
                            <th style={{ width: 'var(--table-col-합계-width)' }}><div className="sortable-header" onClick={() => handleSort('subTotal')}><span>합계</span><ArrowUpDown size={12} /></div></th>
                            <th style={{ width: 'var(--table-col-픽업일-width)' }}><div className="sortable-header" onClick={() => handleSort('pickupDate')}><span>픽업일</span><ArrowUpDown size={12} /></div></th>
                            <th style={{ width: 'var(--table-col-완료시각-width)' }}><div className="sortable-header" onClick={() => handleSort('pickedUpAt')}><span>완료시각</span><ArrowUpDown size={12} /></div></th>
                            <th style={{ width: 'var(--table-col-선입금-width)' }}><div className="sortable-header" onClick={() => handleSort('prepaidAt')}><span>선입금 처리</span><ArrowUpDown size={12} /></div></th>
                            <th style={{ width: 'var(--table-col-상태-width)' }}><div className="sortable-header" onClick={() => handleSort('status')}><span>상태</span><ArrowUpDown size={12} /></div></th>
                            <th style={{ width: 'var(--table-col-비고-width)' }}>비고</th>
                            <th className="cell-center" style={{ width: 'var(--table-col-북마크-width)' }} title="북마크"><Star size={16} /></th>
                            <th className="cell-center" style={{ width: 'var(--table-col-삭제-width)' }} title="삭제"><Trash2 size={16} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedRows.length > 0 ? (
                            paginatedRows.map((row, index) => (
                                <OrderTableRow
                                    key={row.uniqueRowKey}
                                    row={row}
                                    index={(currentPage - 1) * itemsPerPage + index}
                                    onStatusChange={handleStatusChange}
                                    onSaveNote={handleSaveNote}
                                    onToggleBookmark={handleToggleBookmark}
                                    onDeleteOrder={handleDeleteOrder}
                                />
                            ))
                        ) : (
                            <tr><td colSpan={15} className="no-results-cell">표시할 예약이 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            <PaginationControls
                currentPage={currentPage}
                totalPages={Math.ceil(filteredAndSortedRows.length / itemsPerPage)}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={(e) => setItemsPerPage(Number(e.target.value))}
                totalItems={filteredAndSortedRows.length}
            />
        </div>
    );
};

export default OrderManagementPage;