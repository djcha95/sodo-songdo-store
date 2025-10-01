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
// useLongPress 제거
// import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderItem, OrderStatus } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import {
  Package, ListOrdered, Truck, CircleCheck, AlertCircle, PackageCheck,
  PackageX, Hourglass, CreditCard, Inbox, Info, Bolt, XCircle, Plus, Minus
} from 'lucide-react';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import toast from 'react-hot-toast';
import { showToast, showPromiseToast } from '@/utils/toastUtils';

import './OrderHistoryPage.css';

const functions = getFunctions(getApp(), 'asia-northeast3');
const updateOrderQuantityCallable = httpsCallable<{ orderId: string; newQuantity: number }, { success: boolean, message: string }>(functions, 'updateOrderQuantity');


const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWFmMGY0Ii8+PC9zdmc+';
const DEFAULT_EVENT_IMAGE = '/event-snack-default.png';

// 타입 정의 추가
type OrderCancellationItem = { order: Order; isPenalty: boolean; };
type WaitlistCancellationItem = WaitlistInfo;

interface WaitlistInfo {
  productId: string;
  roundId: string;
  itemId: string;
  productName: string;
  itemName: string;
  imageUrl: string;
  quantity: number;
  timestamp: Timestamp;
  waitlistOrder?: number;
  primaryReservationEndAt?: Timestamp;
}


type ThumbSize = '200x200' | '1080x1080';

const SafeThumb: React.FC<{
  src?: string; alt: string; size?: ThumbSize; eager?: boolean; className?: string;
}> = ({ src, alt, size = '200x200', eager = false, className }) => {

  const original = useMemo(() => (src && src.trim()) ? src : PLACEHOLDER, [src]);

  const optimized = useMemo(() => {
    if (original === PLACEHOLDER) return PLACEHOLDER; // 💡 [오류 수정] PLACEHOLDEr -> PLACEHOLDER
    return getOptimizedImageUrl(original, size);
  }, [original, size]);

  const [imageSrc, setImageSrc] = useState(optimized);
  const [errorState, setErrorState] = useState<'none' | 'optimized-failed' | 'original-failed'>('none');

  useEffect(() => {
    const newOptimized = getOptimizedImageUrl(original, size);
    setImageSrc(newOptimized);
    setErrorState('none');
  }, [original, size]);

  const handleError = useCallback(() => {
    if (errorState === 'original-failed') {
      return;
    }

    if (errorState === 'none') {
      console.error(`[SafeThumb ERROR] Optimized image failed to load: ${optimized}`);
      console.log(`[SafeThumb FALLBACK-1] Trying original URL: ${original}`);
      setErrorState('optimized-failed');
      setImageSrc(original);
    } else if (errorState === 'optimized-failed') {
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
      className={`${className} ${errorState !== 'none' ? 'image-error-fallback' : ''}`}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'auto'}
      onError={handleError}
    />
  );
};


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

interface CancellationDetails {
  cancellable: boolean;
  orderToCancel?: Order;
  cancelDisabledReason: string | null;
  isEvent: boolean;
  isPenaltyPeriod: boolean;
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
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[date.getDay()];
  return `${month}/${day}(${dayOfWeek})`;
};

// ✅ [수정] 픽업일 헤더 포맷 변경 (예: 10/1(수) 픽업상품)
const formatPickupDateHeader = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[date.getDay()];
  return `${month}/${day}(${dayOfWeek}) 픽업상품`;
};

const formatPickupDateShort = (date: Date): string => {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[(date.getDay())];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
};

const getCancellationDetails = (item: AggregatedItem): CancellationDetails => {
  const latestOrder = item.originalOrders[0];
  if (!latestOrder) {
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: '주문 정보를 찾을 수 없습니다.', isEvent: false, isPenaltyPeriod: false };
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
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: '이벤트 상품은 취소할 수 없습니다.', isEvent: true, isPenaltyPeriod: false };
  }
  
  const isCancellableStatus = latestOrder.status === 'RESERVED' || latestOrder.status === 'PREPAID';
  if (!isCancellableStatus) {
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: null, isEvent: false, isPenaltyPeriod: false };
  }

  const createdAt = safeToDate(latestOrder.createdAt);
  const pickupDate = safeToDate(latestOrder.pickupDate);
  if (!createdAt || !pickupDate) {
      return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: '주문 또는 픽업일 정보를 확인할 수 없습니다.', isEvent: false, isPenaltyPeriod: false };
  }

  const firstPeriodDeadline = dayjs(createdAt);
  const deadlineDay = firstPeriodDeadline.day() === 6
    ? firstPeriodDeadline.add(2, 'day')
    : firstPeriodDeadline.add(1, 'day');
  const finalFirstPeriodDeadline = deadlineDay.hour(13).minute(0).second(0).millisecond(0).toDate();

  const finalCancelDeadline = dayjs(pickupDate).hour(13).minute(0).second(0).millisecond(0).toDate();
  
  const now = new Date();

  if (now > finalCancelDeadline) {
    return { cancellable: false, orderToCancel: undefined, cancelDisabledReason: '픽업일 마감 시간이 지나 취소할 수 없습니다.', isEvent: false, isPenaltyPeriod: false };
  }
  
  const isPenalty = now > finalFirstPeriodDeadline;

  return { cancellable: true, orderToCancel: latestOrder, cancelDisabledReason: null, isEvent: false, isPenaltyPeriod: isPenalty };
};

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
      // ✅ [수정] hasMoreRef -> setHasMore(false)로 수정
      setHasMore(false);
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

// ✅ [수정] DateHeader 로직 변경
const DateHeader: React.FC<{ date: Date, viewMode: 'pickup' | 'waitlist' }> = React.memo(({ date, viewMode }) => (
  <h2 className="date-header">
    {/* viewMode === 'orders' 로직 제거 */}
    {viewMode === 'pickup' ? formatPickupDateHeader(date) : formatSimpleDate(date)} 
  </h2>
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

const QuantityControls: React.FC<{
  value: number;
  onUpdate: (newQuantity: number) => void;
  orderId: string;
  max?: number;
  onStockLimitDiscovered: (orderId: string, max: number) => void;
}> = ({ value, onUpdate, orderId, max, onStockLimitDiscovered }) => {
  const [currentQuantity, setCurrentQuantity] = useState(value);
  const [isUpdating, setIsUpdating] = useState(false);

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (max !== undefined && currentQuantity > max) {
      setCurrentQuantity(max);
    }
  }, [max, currentQuantity]);

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1) return;
    
    setCurrentQuantity(newQuantity);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      if (newQuantity !== value) {
        setIsUpdating(true);
        const promise = updateOrderQuantityCallable({ orderId, newQuantity });
        
        showPromiseToast(promise, {
            loading: '수량 변경 중...',
            success: (result) => {
                onUpdate(newQuantity);
                setIsUpdating(false);
                return result.data.message;
            },
            error: (err: any) => {
                setCurrentQuantity(value);
                setIsUpdating(false);
                const message = err.message || '수량 변경에 실패했습니다.';
                const match = message.match(/최대 (\d+)개/);
                if (match && match[1]) {
                    const maxQuantity = parseInt(match[1], 10);
                    onStockLimitDiscovered(orderId, maxQuantity);
                }
                return message;
            }
        });
      }
    }, 800);
  };
  
  return (
    <div className="quantity-controls">
      <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(currentQuantity - 1); }} disabled={isUpdating || currentQuantity <= 1}>
        <Minus size={20} />
      </button>
      <span className="quantity-value">{isUpdating ? '...' : currentQuantity}</span>
      <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(currentQuantity + 1); }} disabled={isUpdating || (max !== undefined && currentQuantity >= max)}>
        <Plus size={20} />
      </button>
    </div>
  );
};


const AggregatedItemCard: React.FC<{
  item: AggregatedItem;
  // displayDateInfo props는 픽업일순으로 고정되므로 제거
  isSelected: boolean;
  onSelect: (id: string) => void;
  onQuantityUpdate: (orderId: string, newQuantity: number) => void;
  maxQuantity?: number;
  onStockLimitDiscovered: (orderId: string, max: number) => void;
}> = React.memo(({ item, isSelected, onSelect, onQuantityUpdate, maxQuantity, onStockLimitDiscovered }) => {

  const { statusText, StatusIcon, statusClass } = useMemo(() => {
    if (item.wasPrepaymentRequired && item.status === 'RESERVED') {
      return { statusText: '선입금 필요', StatusIcon: CreditCard, statusClass: 'status-prepayment_required' };
    }
    const textMap: Record<OrderStatus, string> = { 
        RESERVED: '예약 완료', 
        PREPAID: '선입금 완료', 
        PICKED_UP: '픽업 완료', 
        COMPLETED: '처리 완료', 
        CANCELED: '취소됨', 
        NO_SHOW: '픽업 기간 만료', 
        LATE_CANCELED: '취소됨' 
    };
    const iconMap: Record<OrderStatus, React.ElementType> = { 
        RESERVED: Hourglass, 
        PREPAID: PackageCheck, 
        PICKED_UP: PackageCheck, 
        COMPLETED: CircleCheck, 
        CANCELED: PackageX, 
        NO_SHOW: AlertCircle, 
        LATE_CANCELED: PackageX 
    };
    return {
      statusText: textMap[item.status] || '알 수 없음',
      StatusIcon: iconMap[item.status] || AlertCircle,
      statusClass: `status-${item.status.toLowerCase()}`
    }
  }, [item.status, item.wasPrepaymentRequired]);


  const { cancellable, isEvent } = useMemo(() => getCancellationDetails(item), [item]);
  const isQuantityEditable = (item.status === 'RESERVED' || item.status === 'PREPAID') && item.originalOrders.length === 1;

  const isCanceledOrNoShow = useMemo(() => 
    item.status === 'CANCELED' || item.status === 'LATE_CANCELED' || item.status === 'NO_SHOW', 
    [item.status]
  );
  
  const topText = useMemo(
    () => isEvent ? item.productName : item.variantGroupName,
    [isEvent, item.productName, item.variantGroupName]
  );

  const bottomText = useMemo(
    () => isEvent ? item.originalOrders[0]?.items[0]?.roundName : item.itemName,
    [isEvent, item.originalOrders, item.itemName]
  );
    
  // ✅ [수정] useLongPress 제거 및 일반 onClick으로 변경
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isCanceledOrNoShow) return; 
    if (cancellable || (item.status === 'RESERVED' || item.status === 'PREPAID')) {
      e.preventDefault(); // 드래그 후 클릭 오인 방지를 위해
      onSelect(item.id);
    }
  }, [cancellable, item.status, item.id, onSelect, isCanceledOrNoShow]);
  
  // 픽업일순으로 통일되어 displayDateInfo가 필요 없어짐
  // let displayDateText = '';
  // if (displayDateInfo?.date) {
  //   const formattedDate = formatPickupDateShort(displayDateInfo.date);
  //   displayDateText = displayDateInfo.type === 'pickup' ? `픽업 ${formattedDate}` : ``;
  // }
  
  // 주문일순 탭이 제거되어 픽업일 정보는 이제 헤더에서 보여지므로 카드 내부에는 불필요

  return (
    <motion.div
      className={`order-card-v3 ${isSelected ? 'selected' : ''} ${cancellable ? 'cancellable' : ''} ${isEvent ? 'event-item' : ''} ${isCanceledOrNoShow ? 'canceled-order' : ''}`}
      layoutId={item.stableId}
      key={item.id}
      onClick={handleClick} // ✅ onClick으로 변경
      whileTap={cancellable && !isCanceledOrNoShow ? { scale: 0.98 } : {}}
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
              {!isQuantityEditable && <span className="item-quantity">({item.totalQuantity}개)</span>}
            </span>
            
            {isQuantityEditable ? (
              <div className="quantity-control-container" onClick={(e) => e.stopPropagation()}>
                <QuantityControls
                  value={item.totalQuantity}
                  onUpdate={(newQuantity) => onQuantityUpdate(item.originalOrders[0].id, newQuantity)}
                  orderId={item.originalOrders[0].id}
                  max={maxQuantity}
                  onStockLimitDiscovered={onStockLimitDiscovered}
                />
              </div>
            ) : (
              // displayDateText && <span className="date-info-badge">{displayDateText}</span>
              // 픽업일순으로 통일되어 카드 내부의 날짜 정보는 제거
              null
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

const WaitlistItemCard: React.FC<{ 
  item: WaitlistInfo; 
  isSelected: boolean; 
  onSelect: (id: string) => void; 
}> = React.memo(({ item, isSelected, onSelect }) => {
  const stableId = useMemo(() => item.timestamp.toMillis().toString(), [item.timestamp]);
  
  const handleSelect = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 드래그 후 클릭 오인 방지를 위해
    onSelect(stableId);
  }, [stableId, onSelect]);

  // useLongPress 제거
  // const handlers = useLongPress(() => {}, handleSelect, { initialDelay: 500 });

  return (
    <motion.div 
      className={`waitlist-card ${isSelected ? 'selected' : ''}`} 
      layout 
      onClick={handleSelect} // ✅ onClick으로 변경
      whileTap={{ scale: 0.98 }} 
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
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
        </div>
      </div>
    </motion.div>
  );
});

// 취소 요청에 대한 타입을 정의합니다.
type CancellationRequest = {
  type: 'order' | 'waitlist';
  items: OrderCancellationItem[] | WaitlistCancellationItem[];
};

const OrderHistoryPage: React.FC = () => {
  const { user, userDocument } = useAuth();
  const { runPageTourIfFirstTime } = useTutorial();
  // ✅ [수정] viewMode 기본값을 'pickup'으로 고정하고 'orders' 옵션 제거
  const [viewMode, setViewMode] = useState<'pickup' | 'waitlist'>('pickup'); 
  const [waitlist, setWaitlist] = useState<WaitlistInfo[]>([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);
  
  const [selectedOrderKeys, setSelectedOrderKeys] = useState<Set<string>>(new Set());
  const [selectedWaitlistKeys, setSelectedWaitlistKeys] = useState<Set<string>>(new Set());
  
  const [maxQuantities, setMaxQuantities] = useState<Record<string, number>>({});

  // 📌 1. 취소 확인을 관리하기 위한 새로운 상태 추가
  const [cancellationRequest, setCancellationRequest] = useState<CancellationRequest | null>(null);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getUserOrdersCallable = useMemo(() => httpsCallable(functions, 'getUserOrders'), [functions]);

  // ✅ [수정] viewMode 변경 함수에서 'orders' 제거
  const handleViewChange = (mode: 'pickup' | 'waitlist') => {
    setViewMode(mode);
    setSelectedOrderKeys(new Set());
    setSelectedWaitlistKeys(new Set());
  };

  const basePayload = useMemo(() => {
    const payload = { userId: user?.uid };
    
    // ✅ [최종 수정] '주문일순' 제거, '픽업일순'이 메인: 과거/미래 모두 픽업일 기준으로 정렬
    return { 
        ...payload, 
        orderByField: 'pickupDate', 
        orderDirection: 'desc', // 최근 픽업일이 위에 오도록 내림차순 정렬
        filterStatuses: null // 모든 주문 상태를 가져옴
      };
  }, [user]);

  // viewMode는 'pickup'으로 고정하거나 'waitlist'일 때만 isActive를 true로 설정
  const { data: orders, setData: setOrders, loading: ordersLoading, hasMore: hasMoreOrders, loadMore: loadMoreOrders } =
    usePaginatedData<Order>(user?.uid, getUserOrdersCallable, basePayload, viewMode === 'pickup'); // viewMode === 'orders' 로직 제거

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
          const fetchedWaitlist: WaitlistInfo[] = await getUserWaitlist(user.uid);
          
          const activeWaitlist = fetchedWaitlist.filter(item => {
            if (!item.primaryReservationEndAt) {
              console.warn('Waitlist item is missing primaryReservationEndAt:', item);
              return true;
            }
            return dayjs().isBefore(safeToDate(item.primaryReservationEndAt));
          });

          setWaitlist(activeWaitlist);

        } catch (error) {
          showToast('error', "대기 목록을 불러오는 데 실패했습니다.");
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
      // ✅ [수정] 픽업일(pickupDate) 기준으로 고정
      const date = safeToDate(order.pickupDate);
      if (!date) return;
      (order.items || []).forEach((item: OrderItem) => {
        // 각 주문이 고유한 카드로 표시되도록 aggregation key를 주문 ID 기반으로 설정
        const aggregationKey = `${order.id}-${item.itemId}`;
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
      // 주문 생성일(createdAt)이 아니라 픽업일(pickupDate) 기준으로 정렬해야 함 (다수 주문 취급 시)
      item.originalOrders.sort((a, b) => (safeToDate(b.pickupDate)?.getTime() || 0) - (safeToDate(a.pickupDate)?.getTime() || 0));
    });
    const groupedByDate: { [date: string]: AggregatedItem[] } = {};
    Object.values(aggregated).forEach(item => {
      const firstOrder = item.originalOrders[0];
      if (!firstOrder) return;
      // ✅ [수정] 픽업일(pickupDate) 기준으로 고정
      const date = safeToDate(firstOrder.pickupDate);
      if (!date) return;
      const dateStr = dayjs(date).format('YYYY-MM-DD');
      if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
      // AggregatedItemCard에 필요한 정보를 추가적으로 정렬하는 로직은 여기서는 생략
      groupedByDate[dateStr].push(item);
    });
    return groupedByDate;
    // viewMode는 'pickup'으로 고정되었으므로 의존성 배열에서 제거
  }, [orders]);

  const handleScroll = useCallback(() => {
    const isAtBottom = window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 200;
    // ✅ [수정] viewMode === 'orders' 로직 제거
    if (isAtBottom && viewMode === 'pickup' && !ordersLoading && hasMoreOrders) {
      loadMoreOrders();
    }
  }, [viewMode, ordersLoading, hasMoreOrders, loadMoreOrders]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleItemSelect = useCallback((itemKey: string, type: 'order' | 'waitlist') => {
    const setter = type === 'order' ? setSelectedOrderKeys : setSelectedWaitlistKeys;
    setter(prev => {
        const newSet = new Set(prev);
        if (newSet.has(itemKey)) newSet.delete(itemKey);
        else newSet.add(itemKey);
        return newSet;
    });
  }, []);

  const handleQuantityUpdate = useCallback((orderId: string, newQuantity: number) => {
    setOrders(prevOrders => prevOrders.map(order => {
        if (order.id === orderId) {
            const updatedItem = { ...order.items[0], quantity: newQuantity };
            return {
                ...order,
                items: [updatedItem],
                totalPrice: updatedItem.unitPrice * newQuantity,
            };
        }
        return order;
    }));
  }, [setOrders]);
  
  const handleStockLimitDiscovered = useCallback((orderId: string, max: number) => {
    setMaxQuantities(prev => ({ ...prev, [orderId]: max }));
  }, []);

  // 📌 2. 실제 취소를 실행하는 함수를 분리
  const executeCancellation = useCallback((request: CancellationRequest) => {
    const { type, items } = request;

    if (type === 'order') {
        const ordersToCancel = items as OrderCancellationItem[];
        const cancelPromises = ordersToCancel.map(item =>
            cancelOrder(item.order.id, { penaltyType: item.isPenalty ? 'late' : 'none' })
                .then(() => ({ status: 'fulfilled' as const, value: item }))
                .catch(error => ({ status: 'rejected' as const, reason: error, item }))
        );

        showPromiseToast(Promise.all(cancelPromises), {
            loading: `${ordersToCancel.length}개 항목 취소 중...`,
            success: (results) => {
                const successfulCancellations = results
                    .filter((r): r is { status: 'fulfilled'; value: OrderCancellationItem } => r.status === 'fulfilled')
                    .map(r => r.value);

                const failedCancellations = results
                    .filter((r): r is { status: 'rejected'; reason: any; item: OrderCancellationItem } => r.status === 'rejected');

                if (successfulCancellations.length > 0) {
                    const canceledOrderIds = new Set(successfulCancellations.map(i => i.order.id));
                    setOrders(prev => prev.map(o => {
                        if (canceledOrderIds.has(o.id)) {
                            const canceledItemInfo = successfulCancellations.find(i => i.order.id === o.id);
                            const newStatus: OrderStatus = canceledItemInfo?.isPenalty ? 'LATE_CANCELED' : 'CANCELED';
                            return { ...o, status: newStatus };
                        }
                        return o;
                    }));
                    setSelectedOrderKeys(new Set());
                }

                if (failedCancellations.length > 0) {
                    console.error('Order cancellation failures:', failedCancellations.map(f => ({ reason: f.reason, orderId: f.item.order.id })));
                    return `${successfulCancellations.length}개 취소 성공, ${failedCancellations.length}개 실패.`;
                }

                return `${successfulCancellations.length}개 항목이 취소되었습니다.`;
            },
            error: (err) => {
                console.error("Unexpected error during bulk order cancel:", err);
                return '일부 항목 취소 중 예상치 못한 오류가 발생했습니다.'
            }
        });

    } else { // waitlist
        if (!user) return;
        const itemsToCancel = items as WaitlistCancellationItem[];
        const cancelPromises = itemsToCancel.map(item =>
            cancelWaitlistEntry(item.productId, item.roundId, user.uid, item.itemId)
                .then(() => ({ status: 'fulfilled' as const, value: item }))
                .catch(error => ({ status: 'rejected' as const, reason: error, item }))
        );

        showPromiseToast(Promise.all(cancelPromises), {
            loading: `${itemsToCancel.length}개 항목 취소 중...`,
            success: (results) => {
                const successfulCancellations = results
                    .filter((r): r is { status: 'fulfilled', value: WaitlistInfo } => r.status === 'fulfilled')
                    .map(r => r.value);
                
                const failedCancellations = results
                    .filter((r): r is { status: 'rejected', reason: any, item: WaitlistInfo } => r.status === 'rejected');

                if (successfulCancellations.length > 0) {
                    const canceledKeys = new Set(successfulCancellations.map(i => i.timestamp.toMillis().toString()));
                    setWaitlist(prev => prev.filter(w => !canceledKeys.has(w.timestamp.toMillis().toString())));
                    setSelectedWaitlistKeys(new Set());
                }

                if (failedCancellations.length > 0) {
                    console.error("Waitlist cancellation failures:", failedCancellations.map(f => ({ reason: f.reason, item: f.item })));
                    return `${successfulCancellations.length}개 성공, ${failedCancellations.length}개 실패.`;
                }

                return `${successfulCancellations.length}개 대기 신청이 취소되었습니다.`;
            },
            error: () => '대기 취소 중 예상치 못한 오류가 발생했습니다.'
        });
    }
  }, [user, setOrders, setWaitlist]);


  // 📌 3. 취소 '요청'을 처리하는 함수 (상태만 변경)
  const handleBulkCancelRequest = useCallback((type: 'order' | 'waitlist') => {
    if (type === 'order') {
        const allAggregatedItems = Object.values(aggregatedItems).flat();
        const ordersToCancel: OrderCancellationItem[] = [];
        selectedOrderKeys.forEach(key => {
            const aggItem = allAggregatedItems.find(item => item.id === key);
            if (aggItem) {
                const { cancellable, orderToCancel, isPenaltyPeriod } = getCancellationDetails(aggItem);
                if (cancellable && orderToCancel) {
                    ordersToCancel.push({ order: orderToCancel, isPenalty: isPenaltyPeriod });
                }
            }
        });

        if (ordersToCancel.length === 0) {
            showToast('info', '취소할 수 있는 항목이 선택되지 않았습니다.');
            return;
        }
        setCancellationRequest({ type: 'order', items: ordersToCancel });
    } else { // waitlist
        const itemsToCancel: WaitlistCancellationItem[] = [];
        selectedWaitlistKeys.forEach(key => {
            const waitlistItem = waitlist.find(item => item.timestamp.toMillis().toString() === key);
            if (waitlistItem) itemsToCancel.push(waitlistItem);
        });

        if (itemsToCancel.length === 0) {
            showToast('info', '취소할 대기 항목이 선택되지 않았습니다.');
            return;
        }
        setCancellationRequest({ type: 'waitlist', items: itemsToCancel });
    }
  }, [aggregatedItems, selectedOrderKeys, selectedWaitlistKeys, waitlist]);


  // 📌 4. cancellationRequest 상태가 변경되면 확인 토스트를 띄우는 useEffect
  useEffect(() => {
    if (!cancellationRequest) {
        return;
    }

    const { type, items } = cancellationRequest;
    const toastId = `bulk-cancel-confirmation-${type}`;
    let title = '';
    let message = '';

    if (type === 'order') {
        const containsPenalty = (items as OrderCancellationItem[]).some(i => i.isPenalty);
        title = containsPenalty ? "🚨 페널티 포함된 취소" : "선택 항목 취소";
        message = `선택한 ${items.length}개의 예약을 정말 취소하시겠습니까?` + 
                  (containsPenalty ? "\n'노쇼' 처리되는 항목이 포함되어 있습니다." : "");
    } else {
        title = "대기 취소";
        message = `선택한 ${items.length}개의 대기 신청을 취소하시겠습니까?`;
    }

    toast((t) => (
        <div className="confirmation-toast-content">
            <AlertCircle size={44} className="toast-icon" style={{ color: 'var(--danger-color, #ef4444)' }} />
            <h4>{title}</h4>
            <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
            <div className="toast-buttons">
                <button className="common-button button-secondary button-medium" onClick={() => {
                    toast.dismiss(t.id);
                    setCancellationRequest(null); // '유지' 버튼 클릭 시 상태 초기화
                }}>유지</button>
                <button className="common-button button-danger button-medium" onClick={() => {
                    toast.dismiss(t.id);
                    executeCancellation(cancellationRequest); // 실행 함수 호출
                }}>모두 취소</button>
            </div>
        </div>
    ), { 
        id: toastId, 
        duration: Infinity, 
        style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } 
    });
    
    // 💡 [오류 수정] 622번째 줄 근처의 불필요한 return 블록 제거
  }, [cancellationRequest, executeCancellation]);

  const renderOrderContent = () => {
    const isFirstLoading = ordersLoading && orders.length === 0;
    if (isFirstLoading) { return <div className="loading-spinner-container"><InlineSodomallLoader /></div>; }

    const ordersExist = orders.length > 0;
    if (!ordersExist && !ordersLoading) { return <EmptyHistory type='pickup' />; } // ✅ type='pickup'으로 고정

    // ✅ [수정] 정렬: 픽업일(YYYY-MM-DD) 기준으로 내림차순(최신 픽업일이 위로)
    const sortedDates = Object.keys(aggregatedItems).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());


    return (
      <div className="orders-list">
        <AnimatePresence>
          {sortedDates.map((dateStr, index) => {
            if (aggregatedItems[dateStr].length === 0) return null;
            return (
              <motion.div key={dateStr} layout>
                <div className="date-header-container">
                  {/* ✅ [수정] viewMode를 DateHeader에 전달하여 '픽업상품' 헤더 포맷 사용 */}
                  <DateHeader date={new Date(dateStr)} viewMode="pickup" />
                  {index === 0 && (
                    <div className="cancel-instruction" data-tutorial-id="history-cancel-info">
                      <Info size={14} /><span>카드를 클릭하여 취소할 항목을 선택하세요.</span>
                    </div>
                  )}
                </div>
                <div className="order-cards-grid">
                  {aggregatedItems[dateStr].map(item => {
                    // 픽업일순으로 고정되었으므로 displayDateInfo는 AggregatedItemCard 내부에서 필요 없음.
                    return (
                      <AggregatedItemCard
                        key={item.id}
                        item={item}
                        isSelected={selectedOrderKeys.has(item.id)}
                        onSelect={(id) => handleItemSelect(id, 'order')}
                        // displayDateInfo props 제거
                        onQuantityUpdate={handleQuantityUpdate}
                        maxQuantity={maxQuantities[item.originalOrders[0]?.id]}
                        onStockLimitDiscovered={handleStockLimitDiscovered}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    );
  };

  const renderWaitlistContent = () => {
    if (loadingWaitlist) { return <div className="loading-spinner-container"><InlineSodomallLoader /></div>; }
    if (waitlist.length === 0 && !loadingWaitlist) { return <EmptyHistory type="waitlist" />; }
    return (
      <div className="waitlist-list">
         <div className="date-header-container">
            <h2 className="date-header">나의 대기 목록</h2>
            <div className="cancel-instruction" data-tutorial-id="history-cancel-info">
                <Info size={14} /><span>카드를 클릭하여 취소할 항목을 선택하세요.</span>
            </div>
        </div>
        <AnimatePresence>
          {waitlist.map(item => (
            <WaitlistItemCard
              key={`${item.roundId}-${item.itemId}-${item.timestamp.toMillis()}`}
              item={item}
              isSelected={selectedWaitlistKeys.has(item.timestamp.toMillis().toString())}
              onSelect={(id) => handleItemSelect(id, 'waitlist')}
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
          {/* ✅ [수정] 주문일순 탭 제거, 픽업 예약 내역 탭을 기본 활성화 상태로 유지 */}
          <button className={`toggle-btn ${viewMode === 'pickup' ? 'active' : ''}`} onClick={() => handleViewChange('pickup')}> <Truck size={18} /> 픽업 예약 내역 </button>
          <button className={`toggle-btn ${viewMode === 'waitlist' ? 'active' : ''}`} onClick={() => handleViewChange('waitlist')}> <Hourglass size={18} /> 대기목록 </button>
        </div>
        
        <AnimatePresence mode="wait">
          <motion.div key={viewMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} >
            {viewMode === 'waitlist' ? renderWaitlistContent() : renderOrderContent()}
          </motion.div>
        </AnimatePresence>
        {/* ✅ [수정] viewMode === 'orders' 로직 제거 */}
        {viewMode === 'pickup' && ordersLoading && orders.length > 0 && (<div className="loading-more-spinner"><InlineSodomallLoader /></div>)}
        {viewMode === 'pickup' && !hasMoreOrders && orders.length > 0 && (<div className="end-of-list-message">모든 내역을 불러왔습니다.</div>)}
        
        <AnimatePresence>
          {((viewMode === 'pickup' && selectedOrderKeys.size > 0) ||
           (viewMode === 'waitlist' && selectedWaitlistKeys.size > 0)) && (
            <motion.div
              className="fab-container"
              initial={{ y: 100, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            >
              <button 
                className="fab-cancel-btn" 
                onClick={() => handleBulkCancelRequest(viewMode === 'waitlist' ? 'waitlist' : 'order')}
              >
                <XCircle size={20} />
                <span>
                  {viewMode === 'waitlist' 
                    ? `${selectedWaitlistKeys.size}개 대기 취소` 
                    : `${selectedOrderKeys.size}개 예약 취소`}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OrderHistoryPage;