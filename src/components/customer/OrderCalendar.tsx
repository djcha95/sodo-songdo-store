// src/components/customer/OrderCalendar.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import 'react-calendar/dist/Calendar.css';
import './OrderCalendar.css';
import '../../pages/customer/OrderHistoryPage.css';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { useAuth } from '../../context/AuthContext';
import { useTutorial } from '../../context/TutorialContext'; // ✅ [추가]
import { calendarPageTourSteps } from '../customer/AppTour'; // ✅ [추가]
import InlineSodomallLoader from '../common/InlineSodomallLoader';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

import Holidays from 'date-holidays';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import type { Order, OrderStatus } from '../../types';
import toast from 'react-hot-toast';
import { Hourglass, PackageCheck, PackageX, AlertCircle, CalendarX, X, Trophy, ShieldCheck, Target, CreditCard, CircleCheck, HelpCircle } from 'lucide-react'; // ✅ [추가]

// --- 헬퍼 함수 및 타입 ---
type ValuePiece = Date | null;
type PickupStatus = 'pending' | 'completed' | 'noshow';
interface AggregatedItem { 
  id: string; 
  productName: string;
  variantGroupName: string;
  itemName:string;
  totalQuantity: number;
  imageUrl: string;
  originalOrders: Order[];
  status: OrderStatus;
  wasPrepaymentRequired: boolean;
}
const holidays = new Holidays('KR');
const customWeekday = ['일', '월', '화', '수', '목', '금', '토'];

const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && (date.seconds !== undefined || date._seconds !== undefined)) {
        const seconds = date.seconds ?? date._seconds;
        const nanoseconds = date.nanoseconds ?? date._nanoseconds ?? 0;
        return new Timestamp(seconds, nanoseconds).toDate();
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

const aggregateOrdersForDate = (ordersToAggregate: Order[]): AggregatedItem[] => {
    const aggregated: { [key: string]: AggregatedItem } = {};

    ordersToAggregate.forEach(order => {
        (order.items || []).forEach((item: any) => {
            const aggregationKey = `${item.productId?.trim() ?? ''}-${item.variantGroupName?.trim() ?? ''}-${item.itemName?.trim() ?? ''}-${order.wasPrepaymentRequired}`;
            
            if (!aggregated[aggregationKey]) {
                aggregated[aggregationKey] = {
                    id: aggregationKey,
                    productName: item.productName,
                    variantGroupName: item.variantGroupName,
                    itemName: item.itemName,
                    totalQuantity: 0,
                    imageUrl: item.imageUrl,
                    originalOrders: [],
                    status: order.status,
                    wasPrepaymentRequired: order.wasPrepaymentRequired ?? false,
                };
            }
            aggregated[aggregationKey].totalQuantity += item.quantity;
            aggregated[aggregationKey].originalOrders.push(order);
        });
    });

    Object.values(aggregated).forEach(item => {
      const sortedOrders = [...item.originalOrders].sort((a, b) => (safeToDate(b.createdAt)?.getTime() || 0) - (safeToDate(a.createdAt)?.getTime() || 0));
      item.status = sortedOrders[0]?.status ?? 'RESERVED';
    });

    return Object.values(aggregated);
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

const CalendarItemCard: React.FC<{ item: AggregatedItem }> = React.memo(({ item }) => {
  const { statusText, StatusIcon, statusClass } = useMemo(() => {
    if (item.wasPrepaymentRequired && item.status === 'RESERVED') {
      return { statusText: '선입금 필요', StatusIcon: CreditCard, statusClass: 'status-prepayment_required' };
    }
    const textMap: Record<OrderStatus, string> = { RESERVED: '예약 완료', PREPAID: '선입금 완료', PICKED_UP: '픽업 완료', COMPLETED: '처리 완료', CANCELED: '취소됨', NO_SHOW: '노쇼' };
    const iconMap: Record<OrderStatus, React.ElementType> = { RESERVED: Hourglass, PREPAID: PackageCheck, PICKED_UP: PackageCheck, COMPLETED: CircleCheck, CANCELED: PackageX, NO_SHOW: AlertCircle };
    return {
      statusText: textMap[item.status] || '알 수 없음',
      StatusIcon: iconMap[item.status] || AlertCircle,
      statusClass: `status-${item.status.toLowerCase()}`
    }
  }, [item.status, item.wasPrepaymentRequired]);

  return (
    <motion.div 
      className="order-card-v3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="card-v3-body">
        <div className="item-image-wrapper">
          <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
        </div>
        <div className="item-aggregated-info">
          <div className="info-top-row">
            <span className="product-name-top">{item.variantGroupName}</span>
            <span className={`status-badge ${statusClass}`}><StatusIcon size={14} /> {statusText}</span>
          </div>
          <div className="info-bottom-row">
            <span className="item-options-quantity">
              <span className="item-option-name">{item.itemName}</span>
              <span className="item-quantity">({item.totalQuantity}개)</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

const sheetVariants: Variants = {
    hidden: { y: "100%", opacity: 0.8 },
    visible: { y: "0%", opacity: 1, transition: { type: "spring", damping: 30, stiffness: 250 } },
    exit: { y: "100%", opacity: 0.8, transition: { duration: 0.2 } }
};

const DetailsBottomSheet: React.FC<{ selectedDate: Date; orders: Order[]; onClose: () => void; }> = ({ selectedDate, orders, onClose }) => {
    
    const aggregatedItems = useMemo(() => aggregateOrdersForDate(orders), [orders]);

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
                    {aggregatedItems.length > 0 ? (
                        <div className="order-cards-grid">
                            {aggregatedItems.map(item => <CalendarItemCard key={item.id} item={item} />)}
                        </div>
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
        <div className="monthly-challenge-container" data-tutorial-id="calendar-challenge">
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
  const { startTour } = useTutorial(); // ✅ [추가]
  const [selectedDate, setSelectedDate] = useState<ValuePiece>(null);
  const [activeMonth, setActiveMonth] = useState<Date>(new Date());
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getUserOrdersCallable = useMemo(() => httpsCallable(functions, 'callable-getUserOrders'), [functions]);

  useEffect(() => {
    if (user?.uid) {
        setIsLoading(true);

        const payload = { 
          orderByField: 'pickupDate', 
          orderDirection: 'asc',
          pageSize: 1000,
        };

        getUserOrdersCallable(payload)
            .then(result => {
                const ordersData = (result.data as any)?.data || result.data;

                if (Array.isArray(ordersData)) {
                    setUserOrders(ordersData as Order[]);
                } else {
                    console.warn("Expected an array of orders, but received:", result.data);
                    setUserOrders([]);
                }
            })
            .catch(err => {
                console.error("주문 내역 로딩 오류:", err);
                setError("주문 내역을 불러오는 데 실패했습니다.");
                toast.error("주문 내역을 불러오는 데 실패했습니다.");
            })
            .finally(() => setIsLoading(false));
    }
  }, [user, getUserOrdersCallable]);

  const calendarDayMarkers = useMemo(() => {
    const markers: { [key: string]: { status: PickupStatus } } = {};
    const ordersByDate: { [key:string]: Order[] } = {};

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
  if (userOrders.length === 0 && !isLoading) return <EmptyCalendarState />;

  return (
    <>
      <div className="order-calendar-page-container">
        {/* ✅ [추가] 페이지 헤더 */}
        <div className="page-header-container">
          <h1 className="page-title">나의 픽업 캘린더</h1>
          <button onClick={() => startTour(calendarPageTourSteps)} className="tutorial-help-button-inline">
            <HelpCircle size={20} />
          </button>
        </div>
        
        <div className="calendar-wrapper" data-tutorial-id="calendar-main"> {/* ✅ [추가] */}
          <Calendar
            onClickDay={(date) => selectedDate && isSameDay(date, selectedDate) ? setSelectedDate(null) : setSelectedDate(date)}
            value={selectedDate}
            onActiveStartDateChange={({ activeStartDate }) => setActiveMonth(activeStartDate || new Date())}
            locale="ko-KR"
            calendarType="gregory"
            tileContent={({ date, view }) => {
                if (view !== 'month') return null;
                const isToday = isSameDay(date, new Date());
                
                const lastLoginTimestamp = userDocument?.lastLoginDate;
                const lastLoginDate = lastLoginTimestamp ? safeToDate(lastLoginTimestamp) : null;

                if (isToday && lastLoginDate && isSameDay(lastLoginDate, new Date())) {
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
          <div className="calendar-legend" data-tutorial-id="calendar-legend"> {/* ✅ [추가] */}
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
