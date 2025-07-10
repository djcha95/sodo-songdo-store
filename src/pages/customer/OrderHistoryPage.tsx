// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getUserOrders, cancelOrder } from '@/firebase';
import type { Order, OrderItem, OrderStatus } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  ListOrdered,
  ChevronDown,
  Truck,
  CircleCheck,
  CircleX,
  AlertCircle,
  X,
  PackageCheck,
  PackageX,
  Hourglass,
  BadgeAlert,
  CalendarDays,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './OrderHistoryPage.css';

// =================================================================
// 📌 타입 정의 (Type Definitions)
// =================================================================

/** 픽업일 순으로 집계된 상품 정보 타입 */
interface AggregatedPickupItem {
  id: string; // 상품 ID
  name: string;
  totalQuantity: number;
  pickupDate: Timestamp | null;
  imageUrl: string;
  options: { name: string; quantity: number }[];
}

// =================================================================
// 📌 헬퍼 함수 (Helper Functions)
// =================================================================

/** 날짜를 'M월 D일 (요일)' 형식으로 변환합니다. */
const formatOrderDate = (date: Date): string => {
  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

/** 날짜를 'M/D(요일)' 형식으로 변환합니다. */
const formatPickupDateWithDay = (date: Date): string => {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = week[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
};


// =================================================================
// 📌 커스텀 훅 (Custom Hooks)
// =================================================================

/** 사용자의 주문 목록을 가져오는 커스텀 훅 */
const useUserOrders = (uid?: string) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedOrders = await getUserOrders(uid);
        setOrders(fetchedOrders);
      } catch (err) {
        console.error("예약 내역 로딩 오류:", err);
        setError("예약 내역을 불러오는 데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [uid]);

  return { orders, loading, error, setOrders };
};


// =================================================================
// 📌 하위 컴포넌트 (Sub-components)
// =================================================================

/** 날짜 헤더 컴포넌트 */
const DateHeader: React.FC<{ date: Date; type: 'order' | 'pickup' }> = ({ date, type }) => (
  <h2 className="date-header">
    <CalendarDays size={20} />
    <span>{formatOrderDate(date)} {type === 'order' ? '주문' : '픽업'}</span>
  </h2>
);

/** 시간 구분선 헤더 컴포넌트 */
const TimeSectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h3 className="time-section-header">{title}</h3>
);


/** 예약 내역이 없을 때 표시될 UI 컴포넌트 */
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

/** '주문일 순 보기'의 개별 주문 카드 컴포넌트 */
const OrderGroupCard: React.FC<{ order: Order; onCancel: (orderId: string, showWarning: boolean) => void }> = React.memo(({ order, onCancel }) => {
  const { status, items = [], totalPrice, id } = order;
  const statusIcons: Record<OrderStatus, React.ReactElement> = {
    RESERVED: <Hourglass size={16} />,
    PICKED_UP: <PackageCheck size={16} />,
    COMPLETED: <CircleCheck size={16} />,
    CANCELED: <PackageX size={16} />,
    NO_SHOW: <AlertCircle size={16} />,
  };
  const statusTexts: Record<OrderStatus, string> = {
    RESERVED: '예약됨',
    PICKED_UP: '픽업 완료',
    COMPLETED: '처리 완료',
    CANCELED: '예약 취소',
    NO_SHOW: '노쇼',
  };

  const getCancellationInfo = useCallback(() => {
    if (status !== 'RESERVED') {
      return { cancellable: false, showWarning: false };
    }
    const now = new Date();
    const pickupDate = order.pickupDate?.toDate();

    if (pickupDate && now >= pickupDate) {
      return { cancellable: false, showWarning: false };
    }
    if (pickupDate && pickupDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
      return { cancellable: true, showWarning: true };
    }
    return { cancellable: true, showWarning: false };
  }, [order.pickupDate, status]);
  
  const { cancellable, showWarning } = getCancellationInfo();
  
  return (
    <motion.div className="order-card" layout>
      <div className="card-header">
        <span className={`status-badge status-${status.toLowerCase()}`}>
          {statusIcons[status]} {statusTexts[status]}
        </span>
        <span className="order-date">
          픽업: {order.pickupDate ? formatPickupDateWithDay(order.pickupDate.toDate()) : '미정'}
        </span>
      </div>
      <div className="card-body">
        {items.map((item, index) => (
          <div key={index} className="order-item">
            <div className="item-image-wrapper">
              <img src={item.imageUrl} alt={item.productName} className="item-image" />
            </div>
            <div className="item-details">
              <span className="item-name">{item.productName} ({item.itemName})</span>
              <span className="item-quantity-price">
                {item.quantity}개 / {(item.unitPrice * item.quantity).toLocaleString()}원
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="card-footer">
        <span className="total-price">총 {totalPrice.toLocaleString()}원</span>
        {cancellable && (
          <button 
            className={`cancel-button ${showWarning ? 'warning' : ''}`} 
            onClick={() => onCancel(id, showWarning)}
          >
            {showWarning ? <BadgeAlert size={16}/> : <X size={16} />}
            {showWarning ? '신중 취소' : '예약 취소'}
          </button>
        )}
      </div>
    </motion.div>
  );
});

/** '픽업일 순 보기'의 날짜별 그룹 카드 컴포넌트 */
const PickupGroupCard: React.FC<{ date: string; items: AggregatedPickupItem[] }> = React.memo(({ date, items }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <motion.div className="pickup-group-card" layout>
      <button className="collapsible-trigger" onClick={() => setIsOpen(!isOpen)}>
        <div className="trigger-content">
          <Truck size={20} />
          <h3 className="pickup-group-title">
            {formatPickupDateWithDay(new Date(date))} 픽업
          </h3>
        </div>
        <ChevronDown size={24} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="collapsible-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {items.map((item) => (
              <div key={item.id} className="pickup-item">
                <div className="item-image-wrapper">
                  <img src={item.imageUrl} alt={item.name} className="item-image" />
                </div>
                <div className="item-details">
                  <span className="item-name">{item.name}</span>
                  <span className="item-total-quantity">총 {item.totalQuantity}개</span>
                  <div className="item-options-list">
                    {item.options.map((opt, i) => (
                      <span key={i} className="option-chip">{opt.name}: {opt.quantity}개</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/** '픽업일 순 보기'의 기간별 집계 카드 컴포넌트 (지난주, 월별 등) */
const AggregatedPickupGroupCard: React.FC<{ title: string; dateGroups: {date: string; items: AggregatedPickupItem[]}[] }> = React.memo(({ title, dateGroups }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <motion.div className="pickup-group-card" layout>
            <button className="collapsible-trigger" onClick={() => setIsOpen(!isOpen)}>
                <div className="trigger-content">
                    <CalendarDays size={20} />
                    <h3 className="pickup-group-title">{title}</h3>
                </div>
                <ChevronDown size={24} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="collapsible-content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                        {dateGroups.map(({ date, items }) => (
                            <div key={date} className="aggregated-item-group">
                                <h4 className='aggregated-item-date'>{formatPickupDateWithDay(new Date(date))}</h4>
                                {items.map(item => (
                                     <div key={item.id} className="pickup-item">
                                        <div className="item-image-wrapper">
                                          <img src={item.imageUrl} alt={item.name} className="item-image" />
                                        </div>
                                        <div className="item-details">
                                        <span className="item-name">{item.name}</span>
                                        <span className="item-total-quantity">총 {item.totalQuantity}개</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
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

  const ordersByDate = useMemo(() => {
    return orders.reduce((acc, order) => {
      const date = order.createdAt instanceof Timestamp ? order.createdAt.toDate() : new Date();
      const dateStr = date.toISOString().split('T')[0];
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(order);
      return acc;
    }, {} as { [date: string]: Order[] });
  }, [orders]);

  const aggregatedItemsByPickupDate = useMemo(() => {
    const aggregated: { [key: string]: AggregatedPickupItem } = {};
    const filteredOrders = orders.filter(o => o.status === 'RESERVED' || o.status === 'PICKED_UP');

    filteredOrders.forEach(order => {
        if (!order.pickupDate) return;
        const dateStr = order.pickupDate.toDate().toISOString().split('T')[0];

        order.items.forEach(item => {
            const key = `${item.productId}_${dateStr}`;
            if (!aggregated[key]) {
                aggregated[key] = {
                    id: key,
                    name: item.productName,
                    pickupDate: order.pickupDate,
                    totalQuantity: 0,
                    imageUrl: item.imageUrl,
                    options: [],
                };
            }
            aggregated[key].totalQuantity += item.quantity;
            const existingOption = aggregated[key].options.find(opt => opt.name === item.itemName);
            if (existingOption) {
                existingOption.quantity += item.quantity;
            } else {
                aggregated[key].options.push({ name: item.itemName, quantity: item.quantity });
            }
        });
    });
    
    const groupedByDate: { [date: string]: AggregatedPickupItem[] } = {};
    Object.values(aggregated).forEach(item => {
      const dateStr = item.pickupDate!.toDate().toISOString().split('T')[0];
      if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
      groupedByDate[dateStr].push(item);
    });
    return groupedByDate;
  }, [orders]);

  const groupedPickupItems = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const upcoming: { date: string; items: AggregatedPickupItem[] }[] = [];
    const pastLast7Days: { date: string; items: AggregatedPickupItem[] }[] = [];
    const past8to14Days: { date: string; items: AggregatedPickupItem[] }[] = [];
    const olderByMonth: { [month: string]: { date: string; items: AggregatedPickupItem[] }[] } = {};
    
    const sortedDates = Object.keys(aggregatedItemsByPickupDate).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());

    for (const dateStr of sortedDates) {
        const pickupDate = new Date(dateStr);
        pickupDate.setUTCHours(0, 0, 0, 0);
        const data = { date: dateStr, items: aggregatedItemsByPickupDate[dateStr] };

        if (pickupDate >= today) {
            upcoming.push(data);
        } else {
            const diffTime = today.getTime() - pickupDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

            if (diffDays <= 7) pastLast7Days.push(data);
            else if (diffDays <= 14) past8to14Days.push(data);
            else {
                const monthKey = `${pickupDate.getFullYear()}년 ${pickupDate.getMonth() + 1}월`;
                if (!olderByMonth[monthKey]) olderByMonth[monthKey] = [];
                olderByMonth[monthKey].push(data);
            }
        }
    }
    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { upcoming, pastLast7Days, past8to14Days, olderByMonth };
  }, [aggregatedItemsByPickupDate]);

  /** 주문 취소 핸들러 */
  const handleCancelOrder = useCallback((orderId: string, showWarning: boolean) => {
    if (!user) return;

    const performCancellation = async () => {
      const toastId = toast.loading('예약 취소 처리 중...');
      try {
        await cancelOrder(orderId, user.uid);
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELED' } : o));
        toast.success('예약이 성공적으로 취소되었습니다.', { id: toastId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`취소 중 오류가 발생했습니다: ${message}`, { id: toastId });
      }
    };

    const toastMessage = showWarning 
      ? "마감이 임박한 상품입니다. 정말 예약을 취소하시겠어요? 취소는 운영에 영향을 줄 수 있습니다."
      : "예약을 취소하시겠습니까? 취소된 예약은 복구할 수 없습니다.";
    
    const toastTitle = showWarning ? "마감 임박" : "예약 취소 확인";

    toast((t) => (
      <div className="confirmation-toast">
        <h4>{toastTitle}</h4>
        <p>{toastMessage}</p>
        <div className="toast-buttons">
          <button onClick={() => toast.dismiss(t.id)}>유지</button>
          <button className="confirm" onClick={() => {
            toast.dismiss(t.id);
            performCancellation();
          }}>
            취소 확정
          </button>
        </div>
      </div>
    ), { duration: 6000 });
  }, [user, setOrders]);
  
  const renderContent = () => {
    if (loading) return <div className="loading-spinner-container"><div className="loading-spinner"></div></div>;
    if (error) return <div className="error-message">{error}</div>;
    if (orders.length === 0) return <EmptyHistory />;

    if (viewMode === 'orders') {
      const sortedDates = Object.keys(ordersByDate).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());
      return (
        <div className="orders-list">
          <AnimatePresence>
            {sortedDates.map(dateStr => (
              <motion.div key={dateStr} layout>
                <DateHeader date={new Date(dateStr)} type="order" />
                {ordersByDate[dateStr].map(order => (
                  <OrderGroupCard key={order.id} order={order} onCancel={handleCancelOrder} />
                ))}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      );
    } else { // pickup view
      const { upcoming, pastLast7Days, past8to14Days, olderByMonth } = groupedPickupItems;
      const hasContent = upcoming.length > 0 || pastLast7Days.length > 0 || past8to14Days.length > 0 || Object.keys(olderByMonth).length > 0;
      if (!hasContent) {
        return <div className="info-message">픽업 예정 또는 완료된 상품이 없습니다.</div>
      }
      return (
        <div className="pickup-list">
            {upcoming.length > 0 && <TimeSectionHeader title="예정된 픽업" />}
            {upcoming.map(({ date, items }) => (
                <PickupGroupCard key={date} date={date} items={items} />
            ))}

            {(pastLast7Days.length > 0 || past8to14Days.length > 0 || Object.keys(olderByMonth).length > 0) && (
                 <TimeSectionHeader title="지난 픽업" />
            )}
            {pastLast7Days.map(({ date, items }) => (
                <PickupGroupCard key={date} date={date} items={items} />
            ))}
            {past8to14Days.length > 0 && (
                <AggregatedPickupGroupCard title="지난 주" dateGroups={past8to14Days} />
            )}
            {Object.entries(olderByMonth).map(([month, dateGroups]) => (
                <AggregatedPickupGroupCard key={month} title={month} dateGroups={dateGroups} />
            ))}
        </div>
      );
    }
  };

  return (
    <div className="order-history-page">
      <div className="view-toggle-container">
        <button className={`toggle-btn ${viewMode === 'orders' ? 'active' : ''}`} onClick={() => setViewMode('orders')}>
          <ListOrdered size={18} /> 주문일 순 보기
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
