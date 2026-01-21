// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cancelOrder } from '@/firebase/orderService';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Order, OrderItem, OrderStatus } from '@/shared/types';
import { 
  Timestamp, getFirestore, collection, query, where, 
  orderBy, limit, startAfter, getDocs, type QueryConstraint
} from 'firebase/firestore'; 
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import {
  Package, CircleCheck, AlertCircle, PackageCheck,
  PackageX, Hourglass, CreditCard, Info, XCircle, Plus, Minus, ChevronDown, MessageCircle
} from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import toast from 'react-hot-toast';
import { showToast, showPromiseToast } from '@/utils/toastUtils';
import './OrderHistoryPage.css';

// Firebase Functions 설정
const functions = getFunctions(getApp(), 'asia-northeast3');
const db = getFirestore(getApp());
const updateOrderQuantityCallable = httpsCallable<{ orderId: string; newQuantity: number }, { success: boolean, message: string }>(functions, 'updateOrderQuantity');

// 상수 정의
const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWFmMGY0Ii8+PC9zdmc+';

// 타입 정의
type OrderCancellationItem = { order: Order; isPenalty: boolean; };
type CancellationRequest = { type: 'order'; items: OrderCancellationItem[]; };

// ✅ [추가] 숨길 상태 정의 (취소/노쇼)
const isHiddenStatus = (status: OrderStatus) =>
  status === 'CANCELED' ||
  status === 'LATE_CANCELED' ||
  status === 'NO_SHOW';

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
  if (typeof date === 'number') return new Date(date);
  if (date instanceof Date) return date;
  if (typeof date?.toDate === 'function') return date.toDate();
  
  if (date && typeof date._seconds === 'number' && typeof date._nanoseconds === 'number') {
    try { return new Timestamp(date._seconds, date._nanoseconds).toDate(); } 
    catch (e) { console.error("Failed to convert _seconds object:", date); return null; }
  }
  
  if (date && typeof date.seconds === 'number' && typeof date.nanoseconds === 'number') {
    try { return new Date(date.seconds * 1000 + date.nanoseconds / 1000000); } 
    catch (e) { console.error("Failed to convert seconds object:", date); return null; }
  }

  if (typeof date === 'string') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatPickupDateHeader = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}) 픽업상품`;

// 취소 가능 여부 확인 로직
const getCancellationDetails = (order: Order): { cancellable: boolean; isPenalty: boolean; reason: string | null; } => {
  const isCancellableStatus = order.status === 'RESERVED' || order.status === 'PREPAID';
  if (!isCancellableStatus) return { cancellable: false, isPenalty: false, reason: null };

  const createdAt = order.createdAt instanceof Date ? order.createdAt : safeToDate(order.createdAt);
  const pickupDate = order.pickupDate instanceof Date ? order.pickupDate : safeToDate(order.pickupDate);
  
  if (!createdAt || !pickupDate) return { cancellable: false, isPenalty: false, reason: '날짜 정보 오류' };

  const finalCancelDeadline = dayjs(pickupDate).hour(13).minute(0).second(0).toDate();
  const penaltyDeadline = dayjs(createdAt).add(1, 'day').hour(13).minute(0).second(0).toDate();
  const now = new Date();

  if (now > finalCancelDeadline) return { cancellable: false, isPenalty: false, reason: '취소 가능 시간이 지났습니다.' };
  
  return { cancellable: true, isPenalty: now > penaltyDeadline, reason: null };
};

const usePaginatedOrders = (uid?: string) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ✅ [변경] 이제 커서는 복잡한 객체가 아니라 'createdAt(Timestamp)' 하나만 사용합니다.
  const [lastVisible, setLastVisible] = useState<Timestamp | null>(null);
  const lastVisibleRef = useRef<Timestamp | null>(lastVisible);
  lastVisibleRef.current = lastVisible;

  const fetchOrders = useCallback(
    async (isInitial = false) => {
      if (!uid) {
        setLoading(false);
        setHasMore(false);
        return;
      }

      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      try {
        const ordersRef = collection(db, "orders");

        // ✅ [핵심 수정 1] 쿼리에서 'pickupDate' 정렬을 제거했습니다.
        // 이제 pickupDate가 없는 예전 데이터도 필터링되지 않고 모두 가져옵니다.
        // ✅ [개선] 초기 로딩 시 더 많은 항목을 가져와서 사용자가 더 많은 내역을 볼 수 있도록 함
        const pageSize = isInitial ? 30 : 20; // 초기: 30개, 더보기: 20개씩
        const queryConstraints: QueryConstraint[] = [
          where("userId", "==", uid),
          orderBy("createdAt", "desc"), // 생성일 기준 정렬만 유지
          limit(pageSize),
        ];

        // ✅ [변경] 커서도 createdAt 하나만 사용합니다.
        const cursor = isInitial ? null : lastVisibleRef.current;
        if (cursor) {
          queryConstraints.push(startAfter(cursor));
        }

        const q = query(ordersRef, ...queryConstraints);
        const snapshot = await getDocs(q);

        // ✅ [핵심 수정 2] 데이터 매핑 시 fallback 로직 추가
        const newOrders = snapshot.docs.map((doc) => {
          const data = doc.data();

          const realCreatedAt = safeToDate(data.createdAt);
          const realPickupDate = safeToDate(data.pickupDate);

          // 픽업일이 없으면 생성일을 대신 사용 -> UI 그룹핑이 정상 작동함
          const effectivePickupDate = realPickupDate || realCreatedAt || null;

          return {
            ...data,
            id: doc.id,
            createdAt: realCreatedAt,
            pickupDate: effectivePickupDate,
          } as unknown as Order;
        });

        // 기존의 중복 제거 및 데이터 합치기 로직 유지
        setOrders((prev) => {
          const combined = isInitial ? newOrders : [...prev, ...newOrders];
          const map = new Map<string, Order>();
          combined.forEach((order) => {
            if (order && order.id) map.set(order.id, order);
          });
          return Array.from(map.values());
        });

        // ✅ [변경] 다음 페이지를 위한 커서 업데이트 (createdAt 기준)
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (lastDoc) {
          const lastDocData = lastDoc.data();
          const lastCreatedAt = lastDocData.createdAt as Timestamp | undefined;

          if (lastCreatedAt) {
            setLastVisible(lastCreatedAt);
          } else {
            // createdAt조차 없으면 더 이상 페이지네이션 불가
            setLastVisible(null);
            setHasMore(false);
          }
        } else {
          setLastVisible(null);
          setHasMore(false);
        }

        // 페이지 크기보다 적게 가져왔으면 더 이상 데이터 없음
        if (newOrders.length < pageSize) setHasMore(false);

      } catch (error: any) {
        console.error("Order fetching error:", error);
        setHasMore(false);
        setLastVisible(null);

        if (error.code === "failed-precondition") {
          showToast("error", "DB 인덱스 필요 (콘솔 확인)");
        } else {
          showToast("error", "예약 내역을 불러오는데 실패했습니다.");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [uid]
  );

  useEffect(() => {
    if (uid) {
      setOrders([]);
      setLastVisible(null);
      setHasMore(true);
      fetchOrders(true);
    } else {
      setOrders([]);
      setLastVisible(null);
      setHasMore(false);
      setLoading(false);
    }
  }, [uid, fetchOrders]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) fetchOrders(false);
  }, [loadingMore, hasMore, fetchOrders]);

  return { orders, setOrders, loading, loadingMore, hasMore, loadMore };
};
// 수량 조절 컴포넌트
const QuantityControls: React.FC<{
  order: Order;
  onUpdate: (orderId: string, newQuantity: number) => void;
}> = ({ order, onUpdate }) => {
  const [currentQuantity, setCurrentQuantity] = useState(order.items[0].quantity);
  const [isUpdating, setIsUpdating] = useState(false);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = order.items[0];
  const rawLimit = (item as any).limitQuantity;
  const limitQuantity = (rawLimit !== undefined && rawLimit !== null) ? Number(rawLimit) : Infinity;
  
  useEffect(() => { setCurrentQuantity(order.items[0].quantity); }, [order.items]);

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1 || isUpdating) return;
    if (limitQuantity !== Infinity && newQuantity > limitQuantity) {
        showToast('error', `최대 ${limitQuantity}개까지만 가능합니다.`);
        setCurrentQuantity(Math.min(currentQuantity, limitQuantity));
        return;
    }

    setCurrentQuantity(newQuantity);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(() => {
      setIsUpdating(true);
      const promise = updateOrderQuantityCallable({ orderId: order.id, newQuantity });
      showPromiseToast(promise, {
        loading: '수량 변경 중...',
        success: () => { 
            onUpdate(order.id, newQuantity); 
            setIsUpdating(false); 
            return '수량이 변경되었습니다.'; 
        },
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
        className="qty-btn minus"
      >
        <Minus size={16} />
      </button>
      <span className="quantity-value">{isUpdating ? '...' : currentQuantity}</span>
      <button 
        onClick={(e) => { e.stopPropagation(); handleQuantityChange(currentQuantity + 1); }} 
        disabled={isUpdating || (limitQuantity !== Infinity && currentQuantity >= limitQuantity)}
        className="qty-btn plus"
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

const { cancellable, reason } = useMemo(() => getCancellationDetails(order), [order]);

// ✅ 취소 가능 시간 안이고, 상태가 RESERVED / PREPAID 일 때만 수량 변경 가능
const isQuantityEditable =
  (order.status === 'RESERVED' || order.status === 'PREPAID') && cancellable;
  const isInactive = isHiddenStatus(order.status); // 이제 isHiddenStatus를 사용

  // ✅ 선입금 필요 여부 확인
  const needsPrepayment = order.wasPrepaymentRequired && order.status === 'RESERVED' && !order.prepaidAt;

  // ✅ 채널톡 열기 함수
  const openChannelTalk = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open('http://pf.kakao.com/_CxjNKn/chat', '_blank', 'noopener,noreferrer');
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (isInactive) return;
    if (cancellable) { e.preventDefault(); onSelect(order.id); }
  };

  return (
    <motion.div
      className={`order-card-v3 ${isSelected ? 'selected' : ''} ${cancellable ? 'cancellable' : ''} ${isInactive ? 'canceled-order' : ''}`}
      layoutId={order.id}
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
          
          {!cancellable && reason && !isInactive && (
            <div className="order-notice-message" style={{ marginTop: '8px', fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={12} /> <span>{reason}</span>
            </div>
          )}

          {/* ✅ 선입금 필요 안내 */}
          {needsPrepayment && (
            <div style={{ 
              marginTop: '12px', 
              padding: '12px', 
              background: '#FFF7ED', 
              border: '2px solid #F59E0B',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#D97706' }}>
                <CreditCard size={14} />
                <span>선입금 필요</span>
              </div>
              <p style={{ fontSize: '12px', color: '#92400E', lineHeight: '1.5', margin: 0 }}>
                해당 상품은 선입금 후 예약이 확정됩니다.
                <br />
                입금 계좌: <strong>우리은행 1005-504-763060 (차동진)</strong>
                <br />
                입금 금액: <strong>{order.totalPrice.toLocaleString()}원</strong>
              </p>
              <button
                onClick={openChannelTalk}
                style={{
                  marginTop: '4px',
                  padding: '8px 12px',
                  background: '#F59E0B',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#D97706';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F59E0B';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <MessageCircle size={16} />
                입금 내역 보내기 (채널톡)
              </button>
            </div>
          )}
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
  // ✅ 과거 내역(취소/노쇼)까지 포함해서 볼지 여부
  const [showHiddenOrders, setShowHiddenOrders] = useState(false);

  // ✅ [수정 반영] groupedOrders 만들 때 필터링
  const groupedOrders = useMemo(() => {
    const groups: { [date: string]: Order[] } = {};

    orders.forEach(order => {
      // ✅ 취소/노쇼는 아예 목록에서 제외
      if (!showHiddenOrders && isHiddenStatus(order.status as OrderStatus)) return;

      const date = order.pickupDate as unknown as Date;
      if (date && date instanceof Date) {
        const dateStr = dayjs(date).format('YYYY-MM-DD');
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(order);
      }
    });

    return groups;
  }, [orders, showHiddenOrders]);

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
            // 취소된 항목은 목록에서 제외될 것이므로, 상태 업데이트는 DB와 동기화 정도로만 의미가 있음.
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
    // Orders에는 취소된 항목도 포함될 수 있으므로, filteredOrders(groupedOrders의 keys)로 확인해야 함
    if (!loading && Object.keys(groupedOrders).length === 0) return (
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
        {/* ✅ [추가] 초기 로딩 시 안내 메시지 */}
        {loading && orders.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: '24px', 
            color: '#6b7280',
            fontSize: '14px'
          }}>
            <SodomallLoader />
            <div style={{ marginTop: '12px' }}>예약 내역을 불러오는 중...</div>
          </div>
        )}
        
        {/* ✅ 과거(취소/노쇼) 내역 토글 */}
        {!loading && Object.keys(groupedOrders).length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 16px' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={14} />
              <span>총 {orders.filter(o => !isHiddenStatus(o.status as OrderStatus) || showHiddenOrders).length}개의 예약 내역</span>
            </div>
            <button
              type="button"
              className="common-button button-secondary button-small"
              onClick={() => setShowHiddenOrders((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="취소/노쇼 내역까지 포함해서 볼지 선택합니다."
            >
              <Info size={14} />
              <span>{showHiddenOrders ? '취소/노쇼 숨기기' : '취소/노쇼 포함 보기'}</span>
            </button>
          </div>
        )}
        <AnimatePresence>
          {sortedDates.map((dateStr, index) => (
            <motion.div key={dateStr} layout>
              <div className="date-header-container">
                <h2 className="date-header">{formatPickupDateHeader(new Date(dateStr))}</h2>
                {/* ✅ [추가 제안] 총 개수 배지 (옵션) 
                    <span className="order-count-badge">{groupedOrders[dateStr].length}개</span>
                */}
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

        {/* ✅ [개선] 더보기 버튼 (더 눈에 띄게 개선) */}
        {hasMore && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            margin: '32px 0 40px',
            padding: '20px 0',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button 
              onClick={loadMore} 
              disabled={loadingMore}
              className="common-button button-primary"
              style={{ 
                width: '100%', 
                maxWidth: '400px', 
                padding: '14px 24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                fontSize: '15px',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }}
            >
              {loadingMore ? (
                <>
                  <SodomallLoader size={20} />
                  <span>지난 내역 불러오는 중...</span>
                </>
              ) : (
                <>
                  <ChevronDown size={20} />
                  <span>지난 예약 내역 더 보기</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="customer-page-container modern-shell">
      <div className="modern-inner-shell" style={{ padding: '16px 16px 40px' }}>
        <div className="order-history-page">
        <AnimatePresence mode="wait">
          <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>

        {!hasMore && Object.keys(groupedOrders).length > 0 && (
          <div className="end-of-list-message" style={{
            textAlign: 'center',
            padding: '20px',
            color: '#6b7280',
            fontSize: '14px',
            borderTop: '1px solid #e5e7eb',
            marginTop: '20px'
          }}>
            <PackageCheck size={20} style={{ marginBottom: '8px', opacity: 0.6 }} />
            <div>모든 예약 내역을 불러왔습니다.</div>
          </div>
        )}
        
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
    </div>
  );
};

export default OrderHistoryPage;