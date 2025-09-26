// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApp } from 'firebase/app';
import type { Product, SalesRound } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, Clock, Ticket } from 'lucide-react';
import { getDisplayRound, getDeadlines, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './SimpleOrderPage.css';
import '@/styles/common.css';
import { getProductsWithStock } from '@/firebase/productService'; 

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  // ✅ [수정] 'event' 타입을 제거합니다.
  phase: 'primary' | 'secondary' | 'onsite' | 'past' | 'raffle';
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

  // ✅ [수정] 'event' 상태를 제거하고 'primary'를 기본으로 설정합니다.
  const [visibleSection, setVisibleSection] = useState<'primary' | 'secondary'>('primary');

  const raffleRef = useRef<HTMLDivElement>(null);
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
    let throttleTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
        // ✅ [수정] eventRef를 제거하고 primaryRef와 secondaryRef만 사용합니다.
        if (!primaryRef.current || !secondaryRef.current || !tabContainerRef.current) return;
        
        const triggerLine = tabContainerRef.current.offsetHeight + 60 + 15;
        const primaryTop = primaryRef.current.getBoundingClientRect().top;
        const secondaryTop = secondaryRef.current.getBoundingClientRect().top;
        
        startTransition(() => {
            // ✅ [수정] 스크롤 로직을 'primary'와 'secondary' 두 섹션에 맞게 단순화합니다.
            if (primaryTop <= triggerLine && secondaryTop > triggerLine) {
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


  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { products: fetchedProducts } = await getProductsWithStock();
      startTransition(() => {
        setProducts(fetchedProducts || []);
      });

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


  // ✅ [수정] useMemo에서 eventProducts 관련 로직을 모두 제거합니다.
  const { raffleProducts, primarySaleProducts, secondarySaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempRaffle: ProductWithUIState[] = [];

    products.forEach(product => {
      const round = getDisplayRound(product) as SalesRound & { eventType?: string };
      if (!round || round.status === 'draft') return;

      // ✅ [수정] isChuseokEvent 변수와 관련 로직을 제거합니다.
      const isRaffleEvent = round.eventType === 'RAFFLE';

      if (round.manualStatus === 'sold_out' || round.manualStatus === 'ended') return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const pickupDeadlineDate = round.pickupDeadlineDate ? dayjs(safeToDate(round.pickupDeadlineDate)) : null;

      // ✅ [수정] 'event' phase를 제거합니다.
      let finalPhase: 'primary' | 'secondary' | 'onsite' | 'past' | 'raffle';

      if (isRaffleEvent) finalPhase = 'raffle';
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
        isEventProduct: isRaffleEvent, // '추석' 이벤트를 제외하고 'raffle'만 이벤트 상품으로 간주
      };

      if (finalPhase === 'raffle') {
          if (['SCHEDULED', 'PURCHASABLE', 'ENDED'].includes(actionState)) {
              tempRaffle.push(productWithState);
          }
      // ✅ [수정] 'event' phase 처리 로직을 제거합니다.
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
      // ✅ [수정] eventProducts를 반환하지 않습니다.
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
        {/* ✅ [수정] '추석특집' 탭을 제거하고 2개의 탭만 남깁니다. */}
        <div ref={tabContainerRef} className="tab-container sticky-tabs">
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
            {/* ✅ [수정] '추석특집' 섹션 전체를 제거합니다. */}

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
    </div>
  );
};

export default SimpleOrderPage;