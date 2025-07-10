// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import { getUserOrders } from '../../firebase';
import { cancelOrder } from '../../firebase/orderService';
import type { Order, OrderItem, OrderStatus } from '../../types';
import { Timestamp } from 'firebase/firestore'; // FieldValue import 제거됨
import "../customer/OrderHistoryPage.css";
import { motion } from 'framer-motion';
import { AiOutlineCheckCircle, AiOutlineCloseCircle, AiOutlineExclamationCircle } from 'react-icons/ai';
import { IoIosArrowDown, IoIosArrowUp } from 'react-icons/io';
import { FiShoppingBag } from 'react-icons/fi';
import Collapsible from 'react-collapsible';

import toast from 'react-hot-toast';

interface GroupedOrders {
  [date: string]: Order[];
}

interface AggregatedPickupItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  totalPrice: number;
  orderId?: string;
  pickupDate: Timestamp | null;
  pickupDeadlineDate: Timestamp | null | undefined;
  status?: OrderStatus;
  statuses: { [key: string]: number };
  category?: string;
  subCategory?: string;
  deadlineDate?: Timestamp;
  stock?: number | null;
  imageUrl: string;
}

const OrderHistoryPage: React.FC = () => {
  const { user, notifications = [], handleMarkAsRead = () => {} } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'orders' | 'pickup'>('orders');

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) {
        setLoading(false);
        setError('로그인이 필요합니다.');
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const fetchedOrders = await getUserOrders(user.uid);
        const ordersWithProcessedDates = fetchedOrders.map(order => ({
          ...order,
          items: order.items.map(item => ({
            ...item,
            // types.ts의 OrderItem에 arrivalDate와 expirationDate가 추가되었다고 가정하고 사용합니다.
            arrivalDate: item.arrivalDate || (order.createdAt as Timestamp), // 기존 값이 없으면 order.createdAt 사용
            expirationDate: item.expirationDate || new Timestamp((order.createdAt as Timestamp).seconds + 5 * 24 * 60 * 60, 0), // 기존 값이 없으면 계산
          })),
        }));
        setOrders(ordersWithProcessedDates);
      } catch (err) {
        console.error("예약 내역 불러오기 오류:", err);
        setError('예약 내역을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user]);

  const groupedOrders = useMemo(() => {
    if (!orders.length) return {};
    const groups: GroupedOrders = {};
    orders.forEach(order => {
      const dateKey = (order.createdAt as Timestamp).toDate().toLocaleDateString('ko-KR') || '날짜 미정';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(order);
    });
    return groups;
  }, [orders]);

  const groupedPickupItems = useMemo(() => {
    const allItems = orders.flatMap(order =>
      order.items.map(item => ({
        ...item,
        orderStatus: order.status,
        pickupDate: order.pickupDate,
        pickupDeadlineDate: order.pickupDeadlineDate,
      }))
    );

    const aggregated = allItems.reduce((acc, item) => {
        const key = `${item.productId}_${item.itemName}`;

        if (!acc[key]) {
            acc[key] = {
                id: item.productId,
                name: item.itemName,
                imageUrl: item.imageUrl,
                quantity: 0,
                price: item.unitPrice,
                totalPrice: 0,
                pickupDate: item.pickupDate,
                pickupDeadlineDate: item.pickupDeadlineDate,
                statuses: {},
                category: item.category,
                subCategory: item.subCategory,
                deadlineDate: item.deadlineDate,
                stock: item.stock,
            };
        }
        acc[key].quantity += item.quantity;
        acc[key].totalPrice += item.unitPrice * item.quantity;

        const currentStatusCount = acc[key].statuses[item.orderStatus] || 0;
        acc[key].statuses[item.orderStatus] = currentStatusCount + item.quantity;

        return acc;
    }, {} as { [key: string]: AggregatedPickupItem });

    const finalItems = Object.values(aggregated);

    const groups: { [date: string]: AggregatedPickupItem[] } = {};
    finalItems.sort((a, b) => (a.pickupDate?.toMillis() || 0) - (b.pickupDate?.toMillis() || 0));

    finalItems.forEach(item => {
      const dateKey = item.pickupDate?.toDate().toLocaleDateString('ko-KR') || '날짜 미정';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(item);
    });

    return groups;
  }, [orders]);


  const getOrderStatusDisplay = (order: Order) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const pickupDeadline = order.pickupDeadlineDate?.toDate();
    const isPickupDeadlinePassed = pickupDeadline && pickupDeadline.getTime() < now.getTime();

    switch (order.status) {
      case 'CANCELED':
        return { text: '예약 취소', className: 'status-cancelled', icon: <AiOutlineCloseCircle /> };
      case 'PICKED_UP':
      case 'COMPLETED':
        return { text: '픽업 완료', className: 'status-delivered', icon: <AiOutlineCheckCircle /> };
      case 'RESERVED':
        if (isPickupDeadlinePassed) {
          return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
        }
        return { text: '예약됨', className: 'status-reserved', icon: <AiOutlineCheckCircle /> };
      case 'NO_SHOW':
        return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
      default:
        return { text: order.status, className: '', icon: null };
    }
  };

  const getAggregatedItemStatusDisplay = (item: AggregatedPickupItem) => {
    const mostFrequentStatus = Object.keys(item.statuses).reduce((a, b) => item.statuses[a] > item.statuses[b] ? a : b, '');

    switch (mostFrequentStatus as OrderStatus) {
        case 'CANCELED':
            return { text: '일부 취소', className: 'status-cancelled', icon: <AiOutlineCloseCircle /> };
        case 'PICKED_UP':
        case 'COMPLETED':
            return { text: '일부 픽업 완료', className: 'status-delivered', icon: <AiOutlineCheckCircle /> };
        case 'RESERVED':
            return { text: '예약됨', className: 'status-reserved', icon: <AiOutlineCheckCircle /> };
        case 'NO_SHOW':
            return { text: '일부 노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
        default:
            return { text: '혼합 상태', className: '', icon: null };
    }
  };


  const formatDate = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '미정';
    const date = timestamp.toDate();
    return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  };

  const formatDateYYMMDD = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '미정';
    const date = timestamp.toDate();
    const year = date.getFullYear().toString().slice(2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const getPickupDeadlineText = (item: AggregatedPickupItem) => {
    if (!item.pickupDeadlineDate || !(item.pickupDeadlineDate instanceof Timestamp)) {
        return '날짜 정보 없음';
    }

    const pickup = item.pickupDate?.toDate();
    const deadline = item.pickupDeadlineDate.toDate();

    if (pickup &&
        deadline &&
        pickup.getFullYear() === deadline.getFullYear() &&
        pickup.getMonth() === deadline.getMonth() &&
        pickup.getDate() === deadline.getDate()) {
      return <span className="pickup-deadline same-day">당일픽업</span>;
    }

    return formatDateYYMMDD(item.pickupDeadlineDate);
  };

  const getCancellationInfo = useCallback((order: Order) => {
    const now = new Date();
    const pickupDate = order.pickupDate?.toDate();

    if (order.status !== 'RESERVED') {
      return { cancellable: false, showWarning: false, reason: '취소/완료된 주문' };
    }

    if (pickupDate && now >= pickupDate) {
      return { cancellable: false, showWarning: false, reason: '픽업 시작일 경과' };
    }

    const firstItem = order.items[0];
    if (!firstItem || !firstItem.deadlineDate) {
      return { cancellable: true, showWarning: false, reason: '정보 부족' };
    }

    const deadline = firstItem.deadlineDate.toDate();
    const isLimited = firstItem.stock != null;

    const uploadDate = new Date(deadline.getTime() - (24 + 13) * 60 * 60 * 1000);
    uploadDate.setHours(0, 0, 0, 0);

    if (isLimited) {
      const freeCancelEnd = new Date(uploadDate.getTime());
      freeCancelEnd.setHours(22, 0, 0, 0);

      const cautiousCancelEnd = new Date(uploadDate.getTime());
      cautiousCancelEnd.setDate(cautiousCancelEnd.getDate() + 1);
      cautiousCancelEnd.setHours(10, 0, 0, 0);

      if (now <= freeCancelEnd) return { cancellable: true, showWarning: false, reason: '자유 취소' };
      if (now <= cautiousCancelEnd) return { cancellable: true, showWarning: true, reason: '신중 취소' };

    } else {
      const freeCancelEnd = new Date(uploadDate.getTime());
      freeCancelEnd.setDate(freeCancelEnd.getDate() + 1);
      freeCancelEnd.setHours(10, 0, 0, 0);

      const cautiousCancelEnd = new Date(uploadDate.getTime());
      cautiousCancelEnd.setDate(cautiousCancelEnd.getDate() + 1);
      cautiousCancelEnd.setHours(13, 0, 0, 0);

      if (now <= freeCancelEnd) return { cancellable: true, showWarning: false, reason: '자유 취소' };
      if (now <= cautiousCancelEnd) return { cancellable: true, showWarning: true, reason: '신중 취소' };
    }

    return { cancellable: false, showWarning: false, reason: '취소 기간 만료' };
  }, []);

  const handleCancelOrder = async (orderId: string) => {
    if (!user?.uid) {
      toast.error('로그인 정보가 없어 주문을 취소할 수 없습니다.');
      return;
    }

    const orderToCancel = orders.find(order => order.id === orderId);
    if (!orderToCancel) {
      toast.error('취소할 주문을 찾을 수 없습니다.');
      return;
    }
    const cancellationInfo = getCancellationInfo(orderToCancel);

    if (cancellationInfo.showWarning) {
      toast((t) => (
        <div className="confirmation-toast-simple">
          <h4>정말 취소하시겠어요?</h4>
          <p>마감이 임박한 상품의 취소는 재고 운영에 영향을 줄 수 있습니다.</p>
          <div className="toast-buttons-simple">
            <button className="toast-cancel-btn-simple" onClick={() => toast.dismiss(t.id)}>
              유지
            </button>
            <button
              className="toast-confirm-btn-simple danger"
              onClick={() => {
                toast.dismiss(t.id);
                toast.promise(cancelOrder(user.uid, orderId), {
                  loading: '주문 취소 중...',
                  success: () => {
                    setOrders(prevOrders => prevOrders.map(order =>
                      order.id === orderId ? { ...order, status: 'CANCELED' as OrderStatus } : order
                    ));
                    return '예약이 취소되었습니다.';
                  },
                  error: (err) => `취소에 실패했습니다. ${err.message || '다시 시도해 주세요.'}`,
                });
              }}
            >
              취소하기
            </button>
          </div>
        </div>
      ), { duration: 6000, style: { background: 'transparent', boxShadow: 'none' } });
    } else {
      toast.promise(cancelOrder(user.uid, orderId), {
        loading: '주문 취소 중...',
        success: () => {
          setOrders(prevOrders => prevOrders.map(order =>
            order.id === orderId ? { ...order, status: 'CANCELED' as OrderStatus } : order
          ));
          return '예약이 취소되었습니다.';
        },
        error: (err) => `취소에 실패했습니다. ${err.message || '다시 시도해 주세요.'}`,
      });
    }
  };

  /* ───── 렌더링 ───── */

  const OrderView = () => {
    const dates = Object.keys(groupedOrders).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return (
      <div className="order-history-list">
        {dates.map((date, index) => (
          <motion.div
            key={date}
            className="order-group-card"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            viewport={{ once: true, amount: 0.8 }}
          >
            <Collapsible
              triggerTagName="div"
              trigger={
                <div className="collapsible-header">
                  <div className="header-text">
                    <span className="group-date">{date}</span>
                    <span className="group-order-count">총 {groupedOrders[date].length}건</span>
                  </div>
                  <div className="header-icon-wrapper">
                    <IoIosArrowDown className="header-icon" />
                  </div>
                </div>
              }
              triggerWhenOpen={
                <div className="collapsible-header">
                  <div className="header-text">
                    <span className="group-date">{date}</span>
                    <span className="group-order-count">총 {groupedOrders[date].length}건</span>
                  </div>
                  <div className="header-icon-wrapper">
                    <IoIosArrowUp className="header-icon" />
                  </div>
                </div>
              }
              transitionTime={300}
              easing="ease-in-out"
            >
              <div className="collapsible-content">
                {(groupedOrders[date] || []).map((order: Order) => {
                  const statusDisplay = getOrderStatusDisplay(order);
                  const cancellationInfo = getCancellationInfo(order);
                  return (
                    <div key={order.id} className="order-card-in-group">
                      <div className="order-header-section-in-group">
                        <span className="order-id">주문번호: {order.id.slice(0, 8)}...</span>
                        <span className={`order-status-badge ${statusDisplay.className}`}>
                          {statusDisplay.icon}
                          {statusDisplay.text}
                        </span>
                      </div>
                      <ul className="order-items-detail-list">
                        {(order.items || []).map((item: OrderItem, idx: number) => (
                          <li key={idx} className="order-item-detail-row">
                            <div className="product-main-info">
                              <span className="product-name-qty">
                                {item.productName} <span className="product-quantity-display">({item.quantity}개)</span>
                              </span>
                              <span className="product-category">
                                [{item.category || '기타'}]
                                {item.subCategory && ` (${item.subCategory})`}
                              </span>
                            </div>
                            <div className="product-sub-info">
                              <span className="product-price">{(item.unitPrice * item.quantity).toLocaleString()}원</span>
                              <div className="product-date-info-group">
                                <span className="product-date-info">
                                  입고: {formatDate(item.arrivalDate || null)}
                                </span>
                                <span className="product-date-info">
                                  유통: {formatDate(item.expirationDate || null)}
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="order-footer-section">
                        <span className="order-pickup-info">
                          픽업 예정일: {order.pickupDate?.toDate().toLocaleDateString() || '미정'}
                          {order.pickupDeadlineDate && ` (마감: ${formatDate(order.pickupDeadlineDate)})`}
                        </span>
                        {cancellationInfo.cancellable && (
                          <button
                            className={`cancel-order-btn ${cancellationInfo.showWarning ? 'warning' : ''}`}
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={!cancellationInfo.cancellable}
                          >
                            {cancellationInfo.showWarning ? '신중 취소' : '예약 취소'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          </motion.div>
        ))}
      </div>
    );
  };

  const PickupView = () => {
    const dates = Object.keys(groupedPickupItems).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return (
      <div className="pickup-history-list">
        {dates.map((date, index) => (
          <motion.div
            key={date}
            className="pickup-group-card"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            viewport={{ once: true, amount: 0.8 }}
          >
            <Collapsible
              triggerTagName="div"
              trigger={
                <div className="collapsible-header">
                  <div className="header-text">
                    <span className="group-date">픽업일: {date}</span>
                    <span className="group-order-count">총 {groupedPickupItems[date].length}개 상품</span>
                  </div>
                  <div className="header-icon-wrapper">
                    <IoIosArrowDown className="header-icon" />
                  </div>
                </div>
              }
              triggerWhenOpen={
                <div className="collapsible-header">
                  <div className="header-text">
                    <span className="group-date">픽업일: {date}</span>
                    <span className="group-order-count">총 {groupedPickupItems[date].length}개 상품</span>
                  </div>
                  <div className="header-icon-wrapper">
                    <IoIosArrowUp className="header-icon" />
                  </div>
                </div>
              }
              transitionTime={300}
              easing="ease-in-out"
            >
              <div className="collapsible-content">
                {groupedPickupItems[date].map((item: AggregatedPickupItem, idx: number) => {
                  const itemStatusDisplay = getAggregatedItemStatusDisplay(item);
                  return (
                    <div key={`${item.id}-${idx}`} className="item-card-in-group aggregated-item-card">
                      <div className="item-card-header-row">
                        <span className="item-name">
                            {item.name} <span className="item-aggregated-quantity">({item.quantity}개)</span>
                        </span>
                        <span className={`item-card-status-badge ${itemStatusDisplay.className}`}>
                          {itemStatusDisplay.icon}
                          {itemStatusDisplay.text}
                        </span>
                      </div>
                      <div className="item-card-status-row">
                        <span className="item-category">
                          [{item.category || '기타'}]
                          {item.subCategory && ` (${item.subCategory})`}
                        </span>
                      </div>
                      <div className="item-card-bottom-row">
                        <span className="item-pickup-date">픽업 마감일: {getPickupDeadlineText(item)}</span>
                        <span className="item-price">{(item.totalPrice || 0).toLocaleString()}원</span>
                      </div>
                      {Object.keys(item.statuses).length > 1 && (
                          <div className="item-detailed-statuses">
                              {Object.entries(item.statuses).map(([status, count]) => (
                                  <span key={status} className="detailed-status-badge">
                                      {getStatusDisplayForDetail(status as OrderStatus).icon}
                                      {getStatusDisplayForDetail(status as OrderStatus).text}: {count}개
                                  </span>
                              ))}
                          </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Collapsible>
          </motion.div>
        ))}
      </div>
    );
  };

  const getStatusDisplayForDetail = (status: OrderStatus) => {
    switch (status) {
      case 'CANCELED': return { text: '취소', icon: <AiOutlineCloseCircle /> };
      case 'PICKED_UP': return { text: '픽업', icon: <AiOutlineCheckCircle /> };
      case 'COMPLETED': return { text: '완료', icon: <AiOutlineCheckCircle /> };
      case 'RESERVED': return { text: '예약', icon: <AiOutlineCheckCircle /> };
      case 'NO_SHOW': return { text: '노쇼', icon: <AiOutlineExclamationCircle /> };
      default: return { text: status, icon: null };
    }
  };


  const Body = () => {
    if (loading) return <p className="loading-message">예약 내역을 불러오는 중…</p>;
    if (error) return <p className="error-message">{error}</p>;

    return (orders.length === 0 ?
      <div className="empty-history-container">
        <FiShoppingBag className="empty-icon" size={50} />
        <p className="empty-title">아직 예약 내역이 없어요</p>
        <p className="empty-description">마음에 드는 상품을 찾아 예약해보세요!</p>
        <button className="go-to-shop-btn" onClick={() => window.location.href='/'}>상품 보러가기</button>
      </div>
      : (
        <>
          <div className="view-mode-toggle">
            <button
              className={viewMode === 'orders' ? 'active' : ''}
              onClick={() => setViewMode('orders')}
            >
              예약 건별 보기
            </button>
            <button
              className={viewMode === 'pickup' ? 'active' : ''}
              onClick={() => setViewMode('pickup')}
            >
              픽업일 순 보기
            </button>
          </div>
          {viewMode === 'orders' ? <OrderView /> : <PickupView />}
        </>
      )
    );
  };

  return (
    <>
      {/* Header 컴포넌트는 현재 Header.tsx의 로직에 따라 제목을 결정합니다. */}
      {/* notifications와 onMarkAsRead props는 Header 컴포넌트의 정의가 업데이트되어야 유효합니다. */}
      <Header
        title="예약 내역"
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
      />
      <div className="customer-page-container">
        <Body />
      </div>
    </>
  );
};

export default OrderHistoryPage;