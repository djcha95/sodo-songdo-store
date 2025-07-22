// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
// ✅ [수정] 필요한 페이지네이션 함수 모두 import
import {
  getUserOrdersPaginated,
  getUserOrdersByPickupDatePaginated,
  cancelOrder
} from '@/firebase';
import { getUserWaitlist, cancelWaitlistEntry } from '@/firebase/productService';
import { applyWaitlistPriorityTicket } from '@/firebase/pointService';
import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderStatus, WaitlistInfo } from '@/types';
import { Timestamp, type DocumentData } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
  Package, ListOrdered, Truck, CircleCheck, AlertCircle, PackageCheck,
  PackageX, Hourglass, CreditCard, XCircle, Inbox, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import InlineSodamallLoader from '@/components/common/InlineSodamallLoader';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
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
  const dayOfWeek = week[(date.getDay())];
  return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
};

const formatPickupDateShort = (date: Date): string => {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[(date.getDay())];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
};

// =================================================================
// 📌 커스텀 훅 (Custom Hooks)
// =================================================================
const DATA_PER_PAGE = 10; // ORDERS_PER_PAGE를 DATA_PER_PAGE로 변경

// ✅ [신규] 모든 탭의 페이지네이션을 처리하는 통합 커스텀 훅
const usePaginatedData = <T,>(
  uid: string | undefined,
  fetchFn: (uid: string, pageSize: number, cursor: DocumentData | null) => Promise<{ data: T[], lastDoc: DocumentData | null }>,
  isActive: boolean
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    if (!uid) {
      if (isInitial) setLoading(false);
      return;
    }

    if (isInitial) {
      setLoading(true);
      setData([]);
      setHasMore(true);
      setLastVisible(null);
    } else {
      if (loadingMore || !hasMore) return; //
      setLoadingMore(true);
    }

    try {
      const cursor = isInitial ? null : lastVisible;
      const { data: newData, lastDoc } = await fetchFn(uid, DATA_PER_PAGE, cursor);

      setData(prev => isInitial ? newData : [...prev, ...newData]);
      setLastVisible(lastDoc);
      if (newData.length < DATA_PER_PAGE) {
        setHasMore(false);
      }
    } catch (err: any) {
      console.error('데이터 로딩 오류:', err);
      // Firestore 색인 오류에 대한 사용자 안내 추가
      if (err.code === 'failed-precondition') {
        toast.error('데이터를 불러오기 위한 색인이 필요합니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.');
      } else {
        showToast('error', '데이터를 불러오는 데 실패했습니다.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [uid, loadingMore, hasMore, lastVisible, fetchFn]); // fetchFn 의존성 추가

  // ✅ [수정] 무한 루프 문제를 해결하기 위해 useEffect 의존성을 수정합니다.
  // 이 Effect는 탭이 활성화될 때(isActive) 최초 데이터를 로드하는 역할만 수행해야 합니다.
  // 기존 코드에서는 fetchData가 의존성 배열에 포함되어, 데이터 로드 후 상태 변경 시
  // 새로운 fetchData 함수가 생성되고, 이로 인해 useEffect가 다시 실행되는 무한 루프가 발생했습니다.
  useEffect(() => {
    if (isActive) {
      // isInitial=true로 호출하여 해당 탭의 데이터를 처음부터 다시 로드합니다.
      fetchData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]); // 🚨 [수정] 무한 루프를 유발하는 `fetchData`를 의존성 배열에서 제거했습니다.

  return { data, setData, loading, loadingMore, hasMore, fetchData };
};


// =================================================================
// 📌 하위 컴포넌트 (Sub-components)
// =================================================================

const DateHeader: React.FC<{ date: Date }> = React.memo(({ date }) => (
  <h2 className="date-header">{formatSimpleDate(date)}</h2>
));

const EmptyHistory: React.FC<{ type?: 'order' | 'waitlist' }> = ({ type = 'order' }) => {
  // ✅ [수정] navigate를 여기서 선언하여 사용 안함 오류 해결
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
      RESERVED: '예약 완료', PREPAID: '선입금 완료', PICKED_UP: '픽업 완료',
      COMPLETED: '처리 완료', CANCELED: '취소됨', NO_SHOW: '노쇼',
    };
    const iconMap: Record<OrderStatus, React.ReactElement> = {
      RESERVED: <Hourglass size={14} />, PREPAID: <PackageCheck size={14} />,
      PICKED_UP: <PackageCheck size={14} />, COMPLETED: <CircleCheck size={14} />,
      CANCELED: <PackageX size={14} />, NO_SHOW: <AlertCircle size={14} />,
    };

    return {
      statusText: textMap[(item.status)] || '알 수 없음',
      StatusIcon: iconMap[(item.status)] || <AlertCircle size={14} />,
      statusClass: `status-${item.status.toLowerCase()}`
    }
  }, [item.status, item.wasPrepaymentRequired]);

  const getCancellationInfo = useCallback(() => {
    const latestOrder = item.originalOrders[(0)];
    if (!latestOrder || (latestOrder.status !== 'RESERVED' && latestOrder.status !== 'PREPAID')) {
      return { cancellable: false };
    }

    const now = new Date();
    const createdAt = safeToDate(latestOrder.createdAt);

    if (createdAt && createdAt.getDay() === 6) {
        const deadline = new Date(createdAt);
        deadline.setDate(deadline.getDate() + 2);
        deadline.setHours(13, 0, 0, 0);
        return { cancellable: now < deadline, orderToCancel: latestOrder };
    }

    const pickupDate = safeToDate(latestOrder.pickupDate);
    if (pickupDate) {
        const deadline = new Date(pickupDate.getTime() - (60 * 60 * 1000));
        return { cancellable: now < deadline, orderToCancel: latestOrder };
    }

    return { cancellable: false };
  }, [item.originalOrders]);

  const { cancellable, orderToCancel } = getCancellationInfo();
  const HINT_TOAST_ID = 'cancel-hint-toast';
  const cancelHandlers = useLongPress(
    () => {
      toast.dismiss(HINT_TOAST_ID); //
      if (cancellable && orderToCancel && onCancel) onCancel(orderToCancel);
    },
    () => { if (cancellable) showToast('blank', '카드를 꾹 눌러서 취소할 수 있어요.', 4000); },
    { delay: 500 }
  );

  let displayDateText = '';
  if (displayDateInfo?.date) {
    const formattedDate = formatPickupDateShort(displayDateInfo.date);
    displayDateText = displayDateInfo.type === 'pickup' ? `픽업 ${formattedDate}` : `주문 ${formattedDate}`;
  }

  return (
    <motion.div className={`order-card-v3 ${cancellable ? 'cancellable' : ''}`} layout key={item.id} {...(onCancel ? cancelHandlers : {})}>
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          {/* ✅ [개선] 최적화된 이미지 URL을 사용하도록 수정 */}
          <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
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
    <motion.div className="waitlist-card" layout key={`${item.roundId}-${item.itemId}`}>
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
  const [viewMode, setViewMode] = useState<'orders' | 'pickup' | 'waitlist'>('orders');
  const isProcessingCancel = useRef(false); //

  // ✅ [수정] 각 탭에 맞는 fetch 함수 정의
  const fetchOrdersByDate = useCallback(async (uid: string, pageSize: number, cursor: DocumentData | null) => {
    const { orders, lastDoc } = await getUserOrdersPaginated(uid, pageSize, cursor);
    return { data: orders, lastDoc };
  }, []);

  const fetchOrdersByPickupDate = useCallback(async (uid: string, pageSize: number, cursor: DocumentData | null) => {
    const { orders, lastDoc } = await getUserOrdersByPickupDatePaginated(uid, pageSize, cursor);
    return { data: orders, lastDoc };
  }, []);

  const fetchWaitlistData = useCallback(async (uid: string) => {
    // 현재 getUserWaitlist는 페이지네이션을 지원하지 않으므로, 한번에 모두 가져옵니다.
    // 추후 백엔드에서 페이지네이션 구현 시 이 부분을 수정할 수 있습니다.
    const waitlistItems = await getUserWaitlist(uid);
    return { data: waitlistItems, lastDoc: null };
  }, []);


  // ✅ [수정] 통합 훅을 사용하여 각 탭의 데이터 관리
  const { data: orders, setData: setOrders, loading: ordersLoading, loadingMore: ordersLoadingMore, hasMore: hasMoreOrders, fetchData: fetchMoreOrders } = usePaginatedData<Order>(user?.uid, fetchOrdersByDate, viewMode === 'orders');
  const { data: pickupOrders, setData: setPickupOrders, loading: pickupLoading, loadingMore: pickupLoadingMore, hasMore: hasMorePickup, fetchData: fetchMorePickupOrders } = usePaginatedData<Order>(user?.uid, fetchOrdersByPickupDate, viewMode === 'pickup');
  const { data: waitlist, setData: setWaitlist, loading: waitlistLoading, fetchData: fetchMoreWaitlist } = usePaginatedData<WaitlistInfo>(user?.uid, fetchWaitlistData, viewMode === 'waitlist');

  const handleScroll = useCallback(() => {
    if (window.innerHeight + document.documentElement.scrollTop < document.documentElement.offsetHeight - 200) return;

    //
    if (viewMode === 'orders' && !ordersLoadingMore && hasMoreOrders) fetchMoreOrders(false);
    if (viewMode === 'pickup' && !pickupLoadingMore && hasMorePickup) fetchMorePickupOrders(false);
    // 대기목록은 현재 전체 로딩이므로 스크롤 이벤트 불필요
  }, [viewMode, ordersLoadingMore, hasMoreOrders, fetchMoreOrders, pickupLoadingMore, hasMorePickup, fetchMorePickupOrders]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    return () => { toast.dismiss(); };
  }, []);

  const aggregateOrders = (ordersToAggregate: Order[], groupBy: 'orderDate' | 'pickupDate'): { [date: string]: AggregatedItem[] } => {
    const aggregated: { [key: string]: AggregatedItem } = {};
    const filteredOrders = groupBy === 'pickupDate'
      ? ordersToAggregate.filter(o => (o.status === 'RESERVED' || o.status === 'PICKED_UP' || o.status === 'PREPAID') && o.pickupDate)
      : ordersToAggregate;

    filteredOrders.forEach(order => {
      const date = groupBy === 'orderDate' ? safeToDate(order.createdAt) : safeToDate(order.pickupDate);
      if (!date) return;
      const dateStr = date.toISOString().split('T')[0];

      order.items.forEach(item => {
        const key = `${dateStr}-${item.productId.trim()}-${item.variantGroupName.trim()}-${item.itemName.trim()}-${order.wasPrepaymentRequired}`;
        if (!aggregated[(key)]) {
          aggregated[(key)] = {
            id: key, productName: item.productName, variantGroupName: item.variantGroupName,
            itemName: item.itemName, totalQuantity: 0, imageUrl: item.imageUrl,
            originalOrders: [], status: order.status,
            wasPrepaymentRequired: order.wasPrepaymentRequired ?? false,
          };
        }
        aggregated[(key)].totalQuantity += item.quantity;
        // AggregatedItem의 originalOrders에 해당 주문을 추가합니다.
        // 여기서 deep copy를 하지 않고 원본 Order 객체를 추가합니다.
        aggregated[(key)].originalOrders.push(order);
      });
    });

    Object.values(aggregated).forEach(item => {
      // aggregated.originalOrders에 이미 추가된 주문들의 status를 기준으로 최신 상태를 결정합니다.
      // 여기서는 aggregated.originalOrders가 이미 추가된 주문들이므로,
      // 가장 최근의 주문(createdAt이 가장 큰)의 상태를 대표 상태로 사용합니다.
      const sortedOrders = [...item.originalOrders].sort((a, b) => {
        const timeA = safeToDate(a.createdAt)?.getTime() || 0;
        const timeB = safeToDate(b.createdAt)?.getTime() || 0;
        return timeB - timeA;
      });
      item.status = sortedOrders[(0)]?.status ?? 'RESERVED';
      item.originalOrders = sortedOrders; // 정렬된 주문 목록으로 업데이트
    });

    const groupedByDate: { [date: string]: AggregatedItem[] } = {};
    Object.values(aggregated).forEach(item => {
      const firstOrder = item.originalOrders[(0)]; // 정렬된 목록의 첫 번째(가장 최근) 주문
      if (!firstOrder) return;
      const date = groupBy === 'orderDate' ? safeToDate(firstOrder.createdAt) : safeToDate(firstOrder.pickupDate);
      if (!date) return;
      const dateStr = date.toISOString().split('T')[0];
      if (!groupedByDate[(dateStr)]) groupedByDate[(dateStr)] = [];
      groupedByDate[(dateStr)].push(item);
    });

    return groupedByDate;
  };

  const aggregatedItemsByOrderDate = useMemo(() => aggregateOrders(orders, 'orderDate'), [orders]);
  const aggregatedItemsByPickupDate = useMemo(() => aggregateOrders(pickupOrders, 'pickupDate'), [pickupOrders]);

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
                      isProcessingCancel.current = true; //
                      const promise = cancelOrder(order);
                      toast.promise(promise, {
                        loading: '예약 취소 처리 중...',
                        success: () => {
                          // 두 상태 모두 업데이트
                          setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELED' } : o)));
                          setPickupOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELED' } : o)));
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
  }, [setOrders, setPickupOrders]); // setPickupOrders 의존성 추가

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
              const promise = applyWaitlistPriorityTicket(user!.uid, item.productId, item.roundId, item.itemId); //
              toast.promise(promise, {
                loading: '순번 상승권 사용 중...',
                success: () => {
                  fetchMoreWaitlist(true); // 우선권 사용 후 대기 목록 새로고침
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
  }, [user, fetchMoreWaitlist]); // fetchWaitlist 대신 fetchMoreWaitlist 사용

  const renderContent = () => {
    const loading = (viewMode === 'orders' && ordersLoading) || (viewMode === 'pickup' && pickupLoading) || (viewMode === 'waitlist' && waitlistLoading);
    if (loading) return (<div className="loading-spinner-container"><InlineSodamallLoader /></div>);
    // error 상태는 fetchOrders에서 이미 토스트로 처리하므로 별도 UI는 생략

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

    const currentOrders = viewMode === 'orders' ? orders : pickupOrders;
    const currentViewData = viewMode === 'orders' ? aggregatedItemsByOrderDate : aggregatedItemsByPickupDate;
    const sortedDates = Object.keys(currentViewData).sort((a, b) => {
      const dateA = new Date(a).getTime(); const dateB = new Date(b).getTime();
      return viewMode === 'orders' ? dateB - dateA : dateA - dateB;
    });
    const loadingMore = viewMode === 'orders' ? ordersLoadingMore : pickupLoadingMore;
    const hasMore = viewMode === 'orders' ? hasMoreOrders : hasMorePickup;

    if (currentOrders.length === 0 && !hasMore) return <EmptyHistory type="order" />; // 모든 데이터를 불러왔는데도 비어있을 때
    if (sortedDates.length === 0 && !hasMore) { // 특정 뷰 모드에서 필터링 후 내용이 없을 때
      return (<div className="info-message">{viewMode === 'orders' ? '주문 내역이 없습니다.' : '픽업 예정 또는 완료된 상품이 없습니다.'}</div>);
    }

    return (
      <>
        <div className={viewMode === 'orders' ? 'orders-list' : 'pickup-list'}>
          {sortedDates.map(dateStr => (
            <motion.div key={dateStr} layout>
              <DateHeader date={new Date(dateStr)} />
              <div className="order-cards-grid">
                {currentViewData[(dateStr)].map(item => {
                  const dateInfo: { type: 'pickup' | 'order'; date: Date | null } = viewMode === 'orders'
                    ? { type: 'pickup', date: safeToDate(item.originalOrders[(0)]?.pickupDate) }
                    : { type: 'order', date: safeToDate(item.originalOrders[(0)]?.createdAt) };
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

        {/* ✅ [추가] 로딩 스피너 및 마지막 메시지 */}
        {loadingMore && <div className="loading-more-spinner"><InlineSodamallLoader /></div>}
        {!hasMore && currentOrders.length > 0 && (viewMode === 'orders' || viewMode === 'pickup') && <div className="end-of-list-message">모든 내역을 불러왔습니다.</div>}
      </>
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