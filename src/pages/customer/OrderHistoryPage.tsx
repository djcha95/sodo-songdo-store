// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { orderHistoryTourSteps } from '@/components/customer/AppTour';
import { cancelOrder } from '@/firebase/orderService';
import { getUserWaitlist, cancelWaitlistEntry } from '@/firebase/productService';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderItem, OrderStatus, WaitlistInfo } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import {
  Package, ListOrdered, Truck, CircleCheck, AlertCircle, PackageCheck,
  PackageX, Hourglass, CreditCard, Inbox, Info, Bolt,
} from 'lucide-react';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import { showToast, showPromiseToast } from '@/utils/toastUtils';
import toast from 'react-hot-toast';

import './OrderHistoryPage.css';

// =================================================================
// 📌 이미지 안전 로더 (수정됨)
// =================================================================

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWFmMGY0Ii8+PC9zdmc+';
const DEFAULT_EVENT_IMAGE = '/event-snack-default.png';

type ThumbSize = '200x200' | '1080x1080';

// ✅ fetchPriority 경고 수정 및 오류 처리 로직 강화
const SafeThumb: React.FC<{
  src?: string; alt: string; size?: ThumbSize; eager?: boolean; className?: string;
}> = ({ src, alt, size = '200x200', eager = false, className }) => {

  const original = useMemo(() => (src && src.trim()) ? src : PLACEHOLDER, [src]);

  const optimized = useMemo(() => {
    if (original === PLACEHOLDER) return PLACEHOLDER;
    return getOptimizedImageUrl(original, size);
  }, [original, size]);

  const [imageSrc, setImageSrc] = useState(optimized);
  const [errorState, setErrorState] = useState<'none' | 'optimized-failed' | 'original-failed'>('none');

  useEffect(() => {
    const newOptimized = getOptimizedImageUrl(original, size);
    setImageSrc(newOptimized);
    setErrorState('none'); // src prop이 변경되면 에러 상태 초기화
  }, [original, size]); // 의존성 배열에 original과 size만 유지

  const handleError = useCallback(() => {
    if (errorState === 'original-failed') {
      // 최종 대체 이미지 로딩도 실패하면 더 이상 아무것도 하지 않음 (무한 루프 방지)
      return;
    }

    if (errorState === 'none') {
      // 1단계: 최적화 이미지 로딩 실패
      console.error(`[SafeThumb ERROR] Optimized image failed to load: ${optimized}`);
      console.log(`[SafeThumb FALLBACK-1] Trying original URL: ${original}`);
      setErrorState('optimized-failed');
      setImageSrc(original);
    } else if (errorState === 'optimized-failed') {
      // 2단계: 원본 이미지 로딩도 실패
      console.error(`[SafeThumb ERROR] Original image also failed: ${original}`);
      console.log(`[SafeThumb FALLBACK-2] Displaying placeholder.`);
      setErrorState('original-failed');
      setImageSrc(PLACEHOLDER);
    }
  }, [errorState, optimized, original]);

  return (
    <img
      src={imageSrc}
      alt={alt}
      // ✅ [수정] 에러 상태에 따라 클래스 추가
      className={`${className} ${errorState !== 'none' ? 'image-error-fallback' : ''}`}
      loading={eager ? 'eager' : 'lazy'}
      // ✅ [수정] React 경고 해결: fetchpriority -> fetchPriority
      fetchPriority={eager ? 'high' : 'auto'}
      onError={handleError}
    />
  );
};


// =================================================================
// 📌 타입 정의 및 헬퍼 함수
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

// =================================================================
// 📌 커스텀 훅
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
      setData([]);
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
  const longPressActionInProgress = useRef(false);

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

  const { cancellable, orderToCancel, cancelDisabledReason, isEvent } = useMemo(() => {
  const latestOrder = item.originalOrders[0];
  if (!latestOrder) {
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: null, isEvent: false };
  }
  const oi = latestOrder.items?.[0];
  const isEventLike =
    (latestOrder as any)?.eventId ||
    (oi as any)?.eventId ||
    (oi as any)?.roundId?.startsWith?.('welcome-') ||
    (oi as any)?.roundName?.includes?.('이벤트') ||
    item.productName?.includes?.('랜덤간식') ||
    (typeof (oi as any)?.unitPrice === 'number' && (oi as any)?.unitPrice === 0);

  if (isEventLike) {
    return {
      cancellable: false,
      orderToCancel: undefined,
      cancelDisabledReason: '이벤트 상품은 취소할 수 없습니다.',
      isEvent: true
    };
  }

  const isCancellableStatus =
    latestOrder.status === 'RESERVED' || latestOrder.status === 'PREPAID';
  if (!isCancellableStatus) {
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: null, isEvent: false };
  }

  const deadline = safeToDate(latestOrder.items?.[0]?.deadlineDate);
  if (deadline && new Date() > deadline) {
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: '마감일이 지나 취소할 수 없습니다.', isEvent: false };
  }

  return { cancellable: true, orderToCancel: latestOrder, cancelDisabledReason: null, isEvent: false };
}, [item.originalOrders, item.productName]);



  const topText = useMemo(
    () => isEvent ? item.productName : item.variantGroupName,
    [isEvent, item.productName, item.variantGroupName]
  );

  const bottomText = useMemo(
    () => isEvent ? item.originalOrders[0]?.items[0]?.roundName : item.itemName,
    [isEvent, item.originalOrders, item.itemName]
  );

  const handleLongPress = () => {
    if (longPressActionInProgress.current) return;
    longPressActionInProgress.current = true;
    if (cancellable && orderToCancel && onCancel) {
      onCancel(orderToCancel);
    }
    else if (cancelDisabledReason) {
      toast.custom((t) => (
        <div className={`confirmation-toast ${t.visible ? 'animate-enter' : ''}`}>
            <h4 className="toast-header"><Info size={20} /><span>취소 불가 안내</span></h4>
            <p className="toast-message">{cancelDisabledReason}</p>
            <div className="toast-buttons">
                <button className="common-button button-primary button-medium" onClick={() => toast.dismiss(t.id)}>확인</button>
            </div>
        </div>
      ), { duration: Infinity, style: { background: 'transparent', boxShadow: 'none', padding: 0 } });
    }
  };

  const handlePressEnd = () => { longPressActionInProgress.current = false; };

  const handleCardClick = () => {
    if (isEvent) return;
    navigate(`/product/${item.productId}`);
  };

  const handlers = useLongPress(handleLongPress, handleCardClick, { initialDelay: 1500 });
  const finalHandlers = { ...handlers, onMouseUp: () => { handlers.onMouseUp(); handlePressEnd(); }, onMouseLeave: () => { handlers.onMouseLeave(); handlePressEnd(); }, onTouchEnd: () => { handlers.onTouchEnd(); handlePressEnd(); } };

  let displayDateText = '';
  if (displayDateInfo?.date) {
    const formattedDate = formatPickupDateShort(displayDateInfo.date);
    displayDateText = displayDateInfo.type === 'pickup' ? `픽업 ${formattedDate}` : `주문 ${formattedDate}`;
  }

  return (
    <motion.div
      className={`order-card-v3 ${cancellable ? 'cancellable' : ''} ${isEvent ? 'event-item' : ''}`}
      layoutId={item.stableId}
      key={item.id}
      {...finalHandlers}
      whileTap={isEvent ? {} : { scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <SafeThumb
            src={item.imageUrl || (isEvent ? DEFAULT_EVENT_IMAGE : undefined)}
            alt={item.productName}
            className="item-image"
          />
        </div>
        <div className="item-aggregated-info">
          <div className="info-top-row">
            <span className="product-name-top">{topText}</span>
            <div className="status-and-event-wrapper">
              {isEvent && <span className="event-badge">이벤트</span>}
              <span className={`status-badge ${statusClass}`}>
                <StatusIcon size={14} /> {statusText}
              </span>
            </div>
          </div>
          <div className="info-bottom-row">
            <span className="item-options-quantity">
              <span className="item-option-name">{bottomText}</span>
              <span className="item-quantity">({item.totalQuantity}개)</span>
            </span>
            {displayDateText && <span className="date-info-badge">{displayDateText}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

const WaitlistItemCard: React.FC<{ item: WaitlistInfo; onCancel: (item: WaitlistInfo) => void; }> = React.memo(({ item, onCancel }) => {
  const navigate = useNavigate();
  const longPressActionInProgress = useRef(false);

  const handleLongPress = () => {
    if (longPressActionInProgress.current) return;
    longPressActionInProgress.current = true;
    onCancel(item);
  };

  const handlePressEnd = () => { longPressActionInProgress.current = false; };
  const handlers = useLongPress(handleLongPress, () => navigate(`/product/${item.productId}`), { initialDelay: 1500 });
  const finalHandlers = { ...handlers, onMouseUp: () => { handlers.onMouseUp(); handlePressEnd(); }, onMouseLeave: () => { handlers.onMouseLeave(); handlePressEnd(); }, onTouchEnd: () => { handlers.onTouchEnd(); handlePressEnd(); } };

  return (
    <motion.div className="waitlist-card" layout {...finalHandlers} whileTap={{ scale: 0.97 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <SafeThumb
            src={item.imageUrl || PLACEHOLDER}
            alt={item.productName}
            className="item-image"
          />
        </div>
        <div className="item-aggregated-info">
          <div className="info-top-row">
            <span className="product-name-top">{item.productName}</span>
            {item.waitlistOrder && (<span className="waitlist-order-badge"><Bolt size={14} />대기 {item.waitlistOrder}번</span>)}
          </div>
          <div className="info-bottom-row">
            <span className="item-options-quantity">
              <span className="item-option-name">{item.itemName}</span>
              <span className="item-quantity">({item.quantity}개)</span>
            </span>
          </div>
          <div className="waitlist-actions">
            <div className="cancel-instruction-waitlist"><Info size={14} /><span>카드를 길게 눌러 대기를 취소하세요.</span></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// =================================================================
// 📌 메인 컴포넌트
// =================================================================

const OrderHistoryPage: React.FC = () => {
  const { user, userDocument } = useAuth();
  const { runPageTourIfFirstTime } = useTutorial();
  const [viewMode, setViewMode] = useState<'orders' | 'pickup' | 'waitlist'>('orders');
  const [waitlist, setWaitlist] = useState<WaitlistInfo[]>([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);
  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getUserOrdersCallable = useMemo(() => httpsCallable(functions, 'getUserOrders'), [functions]);

  const basePayload = useMemo(() => {
    if (viewMode === 'pickup') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return { orderByField: 'pickupDate', orderDirection: 'asc', startDate: today.toISOString() };
    }
    return { orderByField: 'createdAt', orderDirection: 'desc' };
  }, [viewMode]);

  const { data: orders, setData: setOrders, loading: ordersLoading, hasMore: hasMoreOrders, loadMore: loadMoreOrders } =
    usePaginatedData<Order>(user?.uid, getUserOrdersCallable, basePayload, viewMode === 'orders' || viewMode === 'pickup');

  useEffect(() => {
    if (userDocument) {
      runPageTourIfFirstTime('hasSeenOrderHistoryPage', orderHistoryTourSteps);
    }
  }, [userDocument, runPageTourIfFirstTime]);

  useEffect(() => {
    const fetchWaitlist = async () => {
      if (user && viewMode === 'waitlist') {
        setLoadingWaitlist(true);
        try {
          const fetchedWaitlist = await getUserWaitlist(user.uid);
          setWaitlist(fetchedWaitlist);
        } catch (error) {
          toast.error("대기 목록을 불러오는 데 실패했습니다.");
        } finally {
          setLoadingWaitlist(false);
        }
      }
    };
    fetchWaitlist();
  }, [user, viewMode]);

  const aggregatedItems = useMemo(() => {
    const aggregated: { [key: string]: AggregatedItem } = {};
    orders.forEach(order => {
      const date = viewMode === 'orders' ? safeToDate(order.createdAt) : safeToDate(order.pickupDate);
      if (!date) return;
      const dateStr = dayjs(date).format('YYYY-MM-DD');
      (order.items || []).forEach((item: OrderItem) => {
        const aggregationKey = `${dateStr}-${item.productId?.trim() ?? ''}-${item.variantGroupName?.trim() ?? ''}-${item.itemName?.trim() ?? ''}-${order.wasPrepaymentRequired}-${order.status}-${(order as any).eventId ?? ''}`;
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
            wasPrepaymentRequired: order.wasPrepaymentRequired ?? false
          };
        }
        aggregated[aggregationKey].totalQuantity += item.quantity;
        aggregated[aggregationKey].originalOrders.push(order);
      });
    });
    Object.values(aggregated).forEach(item => {
      item.originalOrders.sort((a, b) => (safeToDate(b.createdAt)?.getTime() || 0) - (safeToDate(a.createdAt)?.getTime() || 0));
    });
    const groupedByDate: { [date: string]: AggregatedItem[] } = {};
    Object.values(aggregated).forEach(item => {
      const firstOrder = item.originalOrders[0];
      if (!firstOrder) return;
      const date = viewMode === 'orders' ? safeToDate(firstOrder.createdAt) : safeToDate(firstOrder.pickupDate);
      if (!date) return;
      const dateStr = dayjs(date).format('YYYY-MM-DD');
      if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
      groupedByDate[dateStr].push(item);
    });
    return groupedByDate;
  }, [orders, viewMode]);

  const handleScroll = useCallback(() => {
    const isAtBottom = window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 200;
    if (isAtBottom && (viewMode === 'orders' || viewMode === 'pickup') && !ordersLoading && hasMoreOrders) {
      loadMoreOrders();
    }
  }, [viewMode, ordersLoading, hasMoreOrders, loadMoreOrders]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleCancelOrder = useCallback((orderToCancel: Order) => {
    toast.custom((t) => (
      <div className={`confirmation-toast ${t.visible ? 'animate-enter' : ''}`}>
        <h4 className="toast-header"><AlertCircle size={20} /><span>예약 취소</span></h4>
        <p className="toast-message">정말 이 예약을 취소하시겠습니까?</p>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>유지</button>
          <button className="common-button button-danger button-medium" onClick={() => {
            toast.dismiss(t.id);
            const promise = cancelOrder(orderToCancel);
            showPromiseToast(promise, {
              loading: '예약 취소 처리 중...',
              success: () => { setOrders(prev => prev.map(o => o.id === orderToCancel.id ? { ...o, status: 'CANCELED' } : o)); return '예약이 성공적으로 취소되었습니다.'; },
              error: (err: any) => err?.message || '취소 중 오류가 발생했습니다.',
            });
          }}>취소하기</button>
        </div>
      </div>
    ));
  }, [setOrders]);

  const handleCancelWaitlist = useCallback(async (item: WaitlistInfo) => {
    if (!user) return;
    const uniqueId = item.timestamp.toMillis();
    showPromiseToast(
      cancelWaitlistEntry(item.productId, item.roundId, user.uid, item.itemId),
      {
        loading: '대기 취소 처리 중...',
        success: () => {
          setWaitlist(prev => prev.filter(w => w.timestamp.toMillis() !== uniqueId));
          return '대기 신청이 취소되었습니다.';
        },
        error: '대기 취소 중 오류가 발생했습니다.'
      }
    );
  }, [user, setWaitlist]);

  const renderOrderContent = () => {
    const isFirstLoading = ordersLoading && orders.length === 0;
    if (isFirstLoading) { return <div className="loading-spinner-container"><InlineSodomallLoader /></div>; }
    if (orders.length === 0 && !ordersLoading) { return <EmptyHistory type={viewMode === 'pickup' ? 'pickup' : 'order'} />; }
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
                  <div className="cancel-instruction" data-tutorial-id="history-cancel-info">
                    <Info size={14} /><span>카드를 길게 눌러 예약을 취소하세요.</span>
                  </div>
                )}
              </div>
              <div className="order-cards-grid">
                {aggregatedItems[dateStr].map(item => (
                  <AggregatedItemCard
                    key={item.id}
                    item={item}
                    displayDateInfo={viewMode === 'orders'
                      ? { type: 'pickup', date: safeToDate(item.originalOrders[0]?.pickupDate)! }
                      : { type: 'order', date: safeToDate(item.originalOrders[0]?.createdAt)! }}
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
    if (loadingWaitlist) { return <div className="loading-spinner-container"><InlineSodomallLoader /></div>; }
    if (waitlist.length === 0 && !loadingWaitlist) { return <EmptyHistory type="waitlist" />; }
    return (
      <div className="waitlist-list">
        <AnimatePresence>
          {waitlist.map(item => (
            <WaitlistItemCard
              key={`${item.roundId}-${item.itemId}-${item.timestamp.toMillis()}`}
              item={item}
              onCancel={handleCancelWaitlist}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="customer-page-container">
      <div className="order-history-page">
        <div className="view-toggle-container" data-tutorial-id="history-view-toggle">
          <button className={`toggle-btn ${viewMode === 'orders' ? 'active' : ''}`} onClick={() => setViewMode('orders')}> <ListOrdered size={18} /> 주문일순 </button>
          <button className={`toggle-btn ${viewMode === 'pickup' ? 'active' : ''}`} onClick={() => setViewMode('pickup')}> <Truck size={18} /> 픽업일순 </button>
          <button className={`toggle-btn ${viewMode === 'waitlist' ? 'active' : ''}`} onClick={() => setViewMode('waitlist')}> <Hourglass size={18} /> 대기목록 </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={viewMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} >
            {viewMode === 'waitlist' ? renderWaitlistContent() : renderOrderContent()}
          </motion.div>
        </AnimatePresence>
        {(viewMode === 'orders' || viewMode === 'pickup') && ordersLoading && orders.length > 0 && (<div className="loading-more-spinner"><InlineSodomallLoader /></div>)}
        {(viewMode === 'orders' || viewMode === 'pickup') && !hasMoreOrders && orders.length > 0 && (<div className="end-of-list-message">모든 내역을 불러왔습니다.</div>)}
      </div>
    </div>
  );
};

export default OrderHistoryPage;