// src/pages/customer/OrderHistoryPage.tsx
// ✅ [UX 개선] '길게 눌러 취소' 기능의 대기 시간을 2.5초에서 1.5초로 단축하여 반응성을 높였습니다.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cancelOrder } from '@/firebase';
import { cancelWaitlistEntry } from '@/firebase/productService';
import { applyWaitlistPriorityTicket } from '@/firebase/pointService';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderItem, OrderStatus, WaitlistInfo } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import {
  Package, ListOrdered, Truck, CircleCheck, AlertCircle, PackageCheck,
  PackageX, Hourglass, CreditCard, Inbox, Zap, Info,
} from 'lucide-react';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import { showToast, showPromiseToast, showCancelOrderToast, showCancelWaitlistToast, showUseTicketToast } from '@/utils/toastUtils';

import './OrderHistoryPage.css';

// =================================================================
// 📌 타입 정의 및 헬퍼 함수 (기존과 동일)
// =================================================================

interface AggregatedItem {
  id: string; 
  stableId: string;
  productId: string;
  productName: string;
  variantGroupName: string;
  itemName:string;
  totalQuantity: number;
  imageUrl: string;
  originalOrders: Order[];
  status: OrderStatus;
  wasPrepaymentRequired: boolean;
}

const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && (date.seconds !== undefined || date._seconds !== undefined)) {
      const seconds = date.seconds ?? date._seconds;
      const nanoseconds = date.nanoseconds ?? date._nanoseconds ?? 0;
      return new Timestamp(seconds, nanoseconds).toDate();
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
    const dayOfWeek = week[(date.getDay())];
    return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
};
  
const formatPickupDateShort = (date: Date): string => {
    const week = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = week[(date.getDay())];
    return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
};

const EMPTY_PAYLOAD = {};

// =================================================================
// 📌 커스텀 훅 (기존과 동일)
// =================================================================
const DATA_PER_PAGE = 10;

const usePaginatedData = <T,>(
  uid: string | undefined,
  fetchFn: (payload: any) => Promise<HttpsCallableResult<any>>,
  basePayload: object,
  isActive: boolean
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<any | null>(null);

  const stateRef = useRef({ loadingMore, hasMore, lastVisible });
  stateRef.current = { loadingMore, hasMore, lastVisible };

  const fetchData = useCallback(async (isInitial = false) => {
    if (!uid) {
      setLoading(false);
      return;
    }
    
    if (isInitial) {
      setLoading(true);
      setHasMore(true); 
      setLastVisible(null);
    } else {
      if (stateRef.current.loadingMore || !stateRef.current.hasMore) return;
      setLoadingMore(true);
    }
    
    try {
      const cursor = isInitial ? null : stateRef.current.lastVisible;
      const payload = { ...basePayload, pageSize: DATA_PER_PAGE, lastVisible: cursor };
      
      const result = await fetchFn(payload);
      const responsePayload = result.data;

      const newData = Array.isArray(responsePayload) ? responsePayload : (responsePayload as any)?.data;
      const lastDoc = Array.isArray(responsePayload) ? null : (responsePayload as any)?.lastDoc;

      if (!Array.isArray(newData)) {
        setHasMore(false);
        if (isInitial) setData([]);
      } else {
        setData(prev => isInitial ? newData : [...prev, ...newData]);
        setLastVisible(lastDoc);
        if (!lastDoc || (newData as any[]).length < DATA_PER_PAGE) {
          setHasMore(false);
        }
      }
    } catch (err: any) {
      console.error('데이터 로딩 오류:', err);
      showToast('error', err.message || '데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [uid, fetchFn, basePayload]);

  useEffect(() => {
    if (isActive) {
      fetchData(true);
    }
  }, [isActive, fetchData]);

  const loadMore = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  return { data, setData, loading: loading || loadingMore, hasMore, loadMore };
};


// =================================================================
// 📌 하위 컴포넌트
// =================================================================

const DateHeader: React.FC<{ date: Date }> = React.memo(({ date }) => (
  <h2 className="date-header">{formatSimpleDate(date)}</h2>
));

const EmptyHistory: React.FC<{ type?: 'order' | 'waitlist' | 'pickup' }> = React.memo(({ type = 'order' }) => {
  const navigate = useNavigate();
  const messages = {
    order: { icon: <Package size={48} className="empty-icon" />, title: '아직 예약 내역이 없어요', desc: '마음에 드는 상품을 찾아 예약해보세요!' },
    waitlist: { icon: <Inbox size={48} className="empty-icon" />, title: '대기중인 상품이 없어요', desc: '품절 상품에 대기 신청을 해보세요!' },
    pickup: { icon: <Truck size={48} className="empty-icon" />, title: '예정된 픽업이 없어요', desc: '다가올 픽업 예약이 여기에 표시됩니다.' },
  }
  const { icon, title, desc } = messages[type];
  
  return (
    <div className="empty-history-container">
      {icon}
      <h3 className="empty-title">{title}</h3>
      <p className="empty-description">{desc}</p>
      <button className="go-to-shop-btn" onClick={() => navigate('/')}>
        상품 보러 가기
      </button>
    </div>
  );
});

const AggregatedItemCard: React.FC<{
  item: AggregatedItem;
  displayDateInfo?: { type: 'pickup' | 'order'; date: Date };
  onCancel?: (order: Order) => void;
}> = React.memo(({ item, displayDateInfo, onCancel }) => {
  const navigate = useNavigate();
  
  const { statusText, StatusIcon, statusClass } = useMemo(() => {
    if (item.wasPrepaymentRequired && item.status === 'RESERVED') {
      return { statusText: '선입금 필요', StatusIcon: CreditCard, statusClass: 'status-prepayment_required' };
    }
    const textMap: Record<OrderStatus, string> = { RESERVED: '예약 완료', PREPAID: '선입금 완료', PICKED_UP: '픽업 완료', COMPLETED: '처리 완료', CANCELED: '취소됨', NO_SHOW: '노쇼' };
    const iconMap: Record<OrderStatus, React.ElementType> = { RESERVED: Hourglass, PREPAID: PackageCheck, PICKED_UP: PackageCheck, COMPLETED: CircleCheck, CANCELED: PackageX, NO_SHOW: AlertCircle };
    return {
      statusText: textMap[item.status] || '알 수 없음',
      StatusIcon: iconMap[item.status] || AlertCircle,
      statusClass: `status-${item.status.toLowerCase()}`
    }
  }, [item.status, item.wasPrepaymentRequired]);

  const { cancellable, orderToCancel } = useMemo(() => {
    const latestOrder = item.originalOrders[0];
    if (!latestOrder || (latestOrder.status !== 'RESERVED' && latestOrder.status !== 'PREPAID')) {
      return { cancellable: false, orderToCancel: undefined };
    }
    return { cancellable: true, orderToCancel: latestOrder };
  }, [item.originalOrders]);

  const handlers = useLongPress(
    () => {
      if (cancellable && orderToCancel && onCancel) {
        onCancel(orderToCancel);
      }
    },
    () => {
      navigate(`/product/${item.productId}`);
    },
    // ✅ [UX 개선] 롱프레스 시간을 2.5초에서 1.5초로 단축하여 반응성을 높입니다.
    { initialDelay: 1500 }
  );

  let displayDateText = '';
  if (displayDateInfo?.date) {
    const formattedDate = formatPickupDateShort(displayDateInfo.date);
    displayDateText = displayDateInfo.type === 'pickup' ? `픽업 ${formattedDate}` : `주문 ${formattedDate}`;
  }

  return (
    <motion.div 
      className={`order-card-v3 ${cancellable ? 'cancellable' : ''}`} 
      layoutId={item.stableId}
      key={item.id}
      {...handlers}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
        </div>
        <div className="item-aggregated-info">
          <div className="info-top-row">
            <span className="product-name-top">{item.variantGroupName}</span>
            <span className={`status-badge ${statusClass}`}><StatusIcon size={14} /> {statusText}</span>
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

const WaitlistItemCard: React.FC<{ item: WaitlistInfo; onCancel: (item: WaitlistInfo) => void; onUseTicket: (item: WaitlistInfo) => void; userPoints: number;}> = React.memo(({ item, onCancel, onUseTicket, userPoints }) => {
    const navigate = useNavigate();

    const handlers = useLongPress(
      () => onCancel(item),
      () => navigate(`/product/${item.productId}`),
      // ✅ [UX 개선] 롱프레스 시간을 2.5초에서 1.5초로 단축합니다.
      { initialDelay: 1500 }
    );
    
    const handleTicketClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUseTicket(item);
    };

    return (
        <motion.div 
          className="waitlist-card" 
          layout 
          key={`${item.roundId}-${item.itemId}`}
          {...handlers}
        >
          <div className="card-v3-body">
            <div className="item-image-wrapper">
              <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
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
                  <button className="priority-ticket-btn used" disabled onClick={(e) => e.stopPropagation()}>
                    <CircleCheck size={16} /> 사용 완료
                  </button>
                ) : (
                  <button
                    className="priority-ticket-btn"
                    onClick={handleTicketClick}
                    disabled={userPoints < 50}
                    title={userPoints < 50 ? '포인트가 부족합니다 (50P 필요)' : '50포인트로 순서 올리기'}
                  >
                    <Zap size={16} /> 순서 올리기
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
    );
});

// =================================================================
// 📌 메인 컴포넌트 (기존과 동일)
// =================================================================

const OrderHistoryPage: React.FC = () => {
    const { user, userDocument } = useAuth();
    const [viewMode, setViewMode] = useState<'orders' | 'pickup' | 'waitlist'>('orders');
  
    const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    const getUserOrdersCallable = useMemo(() => httpsCallable(functions, 'callable-getUserOrders'), [functions]);
    const getUserWaitlistCallable = useMemo(() => httpsCallable(functions, 'callable-getUserWaitlist'), [functions]);
    
    const basePayload = useMemo(() => {
      if (viewMode === 'pickup') {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        return { 
          orderByField: 'pickupDate', 
          orderDirection: 'asc',
          startDate: today.toISOString(),
        };
      }
      return { orderByField: 'createdAt', orderDirection: 'desc' };
    }, [viewMode]);
  
    const { data: orders, setData: setOrders, loading: ordersLoading, hasMore: hasMoreOrders, loadMore: loadMoreOrders } =
      usePaginatedData<Order>(user?.uid, getUserOrdersCallable, basePayload, viewMode === 'orders' || viewMode === 'pickup');
  
    const { data: waitlist, setData: setWaitlist, loading: waitlistLoading, loadMore: loadMoreWaitlist, hasMore: hasMoreWaitlist } =
      usePaginatedData<WaitlistInfo>(user?.uid, getUserWaitlistCallable, EMPTY_PAYLOAD, viewMode === 'waitlist');
    
    const aggregateOrders = useCallback((ordersToAggregate: Order[], groupBy: 'orderDate' | 'pickupDate'): { [date: string]: AggregatedItem[] } => {
      const aggregated: { [key: string]: AggregatedItem } = {};
  
      ordersToAggregate.forEach(order => {
        const date = groupBy === 'orderDate' ? safeToDate(order.createdAt) : safeToDate(order.pickupDate);
        if (!date) return;
  
        const dateStr = dayjs(date).format('YYYY-MM-DD');
  
        (order.items || []).forEach((item: OrderItem) => {
          const aggregationKey = `${dateStr}-${item.productId?.trim() ?? ''}-${item.variantGroupName?.trim() ?? ''}-${item.itemName?.trim() ?? ''}-${order.wasPrepaymentRequired}-${order.status}`;
          const stableAnimationId = `${item.productId?.trim() ?? ''}-${item.variantGroupName?.trim() ?? ''}-${item.itemName?.trim() ?? ''}-${order.wasPrepaymentRequired}`;
  
          if (!aggregated[aggregationKey]) {
            aggregated[aggregationKey] = {
              id: aggregationKey,
              stableId: stableAnimationId,
              productId: item.productId,
              productName: item.productName,
              variantGroupName: item.variantGroupName,
              itemName: item.itemName,
              totalQuantity: 0,
              imageUrl: item.imageUrl,
              originalOrders: [],
              status: order.status,
              wasPrepaymentRequired: order.wasPrepaymentRequired ?? false,
            };
          }
          aggregated[aggregationKey].totalQuantity += item.quantity;
          aggregated[aggregationKey].originalOrders.push(order);
        });
      });
  
      Object.values(aggregated).forEach(item => {
        const sortedOrders = [...item.originalOrders].sort((a, b) => (safeToDate(b.createdAt)?.getTime() || 0) - (safeToDate(a.createdAt)?.getTime() || 0));
        item.originalOrders = sortedOrders;
      });
  
      const groupedByDate: { [date: string]: AggregatedItem[] } = {};
      Object.values(aggregated).forEach(item => {
        const firstOrder = item.originalOrders[0];
        if (!firstOrder) return;
        const date = groupBy === 'orderDate' ? safeToDate(firstOrder.createdAt) : safeToDate(firstOrder.pickupDate);
        if (!date) return;
        
        const dateStr = dayjs(date).format('YYYY-MM-DD');
  
        if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
        groupedByDate[dateStr].push(item);
      });
      return groupedByDate;
    }, []);
  
    const aggregatedItems = useMemo(() => 
      aggregateOrders(orders, viewMode === 'pickup' ? 'pickupDate' : 'orderDate'),
    [orders, viewMode, aggregateOrders]);
  
    const handleScroll = useCallback(() => {
      const isAtBottom = window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 200;
      if (!isAtBottom) return;
      
      if (viewMode === 'orders' || viewMode === 'pickup') {
        if(!ordersLoading && hasMoreOrders) loadMoreOrders();
      } else if (viewMode === 'waitlist') {
        if(!waitlistLoading && hasMoreWaitlist) loadMoreWaitlist();
      }
      
    }, [viewMode, ordersLoading, hasMoreOrders, loadMoreOrders, waitlistLoading, hasMoreWaitlist, loadMoreWaitlist]);
  
    useEffect(() => {
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);
    
    const handleCancelOrder = useCallback((orderToCancel: Order) => {
      showCancelOrderToast(() => {
        const promise = cancelOrder(orderToCancel);
        showPromiseToast(promise, {
          loading: '예약 취소 처리 중...',
          success: () => {
            setOrders(prev => prev.map(o => 
              o.id === orderToCancel.id ? { ...o, status: 'CANCELED' } : o
            ));
            return '예약이 성공적으로 취소되었습니다.';
          },
          error: (err: any) => err?.message || '취소 중 오류가 발생했습니다.',
        });
      });
    }, [setOrders]);
  
    const handleCancelWaitlist = useCallback((item: WaitlistInfo) => {
      if (!user) return;
      showCancelWaitlistToast(item.itemName, item.quantity, () => {
        const promise = cancelWaitlistEntry(item.productId, item.roundId, user.uid, item.itemId);
        showPromiseToast(promise, {
            loading: '대기 취소 처리 중...',
            success: () => {
                setWaitlist(prev => prev.filter(w => w.itemId !== item.itemId || w.roundId !== item.roundId));
                return '대기 신청이 취소되었습니다.';
            },
            error: (err: any) => err.message || '대기 취소 중 오류가 발생했습니다.'
        });
      });
    }, [user, setWaitlist]);
  
    const handleUsePriorityTicket = useCallback((item: WaitlistInfo) => {
      if (!user) return;
      showUseTicketToast(() => {
        const promise = applyWaitlistPriorityTicket(user.uid, item.productId, item.roundId, item.itemId);
        showPromiseToast(promise, {
          loading: '순번 상승권 사용 중...',
          success: () => {
            setWaitlist(prev => prev.map(w => w.itemId === item.itemId && w.roundId === item.roundId ? { ...w, isPrioritized: true } : w));
            return '순번 상승권이 적용되었습니다!';
          },
          error: (err: any) => err.message || '오류가 발생했습니다.',
        });
      });
    }, [user, setWaitlist]);
  
  
  const renderOrderContent = () => {
      const isFirstLoading = ordersLoading && orders.length === 0;
  
      if (isFirstLoading) {
        return <div className="loading-spinner-container"><InlineSodomallLoader /></div>;
      }
      
      if (orders.length === 0 && !ordersLoading) {
        return <EmptyHistory type={viewMode === 'pickup' ? 'pickup' : 'order'} />;
      }
  
      const sortedDates = Object.keys(aggregatedItems).sort((a, b) => {
        const dateA = new Date(a).getTime(); const dateB = new Date(b).getTime();
        return viewMode === 'orders' ? dateB - dateA : dateA - dateB;
      });
      
      return (
        <div className="orders-list">
          <AnimatePresence>
            {sortedDates.map((dateStr, index) => (
              <motion.div key={dateStr} layout>
                <div className="date-header-container">
                  <DateHeader date={new Date(dateStr)} />
                  {index === 0 && (viewMode === 'orders' || viewMode === 'pickup') && (
                    <div className="cancel-instruction">
                      <Info size={14} />
                      <span>카드를 길게 눌러 예약을 취소하세요.</span>
                    </div>
                  )}
                </div>
                <div className="order-cards-grid">
                  {aggregatedItems[dateStr].map(item => (
                    <AggregatedItemCard
                      key={item.id} item={item}
                      displayDateInfo={viewMode === 'orders'
                        ? { type: 'pickup', date: safeToDate(item.originalOrders[0]?.pickupDate)! }
                        : { type: 'order', date: safeToDate(item.originalOrders[0]?.createdAt)! }
                      }
                      onCancel={handleCancelOrder}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      );
  };
    
    const renderWaitlistContent = () => {
      const isFirstLoading = waitlistLoading && waitlist.length === 0;
      if (isFirstLoading) {
        return <div className="loading-spinner-container"><InlineSodomallLoader /></div>;
      }
      if (waitlist.length === 0 && !waitlistLoading) {
          return <EmptyHistory type="waitlist" />;
      }
      return (
          <div className="waitlist-list">
            {waitlist.map(item => (
              <WaitlistItemCard
                key={`${item.roundId}-${item.itemId}`} item={item}
                onCancel={handleCancelWaitlist} onUseTicket={handleUsePriorityTicket}
                userPoints={userDocument?.points || 0}
              />
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
          
          <AnimatePresence mode="wait">
              <motion.div
                  key={viewMode}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
              >
                  {viewMode === 'waitlist' ? renderWaitlistContent() : renderOrderContent()}
              </motion.div>
          </AnimatePresence>
          
          {(viewMode === 'orders' || viewMode === 'pickup') && ordersLoading && orders.length > 0 && (
            <div className="loading-more-spinner"><InlineSodomallLoader /></div>
          )}
          {(viewMode === 'orders' || viewMode === 'pickup') && !hasMoreOrders && orders.length > 0 && (
            <div className="end-of-list-message">모든 내역을 불러왔습니다.</div>
          )}
  
          {viewMode === 'waitlist' && waitlistLoading && waitlist.length > 0 && (
            <div className="loading-more-spinner"><InlineSodomallLoader /></div>
          )}
          {viewMode === 'waitlist' && !hasMoreWaitlist && waitlist.length > 0 && (
            <div className="end-of-list-message">모든 내역을 불러왔습니다.</div>
          )}
        </div>
      </div>
    );
};
  
export default OrderHistoryPage;
