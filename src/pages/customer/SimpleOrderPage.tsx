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
  phase: 'primary' | 'secondary' | 'onsite' | 'past';
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
  
  // ✅ [수정] activeTab 타입에서 'event' 제거
  const [activeTab, setActiveTab] = useState<'primary' | 'onsite'>('primary');
  const [visibleSection, setVisibleSection] = useState<'primary' | 'secondary'>('primary');

  const PAGE_SIZE = 10;
  const lastVisibleRef = useRef<number | null>(initialCache?.lastVisible || null);
  const hasMoreRef = useRef<boolean>(initialCache?.hasMore ?? true);
  const isFetchingRef = useRef<boolean>(false);

  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductsWithStock'), [functions]);
  
  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({ threshold: 0.1 });

  useEffect(() => {
    let throttleTimeout: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (!primaryRef.current || !secondaryRef.current || !tabContainerRef.current) return;
      if (activeTab !== 'primary') return;

      const triggerLine = tabContainerRef.current.offsetHeight + 50 + 15;

      const secondaryTop = secondaryRef.current.getBoundingClientRect().top;

      startTransition(() => {
        if (secondaryTop <= triggerLine) {
          if (visibleSection !== 'secondary') setVisibleSection('secondary');
        } 
        else {
          if (visibleSection !== 'primary') setVisibleSection('primary');
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
  }, [visibleSection, activeTab]);


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
  const { primarySaleProducts, secondarySaleProducts, onsiteSaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempOnsite: ProductWithUIState[] = [];
    const tempEventInPrimary: ProductWithUIState[] = []; // 이벤트 상품 중 1차 공구에 해당하는 상품을 임시 보관
    
    products.forEach(product => {
      const round = getDisplayRound(product) as SalesRound & { eventType?: string };
      if (!round || round.status === 'draft') return;
      
      const isEvent = round.eventType === 'CHUSEOK';

      if (round.manualStatus === 'sold_out' || round.manualStatus === 'ended') return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const pickupDeadlineDate = round.pickupDeadlineDate ? dayjs(safeToDate(round.pickupDeadlineDate)) : null;

      let finalPhase: 'primary' | 'secondary' | 'onsite' | 'past';

      if (round.isManuallyOnsite) finalPhase = 'onsite';
      else if (primaryEndDate && now.isBefore(primaryEndDate)) finalPhase = 'primary';
      else if (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '(]')) finalPhase = 'secondary';
      else if (pickupDeadlineDate && now.isAfter(pickupDeadlineDate, 'day')) finalPhase = 'onsite';
      else finalPhase = 'past';

      if (finalPhase === 'past') return;
      
      const actionState = determineActionState(round as SalesRound, userDocument);

      const productWithState: ProductWithUIState = { 
        ...product, 
        phase: finalPhase,
        displayRound: round as SalesRound,
        actionState,
        isEventProduct: isEvent,
      };
      
      if (finalPhase === 'primary') {
        const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION'].includes(actionState);
        if (isDisplayableState) {
          // 이벤트 상품과 일반 상품을 분리하여 각 배열에 추가
          if (isEvent) {
            tempEventInPrimary.push(productWithState);
          } else {
            tempPrimary.push(productWithState);
          }
        }
      }
      else if (finalPhase === 'secondary') {
        const isDisplayableState = ['PURCHASABLE', 'REQUIRE_OPTION'].includes(actionState);
         if(isDisplayableState) tempSecondary.push(productWithState);
      }
      else if (finalPhase === 'onsite') {
        const remainingStock = round.variantGroups?.reduce((total, vg) => {
            const stock = vg.totalPhysicalStock ?? -1;
            if (stock === -1) return Infinity;
            if (total === Infinity) return Infinity;
            const reserved = vg.reservedCount ?? 0;
            return total + (stock - reserved);
        }, 0);
        if (remainingStock === Infinity || (remainingStock && remainingStock > 0)) tempOnsite.push(productWithState);
      }
    });
    
    // 카운트다운은 '일반' 공동구매 상품만을 기준으로 계산
    const firstGeneralPrimarySaleEndDate = tempPrimary.length > 0
      ? getDeadlines(tempPrimary[0].displayRound).primaryEnd
      : null;

    // 화면에 보여줄 때는 일반 상품과 이벤트 상품을 합침
    const combinedPrimarySaleProducts = [...tempPrimary, ...tempEventInPrimary];

    return {
      primarySaleProducts: combinedPrimarySaleProducts.sort((a, b) => {
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
      onsiteSaleProducts: tempOnsite.sort((a, b) => {
        const dateA = safeToDate(a.displayRound.pickupDate)?.getTime() ?? 0;
        const dateB = safeToDate(b.displayRound.pickupDate)?.getTime() ?? 0;
        return dateB - dateA;
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
                className={`tab-btn primary-tab ${activeTab === 'primary' && visibleSection === 'primary' ? 'active' : ''}`} 
                onClick={() => {
                    setActiveTab('primary');
                    setVisibleSection('primary');
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
                className={`tab-btn ${activeTab === 'primary' && visibleSection === 'secondary' ? 'active' : ''}`} 
                onClick={() => {
                    setActiveTab('primary');
                    setVisibleSection('secondary');
                    setTimeout(() => scrollToSection(secondaryRef), 0);
                }}
            >
                <span className="tab-title">
                    <span className="tab-icon">⏰</span>
                    <span className="tab-text">추가예약</span>
                    <span className="tab-count">({secondarySaleProducts.length})</span>
                </span>
            </button>
            <button 
                className={`tab-btn ${activeTab === 'onsite' ? 'active' : ''}`} 
                onClick={() => setActiveTab('onsite')}
            >
                <span className="tab-title">
                    <span className="tab-icon">🛒</span>
                    <span className="tab-text">현장판매</span>
                    <span className="tab-count">({onsiteSaleProducts.length})</span>
                </span>
            </button>
        </div>

        <div className="tab-content-area">
            {activeTab === 'primary' && (
                <>
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
                </>
            )}

            {/* ✅ [수정] activeTab === 'event' 블록 제거 */}

            {activeTab === 'onsite' && (
                <div className="content-section">
                    {onsiteSaleProducts.length > 0 ? (
                        <div className="onsite-product-grid">
                            {onsiteSaleProducts.map(p => <OnsiteProductCard key={p.id} product={p as Product} />)}
                        </div>
                    ) : (
                        <div className="product-list-placeholder">
                           <PackageSearch size={48} />
                           <p>현재 현장 판매 상품이 없습니다.</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div ref={loadMoreRef} className="infinite-scroll-loader">
            {loadingMore && <InlineSodomallLoader />}
        </div>
    </div>
  );
};

export default SimpleOrderPage;