// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { Timestamp } from 'firebase/firestore';
import type { Product, SalesRound } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import OnsiteProductCard from '@/components/customer/OnsiteProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, Clock, Gift } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { getDisplayRound, getDeadlines, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './SimpleOrderPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'onsite' | 'past' | 'event';
  displayRound: SalesRound;
  actionState: ProductActionState;
  isEventProduct: boolean;
}

const CACHE_KEY = 'simpleOrderPageCache';
const CACHE_LIFETIME = 5 * 60 * 1000;

const jsonReviver = (key: string, value: any) => {
    if (
        typeof value === 'object' &&
        value !== null &&
        'seconds' in value &&
        'nanoseconds' in value &&
        Object.keys(value).length === 2
    ) {
        return new Timestamp(value.seconds, value.nanoseconds);
    }
    return value;
};

const readCache = () => {
    try {
        const cachedData = sessionStorage.getItem(CACHE_KEY);
        if (cachedData) {
            const parsedData = JSON.parse(cachedData, jsonReviver);
            const now = Date.now();
            if (parsedData.timestamp && now - parsedData.timestamp < CACHE_LIFETIME) {
              return parsedData;
            } else {
              sessionStorage.removeItem(CACHE_KEY);
            }
        }
    } catch (error) {
        console.error("캐시를 읽는 데 실패했습니다:", error);
        sessionStorage.removeItem(CACHE_KEY);
    }
    return null;
};

const SimpleOrderPage: React.FC = () => {
  const { userDocument } = useAuth();
  const initialCache = useMemo(() => readCache(), []);

  const [products, setProducts] = useState<Product[]>(initialCache?.products || []);
  const [loading, setLoading] = useState(!initialCache); 
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  
  // ✅ [수정] activeTab 타입을 'event' | 'primary' | 'secondary'로 변경
  const [activeTab, setActiveTab] = useState<'event' | 'primary' | 'secondary'>('event');
  // ✅ [수정] visibleSection 타입을 'event' | 'primary' | 'secondary'로 변경
  const [visibleSection, setVisibleSection] = useState<'event' | 'primary' | 'secondary'>('event');

  const PAGE_SIZE = 10;
  const lastVisibleRef = useRef<number | null>(initialCache?.lastVisible || null);
  const hasMoreRef = useRef<boolean>(initialCache?.hasMore ?? true);
  const isFetchingRef = useRef<boolean>(false);

  // ✅ [추가] 이벤트 섹션 참조
  const eventRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductsWithStock'), [functions]);
  
  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({ threshold: 0.1 });

  useEffect(() => {
    let throttleTimeout: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (!eventRef.current || !primaryRef.current || !secondaryRef.current || !tabContainerRef.current) return;

      const triggerLine = tabContainerRef.current.offsetHeight + 50 + 15;

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


  const fetchData = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isInitial) {
      setLoading(true);
      setError(null);
      lastVisibleRef.current = null;
      hasMoreRef.current = true;
    } else {
      if (!hasMoreRef.current) { isFetchingRef.current = false; return; }
      setLoadingMore(true);
    }

    try {
      const result: HttpsCallableResult<any> = await getProductsWithStockCallable({
        pageSize: PAGE_SIZE,
        lastVisible: lastVisibleRef.current
      });

      const { products: newProducts, lastVisible: newLastVisible } = result.data as {
        products: Product[],
        lastVisible: number | null
      };

      startTransition(() => {
        setProducts(prev => {
            const map = new Map(prev.map(p => [p.id, p]));
            (newProducts || []).forEach(p => map.set(p.id, p));
            return isInitial ? (newProducts || []) : Array.from(map.values());
        });
      });
      
      lastVisibleRef.current = newLastVisible;
      hasMoreRef.current = newProducts?.length === PAGE_SIZE && newLastVisible !== null;
    } catch (err: any) {
      setError('상품을 불러오는 중 오류가 발생했습니다.');
      showToast('error', err?.message || '데이터 로딩 중 문제가 발생했습니다.');
      hasMoreRef.current = false;
    } finally {
      if (isInitial) setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [getProductsWithStockCallable]);
  
  useEffect(() => {
    if (!initialCache) {
      fetchData(true);
    }
  }, [fetchData, initialCache]);

  useEffect(() => {
    if (isLoadMoreVisible && !loading && !loadingMore && hasMoreRef.current) {
      fetchData(false);
    }
  }, [isLoadMoreVisible, loading, loadingMore, fetchData]);
    
  useEffect(() => {
    return () => {
      if (products.length > 0) {
        const cacheData = {
          products: products,
          lastVisible: lastVisibleRef.current,
          hasMore: hasMoreRef.current,
          timestamp: Date.now(),
        };
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
          console.error("캐시를 저장하는 데 실패했습니다:", error);
        }
      }
    };
  }, [products]);

  // ✅ [수정] useMemo 로직을 변경하여 UI는 통합하되, 카운트다운 계산은 분리
  const { eventProducts, primarySaleProducts, secondarySaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempEvent: ProductWithUIState[] = [];
    
    products.forEach(product => {
      const round = getDisplayRound(product) as SalesRound & { eventType?: string };
      if (!round || round.status === 'draft') return;
      
      const isEvent = round.eventType === 'CHUSEOK';

      if (round.manualStatus === 'sold_out' || round.manualStatus === 'ended') return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const pickupDeadlineDate = round.pickupDeadlineDate ? dayjs(safeToDate(round.pickupDeadlineDate)) : null;

      let finalPhase: 'primary' | 'secondary' | 'onsite' | 'past' | 'event';

      if (isEvent) finalPhase = 'event';
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
        isEventProduct: isEvent,
      };
      
      if (finalPhase === 'event') {
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
    
    // 카운트다운은 '일반' 공동구매 상품만을 기준으로 계산
    const firstGeneralPrimarySaleEndDate = tempPrimary.length > 0
      ? getDeadlines(tempPrimary[0].displayRound).primaryEnd
      : null;

    return {
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

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current || !tabContainerRef.current) return;
    const tabContainerHeight = tabContainerRef.current.offsetHeight;
    const elementPosition = ref.current.getBoundingClientRect().top;
    const STICKY_HEADER_TOP_OFFSET = 50;
    const EXTRA_MARGIN = 15;
    const offsetPosition = window.pageYOffset + elementPosition - (tabContainerHeight + STICKY_HEADER_TOP_OFFSET + EXTRA_MARGIN);
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
  };

  if (loading && products.length === 0) return <SodomallLoader />;
  if (error) return <div className="error-message-container">{error}</div>;

  return (
    <div className="customer-page-container simple-order-page">
        {/* ✅ [수정] 탭 UI를 원래 상태로 복원 */}
        <div ref={tabContainerRef} className="tab-container sticky-tabs">
            <button 
                className={`tab-btn event-tab ${visibleSection === 'event' ? 'active' : ''}`} 
                onClick={() => {
                    setActiveTab('event');
                    setTimeout(() => scrollToSection(eventRef), 0);
                }}
            >
                <span className="tab-title">
                    <span className="tab-icon">✨</span>
                    <span className="tab-text">추석특집</span>
                    <span className="tab-count">({eventProducts.length})</span>
                </span>
            </button>
            <button 
                className={`tab-btn primary-tab ${visibleSection === 'primary' ? 'active' : ''}`} 
                onClick={() => {
                    setActiveTab('primary');
                    setTimeout(() => scrollToSection(primaryRef), 0);
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
                    setActiveTab('secondary');
                    setTimeout(() => scrollToSection(secondaryRef), 0);
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
              {eventProducts.length > 0 && (
                <h2 className="section-title">
                  <span className="tab-icon">✨</span> 추석특집 상품
                </h2>
              )}
              {eventProducts.length > 0 ? (
                <div className="simple-product-list">
                  {eventProducts.map(p => <SimpleProductCard key={p.id} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                </div>
              ) : (
                <div className="product-list-placeholder">
                  <Gift size={48} />
                  <p>아쉽게도 현재 추석특집 상품이 없습니다.</p>
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
                    {primarySaleProducts.map(p => <SimpleProductCard key={p.id} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
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
                            {secondarySaleProducts.map(p => <SimpleProductCard key={p.id} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
                        </div>
                    </>
                )}
            </div>

            {/* ✅ [제거] activeTab === 'onsite' 블록 제거 */}
        </div>

        <div ref={loadMoreRef} className="infinite-scroll-loader">
            {loadingMore && <InlineSodomallLoader />}
        </div>
    </div>
  );
};

export default SimpleOrderPage;