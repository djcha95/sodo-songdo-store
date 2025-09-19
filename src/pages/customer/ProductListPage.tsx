// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { mainTourSteps } from '@/components/customer/AppTour';
import { getActiveBanners } from '@/firebase/firebaseConfig'; 
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import type { Product, Banner, SalesRound, VariantGroup } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import ProductSection from '@/components/customer/ProductSection';
import BannerSlider from '@/components/common/BannerSlider';
import ProductCard from '@/components/customer/ProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, RefreshCw, ArrowDown } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { getDisplayRound, getDeadlines, safeToDate, sortProductsForDisplay, determineActionState } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductForList extends Product {}

interface ProductWithUIState extends ProductForList {
  phase: 'primary' | 'secondary' | 'past';
  deadlines: { primaryEnd: Date | null; secondaryEnd: Date | null; };
  displayRound: SalesRound;
  actionState: ProductActionState;
}

const ProductListPage: React.FC = () => {
  const { userDocument } = useAuth();
  const { startTour, isTourRunning } = useTutorial();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [products, setProducts] = useState<ProductForList[]>([]);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 10;
  const lastVisibleRef = useRef<number | null>(null);
  const hasMoreRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);
  const fetchCooldownRef = useRef<number>(0);
  const FETCH_COOLDOWN = 800;

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductsWithStock'), [functions]);
  
  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({ threshold: 0, triggerOnce: false });

  useEffect(() => {
    if (userDocument && !userDocument.hasCompletedTutorial) {
      setTimeout(() => startTour(mainTourSteps), 500);
    }
  }, [userDocument, startTour]);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isInitial) {
      setLoading(true);
      setError(null);
      lastVisibleRef.current = null;
      hasMoreRef.current = true;
    } else {
      if (!hasMoreRef.current) {
        isFetchingRef.current = false;
        return;
      }
      setLoadingMore(true);
    }

    const prevCursor = lastVisibleRef.current;

    try {
      if (isInitial) {
        const activeBanners = await getActiveBanners();
        setBanners(activeBanners);
      }

      const result: HttpsCallableResult<any> = await getProductsWithStockCallable({
        pageSize: PAGE_SIZE,
        lastVisible: lastVisibleRef.current
      });

      const { products: newProducts, lastVisible: newLastVisible } = result.data as {
        products: ProductForList[],
        lastVisible: number | null
      };

      setProducts(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        (newProducts || []).forEach(p => map.set(p.id, p));
        return isInitial ? (newProducts || []) : Array.from(map.values());
      });

      lastVisibleRef.current = newLastVisible;
      const noProgress =
        newLastVisible === null ||
        newLastVisible === prevCursor ||
        (newProducts?.length ?? 0) === 0 ||
        (newProducts?.length ?? 0) < PAGE_SIZE;

      hasMoreRef.current = !noProgress;
    } catch (err: any) {
      setError('상품을 불러오는 중 오류가 발생했습니다.');
      showToast('error', err?.message || '데이터 로딩 중 문제가 발생했습니다.');
      hasMoreRef.current = false;
    } finally {
      if (isInitial) setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
      fetchCooldownRef.current = Date.now();
    }
  }, [getProductsWithStockCallable]);

  const handleRefresh = useCallback(async () => { await fetchData(true); }, [fetchData]);
  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({ onRefresh: handleRefresh });

  useEffect(() => { fetchData(true); }, [fetchData]);

  useEffect(() => {
    if (!isLoadMoreVisible) return;
    if (loading || loadingMore || isTourRunning) return;
    if (!hasMoreRef.current || isFetchingRef.current) return;

    const now = Date.now();
    if (now - fetchCooldownRef.current < FETCH_COOLDOWN) return;

    fetchData(false);
  }, [isLoadMoreVisible, loading, loadingMore, isTourRunning, fetchData]);

  const { primarySaleProducts, secondarySaleProducts, pastProductsByDate, primarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const userTier = userDocument?.loyaltyTier;
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempPast: ProductWithUIState[] = [];
    
    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft') return;

      const actionState = determineActionState(round as SalesRound, userDocument);
      
      const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION', 'AWAITING_STOCK', 'ENCORE_REQUESTABLE'].includes(actionState);
      
      if (!isDisplayableState) return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      
      let finalPhase: 'primary' | 'secondary' | 'past';

      if (actionState === 'ENCORE_REQUESTABLE') {
          finalPhase = 'past';
      } 
      else if (primaryEndDate && now.isBefore(primaryEndDate)) {
          finalPhase = 'primary';
      } 
      else if (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '[]')) {
          finalPhase = 'secondary';
      }
      else {
          finalPhase = 'past';
      }

      const productWithState: ProductWithUIState = { 
        ...product, 
        phase: finalPhase,
        deadlines: { 
          primaryEnd: primaryEndDate ? primaryEndDate.toDate() : null, 
          secondaryEnd: secondaryEndDate ? secondaryEndDate.toDate() : null 
        }, 
        displayRound: round as SalesRound,
        actionState,
      };
      
      if (finalPhase === 'primary') {
          tempPrimary.push(productWithState);
      } else if (finalPhase === 'secondary') {
          tempSecondary.push(productWithState);
      } else {
          tempPast.push(productWithState);
      }
    });

    const pastGroups: { [key: string]: ProductWithUIState[] } = {};
    tempPast.forEach(p => {
      const publishAtDate = safeToDate(p.displayRound.publishAt);
      if (publishAtDate) {
        const dateKey = dayjs(publishAtDate).format('YYYY-MM-DD');
        if (!pastGroups[dateKey]) pastGroups[dateKey] = [];
        pastGroups[dateKey].push(p);
      }
    });

    const sortedPastKeys = Object.keys(pastGroups).sort((a, b) => b.localeCompare(a));
    const sortedPastGroups: { [key:string]: ProductWithUIState[] } = {};
    sortedPastKeys.forEach(key => {
      sortedPastGroups[key] = pastGroups[key].sort((a, b) => (a.groupName || '').localeCompare(b.groupName || ''));
    });

    const firstPrimarySaleEndDate = tempPrimary.length > 0 
      ? (tempPrimary.find(p => p.actionState !== 'WAITLISTABLE')?.deadlines.primaryEnd || tempPrimary[0].deadlines.primaryEnd)
      : null;

    const sortedPrimaryProducts = tempPrimary.sort((a, b) => {
      const getStatePriority = (state: ProductActionState): number => {
        switch (state) {
          case 'PURCHASABLE':
          case 'REQUIRE_OPTION':
            return 1;
          case 'WAITLISTABLE':
            return 2;
          default:
            return 3;
        }
      };

      const priorityA = getStatePriority(a.actionState);
      const priorityB = getStatePriority(b.actionState);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return sortProductsForDisplay(a as any, b as any);
    });
    
    return {
      primarySaleProducts: sortedPrimaryProducts,
      secondarySaleProducts: tempSecondary.sort((a, b) => {
        const dateA = safeToDate(a.displayRound.pickupDate)?.getTime() ?? Infinity;
        const dateB = safeToDate(b.displayRound.pickupDate)?.getTime() ?? Infinity;

        if (dateA !== dateB) {
          return dateA - dateB;
        }

        return sortProductsForDisplay(a as any, b as any);
      }),
      pastProductsByDate: sortedPastGroups,
      primarySaleEndDate: firstPrimarySaleEndDate
    };
  }, [products, userDocument]); 
      
  useEffect(() => {
    if (!primarySaleEndDate) { setCountdown(null); return; }
    const interval = setInterval(() => {
      const diff = dayjs(primarySaleEndDate).diff(dayjs(), 'second');
      if (diff <= 0) { setCountdown('마감!'); clearInterval(interval); return; }
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setCountdown(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [primarySaleEndDate]);

  if (loading && products.length === 0) return <SodomallLoader />;
  if (error) return <div className="error-message-container">{error}</div>;

  return (
    <div className="customer-page-container">
      <div className="pull-to-refresh-indicator" style={{ 
          height: `60px`, // 고정 높이
          opacity: isRefreshing ? 1 : Math.min(pullDistance / 80, 1), // 당기는 거리에 따라 부드럽게 표시
          transform: `translateY(${isRefreshing ? 0 : Math.max(-60, -60 + pullDistance)}px)`, // 위에서 내려오도록
          transition: 'opacity 0.2s, transform 0.2s'
        }}>
        <div className="indicator-content">
          {isRefreshing ? (
            <RefreshCw size={24} className="refreshing-icon" />
          ) : (
            <>
              <ArrowDown size={20} className="arrow-icon" style={{ transform: isThresholdReached ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              <span>{isThresholdReached ? '놓아서 새로고침' : '아래로 당겨서 새로고침'}</span>
            </>
          )}
        </div>
      </div>
      
      {/* ✅ [수정] style 속성을 제거하여 transform 효과를 없애고 Sticky 헤더와의 충돌을 방지합니다. */}
      <div className="pull-to-refresh-content">
        <div className="page-section banner-section" data-tutorial-id="main-banner">
          <BannerSlider banners={banners} />
        </div>

        <ProductSection
          key="primary-section"
          title={<>🔥 오늘의 공동구매</>}
          countdownText={primarySaleProducts.length > 0 ? countdown : null}
          tutorialId="primary-sale-section"
        >
          {primarySaleProducts.length > 0 ? (
            primarySaleProducts.map(p => <ProductCard key={p.id} product={p as any} actionState={p.actionState} />)
          ) : !loading && (
            <div className="product-list-placeholder">
              <PackageSearch size={48} />
              <p>오늘의 상품을 준비중입니다</p>
              <span>매일 오후 1시에 새로운 상품을 기대해주세요!</span>
            </div>
          )}
        </ProductSection>
        
        {secondarySaleProducts.length > 0 && (
          <ProductSection 
            key="secondary-section"
            title={<>⏰ 픽업임박! 추가공구</>}
            tutorialId="secondary-sale-section"
          >
            {secondarySaleProducts.map(p => <ProductCard key={p.id} product={p as any} actionState={p.actionState} />)}
          </ProductSection>
        )}

        <div className="past-products-section" data-tutorial-id="past-sale-section">
          {Object.keys(pastProductsByDate).map(date => {
            const productsForDate = pastProductsByDate[date];
            if (!productsForDate || productsForDate.length === 0) return null;
            return (
              <ProductSection key={date} title={<>{dayjs(date).format('M월 D일')} 마감공구</>}>
                {productsForDate.map(p => <ProductCard key={p.id} product={p as any} actionState={p.actionState} />)}
              </ProductSection>
            );
          })}
        </div>

        <div ref={loadMoreRef} className="infinite-scroll-loader">
          {loadingMore && <InlineSodomallLoader />}
          {!hasMoreRef.current && products.length > PAGE_SIZE && (
            <div className="end-of-list-message"><p>모든 상품을 확인했어요!</p></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductListPage;