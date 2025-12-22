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
import { ChevronLeft, ChevronRight, CalendarCheck, RefreshCcw, Bell, ShoppingBag, Plus, Copy, MapPin, Camera, List as ListIcon } from 'lucide-react'; 
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas'; // html2canvas import 필요

// 1. PickupEvent 인터페이스에 imageUrl 추가
interface PickupEvent {
  uniqueId: string;
  productId: string;
  roundId: string;
  productName: string;
  pickupDate: number;
  variantCount: number;
  price: number;
  storageType: StorageType;
  imageUrl?: string; // ★ [추가] 이미지 URL 필드
}

// 2. 수동 추가 아이템 타입에도 imageUrl 추가
interface ManualItem {
  uniqueId: string;
  productName: string;
  storageType: StorageType;
  variantCount?: number;
  imageUrl?: string; // ★ [추가]
}
// 상태 타입
type ItemState = 'NORMAL' | 'SHRUNK' | 'HIDDEN';
// 모드 타입
// 1. ViewMode 타입에 'CLOSING' 추가
type ViewMode = 'ARRIVAL' | 'NOSHOW' | 'CLOSING';

const PickupCheckPage: React.FC = () => {
  useDocumentTitle('수진이의 픽업체쿠!');

  // ★ [추가] 사진 모드 여부 상태 (이미지 생성기용)
  const [isPhotoMode, setIsPhotoMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs());

  // 이미지 캡쳐 ref
  const captureRef = useRef<HTMLDivElement>(null);

  // 최신 기능용 상태들
  const [viewMode, setViewMode] = useState<ViewMode>('ARRIVAL'); 
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [inputName, setInputName] = useState('');
  const [inputType, setInputType] = useState<StorageType>('FRESH');

  // 모드 변경 시 초기화
  useEffect(() => {
    setItemStates({});
    setManualItems([]); 
  }, [viewMode]);

  // 데이터 로딩
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
                // ★ [수정] 대표 이미지 가져오기 (첫번째 이미지)
                const firstImage = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : undefined;
                
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
                    imageUrl: firstImage, // ★ [추가] 여기에 이미지 저장
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

  // ★ [오른쪽 리스트용] 선택된 날짜의 이벤트 (정렬 적용)
  const selectedDateEvents = useMemo(() => {
    const dateKey = selectedDate.format('YYYY-MM-DD');
    const list = eventsByDate[dateKey] || [];
    return list.sort((a, b) => {
      const priority: Record<string, number> = { 'FRESH': 1, 'COLD': 1, 'FROZEN': 2, 'ROOM': 3 };
      const scoreA = priority[a.storageType] ?? 99;
      const scoreB = priority[b.storageType] ?? 99;
      return scoreA - scoreB;
    });
  }, [selectedDate, eventsByDate]);

  // 2. [이미지 생성기용] 이벤트 가져오기 (마감임박 로직 수정됨)
  const imageGeneratorEvents = useMemo(() => {
  const targetDateKey = selectedDate.format('YYYY-MM-DD');
  
  if (viewMode === 'ARRIVAL') {
    // ARRIVAL: 입고 알림 (당일)
    return eventsByDate[targetDateKey] || [];
    
  } else if (viewMode === 'CLOSING') {
    // ★ [수정됨] 내일(+1)이 아니라 '선택한 날짜(당일)' 그대로 사용!
    // (오전에 올리는 당일 1시 마감 공지용)
    return eventsByDate[targetDateKey] || [];
    
  } else {
    // NOSHOW: (기존 유지)
    const yesterday = selectedDate.subtract(1, 'day').format('YYYY-MM-DD');
    const dayBeforeYesterday = selectedDate.subtract(2, 'day').format('YYYY-MM-DD');
    const freshItems = (eventsByDate[yesterday] || []).filter(item => ['FRESH', 'COLD'].includes(item.storageType));
    const normalItems = (eventsByDate[dayBeforeYesterday] || []).filter(item => ['FROZEN', 'ROOM'].includes(item.storageType));
    return [...freshItems, ...normalItems];
  }
}, [selectedDate, eventsByDate, viewMode]);

// ★ 최종 리스트 = [자동 불러온 것] + [수동 추가한 것] 합치기
  const combinedEvents = useMemo(() => {
    // 1. 자동 리스트 변환
    const autoItems = imageGeneratorEvents.map(item => ({
      uniqueId: item.uniqueId,
      productName: item.productName,
      storageType: item.storageType,
      variantCount: item.variantCount,
      price: item.price,
      imageUrl: item.imageUrl // ★ [추가] 이미지 전달
    }));

    // 2. 수동 리스트 합치기
    const allItems = [...autoItems, ...manualItems];

    // 3. 정렬 (신선 -> 냉동 -> 실온)
    return allItems.sort((a, b) => {
      const priority: Record<string, number> = { 'FRESH': 1, 'COLD': 1, 'FROZEN': 2, 'ROOM': 3 };
      return (priority[a.storageType] ?? 99) - (priority[b.storageType] ?? 99);
    });
  }, [imageGeneratorEvents, manualItems]);
  
  // ★ [화면 표시용] 숨김 필터링
  const finalVisibleEvents = useMemo(() => {
    return combinedEvents.filter(item => itemStates[item.uniqueId] !== 'HIDDEN');
  }, [combinedEvents, itemStates]);

  // 핸들러들
  const handleItemClick = (id: string) => {
    setItemStates(prev => {
      const currentState = prev[id] || 'NORMAL';
      if (currentState === 'NORMAL') return { ...prev, [id]: 'SHRUNK' };
      else return { ...prev, [id]: 'HIDDEN' };
    });
  };

  const handleAddManualItem = () => {
    if (!inputName.trim()) return toast.error('상품명 입력!');
    const newItem: ManualItem = {
      uniqueId: `manual-${Date.now()}`,
      productName: inputName,
      storageType: inputType,
      variantCount: 0,
    };
    setManualItems(prev => [...prev, newItem]);
    setInputName('');
    toast.success('추가됨!');
  };

  const resetStates = () => {
    setItemStates({});
    setManualItems([]);
    toast.success('초기화 완료!');
  };

  // 캘린더 생성
  const calendarDays = useMemo(() => {
    const start = currentMonth.startOf('month').startOf('week');
    const end = currentMonth.endOf('month').endOf('week');
    const days: Dayjs[] = [];
    let d = start;
    while (d.isBefore(end)) { days.push(d); d = d.add(1, 'day'); }
    return days;
  }, [currentMonth]);

  if (loading) return <SodomallLoader message="로딩 중..." />;

  // 3. 렌더링 부분 수정 시작
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

        {/* --- 리스트 영역 (완벽 수정 버전) --- */}
        <div className="event-list-section">
          <div className="list-header compact-header">
            {/* 제목이 모드에 따라 바뀝니다 */}
            <h3 style={
              viewMode === 'NOSHOW' ? { color: '#1565c0' } : 
              viewMode === 'CLOSING' ? { color: '#e65100' } : {} // 마감임박 색상
            }>
              {viewMode === 'ARRIVAL' && `🔥 ${selectedDate.format('MM/DD(ddd)')} 입고완료! 🔥`}
              
              {/* [수정] 내일 픽업일인 상품들이므로 오늘 마감된다는 멘트 */}
              {viewMode === 'CLOSING' && `⏳ 예약 마감 임박!⏳`}
              
              {viewMode === 'NOSHOW' && `📢 노쇼분 오늘부터 현장판매 📢`}
            </h3>
          </div>

<div className="event-list-content compact-list">
            {finalVisibleEvents.length > 0 ? (
              <>
                {/* [모드 1] 입고 알림: 그룹 나눠서 보여주기 */}
                {viewMode === 'ARRIVAL' ? (
                  <>
                    {/* 1. 신선제품 그룹 */}
                    {finalVisibleEvents.filter(item => ['FRESH', 'COLD'].includes(item.storageType)).length > 0 && (
                      <div className="pickup-group">
                        <h4 className="group-title">** 신선제품 당일픽업 **</h4>
                        {/* ★ [수정 1] listStyle: 'none' 추가 */}
                        <ul className="pickup-items-compact" style={{ listStyle: 'none', padding: 0 }}>
  {finalVisibleEvents
    .filter(item => ['FRESH', 'COLD'].includes(item.storageType))
    .map(item => (
      <li key={item.uniqueId} className="pickup-row">
        <span className="row-product-name">
  ✔️ {item.productName}
  {/* [수정됨] 가격이 0보다 클 때만 괄호 표시 */}
  {((item as any).price || 0) > 0 && <span style={{ fontWeight: 400, marginLeft: '2px' }}>({(item as any).price.toLocaleString()}원)</span>}
</span>
      </li>
    ))}
</ul>
                      </div>
                    )}
                    
                    {/* 2. 일반제품 그룹 */}
                    {finalVisibleEvents.filter(item => ['FROZEN', 'ROOM'].includes(item.storageType)).length > 0 && (
                      <div className="pickup-group">
                        <h4 className="group-title">** 일반제품 2일픽업 **</h4>
                        {/* ★ [수정 2] listStyle: 'none' 추가 */}
                        <ul className="pickup-items-compact" style={{ listStyle: 'none', padding: 0 }}>
                          {finalVisibleEvents
                            .filter(item => ['FROZEN', 'ROOM'].includes(item.storageType))
                            .map(item => (
                              <li key={item.uniqueId} className="pickup-row">
                                <span className="row-product-name">
                                  ✔️ {item.productName}
                                  {(item as any).price && <span style={{ fontWeight: 400, marginLeft: '2px' }}>({(item as any).price.toLocaleString()}원)</span>}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  /* [모드 2/3] 노쇼 줍줍 & 마감 임박: 그냥 쭉 나열하기 */
                  /* ★ [수정 3] listStyle: 'none' 추가 */
                  <ul className="pickup-items-compact" style={{ listStyle: 'none', padding: 0 }}>
                    {/* map 함수에 index(순서) 추가 */}
                    {finalVisibleEvents.map((item, index) => (
                      <li key={item.uniqueId} className="pickup-row">
                        <span className="row-product-name">
                          
                          {/* 마감임박(CLOSING)일 때는 번호 매기기 */}
                          {viewMode === 'CLOSING' ? (
                            <span style={{ fontWeight: 'bold', marginRight: '4px', color: '#e65100' }}>
                              {index + 1}.
                            </span>
                          ) : (
                            '✔️ '
                          )}

                          {item.productName}
                          {(item as any).price && <span style={{ fontWeight: 400, marginLeft: '2px' }}>({(item as any).price.toLocaleString()}원)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (              <div className="empty-state">
                <MapPin size={32} />
                <p>
                  {viewMode === 'ARRIVAL' && '입고 일정 없음'}
                  {viewMode === 'CLOSING' && '마감 임박 상품 없음'}
                  {viewMode === 'NOSHOW' && '노쇼 물량 없음'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* --- 이미지 생성기 (최신 기능: 노쇼 줍줍 + 수동 추가) --- */}
      <div className="image-generator-container">
        <div className="mode-tabs">
          <button className={`mode-tab ${viewMode === 'ARRIVAL' ? 'active-arrival' : ''}`} onClick={() => setViewMode('ARRIVAL')}>
            <Bell size={18} style={{marginRight:'5px', verticalAlign:'text-bottom'}}/> 입고 알림
          </button>
          {/* ★ 마감임박 버튼 추가 */}
          <button className={`mode-tab ${viewMode === 'CLOSING' ? 'active-closing' : ''}`} onClick={() => setViewMode('CLOSING')}>
            <CalendarCheck size={18} style={{marginRight:'5px', verticalAlign:'text-bottom'}}/> 마감 임박
          </button>
          <button className={`mode-tab ${viewMode === 'NOSHOW' ? 'active-noshow' : ''}`} onClick={() => setViewMode('NOSHOW')}>
            <ShoppingBag size={18} style={{marginRight:'5px', verticalAlign:'text-bottom'}}/> 노쇼 줍줍
          </button>
        </div>

        {/* ★ [새 기능] 텍스트 모드 vs 사진 모드 토글 버튼 */}
        <div className="view-toggle-area">
          <button 
            className={`view-toggle-btn ${!isPhotoMode ? 'active' : ''}`} 
            onClick={() => setIsPhotoMode(false)}
          >
            <ListIcon size={16} style={{marginRight:'3px'}}/> 텍스트 공지
          </button>
          <button 
            className={`view-toggle-btn ${isPhotoMode ? 'active' : ''}`} 
            onClick={() => setIsPhotoMode(true)}
          >
            <Camera size={16} style={{marginRight:'3px'}}/> 사진 모아보기
          </button>
        </div>

        {/* 수동 입력창 (사진 모드일 때는 숨김) */}
        {!isPhotoMode && (
          <div className="manual-input-area">
            <input type="text" className="input-product-name" placeholder="상품명 입력" value={inputName} onChange={(e) => setInputName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddManualItem()} />
            <select className="select-storage-type" value={inputType} onChange={(e) => setInputType(e.target.value as StorageType)}>
              <option value="FRESH">🔴 신선/냉장 (빨강)</option>
              <option value="FROZEN">🔵 냉동 (파랑)</option>
              <option value="ROOM">⚫ 실온 (검정)</option>
            </select>
            <button className="btn-add-manual" onClick={handleAddManualItem}><Plus size={16} style={{marginRight:'4px'}}/> 추가</button>
          </div>
        )}

        <h2 style={{ marginBottom: '0.5rem', fontWeight: 700 }}>
          {/* 제목 로직 */}
          {isPhotoMode ? '📸 사진 앨범 (캡쳐용)' : (
            viewMode === 'ARRIVAL' ? '📸 입고 안내문' :
            viewMode === 'CLOSING' ? '📸 예약 마감 경고장' : '📸 현장판매 리스트'
          )}
        </h2>
        
        {/* ★ [캡쳐 영역] 분기 처리: 사진모드 vs 텍스트모드 */}
        <div ref={captureRef} className={`capture-frame ${viewMode === 'NOSHOW' ? 'theme-blue' : viewMode === 'CLOSING' ? 'theme-orange' : ''} ${isPhotoMode ? 'photo-mode-frame' : ''}`}>
          {isPhotoMode ? (
            /* ================= 사진 모드 (Grid) ================= */
            <div className="pickup-photo-card">
              <div className="photo-header">
                  <span className="photo-date">{selectedDate.format('M월 D일')}</span>
                  <span className="photo-title">
                    {/* ▼ [수정됨] 모드별 타이틀 분기 처리 */}
                    {viewMode === 'CLOSING' ? '🔥 예약 곧 마감임박' : 
                     viewMode === 'NOSHOW' ? '노쇼분 현장판매' : 
                     '✨ 오늘의 라인업'}
                  </span>
              </div>
              
              <div className="photo-grid">
  {finalVisibleEvents.filter(item => item.imageUrl).length > 0 ? (
    finalVisibleEvents.filter(item => item.imageUrl).map((item) => (
      <div key={item.uniqueId} className="photo-item">
        <div className="photo-img-wrapper">
          {/* 오직 이미지만 남깁니다 */}
          <img src={item.imageUrl} alt={item.productName} crossOrigin="anonymous" />
        </div>
        {/* 여기 있던 상품명 오버레이 div 삭제됨 */}
      </div>
    ))
  ) : (
                  <div className="no-photo-msg">이미지가 있는 상품이 없습니다. 😢</div>
                )}
              </div>
              
              <div className="photo-footer">
                S O D O M A L L &nbsp; P I C K
              </div>
            </div>
          ) : (
            /* ================= 기존 텍스트 모드 ================= */
            <div className="pickup-notice-card">
              <div className="notice-header">
                {/* 날짜 뱃지 */}
                <span className="notice-date-badge">{selectedDate.format('M월 D일 (ddd)')}</span>
                <h2 className="notice-title">
                  {viewMode === 'ARRIVAL' && '입고완료! 픽업와주세요!'}
                  
                  {/* [수정] 예약 마감 강조 */}
                  {viewMode === 'CLOSING' && '추가공구 곧 마감됩니다!'} 
                  
                  {viewMode === 'NOSHOW' && '노쇼분 현장판매 시작!'}
                </h2>
              </div>
              
              {/* 그리드 아이템들 (기존 로직 유지) */}
              <div className="notice-grid">
                {finalVisibleEvents.length > 0 ? finalVisibleEvents.map((item) => {
                  let colorClass = 'text-black';
                  if (['FRESH', 'COLD'].includes(item.storageType)) colorClass = 'text-red';
                  else if (item.storageType === 'FROZEN') colorClass = 'text-blue';
                  const isShrunk = itemStates[item.uniqueId] === 'SHRUNK';

                  return (
                    <div key={item.uniqueId} className="notice-item" onClick={() => handleItemClick(item.uniqueId)}>
                      <span className={`notice-item-text ${colorClass} ${isShrunk ? 'state-shrunk' : ''}`}>
  {item.productName}
  {/* [수정됨] 0이 출력되지 않도록 조건 변경 */}
  {(item.variantCount || 0) > 1 && <span style={{fontSize:'0.6em', marginLeft:'4px'}}>({item.variantCount}종)</span>}
</span>
                    </div>
                  );
                }) : (
                  <div style={{gridColumn:'span 2', padding:'40px', textAlign:'center', color:'#999', fontSize:'1.2rem', fontWeight:700}}>
                    {viewMode === 'CLOSING' ? '마감 임박 상품이 없습니다.' : '상품이 없습니다. 추가해보세요!'}
                  </div>
                )}
                {/* 홀수일 때 빈칸 채우기 */}
                {finalVisibleEvents.length > 0 && finalVisibleEvents.length % 2 !== 0 && <div className="notice-item" style={{ background: '#f5f5f5', cursor: 'default' }}></div>}
              </div>

              <div className="notice-footer">
                <div className="footer-msg">
                  {viewMode === 'ARRIVAL' && <>📦 보관기간: 입고일 포함 <span className="text-black">2일</span></>}
                  
                  {/* [수정] 마감 시각 강조 */}
                  {viewMode === 'CLOSING' && <>⏰ <span className="text-red" style={{fontWeight:900}}>오후 1시</span> 예약 칼마감!</>}
                  
                  {viewMode === 'NOSHOW' && <>🎁 <span className="text-blue" style={{fontWeight:900}}>선착순 현장판매</span> 진행중!</>}
                </div>
                <div className="footer-highlight">
  {viewMode === 'ARRIVAL' && '🚨 신선/냉장(빨강)은 당일 픽업 필수!'}
  
  {/* ★ [수정] 협박조(?) 대신 부드러운 권유 멘트로 변경 */}
  {viewMode === 'CLOSING' && '혹시 예약을 놓치셨나요? 지금 바로 예약 가능합니다! 🤗'}
  
  {viewMode === 'NOSHOW' && '💸 마감임박! 놓치면 품절입니다!'}
</div>
              </div>
              <div className="footer-deco">S O D O M A L L &nbsp; S O N G D O</div>
            </div>
          )}
        </div>

        <div className="action-buttons">
          <button onClick={resetStates} className="btn-reset"><RefreshCcw size={18} style={{marginRight:'5px'}}/> 초기화</button>
        </div>
      </div>
    </div>
  );
};

export default PickupCheckPage;