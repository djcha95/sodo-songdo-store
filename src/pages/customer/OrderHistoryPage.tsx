// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import { getUserOrders } from '@/firebase';
import type { Order, OrderItem } from '@/types';
import { Timestamp } from 'firebase/firestore';
import './OrderHistoryPage.css';
import { motion } from 'framer-motion';
import { 
    AiOutlineCheckCircle, 
    AiOutlineCloseCircle, 
    AiOutlineClockCircle, 
    AiOutlineExclamationCircle 
} from 'react-icons/ai';
import { IoIosArrowDown, IoIosArrowUp } from 'react-icons/io';
import Collapsible from 'react-collapsible';

interface OrderItemWithDetails extends OrderItem {
  category?: string;
  subCategory?: string;
}

interface GroupedOrders {
  [date: string]: Order[];
}

const OrderHistoryPage: React.FC = () => {
  const { user, notifications = [], handleMarkAsRead = () => {} } = useAuth();
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

  // 주문 날짜 포맷 (25.06.27)
  const formatOrderDate = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '미정';
    const date = timestamp.toDate();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  // 픽업일 포맷 (6/27(금))
  const formatPickupDate = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '미정';
    const date = timestamp.toDate();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}/${day}(${dayOfWeek})`;
  };

  const groupedOrders = useMemo(() => {
    if (!orders.length) return {};
    const groups: GroupedOrders = {};
    orders.forEach(order => {
      const dateKey = order.orderDate ? formatOrderDate(order.orderDate) : '날짜 미정';
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

    const pickupDeadline = order.pickupDeadlineDate?.toDate();
    const isPickupDeadlinePassed = pickupDeadline && pickupDeadline.getTime() < now.getTime();

    switch (order.status) {
      case 'cancelled':
        return { text: '예약 취소', className: 'status-cancelled', icon: <AiOutlineCloseCircle /> };
      case 'delivered':
        return { text: '픽업 완료', className: 'status-delivered', icon: <AiOutlineCheckCircle /> };
      case 'paid':
        if (isPickupDeadlinePassed) {
          return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
        }
        return { text: '선입금 완료', className: 'status-paid', icon: <AiOutlineCheckCircle /> };
      case 'pending':
        if (isPickupDeadlinePassed) {
          return { text: '노쇼', className: 'status-noshow', icon: <AiOutlineExclamationCircle /> };
        }
        return { text: '예약중', className: 'status-pending', icon: <AiOutlineClockCircle /> };
      default:
        return { text: order.status, className: '', icon: null };
    }
  };

  /* ───── 렌더링 ───── */

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
                {groupedOrders[date].map((order: Order) => (
                  <div key={order.id} className="order-card-in-group">
                    <ul className="order-items-detail-list">
                      {(order.items as OrderItemWithDetails[] || []).map((item: OrderItemWithDetails, idx: number) => {
                        const statusDisplay = getOrderStatusDisplay(order);
                        return (
                          <li key={idx} className="order-item-detail-row">
                            {/* 상단 행: 상품명(좌) */}
                            <div className="item-top-row">
                              <div className="product-name-group">
                                <span className="product-name">{item.name}</span>
                                <span className="product-category">[{item.category || '기타'}]</span>
                              </div>
                              {/* 상태 배지 재배치 */}
                              <span className={`order-status-badge ${statusDisplay.className}`}>
                                {statusDisplay.icon}
                                {statusDisplay.text}
                              </span>
                            </div>

                            {/* 하단 행: 픽업일(좌) | 수량(중앙) | 가격(우) */}
                            <div className="item-bottom-row">
                              <span className="product-pickup-info">
                                픽업일: {formatPickupDate(order.pickupDate)}
                              </span>
                              {/* 수정: 수량과 가격을 묶는 그룹 div 추가 */}
                              <div className="quantity-price-group">
                                <span className="product-quantity-display">
                                  {item.quantity}개
                                </span>
                                <span className="product-price">
                                  {(item.price * item.quantity).toLocaleString()}원
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Collapsible>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <>
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