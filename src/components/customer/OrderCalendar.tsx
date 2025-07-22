// src/components/customer/OrderCalendar.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import 'react-calendar/dist/Calendar.css';
import './OrderCalendar.css';

import { useAuth } from '../../context/AuthContext';
import { getUserOrders } from '../../firebase';
import InlineSodomallLoader from '../common/InlineSodomallLoader';

import Holidays from 'date-holidays';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import type { Order } from '../../types';
import toast from 'react-hot-toast';
import { Hourglass, PackageCheck, PackageX, AlertCircle, CalendarX, X, Trophy, ShieldCheck, Target } from 'lucide-react';

// =================================================================
// 헬퍼 함수
// =================================================================

type ValuePiece = Date | null;
type PickupStatus = 'pending' | 'completed' | 'noshow';

const holidays = new Holidays('KR');
const customWeekday = ['일', '월', '화', '수', '목', '금', '토'];

const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && date.seconds !== undefined) {
        return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
    }
    return null;
};

const getOrderStatusDisplay = (order: Order) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const pickupDeadline = safeToDate(order.pickupDeadlineDate);
    const isPickupDeadlinePassed = pickupDeadline && pickupDeadline.getTime() < now.getTime();

    if (order.status === 'CANCELED') return { text: '취소됨', Icon: PackageX, className: 'status-cancelled', type: 'cancelled' };
    if (order.status !== 'PICKED_UP' && isPickupDeadlinePassed) return { text: '노쇼', Icon: AlertCircle, className: 'status-no-show', type: 'noshow' };
    if (order.status === 'PICKED_UP') return { text: '픽업 완료', Icon: PackageCheck, className: 'status-completed', type: 'completed' };
    if (order.status === 'PREPAID') return { text: '결제 완료', Icon: PackageCheck, className: 'status-prepaid', type: 'pending' };
    if (order.status === 'RESERVED') return { text: '예약중', Icon: Hourglass, className: 'status-reserved', type: 'pending' };
    
    return { text: order.status, Icon: Hourglass, className: '', type: 'pending' };
};

// =================================================================
// 하위 컴포넌트
// =================================================================

const EmptyCalendarState: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className="empty-calendar-container">
            <CalendarX size={48} className="empty-icon" />
            <h3 className="empty-title">아직 픽업할 내역이 없어요</h3>
            <p className="empty-description">상품을 예약하고 캘린더에서 픽업일을 확인해보세요!</p>
            <button className="go-to-shop-btn common-button" onClick={() => navigate('/')}>상품 보러 가기</button>
        </div>
    );
};

const DailyOrderCard: React.FC<{ order: Order }> = React.memo(({ order }) => {
    const { text, Icon, className } = getOrderStatusDisplay(order);
    const orderDate = safeToDate(order.createdAt);
    return (
        <li className="order-card-v2">
            <div className="card-v2-header">
                <div className={`status-badge-v2 ${className}`}><Icon size={14} /> {text}</div>
                <span className="order-date-v2">{orderDate ? format(orderDate, 'yy.MM.dd HH:mm') : ''}</span>
            </div>
            <ul className="order-items-detail-v2">
                {(order.items || []).map((item, idx) => (
                    <li key={idx} className="order-item-detail-row-v2">
                        <span className="product-name-qty">{item.itemName} ({item.quantity}개)</span>
                        <span className="product-price">{(item.unitPrice * item.quantity).toLocaleString()}원</span>
                    </li>
                ))}
            </ul>
            <div className="card-v2-footer">
                <span className="order-total-price">총 {order.totalPrice.toLocaleString()}원</span>
            </div>
        </li>
    );
});

const sheetVariants: Variants = {
    hidden: { y: "100%", opacity: 0.8 },
    visible: { y: "0%", opacity: 1, transition: { type: "spring", damping: 30, stiffness: 250 } },
    exit: { y: "100%", opacity: 0.8, transition: { duration: 0.2 } }
};

const DetailsBottomSheet: React.FC<{ selectedDate: Date; orders: Order[]; onClose: () => void; }> = ({ selectedDate, orders, onClose }) => {
    return (
        <>
            <motion.div className="bottom-sheet-overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div 
                className="bottom-sheet-content" 
                variants={sheetVariants} 
                initial="hidden" animate="visible" exit="exit"
                drag="y" dragConstraints={{ top: 0, bottom: 0 }}
                onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
            >
                <div className="sheet-header">
                    <div className="sheet-grabber"></div>
                    <h3 className="sheet-title">{format(selectedDate, 'M월 d일 (eee)', { locale: ko })} 픽업 내역</h3>
                    <button onClick={onClose} className="sheet-close-btn" aria-label="닫기"><X size={20} /></button>
                </div>
                <div className="sheet-body">
                    {orders.length > 0 ? (
                        <ul className="order-list-v2">{orders.map(order => <DailyOrderCard key={order.id} order={order} />)}</ul>
                    ) : (
                        <div className="no-orders-message">
                            <CalendarX size={32} />
                            <span>해당 날짜에 픽업할 주문이 없습니다.</span>
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    );
};

const MonthlyChallenge: React.FC<{ orders: Order[], activeMonth: Date }> = ({ orders, activeMonth }) => {
    const challenges = useMemo(() => {
        const monthlyOrders = orders.filter(o => {
            const pickupDate = safeToDate(o.pickupDate);
            return pickupDate && isSameMonth(pickupDate, activeMonth);
        });

        const noShowCount = monthlyOrders.filter(o => getOrderStatusDisplay(o).type === 'noshow').length;
        const noShowChallenge = {
            icon: <ShieldCheck />,
            title: "노쇼 없이 한 달 보내기",
            progress: noShowCount === 0 ? 100 : 0,
            label: noShowCount === 0 ? "달성 완료!" : `${noShowCount}회 발생`,
        };

        const pickupTarget = 5;
        const pickupCount = monthlyOrders.filter(o => getOrderStatusDisplay(o).type === 'completed').length;
        const pickupChallenge = {
            icon: <Target />,
            title: `이 달에 ${pickupTarget}번 픽업하기`,
            progress: Math.min((pickupCount / pickupTarget) * 100, 100),
            label: `${pickupCount} / ${pickupTarget}회`,
        };

        return [noShowChallenge, pickupChallenge];
    }, [orders, activeMonth]);

    return (
        <div className="monthly-challenge-container">
            <h3 className="challenge-title"><Trophy size={18} /> 이달의 챌린지</h3>
            <div className="challenge-list">
                {challenges.map(c => (
                    <div className="challenge-card" key={c.title}>
                        <div className="challenge-info">
                            <span className="challenge-icon">{c.icon}</span>
                            <span className="challenge-text">{c.title}</span>
                            <span className="challenge-label">{c.label}</span>
                        </div>
                        <div className="progress-bar-track">
                            <motion.div 
                                className="progress-bar-fill" 
                                initial={{ width: 0 }}
                                animate={{ width: `${c.progress}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// =================================================================
// 메인 컴포넌트
// =================================================================

const OrderCalendar: React.FC = () => {
  const { user, userDocument } = useAuth();
  const [selectedDate, setSelectedDate] = useState<ValuePiece>(null);
  const [activeMonth, setActiveMonth] = useState<Date>(new Date());
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
        setIsLoading(true);
        getUserOrders(user.uid)
            .then(orders => setUserOrders(orders))
            .catch(err => {
                console.error("주문 내역 로딩 오류:", err);
                setError("주문 내역을 불러오는 데 실패했습니다.");
                toast.error("주문 내역을 불러오는 데 실패했습니다.");
            })
            .finally(() => setIsLoading(false));
    }
  }, [user]);

  const calendarDayMarkers = useMemo(() => {
    const markers: { [key: string]: { status: PickupStatus } } = {};
    const ordersByDate: { [key: string]: Order[] } = {};

    userOrders.forEach(order => {
        const pickupDate = safeToDate(order.pickupDate);
        if (pickupDate) {
            const dateStr = format(pickupDate, 'yyyy-MM-dd');
            if (!ordersByDate[dateStr]) ordersByDate[dateStr] = [];
            ordersByDate[dateStr].push(order);
        }
    });

    Object.keys(ordersByDate).forEach(dateStr => {
        const ordersOnDate = ordersByDate[dateStr];
        const statuses = ordersOnDate.map(o => getOrderStatusDisplay(o).type);

        if (statuses.includes('noshow')) {
            markers[dateStr] = { status: 'noshow' };
        } else if (statuses.includes('pending')) {
            markers[dateStr] = { status: 'pending' };
        } else if (ordersOnDate.length > 0 && statuses.every(s => s === 'completed')) {
            markers[dateStr] = { status: 'completed' };
        }
    });
    return markers;
  }, [userOrders]);

  const selectedDateOrders = useMemo(() => {
    if (!selectedDate) return [];
    const selectedDateString = format(selectedDate, 'yyyy-MM-dd');
    return userOrders.filter(order => {
        const pickupDate = safeToDate(order.pickupDate);
        return pickupDate && format(pickupDate, 'yyyy-MM-dd') === selectedDateString;
    }).sort((a, b) => (safeToDate(a.createdAt)?.getTime() ?? 0) - (safeToDate(b.createdAt)?.getTime() ?? 0));
  }, [selectedDate, userOrders]);

  if (isLoading) return <div className="order-calendar-page-container--loading"><InlineSodomallLoader /></div>;
  if (error) return <div className="error-message">{error}</div>;
  if (userOrders.length === 0) return <EmptyCalendarState />;

  return (
    <>
      <div className="order-calendar-page-container">
        <div className="calendar-wrapper">
          <Calendar
            onClickDay={(date) => selectedDate && isSameDay(date, selectedDate) ? setSelectedDate(null) : setSelectedDate(date)}
            value={selectedDate}
            onActiveStartDateChange={({ activeStartDate }) => setActiveMonth(activeStartDate || new Date())}
            locale="ko-KR"
            calendarType="gregory"
            tileContent={({ date, view }) => {
                if (view !== 'month') return null;
                const isToday = isSameDay(date, new Date());
                
                // ✅ [수정] 날짜 비교 기준을 UTC로 통일하여 시간대 오류 해결
                const todayUTCString = new Date().toISOString().split('T')[0];
                const hasLoggedInToday = userDocument?.lastLoginDate === todayUTCString;

                if (isToday && hasLoggedInToday) {
                    return <div className="attendance-badge">출석✓</div>;
                }
                return null;
            }}
            tileClassName={({ date, view }) => {
                if (view !== 'month') return null;
                const classes: string[] = [];
                const dateStr = format(date, 'yyyy-MM-dd');
                const marker = calendarDayMarkers[dateStr];
                if (marker) classes.push(`pickup-tile--${marker.status}`);
                if (holidays.isHoliday(date)) classes.push('holiday-tile');
                if (date.getDay() === 6) classes.push('saturday-tile');
                return classes.join(' ');
            }}
            formatDay={(_locale, date) => format(date, 'd')}
            formatShortWeekday={(_locale, date) => customWeekday[date.getDay()]}
            prev2Label={null}
            next2Label={null}
          />
          <div className="calendar-legend">
              <div className="legend-item"><span className="legend-color-box pending"></span> 픽업 예정</div>
              <div className="legend-item"><span className="legend-color-box completed"></span> 픽업 완료</div>
              <div className="legend-item"><span className="legend-color-box noshow"></span> 노쇼 발생</div>
          </div>
        </div>
        
        <MonthlyChallenge orders={userOrders} activeMonth={activeMonth} />
      </div>
      <AnimatePresence>
        {selectedDate && (
          <DetailsBottomSheet
            key={selectedDate.toString()}
            selectedDate={selectedDate}
            orders={selectedDateOrders}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default OrderCalendar;