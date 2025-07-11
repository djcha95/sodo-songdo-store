import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
    getAllOrdersForAdmin,
    updateOrderStatus,
    deleteOrder,
    updateOrderNotes,
    toggleOrderBookmark
} from '../../firebase';
import type { Order, OrderStatus, OrderItem } from '../../types';
import { Timestamp } from 'firebase/firestore';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Filter, Search, Trash2, Star, ArrowUpDown, Layers } from 'lucide-react';
import './OrderManagementPage.css';

// --- Helper Functions ---
const formatTimestamp = (timestamp: any): string => {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '-';
  return timestamp.toDate().toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(/\. /g, '.');
};

const formatPickupDate = (timestamp: any): string => {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '-';
    const date = timestamp.toDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} (${dayNames[date.getDay()]})`;
};

const formatCurrency = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`;

const summarizeOrderItems = (items: OrderItem[] = []): string => {
  if (items.length === 0) return '주문 상품 없음';
  const firstItemName = `${items[0].productName} [${items[0].itemName}]`;
  if (items.length > 1) {
    return `${firstItemName} 외 ${items.length - 1}건`;
  }
  return firstItemName;
};

const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
    { value: 'RESERVED', label: '예약 확정' },
    { value: 'PREPAID', label: '선입금' },
    { value: 'PICKED_UP', label: '픽업 완료' },
    { value: 'CANCELED', label: '주문 취소' },
    { value: 'NO_SHOW', label: '미수령(노쇼)' },
];

const STATUS_SORT_ORDER: Record<OrderStatus, number> = {
    PICKED_UP: 0,
    PREPAID: 1,
    NO_SHOW: 2,
    RESERVED: 3,
    CANCELED: 4,
    COMPLETED: 5,
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

    if (isEditing) {
        return (
            <textarea
                className="notes-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={handleSave}
                autoFocus
            />
        );
    }

    return (
        <div className="notes-display" onClick={() => setIsEditing(true)}>
            {order.notes || <span className="notes-placeholder">비고 입력...</span>}
        </div>
    );
};


const OrderManagementPage: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: 'all', searchQuery: '', showBookmarkedOnly: false });
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
    const [isGrouped, setIsGrouped] = useState(false);

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

    const handleStatusChange = useCallback(async (orderId: string, newStatus: OrderStatus) => {
        const originalOrders = [...orders];
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, pickedUpAt: newStatus === 'PICKED_UP' ? Timestamp.now() : o.pickedUpAt } : o));
        
        try {
            await toast.promise(updateOrderStatus(orderId, newStatus), {
                loading: '주문 상태 변경 중...',
                success: '주문 상태가 변경되었습니다.',
                error: '상태 변경에 실패했습니다.'
            });
        } catch (error) {
            setOrders(originalOrders);
        }
    }, [orders]);
    
    const handleDeleteOrder = useCallback((orderId: string, customerName: string) => {
        toast((t) => (
            <span>
                <b>{customerName}</b>님의 주문을 정말 삭제하시겠습니까?
                <div className="toast-buttons">
                    <button
                        className="toast-button-confirm"
                        onClick={() => {
                            toast.dismiss(t.id);
                            const deleteAction = async () => {
                                await deleteOrder(orderId);
                                setOrders(prev => prev.filter(o => o.id !== orderId));
                            };
                            toast.promise(deleteAction(), {
                                loading: '삭제 중...',
                                success: '주문이 삭제되었습니다.',
                                error: '삭제 중 오류가 발생했습니다.',
                            });
                        }}
                    >
                        삭제
                    </button>
                    <button className="toast-button-cancel" onClick={() => toast.dismiss(t.id)}>
                        취소
                    </button>
                </div>
            </span>
        ), { duration: 6000 });
    }, []);

    const handleSaveNote = useCallback(async (orderId: string, notes: string) => {
        const originalOrders = [...orders];
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes } : o));
        
        try {
            await toast.promise(updateOrderNotes(orderId, notes), {
                loading: '비고 저장 중...',
                success: '비고가 저장되었습니다.',
                error: '비고 저장에 실패했습니다.'
            });
        } catch (error) {
            setOrders(originalOrders);
        }
    }, [orders]);

    const handleToggleBookmark = useCallback(async (order: Order) => {
        const newIsBookmarked = !order.isBookmarked;
        const originalOrders = [...orders];
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isBookmarked: newIsBookmarked } : o));
        
        try {
            await toast.promise(toggleOrderBookmark(order.id, newIsBookmarked), {
                loading: '북마크 변경 중...',
                success: newIsBookmarked ? '북마크에 추가했습니다.' : '북마크에서 제거했습니다.',
                error: '북마크 변경에 실패했습니다.'
            });
        } catch (error) {
            setOrders(originalOrders);
        }
    }, [orders]);
    
    const processedData = useMemo(() => {
        let filtered = orders.filter(order => {
            const statusMatch = filters.status === 'all' || order.status === filters.status;
            const searchMatch = filters.searchQuery === '' ||
                order.customerInfo.name.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
                order.customerInfo.phone.includes(filters.searchQuery);
            const bookmarkMatch = !filters.showBookmarkedOnly || order.isBookmarked;
            return statusMatch && searchMatch && bookmarkMatch;
        });

        if (sortConfig !== null && !isGrouped) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'status') {
                    aValue = STATUS_SORT_ORDER[a.status] ?? 99;
                    bValue = STATUS_SORT_ORDER[b.status] ?? 99;
                } else if (sortConfig.key === 'customerInfo.name') {
                    aValue = a.customerInfo.name;
                    bValue = b.customerInfo.name;
                } else {
                    aValue = a[sortConfig.key as keyof Order];
                    bValue = b[sortConfig.key as keyof Order];
                }
                
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        if (isGrouped) {
            const grouped = filtered.reduce((acc, order) => {
                const pickupDateStr = formatPickupDate(order.pickupDate);
                if (!acc[pickupDateStr]) acc[pickupDateStr] = [];
                acc[pickupDateStr].push(order);
                return acc;
            }, {} as Record<string, Order[]>);

            Object.keys(grouped).forEach(date => {
                grouped[date].sort((a, b) => a.customerInfo.name.localeCompare(b.customerInfo.name));
            });
            
            return grouped;
        }

        return filtered;
    }, [orders, filters, sortConfig, isGrouped]);

    // ✅ 전화번호를 클릭 가능한 링크로 수정
    const renderOrderRow = (order: Order, index: number) => (
        <tr key={order.id} className={order.isBookmarked ? 'bookmarked-row' : ''}>
            <td>{index}</td>
            <td>{formatTimestamp(order.createdAt)}</td>
            <td>{order.customerInfo.name}</td>
            <td>
                <a href={`tel:${order.customerInfo.phone}`} className="phone-link">
                    {order.customerInfo.phone}
                </a>
            </td>
            <td title={order.items.map(i => `${i.productName} [${i.itemName}] x ${i.quantity}`).join('\n')}>
                {summarizeOrderItems(order.items)}
            </td>
            <td className="price-cell">{formatCurrency(order.totalPrice)}</td>
            <td>{formatPickupDate(order.pickupDate)}</td>
            <td>{order.pickedUpAt ? formatTimestamp(order.pickedUpAt) : '-'}</td>
            <td>
                <select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)} className={`status-select status-${order.status.toLowerCase()}`}>
                    {ORDER_STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
            </td>
            <td><EditableNote order={order} onSave={handleSaveNote} /></td>
            <td className="action-cell">
                <button onClick={() => handleToggleBookmark(order)} className={`action-button bookmark-button ${order.isBookmarked ? 'bookmarked' : ''}`} title="북마크">
                    <Star size={16} />
                </button>
            </td>
            <td className="action-cell">
                <button onClick={() => handleDeleteOrder(order.id, order.customerInfo.name)} className="action-button delete-button" title="주문 삭제">
                    <Trash2 size={16} />
                </button>
            </td>
        </tr>
    );

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
                            {ORDER_STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                        </select>
                    </div>
                    <label className="bookmark-filter-label">
                        <input type="checkbox" name="showBookmarkedOnly" checked={filters.showBookmarkedOnly} onChange={handleFilterChange} />
                        <Star size={14} className="bookmark-icon-label" />
                        북마크만
                    </label>
                    <button onClick={() => setIsGrouped(!isGrouped)} className={`group-toggle-button ${isGrouped ? 'active' : ''}`}>
                        <Layers size={14} />
                        픽업일별 묶기
                    </button>
                </div>
            </div>

            <div className="admin-table-container">
                <table className="admin-table excel-style">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>번호</th>
                            <th className="sortable-header" onClick={() => handleSort('createdAt')}>주문일시 <ArrowUpDown size={12} /></th>
                            <th className="sortable-header" onClick={() => handleSort('customerInfo.name')}>고객명 <ArrowUpDown size={12} /></th>
                            <th>전화번호</th>
                            <th>주문내역</th>
                            <th className="sortable-header" onClick={() => handleSort('totalPrice')}>결제금액 <ArrowUpDown size={12} /></th>
                            <th className="sortable-header" onClick={() => handleSort('pickupDate')}>픽업일 <ArrowUpDown size={12} /></th>
                            <th>완료시각</th>
                            <th className="sortable-header" onClick={() => handleSort('status')} style={{ width: '150px' }}>상태 <ArrowUpDown size={12} /></th>
                            <th style={{ minWidth: '200px' }}>비고</th>
                            <th style={{ width: '50px' }}>★</th>
                            <th style={{ width: '60px' }}>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isGrouped 
                            ? (() => {
                                let rowIndex = 0;
                                const sortedDates = Object.keys(processedData).sort((a, b) => new Date(a.split(' ')[0]).getTime() - new Date(b.split(' ')[0]).getTime());
                                
                                return sortedDates.flatMap(date => {
                                    const ordersInGroup = (processedData as Record<string, Order[]>)[date];
                                    return [
                                        <tr key={date} className="group-header-row">
                                            <td colSpan={12}>
                                                <div className="group-header-content">
                                                    {date}
                                                    <span className="group-count">{ordersInGroup.length}건</span>
                                                </div>
                                            </td>
                                        </tr>,
                                        ...ordersInGroup.map(order => renderOrderRow(order, ++rowIndex))
                                    ];
                                });
                            })()
                            : (processedData as Order[]).length > 0
                                ? (processedData as Order[]).map((order, index) => renderOrderRow(order, index + 1))
                                : <tr><td colSpan={12} className="no-results-cell">표시할 주문이 없습니다.</td></tr>
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OrderManagementPage;