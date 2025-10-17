// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cancelOrder } from '@/firebase/orderService';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import type { Order, OrderItem, OrderStatus } from '@/shared/types';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import {
  Package, CircleCheck, AlertCircle, PackageCheck,
  PackageX, Hourglass, CreditCard, Info, XCircle, Plus, Minus
} from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import toast from 'react-hot-toast';
import { showToast, showPromiseToast } from '@/utils/toastUtils';
import './OrderHistoryPage.css';


// Firebase Functions 설정
const functions = getFunctions(getApp(), 'asia-northeast3');
const updateOrderQuantityCallable = httpsCallable<{ orderId: string; newQuantity: number }, { success: boolean, message: string }>(functions, 'updateOrderQuantity');

// 상수 정의
const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWFmMGY0Ii8+PC9zdmc+';

// 타입 정의
type OrderCancellationItem = { order: Order; isPenalty: boolean; };
type CancellationRequest = { type: 'order'; items: OrderCancellationItem[]; };

// 이미지 안전하게 로드하는 컴포넌트
const SafeThumb: React.FC<{ src?: string; alt: string; className?: string; }> = ({ src, alt, className }) => {
  const original = useMemo(() => (src && src.trim()) ? src : PLACEHOLDER, [src]);
  const optimized = useMemo(() => getOptimizedImageUrl(original, '200x200'), [original]);
  const [imageSrc, setImageSrc] = useState(optimized);
  const [hasError, setHasError] = useState(false);
  useEffect(() => { setImageSrc(getOptimizedImageUrl(original, '200x200')); setHasError(false); }, [original]);
  const handleError = () => { if (!hasError) { setImageSrc(original); setHasError(true); } else { setImageSrc(PLACEHOLDER); } };
  return <img src={imageSrc} alt={alt} className="w-full h-full object-cover rounded" loading="lazy" onError={handleError} />;
};


// 날짜 관련 유틸 함수
const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (date && typeof date._seconds === 'number' && typeof date._nanoseconds === 'number') {
    try {
      return new Timestamp(date._seconds, date._nanoseconds).toDate();
    } catch (e) {
      console.error("Failed to convert object to Timestamp/Date:", date, e);
      return null;
    }
  }
  return null;
};
const formatPickupDateHeader = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}) 픽업상품`;


// 취소 가능 여부 확인 로직
const getCancellationDetails = (order: Order): { cancellable: boolean; isPenalty: boolean; reason: string | null; } => {
  const isCancellableStatus = order.status === 'RESERVED' || order.status === 'PREPAID';
  if (!isCancellableStatus) return { cancellable: false, isPenalty: false, reason: '이미 처리된 주문입니다.' };

  const createdAt = safeToDate(order.createdAt);
  const pickupDate = safeToDate(order.pickupDate);
  if (!createdAt || !pickupDate) return { cancellable: false, isPenalty: false, reason: '날짜 정보 오류' };

  const finalCancelDeadline = dayjs(pickupDate).hour(13).minute(0).second(0).toDate();
  const penaltyDeadline = dayjs(createdAt).add(1, 'day').hour(13).minute(0).second(0).toDate();
  const now = new Date();

  if (now > finalCancelDeadline) return { cancellable: false, isPenalty: false, reason: '픽업일 마감 시간이 지났습니다.' };
  
  return { cancellable: true, isPenalty: now > penaltyDeadline, reason: null };
};

const usePaginatedOrders = (uid?: string) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true); // 처음 로딩 상태는 true
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<any | null>(null);
  const fetchOrdersFn = useMemo(() => httpsCallable(functions, 'getUserOrders'), []);

  const fetchOrders = useCallback(async (isInitial = false) => {
    if (!uid) {
      setLoading(false);
      // uid가 없으면 더 이상 fetch할 것이 없으므로 hasMore를 false로 설정
      setHasMore(false); 
      return;
    }
    if ((loadingMore && !isInitial) || (!hasMore && !isInitial)) return;
    
    if (isInitial) {
      setLoading(true);
      setLastVisible(null);
    } else {
      setLoadingMore(true);
    }
    
    try {
      // ✅ 수정된 부분: lastVisible이 null이 아닌 경우만 전달하도록 조건부 할당
      const lastDocToPass = isInitial ? null : lastVisible;

      const result = await fetchOrdersFn({
        userId: uid,
        pageSize: 10,
        // Firebase Function 인자에 'undefined'가 들어가지 않도록 명확하게 처리
        lastVisible: lastDocToPass, 
        orderByField: 'pickupDate',
        orderDirection: 'desc',
      });
      
      const { data: rawNewOrders, lastDoc } = result.data as { data: any[], lastDoc: any };
      
      const newOrders = rawNewOrders.map(order => ({
        ...order,
        createdAt: order.createdAt,
        pickupDate: order.pickupDate,
      })) as Order[];
      
      setOrders(prev => isInitial ? newOrders : [...prev, ...newOrders]);
      
      // ✅ 수정된 부분: lastDoc이 유효한 값일 경우에만 설정 (null/undefined 방지)
      setLastVisible(lastDoc || null); 
      
      // lastDoc이 없거나, 불러온 주문 수가 pageSize보다 적으면 hasMore = false
      if (!lastDoc || newOrders.length < 10) setHasMore(false);
      
    } catch (error) {
      console.error("Order fetching error:", error);
      showToast('error', '예약 내역을 불러오는데 실패했습니다.');
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [uid, loadingMore, hasMore, fetchOrdersFn, lastVisible]); // 의존성 배열 유지

  useEffect(() => {
    fetchOrders(true);
  }, [uid, fetchOrders]);
  
  return { orders, setOrders, loading, loadingMore, hasMore, loadMore: () => fetchOrders(false) };
};

// 수량 조절 컴포넌트
const QuantityControls: React.FC<{
  order: Order;
  onUpdate: (orderId: string, newQuantity: number) => void;
}> = ({ order, onUpdate }) => {
  const [currentQuantity, setCurrentQuantity] = useState(order.items[0].quantity);
  const [isUpdating, setIsUpdating] = useState(false);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    setCurrentQuantity(order.items[0].quantity);
  }, [order.items]);


  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1 || isUpdating) return;
    setCurrentQuantity(newQuantity);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(() => {
      setIsUpdating(true);
      const promise = updateOrderQuantityCallable({ orderId: order.id, newQuantity });
      showPromiseToast(promise, {
        loading: '수량 변경 중...',
        success: () => { onUpdate(order.id, newQuantity); setIsUpdating(false); return '수량이 변경되었습니다.'; },
        error: (err) => { 
          setCurrentQuantity(order.items[0].quantity); 
          setIsUpdating(false); 
          return err.message || '수량 변경 실패'; 
        }
      });
    }, 800);
  };
  
  return (
    <div className="quantity-controls">
      <button 
        onClick={(e) => { e.stopPropagation(); handleQuantityChange(currentQuantity - 1); }} 
        disabled={isUpdating || currentQuantity <= 1}
      >
        <Minus size={16} />
      </button>
      <span className="quantity-value">{isUpdating ? '...' : currentQuantity}</span>
      <button 
        onClick={(e) => { e.stopPropagation(); handleQuantityChange(currentQuantity + 1); }} 
        disabled={isUpdating}
      >
        <Plus size={16} />
      </button>
    </div>
  );
};


// 주문 카드 컴포넌트
const OrderCard: React.FC<{
  order: Order;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onQuantityUpdate: (orderId: string, newQuantity: number) => void;
}> = React.memo(({ order, isSelected, onSelect, onQuantityUpdate }) => {
  const item = order.items[0];
  if (!item) return null;
  
  const { statusText, StatusIcon, statusClass } = useMemo(() => {
    const textMap: Record<OrderStatus, string> = { RESERVED: '예약 완료', PREPAID: '선입금 완료', PICKED_UP: '픽업 완료', COMPLETED: '처리 완료', CANCELED: '취소됨', NO_SHOW: '미픽업', LATE_CANCELED: '취소됨' };
    const iconMap: Record<OrderStatus, React.ElementType> = { RESERVED: Hourglass, PREPAID: PackageCheck, PICKED_UP: PackageCheck, COMPLETED: CircleCheck, CANCELED: PackageX, NO_SHOW: AlertCircle, LATE_CANCELED: PackageX };
    const effectiveStatus = order.wasPrepaymentRequired && order.status === 'RESERVED' ? 'PREPAID_PENDING' : order.status;
    return {
      statusText: effectiveStatus === 'PREPAID_PENDING' ? '선입금 필요' : (textMap[order.status] || '알 수 없음'),
      StatusIcon: effectiveStatus === 'PREPAID_PENDING' ? CreditCard : (iconMap[order.status] || AlertCircle),
      statusClass: effectiveStatus === 'PREPAID_PENDING' ? 'status-prepaid-pending' : `status-${order.status.toLowerCase()}`
    };
  }, [order.status, order.wasPrepaymentRequired]);

  const { cancellable } = useMemo(() => getCancellationDetails(order), [order]);
  const isQuantityEditable = (order.status === 'RESERVED' || order.status === 'PREPAID');
  const isInactive = order.status === 'CANCELED' || order.status === 'LATE_CANCELED' || order.status === 'NO_SHOW';

  const handleClick = (e: React.MouseEvent) => {
    if (isInactive) return;
    if (cancellable) { e.preventDefault(); onSelect(order.id); }
  };

  return (
    <motion.div
      className={`order-card-v3 ${isSelected ? 'selected' : ''} ${cancellable ? 'cancellable' : ''} ${isInactive ? 'canceled-order' : ''}`}
      layoutId={order.id}
      key={order.id}
      onClick={handleClick}
      whileTap={cancellable && !isInactive ? { scale: 0.98 } : {}}
    >
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <SafeThumb src={item.imageUrl} alt={item.productName} className="item-image" />
        </div>
        <div className="item-aggregated-info">
          <div className="info-top-row">
            <span className="product-name-top">{item.variantGroupName}</span>
            <span className={`status-badge ${statusClass}`}><StatusIcon size={14} /> {statusText}</span>
          </div>
          <div className="info-bottom-row">
            <span className="item-options-quantity">
              <span className="item-option-name">{item.itemName}</span>
              {!isQuantityEditable && <span className="item-quantity">({item.quantity}개)</span>}
            </span>
            {isQuantityEditable ? (
              <div className="quantity-control-container" onClick={(e) => e.stopPropagation()}>
                <QuantityControls order={order} onUpdate={onQuantityUpdate} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
});


const OrderHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { orders, setOrders, loading, loadingMore, hasMore, loadMore } = usePaginatedOrders(user?.uid);
  const [selectedOrderKeys, setSelectedOrderKeys] = useState<Set<string>>(new Set());
  const [cancellationRequest, setCancellationRequest] = useState<CancellationRequest | null>(null);

  const handleScroll = useCallback(() => {
    if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 200 && !loading && hasMore) {
      loadMore();
    }
  }, [loading, hasMore, loadMore]);
  useEffect(() => { window.addEventListener('scroll', handleScroll); return () => window.removeEventListener('scroll', handleScroll); }, [handleScroll]);

  // ✅ [수정] 그룹화 로직 버그 수정
  const groupedOrders = useMemo(() => {
    const groups: { [date: string]: Order[] } = {};
    orders.forEach(order => {
      const date = safeToDate(order.pickupDate);
      if (date) {
        // dayjs()는 Date 객체를 직접 사용할 수 있습니다.
        const dateStr = dayjs(date).format('YYYY-MM-DD');
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(order);
      }
    });
    return groups;
  }, [orders]);

  const handleItemSelect = useCallback((orderId: string) => {
    setSelectedOrderKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  }, []);

  const handleQuantityUpdate = useCallback((orderId: string, newQuantity: number) => {
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        const updatedItem = { ...order.items[0], quantity: newQuantity };
        return { ...order, items: [updatedItem], totalPrice: updatedItem.unitPrice * newQuantity };
      }
      return order;
    }));
  }, [setOrders]);

  const executeCancellation = useCallback((request: CancellationRequest) => {
    const ordersToCancel = request.items;
    const promises = ordersToCancel.map(item =>
      cancelOrder(item.order.id, { penaltyType: item.isPenalty ? 'late' : 'none' })
        .catch(err => { console.error(`Failed to cancel ${item.order.id}`, err); return Promise.reject(err); })
    );

    showPromiseToast(Promise.allSettled(promises), {
      loading: `${ordersToCancel.length}개 항목 취소 중...`,
      success: () => {
        const canceledIds = new Set(ordersToCancel.map(i => i.order.id));
        setOrders(prev => prev.map(o => {
          if (canceledIds.has(o.id)) {
            const info = ordersToCancel.find(i => i.order.id === o.id);
            return { ...o, status: info?.isPenalty ? 'LATE_CANCELED' : 'CANCELED' };
          }
          return o;
        }));
        setSelectedOrderKeys(new Set());
        return '선택한 항목이 취소되었습니다.';
      },
      error: () => '일부 항목 취소에 실패했습니다.',
    });
  }, [setOrders]);

  const handleBulkCancelRequest = useCallback(() => {
    const toCancel: OrderCancellationItem[] = [];
    selectedOrderKeys.forEach(key => {
      const order = orders.find(o => o.id === key);
      if (order) {
        const { cancellable, isPenalty } = getCancellationDetails(order);
        if (cancellable) toCancel.push({ order, isPenalty });
      }
    });
    if (toCancel.length === 0) { showToast('info', '취소할 수 있는 항목이 없습니다.'); return; }
    setCancellationRequest({ type: 'order', items: toCancel });
  }, [selectedOrderKeys, orders]);

  useEffect(() => {
    if (!cancellationRequest) return;
    const { items } = cancellationRequest;
    const containsPenalty = items.some(i => i.isPenalty);
    const title = containsPenalty ? "🚨 페널티 포함된 취소" : "선택 항목 취소";
    const message = `선택한 ${items.length}개 예약을 취소하시겠습니까?` + (containsPenalty ? "\n'미픽업' 처리될 수 있습니다." : "");

    toast((t) => (
      <div className="confirmation-toast-content">
        <AlertCircle size={44} className="toast-icon" />
        <h4>{title}</h4>
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => { toast.dismiss(t.id); setCancellationRequest(null); }}>유지</button>
          <button className="common-button button-danger button-medium" onClick={() => { toast.dismiss(t.id); executeCancellation(cancellationRequest); }}>모두 취소</button>
        </div>
      </div>
    ), { duration: Infinity });
  }, [cancellationRequest, executeCancellation]);

  const renderContent = () => {
    if (loading && orders.length === 0) return <div className="loading-spinner-container"><SodomallLoader /></div>;
    if (!loading && orders.length === 0) return (
      <div className="empty-history-container">
        <Package size={48} className="empty-icon" />
        <h3 className="empty-title">아직 예약 내역이 없어요</h3>
        <p className="empty-description">상품을 주문하고 예약 내역을 확인해보세요!</p>
        <button className="go-to-shop-btn" onClick={() => navigate('/')}>상품 보러 가기</button>
      </div>
    );

    const sortedDates = Object.keys(groupedOrders).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    return (
      <div className="orders-list">
        <AnimatePresence>
          {sortedDates.map((dateStr, index) => (
            <motion.div key={dateStr} layout>
              <div className="date-header-container">
                <h2 className="date-header">{formatPickupDateHeader(new Date(dateStr))}</h2>
                {index === 0 && (
                  <div className="cancel-instruction"><Info size={14} /><span>카드를 클릭하여 취소할 항목을 선택하세요.</span></div>
                )}
              </div>
              <div className="order-cards-grid">
                {groupedOrders[dateStr].map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderKeys.has(order.id)}
                    onSelect={handleItemSelect}
                    onQuantityUpdate={handleQuantityUpdate}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="customer-page-container">
      <div className="order-history-page">
        <AnimatePresence mode="wait">
          <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>

        {loadingMore && <div className="loading-more-spinner"><SodomallLoader /></div>}
        {!hasMore && orders.length > 0 && <div className="end-of-list-message">모든 내역을 불러왔습니다.</div>}
        
        <AnimatePresence>
          {selectedOrderKeys.size > 0 && (
            <motion.div
              className="fab-container"
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            >
              <button className="fab-cancel-btn" onClick={handleBulkCancelRequest}>
                <XCircle size={20} />
                <span>{`${selectedOrderKeys.size}개 예약 취소`}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OrderHistoryPage;