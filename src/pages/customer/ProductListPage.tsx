// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { mainTourSteps } from '@/components/customer/AppTour';
// ✅ getReservedQuantitiesMap 임포트 제거, getActiveBanners만 유지
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
import { getDisplayRound, getDeadlines, safeToDate } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductForList extends Product {}

// ✅ ProductCard로 전달될 타입 단순화
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
  // ✅ reservedQuantitiesMap state 제거
  const [countdown, setCountdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastVisibleRef = useRef<number | null>(null);
  const hasMoreRef = useRef<boolean>(true);
  const PAGE_SIZE = 10;
  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductsWithStock'), [functions]);
  
  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({ threshold: 0, triggerOnce: false });

  useEffect(() => {
    if (userDocument && !userDocument.hasCompletedTutorial) {
      setTimeout(() => startTour(mainTourSteps), 500);
    }
  }, [userDocument, startTour]);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
      setError(null);
      lastVisibleRef.current = null;
      hasMoreRef.current = true;
    } else {
      if (loadingMore || !hasMoreRef.current) return;
      setLoadingMore(true);
    }
    try {
      // ✅ getReservedQuantitiesMap 호출 제거
      if (isInitial) {
        const activeBanners = await getActiveBanners();
        setBanners(activeBanners);
      }
      // ✅ Cloud Function 호출은 변경 없음
      const result: HttpsCallableResult<any> = await getProductsWithStockCallable({ pageSize: PAGE_SIZE, lastVisible: lastVisibleRef.current });
      const { products: newProducts, lastVisible: newLastVisible } = result.data as { products: ProductForList[], lastVisible: number | null };
      
      setProducts(prevProducts => {
        const productsMap = new Map(prevProducts.map(p => [p.id, p]));
        newProducts.forEach(p => productsMap.set(p.id, p));
        return isInitial ? newProducts : Array.from(productsMap.values());
      });

      lastVisibleRef.current = newLastVisible;
      if (!newLastVisible || newProducts.length < PAGE_SIZE) {
        hasMoreRef.current = false;
      }
    } catch (err: any) {
      setError("상품을 불러오는 중 오류가 발생했습니다.");
      showToast('error', err.message || "데이터 로딩 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [getProductsWithStockCallable, loadingMore]);

  const handleRefresh = useCallback(async () => { await fetchData(true); }, [fetchData]);
  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({ onRefresh: handleRefresh });

  useEffect(() => { fetchData(true); }, [fetchData]);

  useEffect(() => {
    if (isLoadMoreVisible && !loading && !isRefreshing && hasMoreRef.current && !isTourRunning) {
      fetchData(false);
    }
  }, [isLoadMoreVisible, loading, isRefreshing, fetchData, isTourRunning]);
  
  // ✅ useMemo 로직에서 reservedQuantitiesMap 의존성 제거
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
      
      if (!primaryEndDate) return;

      let currentPhase: 'primary' | 'secondary' | 'past';
      if (now.isBefore(dayjs(primaryEndDate))) {
        currentPhase = 'primary';
      } else if (secondaryEndDate && now.isBetween(dayjs(primaryEndDate), dayjs(secondaryEndDate), null, '[]')) {
        currentPhase = 'secondary';
      } else {
        currentPhase = 'past';
      }
      
      if (round.status === 'scheduled' && round.publishAt) {
          const publishAtDate = safeToDate(round.publishAt);
          if (publishAtDate && now.isBefore(publishAtDate)) return;
      }
      
      const productWithState: ProductWithUIState = { 
          ...product, 
          phase: currentPhase, 
          deadlines: { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate }, 
          displayRound: round,
      };
      
      if (currentPhase === 'primary') {
        tempPrimary.push(productWithState);
      } else if (currentPhase === 'secondary') {
        // ✅ Cloud Function에서 주입된 reservedCount를 직접 사용
        const isSoldOut = round.variantGroups.every(vg => {
          const totalStock = vg.totalPhysicalStock;
          if (totalStock === null || totalStock === -1) return false;
          if (totalStock === 0) return true;
          // 타입 단언을 통해 reservedCount에 접근
          const reserved = (vg as VariantGroup & { reservedCount?: number }).reservedCount || 0;
          return totalStock - reserved <= 0;
        });
        if (!isSoldOut) tempSecondary.push(productWithState);
      } else {
        if (secondaryEndDate && now.diff(dayjs(secondaryEndDate), 'day') <= 7) {
          tempPast.push(productWithState);
        }
      }
    });

    const pastGroups: { [key: string]: ProductWithUIState[] } = {};
    tempPast.forEach(p => {
        if(p.deadlines.secondaryEnd) {
            const dateKey = dayjs(p.deadlines.secondaryEnd).format('YYYY-MM-DD');
            if (!pastGroups[dateKey]) pastGroups[dateKey] = [];
            pastGroups[dateKey].push(p);
        }
    });

    const sortedPastKeys = Object.keys(pastGroups).sort((a, b) => b.localeCompare(a));
    const sortedPastGroups: { [key:string]: ProductWithUIState[] } = {};
    sortedPastKeys.forEach(key => {
      sortedPastGroups[key] = pastGroups[key].sort((a, b) => (a.displayRound.roundName || '').localeCompare(b.displayRound.roundName || ''));
    });
    const firstPrimarySaleEndDate = tempPrimary.length > 0 ? tempPrimary[0].deadlines.primaryEnd : null;
    
    return { primarySaleProducts: tempPrimary, secondarySaleProducts: tempSecondary, pastProductsByDate: sortedPastGroups, primarySaleEndDate: firstPrimarySaleEndDate };
  }, [products, userDocument]); 
      
  useEffect(() => {
    if (!primarySaleEndDate) { setCountdown(null); return; }
    const interval = setInterval(() => {
      const diff = dayjs(primarySaleEndDate).diff(dayjs(), 'second');
      if (diff <= 0) { setCountdown("마감!"); clearInterval(interval); return; }
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
          {isRefreshing ? <RefreshCw size={24} className="refreshing-icon" /> : <><ArrowDown size={20} className="arrow-icon" style={{ transform: isThresholdReached ? 'rotate(180deg)' : 'rotate(0deg)' }} /><span>{isThresholdReached ? '놓아서 새로고침' : '아래로 당겨서 새로고침'}</span></>}
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
            <div className="product-list-placeholder"><PackageSearch size={48} /><p>오늘의 상품을 준비중입니다</p><span>매일 오후 1시에 새로운 상품을 기대해주세요!</span></div>
          )}
        </ProductSection>
        
        {secondarySaleProducts.length > 0 && (
          <ProductSection 
            key="secondary-section"
            title={<>⏰ 마감임박! 추가공구</>}
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
              <ProductSection key={date} title={<>{dayjs(date).format('M월 D일 (dddd)')} 마감 공구</>}>
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