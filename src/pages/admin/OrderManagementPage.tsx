// src/pages/admin/OrderManagementPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import toast from 'react-hot-toast';
import {
    getAllOrdersForAdmin,
    deleteOrder,
    updateOrderNotes,
    toggleOrderBookmark,
    updateOrderStatusAndLoyalty
} from '../../firebase';
import type { Order, OrderStatus } from '../../types';
import { Timestamp } from 'firebase/firestore';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Filter, Search, Trash2, Star, ArrowUpDown, DollarSign, Clock, PackageCheck, UserX, PackageX, AlertTriangle, BadgeCheck } from 'lucide-react';
import './OrderManagementPage.css';

// --- Helper Functions ---
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
    COMPLETED: { label: '처리 완료', icon: <PackageCheck size={14} />, className: 'status-completed', sortOrder: 5 }, // Legacy or manual
};

const getDisplayStatusInfo = (order: Order) => {
    const now = new Date();
    // 늦은 픽업: 픽업 완료 상태이고, 픽업 시간이 마감일보다 늦었을 때
    if (order.status === 'PICKED_UP' && order.pickedUpAt && order.pickupDeadlineDate && order.pickedUpAt.toDate() > order.pickupDeadlineDate.toDate()) {
        return {
            ...ORDER_STATUS_CONFIG.PICKED_UP,
            badge: <span className="status-extra-badge late-pickup"><BadgeCheck size={12} /> 늦은 픽업</span>
        };
    }
    // 미수령(노쇼) 상태: DB상태가 예약/선입금이고, 픽업 마감일이 지났을 때
    if ((order.status === 'RESERVED' || order.status === 'PREPAID') && order.pickupDeadlineDate && order.pickupDeadlineDate.toDate() < now) {
        return {
           ...ORDER_STATUS_CONFIG.NO_SHOW,
            badge: <span className="status-extra-badge no-show-pending"><AlertTriangle size={12} /> 미수령</span>
        };
    }
    return { ...ORDER_STATUS_CONFIG[order.status], badge: null };
};


// --- Editable Notes Component ---
const EditableNote: React.FC<{ order: Order; onSave: (id: string, notes: string) => void }> = ({ order, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [note, setNote] = useState(order.notes || '');

    const handleSave = () => {
        if (note !== order.notes) {
            onSave(order.id, note);
        }
        setIsEditing(false);
    };

    return (
        <div className="notes-display" onClick={() => setIsEditing(true)}>
            {isEditing ? (
                <textarea
                    className="notes-textarea"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={handleSave}
                    autoFocus
                />
            ) : (
                order.notes || <span className="notes-placeholder">비고 입력...</span>
            )}
        </div>
    );
};


// --- Main Component ---
const OrderManagementPage: React.FC = () => {
    useDocumentTitle('주문 통합 관리');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: 'all', searchQuery: '', showBookmarkedOnly: false });
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            try {
                const fetchedOrders = await getAllOrdersForAdmin();
                setOrders(fetchedOrders);
            } catch (error) {
                console.error("Error fetching orders:", error);
                toast.error("주문 목록을 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);

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

        let pointChange = 0;
        let reason = '';
        let newPrepaidAt: Timestamp | null = null;
        
        if (newStatus === 'PREPAID' && order.status !== 'PREPAID') {
            newPrepaidAt = Timestamp.now();
        }

        const originalOrderState = { ...order };
        // Optimistic UI update - prepaidAt은 UI상에서만 임시로 반영
        const updatedOrder = { ...order, status: newStatus, prepaidAt: newPrepaidAt || order.prepaidAt };
        setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));

        const toastId = toast.loading(`${order.customerInfo.name}님의 주문 처리 중...`);
        try {
            // ❗ [수정] DB 함수 정의에 맞춰 5번째 인자(newPrepaidAt)를 제거하고 4개만 전달
            await updateOrderStatusAndLoyalty(order, newStatus, pointChange, reason);
            toast.success('성공적으로 처리되었습니다.', { id: toastId });
        } catch (error) {
            console.error("상태 변경 실패:", error);
            setOrders(prev => prev.map(o => o.id === order.id ? originalOrderState : o));
            toast.error('처리 중 오류가 발생했습니다.', { id: toastId });
        }
    }, []);

    const handleDeleteOrder = useCallback((orderId: string, customerName: string) => {
        toast((t) => (
            <div className="custom-toast-container">
                <p className="toast-message"><b>{customerName}</b>님의 주문을<br/>정말 삭제하시겠습니까?</p>
                <div className="toast-button-group">
                    <button
                        className="toast-button toast-button-cancel"
                        onClick={() => toast.dismiss(t.id)}
                    >
                        취소
                    </button>
                    <button
                        className="toast-button toast-button-confirm"
                        onClick={() => {
                            toast.dismiss(t.id);
                            const deleteAction = async () => await deleteOrder(orderId);
                            toast.promise(deleteAction(), {
                                loading: '주문 삭제 중...',
                                success: () => {
                                    setOrders(prev => prev.filter(o => o.id !== orderId));
                                    return '주문이 성공적으로 삭제되었습니다.';
                                },
                                error: (err: any) => {
                                    console.error("주문 삭제 오류:", err);
                                    return `주문 삭제에 실패했습니다.`;
                                },
                            });
                        }}
                    >
                        삭제
                    </button>
                </div>
            </div>
        ), { duration: 6000, position: 'top-center' });
    }, []);

    const handleSaveNote = useCallback(async (orderId: string, notes: string) => {
        const originalNotes = orders.find(o => o.id === orderId)?.notes || '';
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes } : o));
        try {
            await toast.promise(updateOrderNotes(orderId, notes), {
                loading: '메모 저장 중...',
                success: '메모가 저장되었습니다.',
                error: '메모 저장에 실패했습니다.'
            });
        } catch (error) {
            console.error("메모 저장 실패:", error);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: originalNotes } : o));
        }
    }, [orders]);

    const handleToggleBookmark = useCallback(async (order: Order) => {
        const newIsBookmarked = !order.isBookmarked;
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isBookmarked: newIsBookmarked } : o));
        try {
            await toggleOrderBookmark(order.id, newIsBookmarked)
        } catch (error) {
            console.error("북마크 업데이트 실패:", error);
            toast.error("북마크 변경에 실패했습니다.")
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isBookmarked: !newIsBookmarked } : o)); // Rollback
        }
    }, []);

    const filteredOrders = useMemo(() => {
        let filtered = orders.filter(order => {
            const statusMatch = filters.status === 'all' || order.status === filters.status;
            const searchMatch = filters.searchQuery === '' ||
                order.customerInfo.name.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
                (order.customerInfo.phone && order.customerInfo.phone.includes(filters.searchQuery));
            const bookmarkMatch = !filters.showBookmarkedOnly || order.isBookmarked;
            return statusMatch && searchMatch && bookmarkMatch;
        });

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;
                const { key, direction } = sortConfig;

                if (key === 'status') {
                    aValue = ORDER_STATUS_CONFIG[a.status]?.sortOrder ?? 99;
                    bValue = ORDER_STATUS_CONFIG[b.status]?.sortOrder ?? 99;
                } else if (key === 'customerInfo.name') {
                    aValue = a.customerInfo.name;
                    bValue = b.customerInfo.name;
                } else if (['createdAt', 'pickupDate', 'pickedUpAt', 'prepaidAt'].includes(key)) {
                    aValue = (a[key as keyof Order] as Timestamp)?.toMillis() || 0;
                    bValue = (b[key as keyof Order] as Timestamp)?.toMillis() || 0;
                } else {
                    aValue = a[key as keyof Order];
                    bValue = b[key as keyof Order];
                }

                if (aValue < bValue) return direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [orders, filters, sortConfig]);

    const renderOrderRow = (order: Order, index: number) => {
        const displayStatus = getDisplayStatusInfo(order);
        const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

        return (
            <tr key={order.id} className={order.isBookmarked ? 'bookmarked-row' : ''}>
                <td className="cell-center">{index}</td>
                <td>{formatTimestamp(order.createdAt)}</td>
                <td>{order.customerInfo.name}</td>
                <td><a href={`tel:${order.customerInfo.phone}`} className="phone-link">{order.customerInfo.phone}</a></td>
                <td title={order.items.map(i => `${i.productName} (${i.itemName})`).join(', ')}>
                    {order.items.map(item => `${item.productName} (${item.itemName})`).join(', ')}
                </td>
                <td className="cell-center">{totalQuantity}</td>
                <td className="price-cell">{formatCurrency(order.totalPrice)}</td>
                <td>{formatDateWithDay(order.pickupDate)}</td>
                <td>{formatTimestamp(order.pickedUpAt)}</td>
                <td>{formatTimestamp(order.prepaidAt)}</td>
                <td>
                    <div className="status-cell-content">
                        <select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order, e.target.value as OrderStatus)}
                            className={`status-select ${ORDER_STATUS_CONFIG[order.status].className}`}
                        >
                            {Object.entries(ORDER_STATUS_CONFIG).map(([statusKey, { label }]) => (
                                <option key={statusKey} value={statusKey}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        {displayStatus.badge}
                    </div>
                </td>
                <td><EditableNote order={order} onSave={handleSaveNote} /></td>
                <td className="action-cell">
                    <button onClick={() => handleToggleBookmark(order)} className={`action-button bookmark-button ${order.isBookmarked ? 'bookmarked' : ''}`} title="북마크">
                        <Star size={16} fill={order.isBookmarked ? 'currentColor' : 'none'}/>
                    </button>
                    <button onClick={() => handleDeleteOrder(order.id, order.customerInfo.name)} className="action-button delete-button" title="주문 삭제">
                        <Trash2 size={16} />
                    </button>
                </td>
            </tr>
        );
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="admin-page-container order-management-container">
            <header className="admin-page-header">
                <h1 className="admin-page-title">주문 통합 관리</h1>
            </header>

            <div className="list-controls-v3">
                <div className="search-bar-wrapper-v2">
                    <Search size={20} className="search-icon-v2" />
                    <input type="text" name="searchQuery" placeholder="고객명 또는 전화번호로 검색..." value={filters.searchQuery} onChange={handleFilterChange} className="search-input-v2" />
                </div>
                <div className="filter-sort-wrapper">
                    <div className="control-group-v2">
                        <Filter size={16} />
                        <select name="status" value={filters.status} onChange={handleFilterChange} className="control-select-v2">
                            <option value="all">모든 상태</option>
                            {Object.entries(ORDER_STATUS_CONFIG).map(([status, { label }]) => (
                                <option key={status} value={status}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <label className="bookmark-filter-label">
                        <input type="checkbox" name="showBookmarkedOnly" checked={filters.showBookmarkedOnly} onChange={handleFilterChange} />
                        <Star size={14} className="bookmark-icon-label" fill={filters.showBookmarkedOnly ? 'currentColor' : 'none'}/>
                        북마크만
                    </label>
                </div>
            </div>

            <div className="admin-table-container">
                <table className="admin-table excel-style">
                    <thead>
                        <tr>
                            <th className="cell-center" style={{ width: 'var(--table-col-번호-width)' }}>번호</th>
                            <th style={{ width: 'var(--table-col-주문일시-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('createdAt')}>
                                    <span>주문일시</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-고객명-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('customerInfo.name')}>
                                    <span>고객명</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-전화번호-width)' }}>전화번호</th>
                            <th style={{ width: 'var(--table-col-품목-width)' }}>품목</th>
                            <th className="cell-center" style={{ width: 'var(--table-col-수량-width)' }}>수량</th>
                            <th style={{ width: 'var(--table-col-합계-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('totalPrice')}>
                                    <span>합계</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-픽업일-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('pickupDate')}>
                                    <span>픽업일</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-완료시각-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('pickedUpAt')}>
                                    <span>완료시각</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-선입금-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('prepaidAt')}>
                                    <span>선입금 처리</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-상태-width)' }}>
                                <div className="sortable-header" onClick={() => handleSort('status')}>
                                    <span>상태</span><ArrowUpDown size={12} />
                                </div>
                            </th>
                            <th style={{ width: 'var(--table-col-비고-width)' }}>비고</th>
                            <th className="cell-center" style={{ width: 'var(--table-col-관리-width)' }}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length > 0
                            ? filteredOrders.map((order, index) => renderOrderRow(order, index + 1))
                            : <tr><td colSpan={13} className="no-results-cell">표시할 주문이 없습니다.</td></tr>
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OrderManagementPage;
