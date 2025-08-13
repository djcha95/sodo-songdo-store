// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { mainTourSteps } from '@/components/customer/AppTour';
import { getActiveBanners } from '@/firebase'; 
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

  // --- 무한스크롤 제어 키 포인트 ---
  const PAGE_SIZE = 10;
  const lastVisibleRef = useRef<number | null>(null);
  const hasMoreRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);
  const fetchCooldownRef = useRef<number>(0);
  const FETCH_COOLDOWN = 800; // ms

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

      const allowedTiers = round.allowedTiers || [];
      if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier))) return;
      
      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      
      const actionState = determineActionState(round, userDocument);
      
      // 화면에 표시할 수 있는 상태 그룹
      const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION', 'AWAITING_STOCK', 'ENCORE_REQUESTABLE'].includes(actionState);
      
      if (!isDisplayableState) return;

      let finalPhase: 'primary' | 'secondary' | 'past';

      // '앵콜 요청 가능'은 '마감' 상태이므로 항상 past로 분류
      if (actionState === 'ENCORE_REQUESTABLE') {
          finalPhase = 'past';
      } 
      // 그 외 활성 상태들은 시간으로 1차/2차 구분
      else if (primaryEndDate && now.isBefore(primaryEndDate)) {
          finalPhase = 'primary';
      } 
      else {
          finalPhase = 'secondary';
      }

      const productWithState: ProductWithUIState = { 
        ...product, 
        phase: finalPhase,
        deadlines: { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate }, 
        displayRound: round,
      };
      
      if (finalPhase === 'primary') {
          tempPrimary.push(productWithState);
      } else if (finalPhase === 'secondary') {
          tempSecondary.push(productWithState);
      } else { // 'past'
          const publishAtDate = safeToDate(round.publishAt);
          // 최근 5일 이내에 게시된 마감 상품만 표시
          if (publishAtDate && now.diff(dayjs(publishAtDate), 'day') <= 5) {
              tempPast.push(productWithState);
          }
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

    const firstPrimarySaleEndDate = tempPrimary.length > 0 ? tempPrimary[0].deadlines.primaryEnd : null;
    
    return {
      primarySaleProducts: tempPrimary.sort(sortProductsForDisplay),
      secondarySaleProducts: tempSecondary.sort(sortProductsForDisplay),
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
      <div className="pull-to-refresh-indicator" style={{ height: `${pullDistance}px` }}>
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
      <div className="pull-to-refresh-content" style={{ transform: `translateY(${pullDistance}px)` }}>
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
            primarySaleProducts.map(p => <ProductCard key={p.id} product={p} />)
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
            {secondarySaleProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </ProductSection>
        )}

        <div className="past-products-section" data-tutorial-id="past-sale-section">
          {Object.keys(pastProductsByDate).map(date => {
            const productsForDate = pastProductsByDate[date];
            if (!productsForDate || productsForDate.length === 0) return null;
            return (
              <ProductSection key={date} title={<>{dayjs(date).format('M월 D일')} 마감공구</>}>
                {productsForDate.map(p => <ProductCard key={p.id} product={p} />)}
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