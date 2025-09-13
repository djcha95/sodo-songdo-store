// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Product, SalesRound } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, Clock, Moon, Ticket } from 'lucide-react';
import { getDisplayRound, getDeadlines, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './SimpleOrderPage.css';
import '@/styles/common.css';
import { getProductsWithStock } from '@/firebase/productService'; 

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'onsite' | 'past' | 'event' | 'raffle';
  displayRound: SalesRound;
  actionState: ProductActionState;
  isEventProduct: boolean;
}

const SimpleOrderPage: React.FC = () => {
  const { userDocument } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  const [visibleSection, setVisibleSection] = useState<'event' | 'primary' | 'secondary'>('primary');

  const INITIAL_COUNT = 12;
  const [showEvent, setShowEvent] = useState(INITIAL_COUNT);
  const [showPrimary, setShowPrimary] = useState(INITIAL_COUNT);
  const [showSecondary, setShowSecondary] = useState(INITIAL_COUNT);

  const raffleRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollToSection = useCallback((ref: React.RefObject<HTMLDivElement | null>, behavior: 'smooth' | 'auto' = 'smooth') => {
      if (!ref.current || !tabContainerRef.current) return;
      
      const tabContainerHeight = tabContainerRef.current.offsetHeight;
      const STICKY_HEADER_TOP_OFFSET = 60;
      const EXTRA_MARGIN = 15;
      
      const elementPosition = ref.current.getBoundingClientRect().top;
      const offsetPosition = window.pageYOffset + elementPosition - (tabContainerHeight + STICKY_HEADER_TOP_OFFSET + EXTRA_MARGIN);
      window.scrollTo({ top: offsetPosition, behavior });
  }, []);

  useEffect(() => {
    // ✅ [수정] setTimeout의 타입이 NodeJS.Timeout이 아닌 number를 반환하므로 타입을 변경
    let throttleTimeout: number | null = null;

    const handleScroll = () => {
        if (!eventRef.current || !primaryRef.current || !secondaryRef.current || !tabContainerRef.current) return;
        
        const triggerLine = tabContainerRef.current.offsetHeight + 60 + 15;
        const eventTop = eventRef.current.getBoundingClientRect().top;
        const primaryTop = primaryRef.current.getBoundingClientRect().top;
        const secondaryTop = secondaryRef.current.getBoundingClientRect().top;
        
        startTransition(() => {
            if (eventTop <= triggerLine && primaryTop > triggerLine) {
                if (visibleSection !== 'event') setVisibleSection('event');
            } else if (primaryTop <= triggerLine && secondaryTop > triggerLine) {
                if (visibleSection !== 'primary') setVisibleSection('primary');
            } else if (secondaryTop <= triggerLine) {
                if (visibleSection !== 'secondary') setVisibleSection('secondary');
            }
        });
    };
    const throttledHandleScroll = () => {
  if (!throttleTimeout) {
    throttleTimeout = window.setTimeout(() => {
      handleScroll();
      throttleTimeout = null;
    }, 100);
  }
};

    window.addEventListener('scroll', throttledHandleScroll);
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [visibleSection]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { products: fetchedProducts } = await getProductsWithStock();
      startTransition(() => {
        setProducts(fetchedProducts || []);
      });

      setShowEvent(INITIAL_COUNT);
      setShowPrimary(INITIAL_COUNT);
      setShowSecondary(INITIAL_COUNT);

      setTimeout(() => {
          const targetSection = location.state?.scrollToSection;
          if (targetSection === 'raffle' && raffleRef.current) {
              scrollToSection(raffleRef, 'auto');
              navigate(location.pathname, { replace: true, state: {} });
          } else if (primaryRef.current) {
              scrollToSection(primaryRef, 'auto');
          }
      }, 100);

    } catch (err: any) {
      setError('상품을 불러오는 중 오류가 발생했습니다.');
      showToast('error', err?.message || '데이터 로딩 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [scrollToSection, location, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { raffleProducts, eventProducts, primarySaleProducts, secondarySaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempEvent: ProductWithUIState[] = [];
    const tempRaffle: ProductWithUIState[] = [];

    products.forEach(product => {
      const round = getDisplayRound(product) as SalesRound & { eventType?: string };
      if (!round || round.status === 'draft') return;

      const isChuseokEvent = round.eventType === 'CHUSEOK';
      const isRaffleEvent = round.eventType === 'RAFFLE';

      if (round.manualStatus === 'sold_out' || round.manualStatus === 'ended') return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const pickupDeadlineDate = round.pickupDeadlineDate ? dayjs(safeToDate(round.pickupDeadlineDate)) : null;

      let finalPhase: 'primary' | 'secondary' | 'onsite' | 'past' | 'event' | 'raffle';

      if (isRaffleEvent) finalPhase = 'raffle';
      else if (isChuseokEvent) finalPhase = 'event';
      else if (round.isManuallyOnsite) finalPhase = 'onsite';
      else if (primaryEndDate && now.isBefore(primaryEndDate)) finalPhase = 'primary';
      else if (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '(]')) finalPhase = 'secondary';
      else if (pickupDeadlineDate && now.isAfter(pickupDeadlineDate, 'day')) finalPhase = 'onsite';
      else finalPhase = 'past';

      if (finalPhase === 'past' || finalPhase === 'onsite') return;
      
      const actionState = determineActionState(round as SalesRound, userDocument);

      const productWithState: ProductWithUIState = {
        ...product,
        phase: finalPhase,
        displayRound: round as SalesRound,
        actionState,
        isEventProduct: isChuseokEvent || isRaffleEvent,
      };

      if (finalPhase === 'raffle') {
          if (['SCHEDULED', 'PURCHASABLE', 'ENDED'].includes(actionState)) {
              tempRaffle.push(productWithState);
          }
      } else if (finalPhase === 'event') {
        const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION'].includes(actionState);
        if (isDisplayableState) {
            tempEvent.push(productWithState);
        }
      } else if (finalPhase === 'primary') {
        const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION'].includes(actionState);
        if (isDisplayableState) {
            tempPrimary.push(productWithState);
        }
      }
      else if (finalPhase === 'secondary') {
        const isDisplayableState = ['PURCHASABLE', 'REQUIRE_OPTION'].includes(actionState);
         if(isDisplayableState) tempSecondary.push(productWithState);
      }
    });

    const firstGeneralPrimarySaleEndDate = tempPrimary.length > 0
      ? getDeadlines(tempPrimary[0].displayRound).primaryEnd
      : null;

    return {
      raffleProducts: tempRaffle,
      eventProducts: tempEvent.sort((a, b) => {
        const priceA = a.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        const priceB = b.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        return priceB - priceA;
      }),
      primarySaleProducts: tempPrimary.sort((a, b) => {
        const isAWaitlist = a.actionState === 'WAITLISTABLE';
        const isBWaitlist = b.actionState === 'WAITLISTABLE';
        if (isAWaitlist && !isBWaitlist) return 1;
        if (!isAWaitlist && isBWaitlist) return -1;
        const priceA = a.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        const priceB = b.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        return priceB - priceA;
      }),
      secondarySaleProducts: tempSecondary.sort((a, b) => {
        const dateA = safeToDate(a.displayRound.pickupDate)?.getTime() ?? Infinity;
        const dateB = safeToDate(b.displayRound.pickupDate)?.getTime() ?? Infinity;
        return dateA - dateB;
      }),
      generalPrimarySaleEndDate: firstGeneralPrimarySaleEndDate,
    };
  }, [products, userDocument]);

  useEffect(() => {
    if (!generalPrimarySaleEndDate) {
      setCountdown(null);
      return;
    }
    const interval = setInterval(() => {
      const diff = dayjs(generalPrimarySaleEndDate).diff(dayjs(), 'second');
      if (diff <= 0) {
        setCountdown('마감!');
        clearInterval(interval);
        return;
      }
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setCountdown(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [generalPrimarySaleEndDate]);


  if (loading) return <SodomallLoader />;
  if (error) return <div className="error-message-container">{error}</div>;

  return (
    <div className="customer-page-container simple-order-page">
        <div ref={tabContainerRef} className="tab-container sticky-tabs">
            <button
                className={`tab-btn event-tab ${visibleSection === 'event' ? 'active' : ''}`}
                onClick={() => {
                    setVisibleSection('event');
                    scrollToSection(eventRef);
                }}
            >
                <span className="tab-title">
                    <span className="tab-icon">🌕</span>
                    <span className="tab-text">추석특집</span>
                    <span className="tab-count">({eventProducts.length})</span>
                </span>
            </button>
            <button
                className={`tab-btn primary-tab ${visibleSection === 'primary' ? 'active' : ''}`}
                onClick={() => {
                    setVisibleSection('primary');
                    scrollToSection(primaryRef);
                }}
            >
                <span className="tab-title">
                    <span className="tab-icon">🔥</span>
                    <span className="tab-text">공동구매</span>
                    <span className="tab-count">({primarySaleProducts.length})</span>
                </span>
            </button>
            <button
                className={`tab-btn secondary-tab ${visibleSection === 'secondary' ? 'active' : ''}`}
                onClick={() => {
                    setVisibleSection('secondary');
                    scrollToSection(secondaryRef);
                }}
            >
                <span className="tab-title">
                    <span className="tab-icon">⏰</span>
                    <span className="tab-text">추가예약</span>
                    <span className="tab-count">({secondarySaleProducts.length})</span>
                </span>
            </button>
        </div>

        <div className="tab-content-area">
            <div ref={eventRef} className="content-section">
              {eventProducts.length > 0 ? (
                <>
                  <div className="event-section-header">
                    <h2 className="section-title section-title-event">
                      <span className="tab-icon">🌕</span> 추석특집: 풍성한 한가위!
                    </h2>
                  </div>
                  <div className="simple-product-list">
                    {eventProducts.slice(0, showEvent).map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                  </div>
                  {eventProducts.length > showEvent && (
                    <div className="loadmore-area">
                      <button className="loadmore-btn" onClick={() => setShowEvent(prev => prev + INITIAL_COUNT)}>
                        더 보기
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="product-list-placeholder event-placeholder">
                  <Moon size={48} />
                  <p>풍성한 한가위를 위한 상품을 준비중입니다.</p>
                  <span>조금만 기다려주세요! 🌕</span>
                </div>
              )}
            </div>

            <div ref={primaryRef} className="content-section">
                {primarySaleProducts.length > 0 && (
                  <div className="section-header-split">
                    <h2 className="section-title">
                      <span className="tab-icon">🔥</span> 공동구매 진행중
                    </h2>
                    {countdown && (
                      <div className="countdown-timer-inline">
                        <Clock size={16} />
                        <span>{countdown}</span>
                      </div>
                    )}
                  </div>
                )}
                {primarySaleProducts.length > 0 ? (
                  <>
                    <div className="simple-product-list">
                      {primarySaleProducts.slice(0, showPrimary).map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                    </div>
                    {primarySaleProducts.length > showPrimary && (
                      <div className="loadmore-area">
                        <button className="loadmore-btn" onClick={() => setShowPrimary(prev => prev + INITIAL_COUNT)}>
                          더 보기
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  !loading && <div className="product-list-placeholder">
                    <PackageSearch size={48} />
                    <p>현재 공동구매 상품이 없습니다.</p>
                  </div>
                )}
            </div>

            <div ref={secondaryRef} className="content-section">
                {secondarySaleProducts.length > 0 && (
                    <>
                        <h2 className="section-title">
                            <span className="tab-icon">⏰</span> 추가예약 (픽업시작 전까지)
                        </h2>
                        <div className="simple-product-list">
                            {secondarySaleProducts.slice(0, showSecondary).map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                        </div>
                        {secondarySaleProducts.length > showSecondary && (
                          <div className="loadmore-area">
                            <button className="loadmore-btn" onClick={() => setShowSecondary(prev => prev + INITIAL_COUNT)}>
                              더 보기
                            </button>
                          </div>
                        )}
                    </>
                )}
            </div>
            
            <div ref={raffleRef} className="content-section">
              {raffleProducts.length > 0 ? (
                <>
                  <div className="event-section-header raffle-header">
                    <h2 className="section-title section-title-raffle">
                      <span className="tab-icon">🎉</span> 진행중인 이벤트
                    </h2>
                  </div>
                  <div className="simple-product-list">
                    {raffleProducts.map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                  </div>
                </>
              ) : (
                <div className="product-list-placeholder raffle-placeholder">
                  <Ticket size={48} />
                  <p>진행중인 이벤트가 없습니다.</p>
                  <span>새로운 이벤트가 곧 찾아옵니다! 🎉</span>
                </div>
              )}
            </div>
        </div>
    </div>
  );
};

export default SimpleOrderPage;