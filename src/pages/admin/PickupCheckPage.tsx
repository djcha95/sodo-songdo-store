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
import { ChevronLeft, ChevronRight, CalendarCheck, RefreshCcw, Bell, ShoppingBag, Plus, Copy } from 'lucide-react'; 
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';

// 캘린더 데이터 타입
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

// ★ 수동 추가 아이템 타입
interface ManualItem {
  uniqueId: string;
  productName: string;
  storageType: StorageType;
  variantCount?: number; // 수동 추가는 0 또는 1로 간주
}

// 상태 타입: 기본 -> 작게 -> 숨김
type ItemState = 'NORMAL' | 'SHRUNK' | 'HIDDEN';
// 모드 타입: 입고알림 vs 노쇼줍줍
type ViewMode = 'ARRIVAL' | 'NOSHOW';

const PickupCheckPage: React.FC = () => {
  useDocumentTitle('수진이의 픽업체쿠!');

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs());

  // 이미지 캡쳐를 위한 ref
  const captureRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('ARRIVAL'); 
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  // ★ 수동 추가 상태 관리
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [inputName, setInputName] = useState('');
  const [inputType, setInputType] = useState<StorageType>('FRESH'); // 기본값: 신선(빨강)


  // 모드 변경 시 초기화
  useEffect(() => {
    setItemStates({});
    setManualItems([]); // 모드 바뀌면 수동 추가한 것도 초기화
  }, [viewMode]);

  // 데이터 로딩 (기존 유지)
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
        toast.error('데이터 로딩 실패');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 날짜별 이벤트 분류
  const eventsByDate = useMemo(() => {
    const map: Record<string, PickupEvent[]> = {};
    events.forEach(event => {
      const dateKey = dayjs(event.pickupDate).format('YYYY-MM-DD');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }, [events]);

  const calendarEvents = useMemo(() => eventsByDate[selectedDate.format('YYYY-MM-DD')] || [], [selectedDate, eventsByDate]);

  // 이미지 생성용 이벤트 가져오기
  const imageGeneratorEvents = useMemo(() => {
    const targetDateKey = selectedDate.format('YYYY-MM-DD');
    if (viewMode === 'ARRIVAL') {
      return eventsByDate[targetDateKey] || [];
    } else {
      // 노쇼 모드 날짜 계산 로직
      const yesterday = selectedDate.subtract(1, 'day').format('YYYY-MM-DD');
      const dayBeforeYesterday = selectedDate.subtract(2, 'day').format('YYYY-MM-DD');
      const freshItems = (eventsByDate[yesterday] || []).filter(item => ['FRESH', 'COLD'].includes(item.storageType));
      const normalItems = (eventsByDate[dayBeforeYesterday] || []).filter(item => ['FROZEN', 'ROOM'].includes(item.storageType));
      return [...freshItems, ...normalItems];
    }
  }, [selectedDate, eventsByDate, viewMode]);

  // ★ 최종 리스트 = [자동 불러온 것] + [수동 추가한 것] 합치기
  const combinedEvents = useMemo(() => {
    // 1. 자동 리스트 변환 (ManualItem 타입으로 통일)
    const autoItems = imageGeneratorEvents.map(item => ({
      uniqueId: item.uniqueId,
      productName: item.productName,
      storageType: item.storageType,
      variantCount: item.variantCount
    }));

    // 2. 수동 리스트 합치기
    const allItems = [...autoItems, ...manualItems];

    // 3. 정렬 (신선 -> 냉동 -> 실온)
    return allItems.sort((a, b) => {
      const priority: Record<string, number> = { 'FRESH': 1, 'COLD': 1, 'FROZEN': 2, 'ROOM': 3 };
      return (priority[a.storageType] ?? 99) - (priority[b.storageType] ?? 99);
    });
  }, [imageGeneratorEvents, manualItems]);

  // ★ 숨김 필터링 (최종 화면 표시용)
  const finalVisibleEvents = useMemo(() => {
    return combinedEvents.filter(item => itemStates[item.uniqueId] !== 'HIDDEN');
  }, [combinedEvents, itemStates]);


  // 클릭 핸들러 (NORMAL -> SHRUNK -> HIDDEN -> NORMAL)
  const handleItemClick = (id: string) => {
    setItemStates(prev => {
      const currentState = prev[id] || 'NORMAL';
      let nextState: ItemState = 'NORMAL';

      if (currentState === 'NORMAL') nextState = 'SHRUNK';      // 1번 클릭: 작게
      else if (currentState === 'SHRUNK') nextState = 'HIDDEN'; // 2번 클릭: 숨김 (캡처 시 제외)
      else nextState = 'NORMAL';                                 // 3번 클릭: 원상복구

      // 상태 변경에 따른 토스트 메시지 
      if (nextState === 'SHRUNK') toast('글자가 작게 표시됩니다.', { icon: '🤏' });
      else if (nextState === 'HIDDEN') toast('이 상품은 안내문에서 제거됩니다. (취소하려면 다시 클릭)', { icon: '✂️' });
      else toast('원래 크기로 돌아왔습니다.', { icon: '👀' });

      return { ...prev, [id]: nextState };
    });
  };

  // ★ 수동 추가 핸들러
  const handleAddManualItem = () => {
    if (!inputName.trim()) {
      toast.error('상품 이름을 입력해주세요!');
      return;
    }
    const newItem: ManualItem = {
      uniqueId: `manual-${Date.now()}`, // 고유 ID 생성
      productName: inputName,
      storageType: inputType,
      variantCount: 0, // 수동 추가는 variantCount 0으로 설정 (표시 X)
    };
    setManualItems(prev => [...prev, newItem]);
    setInputName(''); // 입력창 초기화
    toast.success('상품이 추가되었습니다!');
  };

  // 초기화 핸들러
  const resetStates = () => {
    setItemStates({});
    setManualItems([]); // 수동 추가한 것도 싹 비우기
    toast.success('초기화 완료!');
  };

  // 캘린더 관련 로직 (기존 유지)
  const calendarDays = useMemo(() => {
    const start = currentMonth.startOf('month').startOf('week');
    const end = currentMonth.endOf('month').endOf('week');
    const days: Dayjs[] = [];
    let d = start;
    while (d.isBefore(end)) { days.push(d); d = d.add(1, 'day'); }
    return days;
  }, [currentMonth]);

  // ★ 이미지 클립보드 복사 함수 (첫 번째 파일에서 가져옴)
  const handleCopyImage = async () => {
    if (!captureRef.current) return;

    captureRef.current.classList.add('capture-mode');

    try {
      const canvas = await html2canvas(captureRef.current, {
        scale: 2, // 고해상도
        backgroundColor: null, 
        useCORS: true,
        scrollY: 0, 
        x: 0,
      });

      captureRef.current.classList.remove('capture-mode');

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('이미지 생성 실패 ㅠㅠ');
          return;
        }
        
        // 클립보드 복사 시도
        try {
          // navigator.clipboard.write가 존재하는 환경일 때만 실행
          if (window.ClipboardItem && navigator.clipboard.write) {
             const item = new ClipboardItem({ 'image/png': blob });
             await navigator.clipboard.write([item]);
             toast.success('복사 완료! 카톡에 붙여넣기 하세요.');
             return;
          }
        } catch (err) {
          console.warn('Clipboard write failed, falling back to download:', err);
        }
        
        // 실패 시 (or 지원하지 않는 환경 시) 다운로드
        const link = document.createElement('a');
        link.download = `픽업안내_${selectedDate.format('MMDD')}.png`;
        link.href = canvas.toDataURL();
        link.click();
        toast.success('이미지로 저장되었습니다.');
      });
    } catch (error) {
      console.error(error);
      captureRef.current?.classList.remove('capture-mode');
      toast.error('오류가 발생했습니다.');
    }
  };

  if (loading) return <SodomallLoader message="로딩 중..." />;

  return (
    <div className="pickup-check-container">
      <header className="pickup-header">
        <h1><CalendarCheck size={28} /> 수진이의 픽업체쿠!</h1>
      </header>

      <div className="pickup-layout">
        {/* 캘린더 영역 */}
        <div className="calendar-section">
          <div className="calendar-controls">
            <button onClick={() => setCurrentMonth(prev => prev.subtract(1, 'month'))} className="nav-btn"><ChevronLeft /></button>
            <h2 className="current-month-title">{currentMonth.format('YYYY년 M월')}</h2>
            <button onClick={() => setCurrentMonth(prev => prev.add(1, 'month'))} className="nav-btn"><ChevronRight /></button>
            <button onClick={() => {const now=dayjs(); setCurrentMonth(now); setSelectedDate(now);}} className="today-btn">오늘</button>
          </div>
          <div className="calendar-grid">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="week-day-header">{d}</div>)}
            {calendarDays.map((date, idx) => {
              const dateKey = date.format('YYYY-MM-DD');
              const count = eventsByDate[dateKey]?.length || 0;
              return (
                <div 
                  key={idx} 
                  className={`calendar-day ${!date.isSame(currentMonth, 'month') ? 'other-month' : ''} ${date.isSame(selectedDate, 'day') ? 'selected' : ''} ${date.isSame(dayjs(), 'day') ? 'today' : ''}`}
                  onClick={() => setSelectedDate(date)}
                >
                  <span className="day-number">{date.date()}</span>
                  {count > 0 && <div className="event-badge">{count}건</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 리스트 영역 (관리용 - 단순 리스트 표시) */}
        <div className="event-list-section">
          <div className="list-header compact-header">
            <h3>📅 {selectedDate.format('MM/DD')} 리스트</h3>
          </div>
          <div className="event-list-content compact-list">
            {calendarEvents.length > 0 ? (
              <ul className="pickup-items-compact">
                {calendarEvents.map(item => (
                  <li key={item.uniqueId} className="pickup-row">
                    <span className="row-product-name">{item.productName}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="empty-state"><p>입고 없음</p></div>}
          </div>
        </div>
      </div>
      
      {/* --- ▼▼▼ 이미지 생성기 (모드 기능 추가) ▼▼▼ --- */}
      <div className="image-generator-container">
        
        {/* 모드 전환 탭 */}
        <div className="mode-tabs">
          <button 
            className={`mode-tab ${viewMode === 'ARRIVAL' ? 'active-arrival' : ''}`}
            onClick={() => setViewMode('ARRIVAL')}
          >
            <Bell size={18} style={{marginRight:'5px', verticalAlign:'text-bottom'}}/> 
            입고 알림
          </button>
          <button 
            className={`mode-tab ${viewMode === 'NOSHOW' ? 'active-noshow' : ''}`}
            onClick={() => setViewMode('NOSHOW')}
          >
            <ShoppingBag size={18} style={{marginRight:'5px', verticalAlign:'text-bottom'}}/> 
            노쇼 줍줍
          </button>
        </div>

        {/* ★ 상품 직접 추가 영역 ★ */}
        <div className="manual-input-area">
          <input 
            type="text" 
            className="input-product-name" 
            placeholder="추가할 상품명 입력" 
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddManualItem()}
          />
          <select 
            className="select-storage-type"
            value={inputType}
            onChange={(e) => setInputType(e.target.value as StorageType)}
          >
            <option value="FRESH">🔴 신선/냉장 (빨강)</option>
            <option value="FROZEN">🔵 냉동 (파랑)</option>
            <option value="ROOM">⚫ 실온 (검정)</option>
            <option value="COLD">🔴 냉장 (빨강)</option>
          </select>
          <button className="btn-add-manual" onClick={handleAddManualItem}>
            <Plus size={16} style={{marginRight:'4px'}}/> 추가
          </button>
        </div>

        <h2 style={{ marginBottom: '0.5rem', fontWeight: 700 }}>
          {viewMode === 'ARRIVAL' ? '📸 입고 안내문' : '📸 현장판매 리스트'}
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#666', fontSize: '0.95rem' }}>
          {viewMode === 'NOSHOW' ? 
            '자동계산된 줍줍 리스트입니다.' : 
            '오늘 입고 리스트입니다.'}
          <br/>빠진 상품은 위에서 직접 추가하세요!
        </p>

        {/* 캡쳐 프레임 */}
        <div ref={captureRef} className={`capture-frame ${viewMode === 'NOSHOW' ? 'theme-blue' : ''}`}>
          <div className="pickup-notice-card">
            
            {/* 1. 헤더 */}
            <div className="notice-header">
              <span className="notice-date-badge">
                {selectedDate.format('M월 D일 (ddd)')}
              </span>
              {/* 고정된 제목 (customTitle/input 대신) */}
              <h2 className="notice-title">
                {viewMode === 'ARRIVAL' ? '입고완료! 픽업와주세요!' : '노쇼분 현장판매 시작!'}
              </h2>
            </div>

            {/* 2. 그리드 */}
            <div className="notice-grid">
              {finalVisibleEvents.length > 0 ? finalVisibleEvents.map((item) => {
                let colorClass = 'text-black';
                if (['FRESH', 'COLD'].includes(item.storageType)) colorClass = 'text-red';
                else if (item.storageType === 'FROZEN') colorClass = 'text-blue';

                const isShrunk = itemStates[item.uniqueId] === 'SHRUNK';

                return (
                  <div 
                    key={item.uniqueId} 
                    className="notice-item"
                    onClick={() => handleItemClick(item.uniqueId)} 
                  >
                    <span className={`notice-item-text ${colorClass} ${isShrunk ? 'state-shrunk' : ''}`}>
                      {item.productName}
                      {/* variantCount가 1보다 클 때만 표시 */}
                      {(item.variantCount && item.variantCount > 1) && <span style={{fontSize:'0.6em', marginLeft:'4px'}}>({item.variantCount}종)</span>}
                    </span>
                  </div>
                );
              }) : (
                // 목록이 없을 때 표시
                <div style={{gridColumn:'span 2', padding:'40px', textAlign:'center', color:'#999', fontSize:'1.2rem', fontWeight:700}}>
                  상품이 없습니다. 직접 추가해보세요!
                </div>
              )}
              
              {/* 빈칸 채우기 */}
              {finalVisibleEvents.length > 0 && finalVisibleEvents.length % 2 !== 0 && (
                <div className="notice-item" style={{ background: '#f5f5f5', cursor: 'default' }}></div>
              )}
            </div>

            {/* 3. 푸터 */}
            <div className="notice-footer">
              <div className="footer-msg">
                {viewMode === 'ARRIVAL' ? (
                  <>📦 보관기간: 입고일 포함 <span className="text-black">2일</span></>
                ) : (
                  <>🎁 <span className="text-blue" style={{fontWeight:900}}>선착순 현장판매</span> 진행중!</>
                )}
              </div>
              <div className="footer-highlight">
                {viewMode === 'ARRIVAL' ? (
                   '🚨 신선/냉장(빨강)은 당일 픽업 필수!'
                ) : (
                  '💸 마감임박! 놓치면 품절입니다!'
                )}
              </div>
            </div>
            
            <div className="footer-deco">S O D O M A L L &nbsp; S O N G D O</div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="action-buttons">
          <button onClick={resetStates} className="btn-reset">
            <RefreshCcw size={18} style={{marginRight:'5px'}}/> 초기화
          </button>
        </div>
      </div>
    </div>
  );
};

export default PickupCheckPage;