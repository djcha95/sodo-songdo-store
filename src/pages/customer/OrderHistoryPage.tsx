// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getUserOrders, cancelOrder } from '@/firebase';
import { getUserWaitlist, cancelWaitlistEntry } from '@/firebase/productService';
import { applyWaitlistPriorityTicket } from '@/firebase/pointService';
import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderStatus, WaitlistInfo } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
  Package,
  ListOrdered,
  Truck,
  CircleCheck,
  AlertCircle,
  PackageCheck,
  PackageX,
  Hourglass,
  CreditCard,
  XCircle,
  Inbox,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import InlineSodamallLoader from '@/components/common/InlineSodamallLoader';
import './OrderHistoryPage.css';

// =================================================================
// 📌 타입 정의 (Type Definitions)
// =================================================================

interface AggregatedItem {
  id: string;
  productName: string;
  variantGroupName: string;
  itemName: string;
  totalQuantity: number;
  imageUrl: string;
  originalOrders: Order[];
  status: OrderStatus;
  wasPrepaymentRequired: boolean;
}

// =================================================================
// 📌 헬퍼 함수 및 공용 데이터 (Helper Functions & Shared Data)
// =================================================================

const showToast = (type: 'success' | 'error' | 'blank', message: string | React.ReactNode, duration: number = 4000) => {
  let toastFunction;
  switch (type) {
    case 'success': toastFunction = toast.success; break;
    case 'error': toastFunction = toast.error; break;
    case 'blank': toastFunction = toast; break;
    default: toastFunction = toast;
  }
  const toastId = toastFunction(message, { duration: Infinity, });
  setTimeout(() => { toast.dismiss(toastId); }, duration);
};


const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  return null;
};

const formatSimpleDate = (date: Date): string => {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[date.getDay()];
  return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
};

const formatPickupDateShort = (date: Date): string => {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
};

// =================================================================
// 📌 커스텀 훅 (Custom Hooks)
// =================================================================

const useUserOrders = (uid?: string) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const fetchedOrders = await getUserOrders(uid);
      setOrders(fetchedOrders);
    } catch (err) {
      console.error('예약 내역 로딩 오류:', err);
      showToast('error', '예약 내역을 불러오는 데 실패했습니다.');
    } finally { setLoading(false); }
  }, [uid]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  return { orders, loading, error, setOrders };
};

const useUserWaitlist = (uid?: string) => {
  const [waitlist, setWaitlist] = useState<WaitlistInfo[]>([]);
  const [loading, setLoading] = useState(true);
  
  const fetchWaitlist = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const fetchedWaitlist = await getUserWaitlist(uid);
      setWaitlist(fetchedWaitlist);
    } catch (err) {
      console.error('대기 목록 로딩 오류:', err);
      showToast('error', '대기 목록을 불러오는 데 실패했습니다.');
    } finally { setLoading(false); }
  }, [uid]);

  useEffect(() => { fetchWaitlist(); }, [fetchWaitlist]);
  return { waitlist, loading, setWaitlist, fetchWaitlist };
};


// =================================================================
// 📌 하위 컴포넌트 (Sub-components)
// =================================================================

const DateHeader: React.FC<{ date: Date }> = React.memo(({ date }) => (
  <h2 className="date-header">{formatSimpleDate(date)}</h2>
));

const EmptyHistory: React.FC<{ type?: 'order' | 'waitlist' }> = ({ type = 'order' }) => {
  const navigate = useNavigate();
  return (
    <div className="empty-history-container">
      {type === 'order' ? <Package size={48} className="empty-icon" /> : <Inbox size={48} className="empty-icon" />}
      <h3 className="empty-title">{type === 'order' ? '아직 예약 내역이 없어요' : '대기중인 상품이 없어요'}</h3>
      <p className="empty-description">{type === 'order' ? '마음에 드는 상품을 찾아 예약해보세요!' : '품절 상품에 대기 신청을 해보세요!'}</p>
      <button className="go-to-shop-btn" onClick={() => navigate('/')}>
        상품 보러 가기
      </button>
    </div>
  );
};

const AggregatedItemCard: React.FC<{
  item: AggregatedItem;
  displayDateInfo?: { type: 'pickup' | 'order'; date: Date };
  onCancel?: (order: Order) => void;
}> = React.memo(({ item, displayDateInfo, onCancel }) => {

  const { statusText, StatusIcon, statusClass } = useMemo(() => {
    if (item.wasPrepaymentRequired && item.status === 'RESERVED') {
      return {
        statusText: '선입금 필요',
        StatusIcon: <CreditCard size={14} />,
        statusClass: 'status-prepayment_required',
      };
    }
    
    const textMap: Record<OrderStatus, string> = {
      RESERVED: '예약 완료',
      PREPAID: '선입금 완료',
      PICKED_UP: '픽업 완료',
      COMPLETED: '처리 완료',
      CANCELED: '취소됨',
      NO_SHOW: '노쇼',
    };
    
    const iconMap: Record<OrderStatus, React.ReactElement> = {
      RESERVED: <Hourglass size={14} />,
      PREPAID: <PackageCheck size={14} />,
      PICKED_UP: <PackageCheck size={14} />,
      COMPLETED: <CircleCheck size={14} />,
      CANCELED: <PackageX size={14} />,
      NO_SHOW: <AlertCircle size={14} />,
    };

    return {
      statusText: textMap[item.status],
      StatusIcon: iconMap[item.status],
      statusClass: `status-${item.status.toLowerCase()}`
    }
  }, [item.status, item.wasPrepaymentRequired]);

  // ✨ [수정] 토요일 주문 취소 로직 추가
  const getCancellationInfo = useCallback(() => {
    const latestOrder = item.originalOrders[0];
    if (!latestOrder) return { cancellable: false };

    if (latestOrder.status !== 'RESERVED' && latestOrder.status !== 'PREPAID') {
        return { cancellable: false };
    }

    const now = new Date();
    const createdAt = safeToDate(latestOrder.createdAt);
    
    // 토요일 주문 특별 규칙
    if (createdAt && createdAt.getDay() === 6) { // 6 is Saturday
        const deadline = new Date(createdAt);
        deadline.setDate(deadline.getDate() + 2); // 다음 주 월요일로 설정
        deadline.setHours(13, 0, 0, 0); // 오후 1시로 설정
        return { cancellable: now < deadline, orderToCancel: latestOrder };
    }

    // 기본 규칙 (픽업 1시간 전)
    const pickupDate = safeToDate(latestOrder.pickupDate);
    if (pickupDate) {
        const deadline = new Date(pickupDate.getTime() - (60 * 60 * 1000)); // 픽업 1시간 전
        return { cancellable: now < deadline, orderToCancel: latestOrder };
    }

    // 위의 규칙에 해당하지 않으면 취소 불가
    return { cancellable: false };
  }, [item.originalOrders]);

  const { cancellable, orderToCancel } = getCancellationInfo();
  const HINT_TOAST_ID = 'cancel-hint-toast';
  const cancelHandlers = useLongPress(
    () => {
      toast.dismiss(HINT_TOAST_ID);
      if (cancellable && orderToCancel && onCancel) {
        onCancel(orderToCancel);
      }
    },
    () => {
      if (cancellable) {
        showToast('blank', '카드를 꾹 눌러서 취소할 수 있어요.', 4000);
      }
    },
    { delay: 500 }
  );

  let displayDateText = '';
  if (displayDateInfo?.date) {
    const formattedDate = formatPickupDateShort(displayDateInfo.date);
    displayDateText = displayDateInfo.type === 'pickup' ? `픽업 ${formattedDate}` : `주문 ${formattedDate}`;
  }

  return (
    <motion.div className={`order-card-v3 ${cancellable ? 'cancellable' : ''}`} layout {...(onCancel ? cancelHandlers : {})}>
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <img src={item.imageUrl} alt={item.productName} className="item-image" />
        </div>
        <div className="item-aggregated-info">
          <div className="info-top-row">
            <span className="product-name-top">{item.variantGroupName}</span>
            <span className={`status-badge ${statusClass}`}>
              {StatusIcon} {statusText}
            </span>
          </div>
          <div className="info-bottom-row">
            <span className="item-options-quantity">
              <span className="item-option-name">{item.itemName}</span>
              <span className="item-quantity">({item.totalQuantity}개)</span>
            </span>
            {displayDateText && <span className="date-info-badge">{displayDateText}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

const WaitlistItemCard: React.FC<{ 
  item: WaitlistInfo; 
  onCancel: (item: WaitlistInfo) => void;
  onUseTicket: (item: WaitlistInfo) => void;
  userPoints: number;
}> = React.memo(({ item, onCancel, onUseTicket, userPoints }) => {
  return (
    <motion.div className="waitlist-card" layout>
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <img src={item.imageUrl} alt={item.productName} className="item-image" />
        </div>
        <div className="item-aggregated-info">
          <span className="product-name-top">{item.productName}</span>
          <div className="info-bottom-row">
             <span className="item-options-quantity">
              <span className="item-option-name">{item.itemName}</span>
              <span className="item-quantity">({item.quantity}개)</span>
            </span>
          </div>
          <div className="waitlist-actions">
            {item.isPrioritized ? (
              <button className="priority-ticket-btn used" disabled>
                <CircleCheck size={16} /> 사용 완료
              </button>
            ) : (
              <button 
                className="priority-ticket-btn" 
                onClick={() => onUseTicket(item)}
                disabled={userPoints < 50}
                title={userPoints < 50 ? '포인트가 부족합니다 (50P 필요)' : '50포인트로 순서 올리기'}
              >
                <Zap size={16} /> 순서 올리기
              </button>
            )}
          </div>
        </div>
      </div>
      <button className="waitlist-cancel-btn" onClick={() => onCancel(item)}>
        <XCircle size={18} />
      </button>
    </motion.div>
  );
});

// =================================================================
// 📌 메인 컴포넌트 (Main Component)
// =================================================================

const OrderHistoryPage: React.FC = () => {
  const { user, userDocument } = useAuth();
  const { orders, loading: ordersLoading, error, setOrders } = useUserOrders(user?.uid);
  const { waitlist, loading: waitlistLoading, setWaitlist, fetchWaitlist } = useUserWaitlist(user?.uid);
  const [viewMode, setViewMode] = useState<'orders' | 'pickup' | 'waitlist'>('orders');

  const isProcessingCancel = useRef(false);
  const prevOrdersRef = useRef<Order[]>();

  useEffect(() => {
    return () => { toast.dismiss(); };
  }, []);

  useEffect(() => {
    const prevOrders = prevOrdersRef.current;
    if (prevOrders && prevOrders.length > 0 && orders.length > 0) {
      orders.forEach(currentOrder => {
        const prevOrder = prevOrders.find(p => p.id === currentOrder.id);
        if (prevOrder && prevOrder.status === 'RESERVED' && currentOrder.status === 'PREPAID') {
          const productName = currentOrder.items[0]?.productName || '주문하신 상품의';
          toast.success(`${productName} 선입금이 확인되어 예약이 확정됐습니다!`, {
            icon: '🎉',
            duration: 5000
          });
        }
      });
    }
    prevOrdersRef.current = orders;
  }, [orders]);


  const aggregateOrders = (groupBy: 'orderDate' | 'pickupDate'): { [date: string]: AggregatedItem[] } => {
    const aggregated: { [key: string]: AggregatedItem } = {};
    const filteredOrders = groupBy === 'pickupDate'
      ? orders.filter(o => (o.status === 'RESERVED' || o.status === 'PICKED_UP' || o.status === 'PREPAID') && o.pickupDate)
      : orders;

    filteredOrders.forEach(order => {
      const date = groupBy === 'orderDate' ? safeToDate(order.createdAt) : safeToDate(order.pickupDate);
      if (!date) return;
      const dateStr = date.toISOString().split('T')[0];

      order.items.forEach(item => {
        const key = `${dateStr}-${item.productId.trim()}-${item.variantGroupName.trim()}-${item.itemName.trim()}-${order.wasPrepaymentRequired}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            id: key, productName: item.productName, variantGroupName: item.variantGroupName,
            itemName: item.itemName, totalQuantity: 0, imageUrl: item.imageUrl,
            originalOrders: [], status: order.status, 
            wasPrepaymentRequired: order.wasPrepaymentRequired ?? false,
          };
        }
        aggregated[key].totalQuantity += item.quantity;
        aggregated[key].originalOrders.push(order);
      });
    });

    Object.values(aggregated).forEach(item => {
      const sortedOrders = [...item.originalOrders].sort((a,b) => safeToDate(b.createdAt)!.getTime() - safeToDate(a.createdAt)!.getTime());
      item.status = sortedOrders[0]?.status ?? 'RESERVED';
      item.originalOrders = sortedOrders;
    });

    const groupedByDate: { [date: string]: AggregatedItem[] } = {};
    Object.values(aggregated).forEach(item => {
      const firstOrder = item.originalOrders[0];
      if (!firstOrder) return;
      const date = groupBy === 'orderDate' ? safeToDate(firstOrder.createdAt) : safeToDate(firstOrder.pickupDate);
      if (!date) return;
      const dateStr = date.toISOString().split('T')[0];
      if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
      groupedByDate[dateStr].push(item);
    });

    return groupedByDate;
  };

  const aggregatedItemsByOrderDate = useMemo(() => aggregateOrders('orderDate'), [orders]);
  const aggregatedItemsByPickupDate = useMemo(() => aggregateOrders('pickupDate'), [orders]);

  const handleCancelOrder = useCallback(async (order: Order) => {
    if (isProcessingCancel.current) return;
    toast((t) => (
      <div className="confirmation-toast">
          <h4>예약 취소</h4>
          <p>예약을 취소하시겠습니까?</p>
          <div className="toast-buttons">
              <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>유지</button>
              <button
                  className="common-button button-danger button-medium"
                  onClick={async () => {
                      toast.dismiss(t.id);
                      isProcessingCancel.current = true;
                      const promise = cancelOrder(order);
                      toast.promise(promise, {
                        loading: '예약 취소 처리 중...',
                        success: () => {
                          setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELED' } : o)));
                          return '예약이 성공적으로 취소되었습니다.';
                        },
                        error: (err: any) => err?.message || '취소 중 오류가 발생했습니다.',
                      }).finally(() => { isProcessingCancel.current = false; });
                  }}
              >
                  취소 확정
              </button>
          </div>
      </div>
    ), { duration: Infinity, position: 'top-center', style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  }, [setOrders]);

  const handleCancelWaitlist = useCallback((item: WaitlistInfo) => {
    toast((t) => (
        <div className="confirmation-toast">
            <h4>대기 취소</h4>
            <p><strong>{item.itemName}</strong> ({item.quantity}개) 대기 신청을 취소하시겠습니까?</p>
            <div className="toast-buttons">
                <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>유지</button>
                <button
                    className="common-button button-danger button-medium"
                    onClick={() => {
                        toast.dismiss(t.id);
                        const promise = cancelWaitlistEntry(item.productId, item.roundId, user!.uid, item.itemId);
                        toast.promise(promise, {
                            loading: '대기 취소 처리 중...',
                            success: () => {
                                setWaitlist(prev => prev.filter(w => w.itemId !== item.itemId || w.roundId !== item.roundId));
                                return '대기 신청이 취소되었습니다.';
                            },
                            error: (err: any) => err.message || '대기 취소 중 오류가 발생했습니다.'
                        });
                    }}
                >
                    취소 확정
                </button>
            </div>
        </div>
    ), { duration: Infinity, position: 'top-center', style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  }, [user, setWaitlist]);
  
  const handleUsePriorityTicket = useCallback((item: WaitlistInfo) => {
    toast((t) => (
      <div className="confirmation-toast">
        <h4><Zap size={20} /> 순번 상승권 사용</h4>
        <p>50 포인트를 사용하여 이 상품의 대기 순번을 가장 앞으로 옮기시겠습니까?</p>

        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button
            className="common-button button-accent button-medium"
            onClick={() => {
              toast.dismiss(t.id);
              const promise = applyWaitlistPriorityTicket(user!.uid, item.productId, item.roundId, item.itemId);
              toast.promise(promise, {
                loading: '순번 상승권 사용 중...',
                success: () => {
                  fetchWaitlist();
                  return '순번 상승권이 적용되었습니다!';
                },
                error: (err: any) => err.message || '오류가 발생했습니다.',
              });
            }}
          >
            포인트 사용
          </button>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center', style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  }, [user, fetchWaitlist]);

  const renderContent = () => {
    if (ordersLoading || waitlistLoading) return (<div className="loading-spinner-container"><InlineSodamallLoader /></div>);
    if (error && !ordersLoading) return <div className="error-message">오류가 발생했습니다. 잠시 후 다시 시도해주세요.</div>;

    if (viewMode === 'waitlist') {
      if (waitlist.length === 0) return <EmptyHistory type="waitlist" />;
      return (
        <div className="waitlist-list">
          {waitlist.map(item => (
            <WaitlistItemCard 
              key={`${item.roundId}-${item.itemId}`} 
              item={item} 
              onCancel={handleCancelWaitlist}
              onUseTicket={handleUsePriorityTicket}
              userPoints={userDocument?.points || 0}
            />
          ))}
        </div>
      );
    }

    const currentViewData = viewMode === 'orders' ? aggregatedItemsByOrderDate : aggregatedItemsByPickupDate;
    const sortedDates = Object.keys(currentViewData).sort((a, b) => {
      const dateA = new Date(a).getTime(); const dateB = new Date(b).getTime();
      return viewMode === 'orders' ? dateB - dateA : dateA - dateB;
    });

    if (orders.length === 0) return <EmptyHistory type="order" />;
    if (sortedDates.length === 0) {
      return (<div className="info-message">{viewMode === 'orders' ? '주문 내역이 없습니다.' : '픽업 예정 또는 완료된 상품이 없습니다.'}</div>);
    }
    
    return (
      <div className={viewMode === 'orders' ? 'orders-list' : 'pickup-list'}>
        {sortedDates.map(dateStr => (
          <motion.div key={dateStr} layout>
            <DateHeader date={new Date(dateStr)} />
            <div className="order-cards-grid">
              {currentViewData[dateStr].map(item => {
                const dateInfo: { type: 'pickup' | 'order'; date: Date | null } = viewMode === 'orders'
                  ? { type: 'pickup', date: safeToDate(item.originalOrders[0]?.pickupDate) }
                  : { type: 'order', date: safeToDate(item.originalOrders[0]?.createdAt) };
                return (
                  <AggregatedItemCard
                    key={item.id} item={item}
                    displayDateInfo={dateInfo.date ? { type: dateInfo.type, date: dateInfo.date } : undefined}
                    onCancel={handleCancelOrder}
                  />
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <div className="customer-page-container">
      <div className="order-history-page">
        <div className="view-toggle-container">
          <button className={`toggle-btn ${viewMode === 'orders' ? 'active' : ''}`} onClick={() => setViewMode('orders')}>
            <ListOrdered size={18} /> 주문일순
          </button>
          <button className={`toggle-btn ${viewMode === 'pickup' ? 'active' : ''}`} onClick={() => setViewMode('pickup')}>
            <Truck size={18} /> 픽업일순
          </button>
          <button className={`toggle-btn ${viewMode === 'waitlist' ? 'active' : ''}`} onClick={() => setViewMode('waitlist')}>
            <Hourglass size={18} /> 대기목록
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

export default OrderHistoryPage;