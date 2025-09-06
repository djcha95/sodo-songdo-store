// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
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
// ✅ [수정] getProductsWithStock 함수를 직접 import 합니다.
import { getProductsWithStock } from '@/firebase/productService'; 

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'onsite' | 'past' | 'event' | 'raffle';
  displayRound: SalesRound;
  actionState: ProductActionState;
  isEventProduct: boolean;
}

// ❌ [삭제] 페이지네이션 기반의 캐싱 로직은 더 이상 필요 없으므로 제거합니다.

const SimpleOrderPage: React.FC = () => {
  const { userDocument } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ [수정] 상태 관리를 단순화합니다.
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  const [visibleSection, setVisibleSection] = useState<'event' | 'primary' | 'secondary'>('primary');

  // ❌ [삭제] 페이지네이션 관련 상태 및 ref들을 모두 제거합니다.
  // const PAGE_SIZE = 10;
  // const lastVisibleRef = useRef<number | null>(null);
  // const hasMoreRef = useRef<boolean>(true);
  // const isFetchingRef = useRef<boolean>(false);

  const raffleRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  // ❌ [삭제] getProductsPageCallable은 더 이상 사용하지 않습니다.

  // ❌ [삭제] useInView 훅 (무한 스크롤 트리거)을 제거합니다.

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
    let throttleTimeout: NodeJS.Timeout | null = null;
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
        throttleTimeout = setTimeout(() => {
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


  // ✅ [수정] fetchData 함수를 getProductsWithStock을 사용하도록 변경하고 단순화합니다.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // getProductsWithStock은 페이지네이션 없이 모든 활성 상품과 재고를 가져옵니다.
      const { products: fetchedProducts } = await getProductsWithStock();
      startTransition(() => {
        setProducts(fetchedProducts || []);
      });

      // 데이터 로드 후 스크롤 위치 조정
      setTimeout(() => {
          const targetSection = location.state?.scrollToSection;
          if (targetSection === 'raffle' && raffleRef.current) {
              scrollToSection(raffleRef, 'auto');
              navigate(location.pathname, { replace: true, state: {} });
          } else if (primaryRef.current) {
              // 기본적으로 첫 섹션으로 스크롤
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

  // ✅ [수정] 컴포넌트 마운트 시 fetchData를 한 번만 호출합니다.
  useEffect(() => {
    fetchData();
  }, [fetchData]);


  // ❌ [삭제] 페이지네이션 및 캐싱 관련 useEffect들을 모두 제거합니다.

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
      
      // getStockInfo가 이제 정확한 reservedCount를 받으므로 actionState가 올바르게 계산됩니다.
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
                    {eventProducts.map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                  </div>
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
                  <div className="simple-product-list">
                    {primarySaleProducts.map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                  </div>
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
                            {secondarySaleProducts.map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                        </div>
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

        {/* ❌ [삭제] 무한 스크롤 관련 로더를 제거합니다. */}
    </div>
  );
};

export default SimpleOrderPage;