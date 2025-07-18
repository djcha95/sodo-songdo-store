// src/pages/admin/OrderListPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/common/Header';
import { getUserOrders } from '../../firebase';
import type { Order, OrderItem } from '../../types';
import { Timestamp } from 'firebase/firestore';
import "../customer/OrderHistoryPage.css";
import { motion } from 'framer-motion';
import { AiOutlineCheckCircle, AiOutlineCloseCircle, AiOutlineClockCircle, AiOutlineExclamationCircle } from 'react-icons/ai';
import { IoIosArrowDown, IoIosArrowUp } from 'react-icons/io';
import Collapsible from 'react-collapsible';

const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && date.seconds !== undefined) {
      return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
    }
    return null;
  };

// OrderItemWithDetails 인터페이스 제거 (OrderItem에 이미 필요한 필드 포함)

interface GroupedOrders {
  [date: string]: Order[];
}

const OrderListPage: React.FC = () => {
  useDocumentTitle('고객 주문 내역');
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setOrders(fetchedOrders);
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
      const orderDate = safeToDate(order.createdAt);
      const dateKey = orderDate ? orderDate.toLocaleDateString('ko-KR') : '날짜 미정';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(order);
    });
    return groups;
  }, [orders]);

  const getOrderStatusDisplay = (order: Order) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const pickupDeadline = safeToDate(order.pickupDeadlineDate);
    const isPickupDeadlinePassed = pickupDeadline && pickupDeadline.getTime() < now.getTime();

    switch (order.status) {
      case 'CANCELED':
        return { text: '예약 취소', className: 'status-cancelled', icon: <AiOutlineCloseCircle /> };
      case 'PICKED_UP':
      case 'COMPLETED':
        return { text: '픽업 완료', className: 'status-delivered', icon: <AiOutlineCheckCircle /> };
      case 'PREPAID':
        if (isPickupDeadlinePassed) {
          return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
        }
        return { text: '선입금 완료', className: 'status-paid', icon: <AiOutlineCheckCircle /> };
      case 'RESERVED':
        if (isPickupDeadlinePassed) {
          return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
        }
        return { text: '예약중', className: 'status-pending', icon: <AiOutlineClockCircle /> };
      case 'NO_SHOW':
         return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
      default:
        return { text: order.status, className: '', icon: null };
    }
  };

  const formatDate = (timestamp?: Timestamp | Date | null) => {
    if (!timestamp) return '미정';
    const date = safeToDate(timestamp);
    if (!date) return '미정';
    return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  };

  const Body = () => {
    if (loading) return <p className="loading-message">예약 내역을 불러오는 중…</p>;
    if (error) return <p className="error-message">{error}</p>;
    if (orders.length === 0) return <p className="no-orders-message">예약 내역이 없습니다.</p>;

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
                  <div className="header-icon-wrapper"> <IoIosArrowDown className="header-icon" /> </div>
                </div>
              }
              triggerWhenOpen={
                 <div className="collapsible-header">
                  <div className="header-text">
                    <span className="group-date">{date}</span>
                    <span className="group-order-count">총 {groupedOrders[date].length}건</span>
                  </div>
                  <div className="header-icon-wrapper"> <IoIosArrowUp className="header-icon" /> </div>
                </div>
              }
              transitionTime={300}
              easing="ease-in-out"
            >
              <div className="collapsible-content">
                {groupedOrders[date].map((order: Order) => {
                  const statusDisplay = getOrderStatusDisplay(order);
                  return (
                    <div key={order.id} className="order-card-in-group">
                      <div className="order-header-section-in-group">
                        <span className="order-id">주문번호: {order.id.slice(0, 8)}...</span>
                        <span className={`order-status-badge ${statusDisplay.className}`}>
                          {statusDisplay.icon} {statusDisplay.text}
                        </span>
                      </div>
                      <ul className="order-items-detail-list">
                        {(order.items || []).map((item: OrderItem, idx: number) => ( // OrderItemWithDetails 대신 OrderItem 사용
                          <li key={idx} className="order-item-detail-row">
                            <div className="product-main-info">
                              <span className="product-name-qty">
                                {item.productName} <span className="product-quantity-display">({item.quantity}개)</span>
                              </span>
                              {/* category와 subCategory는 OrderItem에 직접 없어 Order 타입으로 내려받는 item에 없을 수 있음. types.ts 확인 필요 */}
                              {/* <span className="product-category">
                                [{item.category || '기타'}]
                                {item.subCategory && ` (${item.subCategory})`}
                              </span> */}
                            </div>
                            <div className="product-sub-info">
                              <span className="product-price">{(item.unitPrice * item.quantity).toLocaleString()}원</span>
                              <div className="product-date-info-group">
                                <span className="product-date-info">
                                  입고: {formatDate(item.arrivalDate)}
                                </span>
                                <span className="product-date-info">
                                  유통: {formatDate(item.expirationDate)}
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="order-footer-section">
                        <span className="order-pickup-info">
                          픽업 예정일: {safeToDate(order.pickupDate)?.toLocaleDateString() || '미정'}
                          {order.pickupDeadlineDate && ` (마감: ${formatDate(order.pickupDeadlineDate)})`}
                        </span>
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

  return (
    <>
      <Header title="예약 내역" />
      <div className="customer-page-container">
        <Body />
      </div>
    </>
  );
};

export default OrderListPage;