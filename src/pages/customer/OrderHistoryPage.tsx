// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getUserOrders, updateOrderStatusAndLoyalty } from '@/firebase';
import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderStatus } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  ListOrdered,
  Truck,
  CircleCheck,
  AlertCircle,
  PackageCheck,
  PackageX,
  Hourglass,
  CalendarDays,
  CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './OrderHistoryPage.css';

// =================================================================
// 📌 타입 정의 (Type Definitions)
// =================================================================

interface AggregatedItem {
  id: string;
  productName: string;
  variantGroupName: string; // ✅ [추가] 카드 제목으로 사용할 variant group 이름
  itemName: string;
  totalQuantity: number;
  imageUrl: string;
  originalOrders: Order[];
  status: OrderStatus;
}

// =================================================================
// 📌 헬퍼 함수 및 공용 데이터 (Helper Functions & Shared Data)
// =================================================================

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  return null;
};

const formatSimpleDate = (date: Date): string => {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}/${month}/${day}`;
};

const formatPickupDateShort = (date: Date): string => {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
};

const statusIcons: Record<OrderStatus, React.ReactElement> = {
  RESERVED: <Hourglass size={14} />,
  PREPAID: <CreditCard size={14} />,
  PICKED_UP: <PackageCheck size={14} />,
  COMPLETED: <CircleCheck size={14} />,
  CANCELED: <PackageX size={14} />,
  NO_SHOW: <AlertCircle size={14} />,
};

const statusTexts: Record<OrderStatus, string> = {
  RESERVED: '예약됨',
  PREPAID: '결제 완료',
  PICKED_UP: '픽업 완료',
  COMPLETED: '처리 완료',
  CANCELED: '예약 취소',
  NO_SHOW: '노쇼',
};

// =================================================================
// 📌 커스텀 훅 (Custom Hooks)
// =================================================================

const useUserOrders = (uid?: string) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetchedOrders = await getUserOrders(uid);
      setOrders(fetchedOrders);
    } catch (err) {
      console.error('예약 내역 로딩 오류:', err);
      setError('예약 내역을 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);
  return { orders, loading, error, setOrders };
};

// =================================================================
// 📌 하위 컴포넌트 (Sub-components)
// =================================================================

const DateHeader: React.FC<{ date: Date }> = React.memo(({ date }) => (
  <h2 className="date-header">{formatSimpleDate(date)}</h2>
));

const EmptyHistory: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="empty-history-container">
      <Package size={48} className="empty-icon" />
      <h3 className="empty-title">아직 예약 내역이 없어요</h3>
      <p className="empty-description">마음에 드는 상품을 찾아 예약해보세요!</p>
      <button className="go-to-shop-btn" onClick={() => navigate('/')}>
        상품 보러 가기
      </button>
    </div>
  );
};

// ✅ [수정] 카드 표시 정보 변경
// 기존 AggregatedItemCard 컴포넌트를 이 코드로 전체 교체하세요.
const AggregatedItemCard: React.FC<{
  item: AggregatedItem;
  displayDateInfo?: { type: 'pickup' | 'order'; date: Date };
  onCancel?: (order: Order) => void;
}> = React.memo(({ item, displayDateInfo, onCancel }) => {

  const getCancellationInfo = useCallback(() => {
      const latestOrder = item.originalOrders?.[item.originalOrders.length - 1];
      if (!latestOrder) return { cancellable: false };

      if (latestOrder.status !== 'RESERVED' && latestOrder.status !== 'PREPAID') return { cancellable: false };
      const now = new Date();
      const pickupDate = safeToDate(latestOrder.pickupDate);
      if (pickupDate && now >= pickupDate) return { cancellable: false };
      return { cancellable: true, orderToCancel: latestOrder };
  }, [item.originalOrders]);

  const { cancellable, orderToCancel } = getCancellationInfo();

  const HINT_TOAST_ID = 'cancel-hint-toast';
  const cancelHandlers = useLongPress(
    () => {
      if (cancellable && orderToCancel && onCancel) {
        onCancel(orderToCancel);
      }
    },
    () => {
      if (cancellable) {
        toast('카드를 꾹 눌러서 취소해주세요.', { id: HINT_TOAST_ID, duration: 1500 });
      }
    }
  );
  
  // ✅ [수정] 날짜 텍스트 생성 로직 변경
  let displayDateText = '';
  if (displayDateInfo && displayDateInfo.date) {
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
            <span className={`status-badge status-${item.status.toLowerCase()}`}>
              {statusIcons?.[item.status]} {statusTexts?.[item.status]}
            </span>
          </div>
          <div className="info-bottom-row">
            <span className="item-options-quantity">
              <span className="item-option-name">{item.itemName}</span>
              <span className="item-quantity">({item.totalQuantity}개)</span>
            </span>
            {/* ✅ [수정] 날짜 표시 부분 클래스명 변경 */}
            {displayDateText && <span className="date-info-badge">{displayDateText}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// =================================================================
// 📌 메인 컴포넌트 (Main Component)
// =================================================================

const OrderHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const { orders, loading, error, setOrders } = useUserOrders(user?.uid);
  const [viewMode, setViewMode] = useState<'orders' | 'pickup'>('orders');
  
  const isProcessingCancel = useRef(false);

  useEffect(() => {
    toast.dismiss();
  }, []);
  
  // ✅ [수정] `variantGroupName`을 합산 데이터에 추가
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
        const key = `${dateStr}-${item.productId.trim()}-${item.itemName.trim()}`;
        
        if (!aggregated[key]) {
          aggregated[key] = {
            id: key,
            productName: item.productName,
            variantGroupName: item.variantGroupName, // variantGroupName 추가
            itemName: item.itemName,
            totalQuantity: 0,
            imageUrl: item.imageUrl,
            originalOrders: [],
            status: order.status,
          };
        }
        
        aggregated[key].totalQuantity += item.quantity;
        aggregated[key].originalOrders.push(order);
      });
    });

    Object.values(aggregated).forEach(item => {
        const sortedOrders = [...item.originalOrders].sort((a,b) => safeToDate(b.createdAt)!.getTime() - safeToDate(a.createdAt)!.getTime());
        item.status = sortedOrders[0].status;
        item.originalOrders = sortedOrders;
    });

    const groupedByDate: { [date: string]: AggregatedItem[] } = {};
    Object.values(aggregated).forEach(item => {
      const firstOrder = item.originalOrders[0];
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
  
  const handleCancelOrder = useCallback(
    (order: Order) => {
      if (isProcessingCancel.current) return;
      isProcessingCancel.current = true;

      const now = new Date();
      const deadlineDate = safeToDate(order.items?.[0]?.deadlineDate);
      const isPenalty = deadlineDate ? now > deadlineDate : false;
      const toastMessage = isPenalty
        ? '마감일이 지난 상품입니다. 지금 취소하면 신뢰도 점수 10점이 차감됩니다. 정말 취소하시겠어요?'
        : '예약을 취소하시겠습니까?';
      const toastTitle = isPenalty ? '마감 후 취소' : '예약 취소';

      toast(
        (t) => (
          <div className="confirmation-toast">
            <h4>{toastTitle}</h4>
            <p>{toastMessage}</p>
            <div className="toast-buttons">
              <button
                className="common-button button-secondary button-medium"
                onClick={() => {
                  toast.dismiss(t.id);
                  isProcessingCancel.current = false;
                }}
              >
                유지
              </button>
              <button
                className="common-button button-danger button-medium"
                onClick={async () => {
                  toast.dismiss(t.id);
                  const toastId = toast.loading('예약 취소 처리 중...');
                  try {
                    await updateOrderStatusAndLoyalty(
                      order,
                      'CANCELED',
                      isPenalty ? -10 : 0,
                      isPenalty ? '마감 후 취소' : '일반 예약 취소'
                    );
                    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELED' } : o)));
                    toast.success('예약이 성공적으로 취소되었습니다.', { id: toastId });
                    if (isPenalty) toast.error('마감 후 취소로 신뢰도 점수 10점이 차감되었습니다.', { duration: 4000 });
                  } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    toast.error(`취소 중 오류가 발생했습니다: ${message}`, { id: toastId });
                  } finally {
                    isProcessingCancel.current = false;
                  }
                }}
              >
                취소 확정
              </button>
            </div>
          </div>
        ),
        { duration: 6000 }
      );
    },
    [setOrders]
  );

  const renderContent = () => {
    if (loading)
      return (
        <div className="loading-spinner-container">
          <div className="loading-spinner"></div>
        </div>
      );
    if (error) return <div className="error-message">{error}</div>;
    if (orders.length === 0) return <EmptyHistory />;

    if (viewMode === 'orders') {
      const sortedDates = Object.keys(aggregatedItemsByOrderDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      if (sortedDates.length === 0) return <div className="info-message">주문 내역이 없습니다.</div>;

      return (
        <div className="orders-list">
            {sortedDates.map(dateStr => (
              <motion.div key={dateStr} layout>
                <DateHeader date={new Date(dateStr)} />
                <div className="order-cards-grid">
                  {aggregatedItemsByOrderDate[dateStr].map(item => {
                    const pickupDate = safeToDate(item.originalOrders[0].pickupDate);
                    return (
                      <AggregatedItemCard 
                        key={item.id} 
                        item={item} 
                        displayDateInfo={pickupDate ? { type: 'pickup', date: pickupDate } : undefined}
                        onCancel={handleCancelOrder}
                      />
                    )
                  })}
                </div>
              </motion.div>
            ))}
        </div>
      );
    } else { // '픽업일 순 보기'
      const sortedPickupDates = Object.keys(aggregatedItemsByPickupDate).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );
      if (sortedPickupDates.length === 0) return <div className="info-message">픽업 예정 또는 완료된 상품이 없습니다.</div>;

      return (
        <div className="pickup-list">
            {sortedPickupDates.map(date => (
              <motion.div key={date} layout>
                <DateHeader date={new Date(date)} />
                <div className="order-cards-grid">
                  {aggregatedItemsByPickupDate[date].map(item => {
                    const orderDate = safeToDate(item.originalOrders[0].createdAt);
                    return (
                      <AggregatedItemCard 
                        key={item.id} 
                        item={item} 
                        displayDateInfo={orderDate ? { type: 'order', date: orderDate } : undefined}
                      />
                    )
                  })}
                </div>
              </motion.div>
            ))}
        </div>
      );
    }
  };

  return (
    <div className="order-history-page">
      <div className="view-toggle-container">
        <button className={`toggle-btn ${viewMode === 'orders' ? 'active' : ''}`} onClick={() => setViewMode('orders')}>
          <ListOrdered size={18} /> 주문일별 보기
        </button>
        <button className={`toggle-btn ${viewMode === 'pickup' ? 'active' : ''}`} onClick={() => setViewMode('pickup')}>
          <Truck size={18} /> 픽업일 순 보기
        </button>
      </div>
      {renderContent()}
    </div>
  );
};

export default OrderHistoryPage;