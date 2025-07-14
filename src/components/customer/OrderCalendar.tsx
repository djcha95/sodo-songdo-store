// src/components/customer/OrderCalendar.tsx

import React, { useState, useEffect, useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './OrderCalendar.css';
import { useAuth } from '../../context/AuthContext';
import { getUserOrders } from '../../firebase';
import type { Order, OrderItem } from '../../types';
import Header from '../common/Header';
import Holidays from 'date-holidays';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Timestamp } from 'firebase/firestore'; // 추가: Timestamp 타입 import
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

interface OrderItemWithCategory extends OrderItem {
    category?: string;
}

const holidays = new Holidays('KR'); // 한국 공휴일 설정

// 요일 헤더를 '일, 월, 화...'로 표시하기 위한 컴포넌트
const customWeekday = ['일', '월', '화', '수', '목', '금', '토'];

const OrderCalendar: React.FC = () => {
  const { user } = useAuth();
  const [value, onChange] = useState<Value>(new Date());
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (user?.uid) {
        setIsLoading(true);
        setError(null);
        try {
          // Firebase에서 주문 내역을 가져옵니다.
          const orders = await getUserOrders(user.uid);
          setUserOrders(orders);
          if (orders.length === 0) {
            toast('아직 픽업할 주문 내역이 없습니다.', { icon: '🗓️' }); // [추가] 정보성 토스트 알림
          }
        } catch (err) {
          console.error("사용자 주문 내역 불러오기 오류:", err);
          setError("주문 내역을 불러오는 데 실패했습니다.");
          toast.error("주문 내역을 불러오는 데 실패했습니다."); // [추가] toast 알림
          setUserOrders([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        setError("로그인한 사용자 정보가 없습니다. 주문 내역을 볼 수 없습니다.");
        toast.error("로그인 정보가 없습니다. 주문 내역을 보려면 로그인 해주세요."); // [추가] toast 알림
        setUserOrders([]);
      }
    };

    fetchOrders();
  }, [user]);

  // [개선] 픽업일이 있는 날짜 목록을 미리 계산
  const pickupDates = useMemo(() => {
    // orders 배열을 순회하며 pickupDate를 Date 객체로 변환하여 Set에 저장
    const dates = new Set<string>();
    userOrders.forEach(order => {
      let date: Date | null | undefined;
      // pickupDate가 Timestamp 객체인지 확인
      if (order.pickupDate && typeof (order.pickupDate as Timestamp).toDate === 'function') {
          date = (order.pickupDate as Timestamp).toDate();
      }
      
      if (date) {
        // 'YYYY-MM-DD' 형식의 문자열로 저장하여 중복을 방지
        dates.add(format(date, 'yyyy-MM-dd'));
      }
    });
    return dates;
  }, [userOrders]);


  // useMemo를 사용하여 selectedDateOrders를 최적화
  const selectedDateOrders = useMemo(() => {
    const selectedDateValue = Array.isArray(value) ? value[0] : value;
    if (!selectedDateValue) {
      return [];
    }
    const selectedDateString = format(selectedDateValue, 'yyyy-MM-dd');

    // [수정] 미리 계산된 pickupDates Set을 활용
    if (!pickupDates.has(selectedDateString)) {
        return [];
    }
    
    return userOrders.filter((order: Order) => {
        const pickupDateValue = order.pickupDate;
        let pickupDate: Date | null = null;
        if (pickupDateValue && typeof (pickupDateValue as Timestamp).toDate === 'function') {
            pickupDate = (pickupDateValue as Timestamp).toDate();
        }
        return pickupDate &&
               format(pickupDate, 'yyyy-MM-dd') === selectedDateString;
    });
  }, [value, userOrders, pickupDates]);


  const getOrderStatusDisplay = (order: Order) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 시간 정보 제거

    const pickupDeadlineValue = order.pickupDeadlineDate;
    let pickupDeadline: Date | undefined;
    if (pickupDeadlineValue && typeof (pickupDeadlineValue as Timestamp).toDate === 'function') {
        pickupDeadline = (pickupDeadlineValue as Timestamp).toDate();
    }
    const isPickupDeadlinePassed = pickupDeadline && pickupDeadline.getTime() < now.getTime();

    // [수정] 우선순위: 취소 > 노쇼 > 픽업 완료 > 선입금 > 예약중 (types.ts의 OrderStatus 타입과 일치시킴)
    if (order.status === 'CANCELED') {
        return { text: '취소', className: 'status-cancelled' };
    }
    // '노쇼'는 마감일이 지났고, 픽업되지 않은 경우
    if (order.status !== 'PICKED_UP' && isPickupDeadlinePassed) {
        return { text: '노쇼', className: 'status-cancelled' };
    }
    if (order.status === 'PICKED_UP') {
        return { text: '픽업 완료', className: 'status-delivered' };
    }
    if (order.status === 'PREPAID') {
        return { text: '선입금', className: 'status-paid' };
    }
    if (order.status === 'RESERVED') {
        return { text: '예약중', className: 'status-pending' };
    }
    return { text: order.status, className: '' };
  };


  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const holidayInfo = holidays.isHoliday(date);
      const hasPickupDate = pickupDates.has(format(date, 'yyyy-MM-dd'));
      const holidayName = Array.isArray(holidayInfo) && holidayInfo.length > 0 ? holidayInfo[0].name : undefined;

      // [수정] 타입 추론 오류를 막기 위해 배열 타입을 명시적으로 지정
      const dots: React.ReactNode[] = [];
      if (hasPickupDate) {
          dots.push(<div key="pickup-dot" className="dot pickup-dot"></div>);
      }
      if (holidayName) {
          dots.push(<div key="holiday-dot" className="dot holiday-dot" title={holidayName}></div>);
      }

      return dots.length > 0 ? <>{dots}</> : null;
    }
    return null;
  };

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      // [수정] 타입 추론 오류를 막기 위해 배열 타입을 명시적으로 지정
      const classes: string[] = [];
      const isHoliday = holidays.isHoliday(date);
      if (Array.isArray(isHoliday) && isHoliday.length > 0) {
        classes.push('holiday-tile');
      }
      if (date.getDay() === 6) {
        classes.push('saturday-tile');
      }
      return classes.length > 0 ? classes.join(' ') : null;
    }
    return null;
  };

  const selectedDate = Array.isArray(value) ? value[0] : value;

  return (
    <>
      <Header title="나의 픽업 캘린더" />
      <div className="order-calendar-page-container">
        {isLoading ? (
          <div className="loading-message">주문 내역을 불러오는 중...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <>
            <div className="calendar-wrapper">
              <Calendar
                onChange={onChange}
                value={value}
                locale="ko-KR"
                calendarType="gregory"
                tileContent={tileContent}
                tileClassName={tileClassName}
                formatShortWeekday={(_locale, date) => customWeekday[date.getDay()]}
                formatDay={(_locale: string | undefined, date: Date) => date.getDate().toString()}
              />
            </div>

            <div className="order-list-section">
              <h3>{selectedDate ? `${format(selectedDate, 'yyyy년 M월 d일', { locale: ko })} 픽업 내역` : '날짜를 선택하세요'}</h3>
              {selectedDateOrders.length > 0 ? (
                <ul className="order-list">
                  {selectedDateOrders.map((order: Order) => {
                    const statusDisplay = getOrderStatusDisplay(order);
                    // [수정] order.orderDate를 order.createdAt으로 변경
                    const orderTimestamp = order.createdAt;
                    let orderDateStr = '날짜 없음';
                    if (orderTimestamp && typeof (orderTimestamp as Timestamp).toDate === 'function') {
                        orderDateStr = (orderTimestamp as Timestamp).toDate().toLocaleDateString();
                    }
                    const pickupTimestamp = order.pickupDate;
                    let pickupDateStr = '미정';
                    if (pickupTimestamp && typeof pickupTimestamp.toDate === 'function') {
                        pickupDateStr = pickupTimestamp.toDate().toLocaleDateString();
                    }
                    const pickupDeadlineTimestamp = order.pickupDeadlineDate;
                    let pickupDeadlineStr = '';
                    if (pickupDeadlineTimestamp && typeof pickupDeadlineTimestamp.toDate === 'function') {
                        pickupDeadlineStr = ` (마감: ${pickupDeadlineTimestamp.toDate().toLocaleDateString()})`;
                    }

                    return (
                      <li key={order.id} className="order-item-card">
                        <div className="order-summary">
                            <p className="order-date">주문일: {orderDateStr}</p>
                            <p className={`order-status ${statusDisplay.className}`}>{statusDisplay.text}</p>
                        </div>
                        <ul className="order-items-detail">
                            {(order.items as OrderItemWithCategory[] || []).map((item: OrderItemWithCategory, idx: number) => (
                                <li key={idx} className="order-item-detail-row">
                                    {/* [수정] item.name -> item.itemName, item.price -> item.unitPrice */}
                                    <span className="product-name-qty">{item.itemName} ({item.quantity}개)</span>
                                    <span className="product-category">[{item.category || '기타'}]</span>
                                    <span className="product-price">{item.unitPrice.toLocaleString()}원</span>
                                </li>
                            ))}
                        </ul>
                        <p className="order-total-price">총 금액: {order.totalPrice.toLocaleString()}원</p>
                        <p className="order-pickup-info">
                            픽업 예정일: {pickupDateStr}{pickupDeadlineStr}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="no-orders-message">선택된 날짜에 픽업할 주문이 없습니다.</p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default OrderCalendar;