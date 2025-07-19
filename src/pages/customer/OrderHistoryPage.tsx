// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getUserOrders, updateOrderStatusAndLoyalty } from '@/firebase';
import useLongPress from '@/hooks/useLongPress';
import type { Order, OrderStatus } from '@/types';
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
}

// =================================================================
// 📌 헬퍼 함수 및 공용 데이터 (Helper Functions & Shared Data)
// =================================================================

// ✅ [오류 수정] 'blank' 타입을 올바르게 처리하도록 showToast 함수 수정
const showToast = (type: 'success' | 'error' | 'blank', message: string | React.ReactNode, duration: number = 4000) => {
  let toastFunction;
  switch (type) {
    case 'success':
      toastFunction = toast.success;
      break;
    case 'error':
      toastFunction = toast.error;
      break;
    case 'blank':
      toastFunction = toast; // 'blank' 타입은 아이콘 없는 기본 toast() 함수 사용
      break;
    default:
      toastFunction = toast;
  }

  const toastId = toastFunction(message, {
    duration: Infinity,
  });

  setTimeout(() => {
    toast.dismiss(toastId);
  }, duration);
};


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

const statusIcons: Record<OrderStatus, React.ReactElement> = {
  RESERVED: <Hourglass size={14} />,
  PREPAID: <CreditCard size={14} />,
  PICKED_UP: <PackageCheck size={14} />,
  COMPLETED: <CircleCheck size={14} />,
  CANCELED: <PackageX size={14} />,
  NO_SHOW: <AlertCircle size={14} />,
};

const statusTexts: Record<OrderStatus, string> = {
  RESERVED: '예약',
  PREPAID: '결제완료',
  PICKED_UP: '픽업완료',
  COMPLETED: '처리완료',
  CANCELED: '취소',
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
      showToast('error', '예약 내역을 불러오는 데 실패했습니다.');
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

const AggregatedItemCard: React.FC<{
  item: AggregatedItem;
  displayDateInfo?: { type: 'pickup' | 'order'; date: Date };
  onCancel?: (order: Order) => void;
}> = React.memo(({ item, displayDateInfo, onCancel }) => {

  const getCancellationInfo = useCallback(() => {
      const latestOrder = item.originalOrders[0];
      if (!latestOrder) return { cancellable: false };

      if (latestOrder.status !== 'RESERVED' && latestOrder.status !== 'PREPAID') return { cancellable: false };

      const now = new Date();
      const pickupDate = safeToDate(latestOrder.pickupDate);

      if (pickupDate) {
        const cancellationDeadline = new Date(pickupDate.getTime() - 60 * 60 * 1000);
        if (now >= cancellationDeadline) return { cancellable: false };
      }

      return { cancellable: true, orderToCancel: latestOrder };
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
              {statusIcons[item.status]} {statusTexts[item.status]}
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

// =================================================================
// 📌 메인 컴포넌트 (Main Component)
// =================================================================

const OrderHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const { orders, loading, error, setOrders } = useUserOrders(user?.uid);
  const [viewMode, setViewMode] = useState<'orders' | 'pickup'>('orders');

  const isProcessingCancel = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cleanup = () => {
      if (overlayRef.current && overlayRef.current.parentNode) {
        overlayRef.current.parentNode.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
    };
    return () => {
      toast.dismiss();
      cleanup();
    };
  }, []);

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
        const key = `${dateStr}-${item.productId.trim()}-${item.variantGroupName.trim()}-${item.itemName.trim()}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            id: key, productName: item.productName, variantGroupName: item.variantGroupName,
            itemName: item.itemName, totalQuantity: 0, imageUrl: item.imageUrl,
            originalOrders: [], status: order.status,
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

  const handleCancelOrder = useCallback(
    (order: Order) => {
      if (isProcessingCancel.current) return;

      overlayRef.current = document.createElement('div');
      overlayRef.current.className = 'toast-overlay';
      document.body.appendChild(overlayRef.current);

      const cleanup = () => {
        if (overlayRef.current && overlayRef.current.parentNode) {
          overlayRef.current.parentNode.removeChild(overlayRef.current);
          overlayRef.current = null;
        }
      };

      const now = new Date();
      const deadlineDate = safeToDate(order.items?.[0]?.deadlineDate);
      const isPenalty = deadlineDate ? now > deadlineDate : false;
      const toastMessage = isPenalty
        ? '마감일이 지난 상품입니다. 지금 취소하면 신뢰도 점수 10점이 차감됩니다. 정말 취소하시겠어요?'
        : '예약을 취소하시겠습니까?';
      const toastTitle = isPenalty ? '마감 후 취소' : '예약 취소';

      toast((t) => (
        <div className="confirmation-toast">
            <h4>{toastTitle}</h4>
            <p>{toastMessage}</p>
            <div className="toast-buttons">
                <button
                    className="common-button button-secondary button-medium"
                    onClick={() => {
                      toast.dismiss(t.id);
                      cleanup();
                    }}
                >
                    유지
                </button>
                <button
                    className="common-button button-danger button-medium"
                    onClick={async () => {
                        toast.dismiss(t.id);
                        cleanup();

                        isProcessingCancel.current = true;
                        const toastId = toast.loading('예약 취소 처리 중...');

                        try {
                          await updateOrderStatusAndLoyalty(
                            order, 'CANCELED', isPenalty ? -10 : 0,
                            isPenalty ? '마감 후 취소' : '일반 예약 취소'
                          );
                          
                          toast.dismiss(toastId);
                          showToast('success', '예약이 성공적으로 취소되었습니다.');

                          setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELED' } : o)));

                          if (isPenalty) {
                              showToast('error', '마감 후 취소로 신뢰도 점수 10점이 차감되었습니다.');
                          }
                        } catch (err: any) {
                          toast.dismiss(toastId);
                          showToast('error', err?.message || '취소 중 오류가 발생했습니다.');
                        } finally {
                          isProcessingCancel.current = false;
                        }
                    }}
                >
                    취소 확정
                </button>
            </div>
        </div>
      ), {
        duration: Infinity,
        position: 'top-center',
        style: {
          background: 'transparent',
          boxShadow: 'none',
          border: 'none',
          padding: 0,
        },
      });
    },
    [setOrders]
  );

  const renderContent = () => {
    if (loading) return (<div className="loading-spinner-container"><InlineSodamallLoader /></div>);
    if (error && !loading) return <div className="error-message">오류가 발생했습니다. 잠시 후 다시 시도해주세요.</div>;

    const currentViewData = viewMode === 'orders' ? aggregatedItemsByOrderDate : aggregatedItemsByPickupDate;
    const sortedDates = Object.keys(currentViewData).sort((a, b) => {
      const dateA = new Date(a).getTime(); const dateB = new Date(b).getTime();
      return viewMode === 'orders' ? dateB - dateA : dateA - dateB;
    });

    if (orders.length === 0) return <EmptyHistory />;
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
            <ListOrdered size={18} /> 주문일별 보기
          </button>
          <button className={`toggle-btn ${viewMode === 'pickup' ? 'active' : ''}`} onClick={() => setViewMode('pickup')}>
            <Truck size={18} /> 픽업일별 보기
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

export default OrderHistoryPage;