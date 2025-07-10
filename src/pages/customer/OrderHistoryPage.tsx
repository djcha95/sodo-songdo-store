// src/pages/customer/OrderHistoryPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getUserOrders, cancelOrder } from '@/firebase/orderService';
import type { Order, OrderItem } from '@/types';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import './OrderHistoryPage.css';
import { motion } from 'framer-motion';
import {
    FiArchive, FiCalendar, FiXCircle, FiCheckCircle, FiClock, FiThumbsDown
} from 'react-icons/fi';
import { IoIosArrowDown, IoIosArrowUp } from 'react-icons/io';
import Collapsible from 'react-collapsible';

// 픽업일 순 보기에서 사용할 집계된 상품 타입
interface AggregatedPickupItem extends OrderItem {
  orderId: string; // 어떤 주문에 속했는지 추적
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp;
  totalQuantity: number;
  totalPrice: number; // 합산된 가격 추가
  // ✅ [개선] 여러 주문의 상태를 모두 추적하기 위해 배열로 변경
  statuses: { status: Order['status']; quantity: number }[];
}

// 주문일 순 보기에서 사용할 집계된 상품 타입 (동일 상품 합산용)
interface GroupedOrderItem extends OrderItem {
    totalQuantity: number;
    totalPrice: number;
}

const OrderHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'orders' | 'pickup'>('orders');

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setError('로그인이 필요합니다.');
      return;
    }
    setLoading(true);
    try {
      const fetchedOrders = await getUserOrders(user.uid);
      setOrders(fetchedOrders);
    } catch (err: any) {
      console.error("예약 내역 불러오기 오류:", err);
      setError('예약 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 날짜 포맷 함수 (요일 포함)
  const formatDateWithDay = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '미정';
    const date = timestamp.toDate();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${year}.${month}.${day}(${dayOfWeek})`;
  };

  // 주문 상태에 따른 UI 정보 반환
  const getOrderStatusDisplay = (status: Order['status'], pickupDeadlineDate?: Timestamp | null) => {
    const now = new Date();
    const pickupDeadline = pickupDeadlineDate?.toDate();
    const isPickupDeadlinePassed = pickupDeadline && new Date(pickupDeadline.getTime() + 24 * 60 * 60 * 1000) < now;
    
    switch (status) {
      case 'CANCELED': return { text: '예약 취소', className: 'status-cancelled', icon: <FiXCircle /> };
      case 'PICKED_UP': return { text: '픽업 완료', className: 'status-picked-up', icon: <FiCheckCircle /> };
      case 'RESERVED':
        if (isPickupDeadlinePassed) return { text: '픽업 기간 만료', className: 'status-noshow', icon: <FiThumbsDown /> };
        return { text: '예약 확정', className: 'status-reserved', icon: <FiCheckCircle /> };
      case 'NO_SHOW': return { text: '노쇼', className: 'status-noshow', icon: <FiThumbsDown /> };
      case 'COMPLETED': return { text: '수령 완료', className: 'status-picked-up', icon: <FiCheckCircle /> }; // COMPLETED를 PICKED_UP과 동일하게 처리
      default:
        return { text: '예약중', className: 'status-pending', icon: <FiClock /> };
    }
  };

  // 예약 취소 가능 여부 및 정책 확인
  const getCancellationInfo = (order: Order) => {
    if (order.status !== 'RESERVED') {
      return { cancellable: false, showWarning: false };
    }
    
    const deadline = order.items[0]?.deadlineDate?.toDate();
    if (!deadline) {
      return { cancellable: true, showWarning: false };
    }
    
    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 2) return { cancellable: false, showWarning: false };
    if (hoursUntilDeadline < 12) return { cancellable: true, showWarning: true };
    return { cancellable: true, showWarning: false };
  };

  // 예약 취소 처리 핸들러
  const handleCancelOrder = (order: Order) => {
    const { showWarning } = getCancellationInfo(order);
    const cancelProcess = () => {
      if (!user) return;
      const promise = cancelOrder(order.id, user.uid).then(() => fetchOrders());
      toast.promise(promise, {
        loading: '예약을 취소하는 중...',
        success: '예약이 정상적으로 취소되었습니다.',
        error: (err: any) => err.message || '예약 취소 중 오류가 발생했습니다.',
      });
    };

    if (showWarning) {
      toast((t) => (
        <div className="confirmation-toast-simple">
          <h4>예약을 취소하시겠습니까?</h4>
          <p>마감이 임박한 상품의 취소는 재고 운영에 영향을 줄 수 있습니다.</p>
          <div className="toast-buttons-simple">
            <button className="toast-cancel-btn-simple" onClick={() => toast.dismiss(t.id)}>유지</button>
            <button className="toast-confirm-btn-simple danger" onClick={() => { toast.dismiss(t.id); cancelProcess(); }}>취소하기</button>
          </div>
        </div>
      ), { duration: 6000, className: 'toast-style-light' });
    } else {
      toast((t) => (
        <div className="confirmation-toast-simple">
          <h4>예약을 취소하시겠습니까?</h4>
          <div className="toast-buttons-simple">
            <button className="toast-cancel-btn-simple" onClick={() => toast.dismiss(t.id)}>아니오</button>
            <button className="toast-confirm-btn-simple" onClick={() => { toast.dismiss(t.id); cancelProcess(); }}>네, 취소합니다</button>
          </div>
        </div>
      ), { duration: 4000, className: 'toast-style-light' });
    }
  };

  // 주문일 순 보기 데이터 (동일 상품 합산 로직 추가)
  const groupedOrders = useMemo(() => {
    if (!orders.length) return {};
    return orders.reduce((groups, order) => {
      const dateKey = order.createdAt ? formatDateWithDay(order.createdAt) : '날짜 미정';
      if (!groups[dateKey]) groups[dateKey] = [];

      // 동일 상품 합산 로직
      const aggregatedItemsMap = new Map<string, GroupedOrderItem>();
      order.items.forEach(item => {
        const key = `${item.productId}-${item.itemId}`; // productId와 itemId 조합으로 고유성 판단
        if (aggregatedItemsMap.has(key)) {
          const existing = aggregatedItemsMap.get(key)!;
          existing.totalQuantity += item.quantity;
          existing.totalPrice += item.unitPrice * item.quantity;
        } else {
          aggregatedItemsMap.set(key, {
            ...item,
            totalQuantity: item.quantity,
            totalPrice: item.unitPrice * item.quantity,
          });
        }
      });
      
      groups[dateKey].push({
        ...order,
        // Order.items의 타입을 OrderItem[]으로 유지하면서 GroupedOrderItem의 속성 사용을 위해 타입 어설션 사용
        items: Array.from(aggregatedItemsMap.values()) as OrderItem[] 
      });
      return groups;
    }, {} as Record<string, Order[]>);
  }, [orders]);

  // 픽업일 순 보기 데이터 (상품 병합 및 수량/상태 집계 및 픽업일 그룹화)
  const pickupSummaryGroups = useMemo(() => {
    const summaryMap = new Map<string, AggregatedPickupItem>();
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.productId}-${item.itemId}`; 

        if (summaryMap.has(key)) {
          const existing = summaryMap.get(key)!;
          existing.totalQuantity += item.quantity;
          existing.totalPrice += item.unitPrice * item.quantity;
          existing.statuses.push({ status: order.status, quantity: item.quantity });
        } else {
          summaryMap.set(key, {
            ...item,
            orderId: order.id, 
            pickupDate: order.pickupDate,
            pickupDeadlineDate: order.pickupDeadlineDate,
            totalQuantity: item.quantity,
            totalPrice: item.unitPrice * item.quantity,
            statuses: [{ status: order.status, quantity: item.quantity }],
          });
        }
      });
    });

    const items = Array.from(summaryMap.values());

    // 픽업일 기준으로 그룹화
    const groupedByPickupDate = items.reduce((groups, item) => {
        const dateKey = item.pickupDate ? formatDateWithDay(item.pickupDate) : '날짜 미정';
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(item);
        return groups;
    }, {} as Record<string, AggregatedPickupItem[]>);

    // 각 그룹 내에서 당일픽업 (pickupDate와 pickupDeadlineDate가 동일한 경우)을 최상단으로 정렬
    // 그 외는 pickupDeadlineDate 오름차순 (가장 빠른 마감일이 위로)
    Object.keys(groupedByPickupDate).forEach(dateKey => {
        groupedByPickupDate[dateKey].sort((a, b) => {
            const isADayPickup = a.pickupDate && a.pickupDeadlineDate && a.pickupDate.toDate().toDateString() === a.pickupDeadlineDate.toDate().toDateString();
            const isBDayPickup = b.pickupDate && b.pickupDeadlineDate && b.pickupDate.toDate().toDateString() === b.pickupDeadlineDate.toDate().toDateString();

            if (isADayPickup && !isBDayPickup) return -1; 
            if (!isADayPickup && isBDayPickup) return 1;  

            const deadlineA = a.pickupDeadlineDate?.toMillis() || Infinity;
            const deadlineB = b.pickupDeadlineDate?.toMillis() || Infinity;
            return deadlineA - deadlineB;
        });
    });

    return groupedByPickupDate;
  }, [orders]);


  // 픽업일 순 보기에서 각 상품의 전체적인 상태를 파악
  const getAggregatedPickupItemStatus = (item: AggregatedPickupItem) => {
    const now = new Date();
    const pickupDeadline = item.pickupDeadlineDate?.toDate();
    const isPickupDeadlinePassed = pickupDeadline && new Date(pickupDeadline.getTime() + 24 * 60 * 60 * 1000) < now;

    const totalPickedUp = item.statuses.filter(s => s.status === 'PICKED_UP' || s.status === 'COMPLETED').reduce((sum, s) => sum + s.quantity, 0);
    const totalCanceled = item.statuses.filter(s => s.status === 'CANCELED').reduce((sum, s) => sum + s.quantity, 0);
    const totalReserved = item.totalQuantity - totalPickedUp - totalCanceled;

    if (totalPickedUp === item.totalQuantity) {
      return { text: '픽업 완료', className: 'status-picked-up', icon: <FiCheckCircle /> }; 
    }
    if (totalCanceled === item.totalQuantity) {
      return { text: '예약 취소', className: 'status-cancelled', icon: <FiXCircle /> }; 
    }
    if (isPickupDeadlinePassed && totalReserved > 0) {
      return { text: '기간 만료', className: 'status-noshow', icon: <FiThumbsDown /> }; 
    }
    if (totalReserved > 0 && (totalPickedUp > 0 || totalCanceled > 0)) {
        return { text: '일부 완료/예약중', className: 'status-pending', icon: <FiClock /> }; 
    }
    if (totalReserved > 0) {
        return { text: '예약중', className: 'status-reserved', icon: <FiClock /> };
    }
    return { text: '상태 불분명', className: 'status-pending', icon: <FiClock /> }; 
  };

  // 주문일 순 보기 렌더링
  const OrderView = () => {
    const dates = Object.keys(groupedOrders).sort((a, b) => {
      if (a === '날짜 미정') return 1;
      if (b === '날짜 미정') return -1;
      const dateA = new Date(`20${a.substring(0, 2)}-${a.substring(3, 5)}-${a.substring(6, 8)}`);
      const dateB = new Date(`20${b.substring(0, 2)}-${b.substring(3, 5)}-${b.substring(6, 8)}`);
      return dateB.getTime() - dateA.getTime();
    });

    return (
      <div className="order-history-list">
        {dates.map((date, index) => (
          <motion.div key={date} className="order-group-wrapper" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}>
            <Collapsible
              triggerTagName="div"
              trigger={ <div className="collapsible-header"><span className="group-date">{date}</span><IoIosArrowDown className="header-icon" /></div> }
              triggerWhenOpen={ <div className="collapsible-header"><span className="group-date">{date}</span><IoIosArrowUp className="header-icon" /></div> }
              transitionTime={250} easing="ease-in-out" open={index === 0}
            >
              <div className="collapsible-content">
                {/* 각 주문을 하나의 깔끔한 카드로 표시 */}
                {groupedOrders[date].map((order: Order) => {
                  const cancelInfo = getCancellationInfo(order);
                  const statusDisplay = getOrderStatusDisplay(order.status, order.pickupDeadlineDate);
                  
                  // 주문 내 모든 상품의 총 수량 합산
                  const totalOrderQuantity = order.items.reduce((sum, item) => sum + (item as GroupedOrderItem).totalQuantity, 0);

                  return (
                    <div key={order.id} className="item-card"> {/* '픽업일 순'과 동일한 item-card 클래스 사용 */}
                        <div className="item-card-top-row">
                            <span className="item-name-option">
                                {/* 첫 번째 아이템 이름 표시, 여러 개면 "외 N개" 추가 */}
                                {(order.items[0] as GroupedOrderItem).variantGroupName} - {(order.items[0] as GroupedOrderItem).itemName}
                                {order.items.length > 1 && ` 외 ${order.items.length - 1}개 상품`}
                            </span>
                            <span className="item-quantity">{totalOrderQuantity}개</span>
                        </div>
                        <div className="item-card-status-row">
                            <span className={`order-status-badge ${statusDisplay.className}`}>{statusDisplay.icon}{statusDisplay.text}</span>
                        </div>
                        <div className="item-card-bottom-row">
                            <span className="item-pickup-date">픽업일: {formatDateWithDay(order.pickupDate)}</span>
                            {/* 총 가격은 요청에 따라 제거되었으므로, 해당 span을 제거하거나 주석 처리합니다. */}
                            {/* <span className="item-price">{order.totalPrice.toLocaleString()}원</span> */}
                        </div>
                        
                        {cancelInfo.cancellable && 
                          <div className="item-card-footer"> {/* item-card 내부 푸터 */}
                            <button className="cancel-order-button" onClick={() => handleCancelOrder(order)}><FiXCircle size={14}/> 예약 취소</button>
                          </div>
                        }
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
  
  // 픽업일 순 보기 렌더링
  const PickupView = () => {
    const getPickupDeadlineText = (item: AggregatedPickupItem) => {
      if (!item.pickupDate || !item.pickupDeadlineDate) return null;
      
      const pickup = item.pickupDate.toDate();
      const deadline = item.pickupDeadlineDate.toDate();

      if (pickup.toDateString() === deadline.toDateString()) {
        return <span className="pickup-deadline same-day">당일픽업</span>;
      }
      return <span>~{formatDateWithDay(item.pickupDeadlineDate)} 마감</span>; 
    };

    const pickupDates = Object.keys(pickupSummaryGroups).sort((a, b) => {
        if (a === '날짜 미정') return 1;
        if (b === '날짜 미정') return -1;
        const dateA = new Date(`20${a.substring(0, 2)}-${a.substring(3, 5)}-${a.substring(6, 8)}`);
        const dateB = new Date(`20${b.substring(0, 2)}-${b.substring(3, 5)}-${b.substring(6, 8)}`);
        return dateA.getTime() - dateB.getTime();
    });
    
    return (
      <div className="pickup-summary-list">
         {pickupDates.length > 0 ? pickupDates.map((date, groupIndex) => (
            <motion.div key={date} className="pickup-group-wrapper" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: groupIndex * 0.05 }}>
                <Collapsible
                    triggerTagName="div"
                    trigger={ <div className="collapsible-header"><span className="group-date">{date} 픽업</span><IoIosArrowDown className="header-icon" /></div> }
                    triggerWhenOpen={ <div className="collapsible-header"><span className="group-date">{date} 픽업</span><IoIosArrowUp className="header-icon" /></div> }
                    transitionTime={250} easing="ease-in-out" open={groupIndex === 0}
                >
                    <div className="collapsible-content">
                        {pickupSummaryGroups[date].map((item, itemIndex) => {
                            const statusDisplay = getAggregatedPickupItemStatus(item);
                            return (
                                <div key={`${item.productId}-${item.itemId}-${item.orderId}`} className="item-card"> {/* 공통 item-card 클래스 사용 */}
                                    <div className="item-card-top-row">
                                        <span className="item-name-option">{item.variantGroupName} - {item.itemName}</span>
                                        <span className="item-quantity">{item.totalQuantity}개</span>
                                    </div>
                                    <div className="item-card-status-row">
                                        <span className={`order-status-badge ${statusDisplay.className}`}>{statusDisplay.icon}{statusDisplay.text}</span>
                                    </div>
                                    <div className="item-card-bottom-row">
                                        <span className="item-pickup-date">{getPickupDeadlineText(item)}</span>
                                        <span className="item-price">{item.totalPrice.toLocaleString()}원</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Collapsible>
            </motion.div>
         )) : <p className="no-orders-message">픽업 예정인 상품이 없습니다.</p>}
      </div>
    );
  }

  return (
    <div className="customer-page-container order-history-page">
      <div className="view-toggle-container">
        <button className={`toggle-btn ${viewMode === 'orders' ? 'active' : ''}`} onClick={() => setViewMode('orders')}><FiArchive size={14}/> 주문일 순</button>
        <button className={`toggle-btn ${viewMode === 'pickup' ? 'active' : ''}`} onClick={() => setViewMode('pickup')}><FiCalendar size={14}/> 픽업일 순</button>
      </div>
      {loading ? <p className="loading-message">예약 내역을 불러오는 중…</p> : error ? <p className="error-message">{error}</p> : (orders.length === 0 ? <p className="no-orders-message">예약 내역이 없습니다.</p> : (viewMode === 'orders' ? <OrderView /> : <PickupView />))}
    </div>
  );
};

export default OrderHistoryPage;