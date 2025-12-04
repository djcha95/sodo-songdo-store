// src/pages/admin/PickupCheckPage.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProductsWithStock } from '@/firebase';
import type { Product, SalesRound, StorageType } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import { safeToDate } from '@/utils/productUtils';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import './PickupCheckPage.css';
import { ChevronLeft, ChevronRight, CalendarCheck, MapPin, Copy, RefreshCcw, MousePointerClick } from 'lucide-react'; 
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';

// 캘린더에 표시할 데이터 타입
interface PickupEvent {
  uniqueId: string;
  productId: string;
  roundId: string;
  productName: string;
  pickupDate: number;
  variantCount: number;
  price: number;
  storageType: StorageType;
}

// 상품의 상태 타입 정의 (기본 -> 작게 -> 숨김)
type ItemState = 'NORMAL' | 'SHRUNK' | 'HIDDEN';

const PickupCheckPage: React.FC = () => {
  useDocumentTitle('수진이의 픽업체쿠!');

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs());

  // 이미지 캡쳐를 위한 ref
  const captureRef = useRef<HTMLDivElement>(null);
  
  // 각 상품의 상태를 관리하는 Map (ID -> 상태)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

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
                
                // 대표 가격 추출 (첫 번째 옵션 그룹의 첫 번째 아이템 가격)
                const firstPrice = round.variantGroups?.[0]?.items?.[0]?.price ?? 0;

                if (pDate) {
                  pickupEvents.push({
                    uniqueId: `${product.id}-${round.roundId}`,
                    productId: product.id,
                    roundId: round.roundId,
                    productName: product.groupName,
                    pickupDate: pDate.getTime(),
                    variantCount: round.variantGroups?.length || 0,
                    price: firstPrice,
                    storageType: product.storageType,
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
    const list = eventsByDate[dateKey] || [];

    // 정렬 로직: 냉장(1) -> 냉동(2) -> 실온(3)
    return list.sort((a, b) => {
      const priority: Record<string, number> = {
        'FRESH': 1, 'COLD': 1,
        'FROZEN': 2,
        'ROOM': 3
      };

      const scoreA = priority[a.storageType] ?? 99;
      const scoreB = priority[b.storageType] ?? 99;

      return scoreA - scoreB;
    });
  }, [selectedDate, eventsByDate]);
  
  // ★ 추가: 화면에 보여줄 최종 리스트 (HIDDEN 상태인 항목은 아예 제거되어 당겨짐)
  const visibleEvents = useMemo(() => {
    return selectedDateEvents.filter(item => {
      const state = itemStates[item.uniqueId] || 'NORMAL';
      return state !== 'HIDDEN';
    });
  }, [selectedDateEvents, itemStates]);


  // 상품 클릭 시 상태 순환 함수 (Normal -> Shrunk -> Hidden -> Normal)
  const handleItemClick = (id: string) => {
    setItemStates(prev => {
      const currentState = prev[id] || 'NORMAL';
      let nextState: ItemState = 'NORMAL';

      if (currentState === 'NORMAL') nextState = 'SHRUNK';      // 1번 클릭: 작게
      else if (currentState === 'SHRUNK') nextState = 'HIDDEN'; // 2번 클릭: 숨김 (캡처 시 제외)
      else nextState = 'NORMAL';                                 // 3번 클릭: 원상복구

      // 상태 변경에 따른 토스트 메시지
      if (nextState === 'SHRUNK') toast('글자가 작게 표시됩니다.', { icon: '🤏' });
      // HIDDEN 상태는 visibleEvents에서 아예 제거되어 리스트가 당겨짐
      else if (nextState === 'HIDDEN') toast('이 상품은 안내문에서 제거됩니다. (취소하려면 다시 클릭)', { icon: '✂️' });
      else toast('원래 크기로 돌아왔습니다.', { icon: '👀' });

      return { ...prev, [id]: nextState };
    });
  };

  // 상태 초기화 (다시 보이기)
  const resetStates = () => {
    setItemStates({});
    toast.success('모든 상품 설정이 초기화되었습니다.');
  };

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

        {/* --- 리스트 영역 (관리용) --- */}
        <div className="event-list-section">
          <div className="list-header compact-header">
            <h3>🔥 {selectedDate.format('MM/DD(ddd)')} 입고완료! 🔥</h3>
          </div>

          <div className="event-list-content compact-list">
            {selectedDateEvents.length > 0 ? (
              <>
                {/* 1. 신선제품 당일픽업 그룹 (냉장, 신선) */}
                {selectedDateEvents.filter(item => ['FRESH', 'COLD'].includes(item.storageType)).length > 0 && (
                  <div className="pickup-group">
                    <h4 className="group-title">** 신선제품 당일픽업 **</h4>
                    <ul className="pickup-items-compact">
                      {selectedDateEvents
                        .filter(item => ['FRESH', 'COLD'].includes(item.storageType))
                        .map((item) => (
                          <li key={item.uniqueId} className="pickup-row">
                            <span className="row-product-name">
                              ✔️ {item.productName} 
                              <span style={{ color: '#888', fontWeight: 400, marginLeft: '4px' }}>
                                ({item.price.toLocaleString()}원)
                              </span>
                            </span>
                          </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 2. 일반제품 2일픽업 그룹 (냉동, 실온) */}
                {selectedDateEvents.filter(item => ['FROZEN', 'ROOM'].includes(item.storageType)).length > 0 && (
                  <div className="pickup-group">
                    <h4 className="group-title">** 일반제품 2일픽업 **</h4>
                    <ul className="pickup-items-compact">
                      {selectedDateEvents
                        .filter(item => ['FROZEN', 'ROOM'].includes(item.storageType))
                        .map((item) => (
                          <li key={item.uniqueId} className="pickup-row">
                            <span className="row-product-name">
                              ✔️ {item.productName} 
                              <span style={{ color: '#888', fontWeight: 400, marginLeft: '4px' }}>
                                ({item.price.toLocaleString()}원)
                              </span>
                            </span>
                          </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <MapPin size={32} />
                <p>일정 없음</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* --- ▼▼▼ 업그레이드된 이미지 생성 섹션 ▼▼▼ --- */}
      <div className="image-generator-container">
        <h2 style={{ marginBottom: '0.5rem', fontWeight: 700 }}>📸 뚜디니의 픽업 안내문 만들기</h2>
        <p style={{ marginBottom: '1.5rem', color: '#666', fontSize: '0.95rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
          <MousePointerClick size={18}/> 상품을 클릭해보세요: 
          <strong>[작게]</strong> → <strong>[삭제(당겨짐)]</strong> → <strong>[원래대로]</strong> 순서로 바뀝니다.
        </p>

        {/* 캡쳐될 영역 (그라데이션 프레임 포함) */}
        <div ref={captureRef} className="capture-frame">
          <div className="pickup-notice-card">
            
            {/* 1. 헤더 */}
            <div className="notice-header">
              <span className="notice-date-badge">
                {selectedDate.format('M월 D일 (ddd)')}
              </span>
              <h2 className="notice-title">입고완료! 픽업와주세요!</h2>
            </div>

            {/* 2. 그리드 (visibleEvents 사용: HIDDEN 항목은 아예 제거됨) */}
            <div className="notice-grid">
              {visibleEvents.map((item) => {
                // 색상 결정
                let colorClass = 'text-black';
                if (['FRESH', 'COLD'].includes(item.storageType)) colorClass = 'text-red';
                else if (item.storageType === 'FROZEN') colorClass = 'text-blue';

                // 현재 상태 확인 (기본값: NORMAL)
                const currentState = itemStates[item.uniqueId] || 'NORMAL';
                
                // 클래스 조합: 색상 + 상태별 스타일(shrink)
                const isShrunk = currentState === 'SHRUNK';

                return (
                  <div 
                    key={item.uniqueId} 
                    className="notice-item"
                    onClick={() => handleItemClick(item.uniqueId)} // 클릭 시 상태 순환
                    title="클릭: 작게 -> 삭제(당겨짐) -> 원상복구"
                  >
                    <span className={`notice-item-text ${colorClass} ${isShrunk ? 'state-shrunk' : ''}`}>
                      {item.productName}
                      {item.variantCount > 1 && <span style={{fontSize:'0.6em', marginLeft:'4px'}}>({item.variantCount}종)</span>}
                    </span>
                  </div>
                );
              })}
              
              {/* 빈칸 채우기 (짝수 맞춤) */}
              {visibleEvents.length % 2 !== 0 && (
                <div className="notice-item" style={{ background: '#f5f5f5', cursor: 'default' }}></div>
              )}
            </div>

            {/* 3. 푸터 */}
            <div className="notice-footer">
              <div className="footer-msg">
                📦 보관기간: 입고일 포함 <span className="text-black">2일</span>
              </div>
              <div className="footer-highlight">
                🚨 신선/냉장(빨강)은 당일 픽업 필수!
              </div>
            </div>
            
            <div className="footer-deco">
              S O D O M A L L &nbsp; S O N G D O
            </div>
          </div>
        </div>

        {/* 버튼들 */}
        <div className="action-buttons">
          <button onClick={resetStates} className="btn-reset">
            <RefreshCcw size={18} style={{marginRight:'5px'}}/> 초기화 (다시 보이기)
          </button>
        </div>
      </div>
      {/* --- ▲▲▲ 이미지 생성 섹션 끝 ▲▲▲ --- */}

    </div>
  );
};

export default PickupCheckPage;