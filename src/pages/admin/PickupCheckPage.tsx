// src/pages/admin/PickupCheckPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProductsWithStock } from '@/firebase';
import type { Product, SalesRound } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import { safeToDate } from '@/utils/productUtils';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import './PickupCheckPage.css';
import { ChevronLeft, ChevronRight, CalendarCheck, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

// 캘린더에 표시할 데이터 타입
interface PickupEvent {
  uniqueId: string;
  productId: string;
  roundId: string;
  productName: string;
  pickupDate: number;
  variantCount: number;
  price: number; // ✅ 가격 정보 추가
}

const PickupCheckPage: React.FC = () => {
  useDocumentTitle('수진이의 픽업체쿠!');

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { products } = await getProductsWithStock({ pageSize: 2000, lastVisible: null });
        
        const pickupEvents: PickupEvent[] = [];

        products.forEach((product: Product) => {
          if (Array.isArray(product.salesHistory)) {
            product.salesHistory.forEach((round: SalesRound) => {
              if (round.pickupDate) {
                const pDate = safeToDate(round.pickupDate);
                
                // ✅ 대표 가격 추출 (첫 번째 옵션 그룹의 첫 번째 아이템 가격)
                const firstPrice = round.variantGroups?.[0]?.items?.[0]?.price ?? 0;

                if (pDate) {
                  pickupEvents.push({
                    uniqueId: `${product.id}-${round.roundId}`,
                    productId: product.id,
                    roundId: round.roundId,
                    productName: product.groupName,
                    pickupDate: pDate.getTime(),
                    variantCount: round.variantGroups?.length || 0,
                    price: firstPrice, // ✅ 가격 데이터 저장
                  });
                }
              }
            });
          }
        });

        setEvents(pickupEvents);
      } catch (error: any) {
        console.error(error);
        toast.error('픽업 데이터를 불러오지 못했어요.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const eventsByDate = useMemo(() => {
    const map: Record<string, PickupEvent[]> = {};
    events.forEach(event => {
      const dateKey = dayjs(event.pickupDate).format('YYYY-MM-DD');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }, [events]);

  const selectedDateEvents = useMemo(() => {
    const dateKey = selectedDate.format('YYYY-MM-DD');
    return eventsByDate[dateKey] || [];
  }, [selectedDate, eventsByDate]);

  const generateCalendarDays = (): Dayjs[] => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startDate = startOfMonth.startOf('week');
    const endDate = endOfMonth.endOf('week');

    const calendar: Dayjs[] = [];
    let day = startDate;

    while (day.isBefore(endDate)) {
      calendar.push(day);
      day = day.add(1, 'day');
    }
    return calendar;
  };

  const calendarDays = generateCalendarDays();

  const prevMonth = () => setCurrentMonth(currentMonth.subtract(1, 'month'));
  const nextMonth = () => setCurrentMonth(currentMonth.add(1, 'month'));
  const goToday = () => {
    const now = dayjs();
    setCurrentMonth(now);
    setSelectedDate(now);
  };

  if (loading) return <SodomallLoader message="픽업 일정을 불러오는 중..." />;

  return (
    <div className="pickup-check-container">
      <header className="pickup-header">
        <h1><CalendarCheck size={28} /> 수진이의 픽업체쿠!</h1>
      </header>

      <div className="pickup-layout">
        {/* --- 캘린더 영역 --- */}
        <div className="calendar-section">
          <div className="calendar-controls">
            <button onClick={prevMonth} className="nav-btn"><ChevronLeft /></button>
            <h2 className="current-month-title">{currentMonth.format('YYYY년 M월')}</h2>
            <button onClick={nextMonth} className="nav-btn"><ChevronRight /></button>
            <button onClick={goToday} className="today-btn">오늘</button>
          </div>

          <div className="calendar-grid">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="week-day-header">{d}</div>
            ))}
            
            {calendarDays.map((date, idx) => {
              const dateKey = date.format('YYYY-MM-DD');
              const eventCount = eventsByDate[dateKey]?.length || 0;
              const hasEvent = eventCount > 0;
              const isSelected = date.isSame(selectedDate, 'day');
              const isCurrentMonth = date.isSame(currentMonth, 'month');
              const isToday = date.isSame(dayjs(), 'day');

              return (
                <div 
                  key={idx} 
                  className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => setSelectedDate(date)}
                >
                  <span className="day-number">{date.date()}</span>
                  {hasEvent && (
                    <div className="event-badge">
                      {eventCount}건
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* --- 리스트 영역 --- */}
        <div className="event-list-section">
  <div className="list-header compact-header">
    {/* ✅ 요청하신 대로 문구와 날짜 포맷(MM/DD(요일)) 변경 */}
    <h3>🔥 {selectedDate.format('MM/DD(ddd)')} 입고완료! 🔥</h3>
  </div>

  <div className="event-list-content compact-list">
            {selectedDateEvents.length > 0 ? (
              <ul className="pickup-items-compact">
  {selectedDateEvents.map((item) => (
    <li key={item.uniqueId} className="pickup-row">
      <span className="row-product-name">
        {/* ✅ 맨 앞에 체크 이모티콘 추가 */}
        ✔️ {item.productName} 
        <span style={{ color: '#888', fontWeight: 400, marginLeft: '4px' }}>
          ({item.price.toLocaleString()}원)
        </span>
      </span>
    </li>
  ))}
</ul>
            ) : (
              <div className="empty-state">
                <MapPin size={32} />
                <p>일정 없음</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PickupCheckPage;