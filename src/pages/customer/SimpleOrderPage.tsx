// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, startTransition, useLayoutEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { Timestamp } from 'firebase/firestore'; // ✅ [추가] Timestamp를 올바르게 복원하기 위해 import
import type { Product, SalesRound } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import OnsiteProductCard from '@/components/customer/OnsiteProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, Clock, PackageOpen } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { getDisplayRound, getDeadlines, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import toast from 'react-hot-toast';
import './SimpleOrderPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'onsite' | 'past';
  displayRound: SalesRound;
  actionState: ProductActionState;
}

const CACHE_KEY = 'simpleOrderPageCache';
const CACHE_LIFETIME = 5 * 60 * 1000; // ✅ [추가] 5분 (밀리초)

// ✅ [개선] Firestore Timestamp 객체를 되살리는 reviver 함수 추가
// JSON으로 변환된 Timestamp 객체({seconds: ..., nanoseconds: ...})를
// 다시 Timestamp 인스턴스로 복원해주는 역할을 합니다.
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
            // ✅ [개선] 캐시 생성 시간과 비교하여 5분 이상 지나지 않았을 경우에만 반환
            if (parsedData.timestamp && now - parsedData.timestamp < CACHE_LIFETIME) {
              return parsedData;
            } else {
              // ✅ [개선] 만료된 캐시는 제거
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
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary' | 'onsite'>(initialCache?.activeTab || 'primary');
  const [countdown, setCountdown] = useState<string | null>(null);

  const PAGE_SIZE = 10;
  const lastVisibleRef = useRef<number | null>(initialCache?.lastVisible || null);
  const hasMoreRef = useRef<boolean>(initialCache?.hasMore ?? true);
  const isFetchingRef = useRef<boolean>(false);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductsWithStock'), [functions]);
  
  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({ threshold: 0.1, triggerOnce: false });

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
      toast.error(err?.message || '데이터 로딩 중 문제가 발생했습니다.');
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
          scrollPos: window.scrollY,
          activeTab: activeTab,
          timestamp: Date.now(), // ✅ [추가] 캐시 생성 시간
        };
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
          console.error("캐시를 저장하는 데 실패했습니다:", error);
        }
      }
    };
  }, [products, activeTab]);

  useLayoutEffect(() => {
    if (initialCache) {
      window.scrollTo(0, initialCache.scrollPos);
    }
  }, [initialCache]);

  const { primarySaleProducts, secondarySaleProducts, onsiteSaleProducts, primarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempOnsite: ProductWithUIState[] = [];
    
    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft') return;

      if (round.manualStatus === 'sold_out' || round.manualStatus === 'ended') {
        return;
      }

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const pickupDeadlineDate = round.pickupDeadlineDate ? dayjs(safeToDate(round.pickupDeadlineDate)) : null;

      let finalPhase: 'primary' | 'secondary' | 'onsite' | 'past';

      if (round.isManuallyOnsite) {
        finalPhase = 'onsite';
      } else if (primaryEndDate && now.isBefore(primaryEndDate)) {
          finalPhase = 'primary';
      } else if (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '(]')) {
          finalPhase = 'secondary';
      } else if (pickupDeadlineDate && now.isAfter(pickupDeadlineDate, 'day')) {
          finalPhase = 'onsite';
      } else {
          finalPhase = 'past';
      }

      if (finalPhase === 'past') return;
      
      const actionState = determineActionState(round as SalesRound, userDocument);

      const productWithState: ProductWithUIState = { 
        ...product, 
        phase: finalPhase,
        displayRound: round as SalesRound,
        actionState,
      };
      
      if (finalPhase === 'primary') {
        const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION'].includes(actionState);
        if(isDisplayableState) tempPrimary.push(productWithState);
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

        if (remainingStock === Infinity || (remainingStock && remainingStock > 0)) {
            tempOnsite.push(productWithState);
        }
      }
    });
    
    const firstPrimarySaleEndDate = tempPrimary.length > 0
      ? getDeadlines(tempPrimary[0].displayRound).primaryEnd
      : null;

    return {
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
      onsiteSaleProducts: tempOnsite.sort((a, b) => {
        const dateA = safeToDate(a.displayRound.pickupDate)?.getTime() ?? 0;
        const dateB = safeToDate(b.displayRound.pickupDate)?.getTime() ?? 0;
        return dateB - dateA;
      }),
      primarySaleEndDate: firstPrimarySaleEndDate,
    };
  }, [products, userDocument]);

  useEffect(() => {
    if (!primarySaleEndDate) {
      setCountdown(null);
      return;
    }
    const interval = setInterval(() => {
      const diff = dayjs(primarySaleEndDate).diff(dayjs(), 'second');
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
  }, [primarySaleEndDate]);

  if (loading && products.length === 0) return <SodomallLoader />;
  if (error) return <div className="error-message-container">{error}</div>;

  const renderContent = () => {
    switch (activeTab) {
      case 'primary':
        return (
          <>
            {countdown && primarySaleProducts.length > 0 && (
              <div className="list-countdown-timer">
                <Clock size={16} />
                <span>마감까지 {countdown}</span>
              </div>
            )}
            {primarySaleProducts.length > 0 ? (
              <div className="simple-product-list">
                {primarySaleProducts.map(p => <SimpleProductCard key={p.id} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
              </div>
            ) : (
              <div className="product-list-placeholder">
                <PackageSearch size={48} />
                <p>현재 예약 가능한 상품이 없습니다.</p>
              </div>
            )}
          </>
        );
      case 'secondary':
        return (
          <>
            {secondarySaleProducts.length > 0 ? (
              <div className="simple-product-list">
                {secondarySaleProducts.map(p => <SimpleProductCard key={p.id} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)}
              </div>
            ) : (
              <div className="product-list-placeholder">
                <PackageSearch size={48} />
                <p>현재 추가 예약 가능한 상품이 없습니다.</p>
              </div>
            )}
          </>
        );
      case 'onsite':
        return (
            <>
              {onsiteSaleProducts.length > 0 ? (
                <div className="onsite-product-grid">
                  {onsiteSaleProducts.map(p => <OnsiteProductCard key={p.id} product={p as Product} />)}
                </div>
              ) : (
                <div className="product-list-placeholder">
                  <PackageOpen size={48} />
                  <p>현재 현장 구매 가능한 상품이 없습니다.</p>
                  <span>예약이 끝난 상품 중 재고가 남으면 여기에 표시됩니다.</span>
                </div>
              )}
            </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="customer-page-container simple-order-page">
        <div className="tab-container">
            <button className={`tab-btn primary-tab ${activeTab === 'primary' ? 'active' : ''}`} onClick={() => setActiveTab('primary')}>
                <span className="tab-title">
                    <span className="tab-icon">🔥</span>
                    <span className="tab-text">공동구매</span>
                    <span className="tab-count">({primarySaleProducts.length})</span>
                </span>
            </button>
            <button className={`tab-btn ${activeTab === 'secondary' ? 'active' : ''}`} onClick={() => setActiveTab('secondary')}>
                <span className="tab-title">
                    <span className="tab-icon">⏰</span>
                    <span className="tab-text">추가예약</span>
                    <span className="tab-count">({secondarySaleProducts.length})</span>
                </span>
            </button>
            <button className={`tab-btn ${activeTab === 'onsite' ? 'active' : ''}`} onClick={() => setActiveTab('onsite')}>
                <span className="tab-title">
                    <span className="tab-icon">🛒</span>
                    <span className="tab-text">현장판매</span>
                    <span className="tab-count">({onsiteSaleProducts.length})</span>
                </span>
            </button>
        </div>

        <div className="tab-content-area">
            {renderContent()}
        </div>

        <div ref={loadMoreRef} className="infinite-scroll-loader">
            {loadingMore && <InlineSodomallLoader />}
        </div>
    </div>
  );
};

export default SimpleOrderPage;