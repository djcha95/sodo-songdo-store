// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { mainTourSteps } from '@/components/customer/AppTour';
// ✅ [수정] getActiveBanners와 함께 getReservedQuantitiesMap을 import합니다.
import { getActiveBanners, getReservedQuantitiesMap } from '@/firebase'; 
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import type { Product, Banner, SalesRound } from '@/types';
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

// ProductForList에서 더 이상 reservedQuantities를 사용하지 않으므로 제거해도 무방합니다.
interface ProductForList extends Product {}

interface ProductWithUIState extends ProductForList {
  phase: 'primary' | 'secondary' | 'past';
  deadlines: { primaryEnd: Date | null; secondaryEnd: Date | null; };
  displayRound: SalesRound;
  // ✅ [추가] 실시간 예약 수량을 전달하기 위한 속성
  liveReservedQuantities: Record<string, number>;
}

const ProductListPage: React.FC = () => {
  const { userDocument } = useAuth();
  const { startTour, isTourRunning } = useTutorial();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [products, setProducts] = useState<ProductForList[]>([]);
  // ✅ [추가] 실시간 예약 수량을 저장할 state
  const [reservedQuantitiesMap, setReservedQuantitiesMap] = useState<Map<string, number>>(new Map());
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
      // ✅ [수정] isInitial일 때 배너 정보와 함께 실시간 예약 수량 정보를 가져옵니다.
      if (isInitial) {
        const [activeBanners, quantitiesMap] = await Promise.all([
            getActiveBanners(),
            getReservedQuantitiesMap()
        ]);
        setBanners(activeBanners);
        setReservedQuantitiesMap(quantitiesMap);
      }
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
  }, [getProductsWithStockCallable, loadingMore]); // fetchData 의존성 배열에서 일부 제거

  const handleRefresh = useCallback(async () => { await fetchData(true); }, [fetchData]);
  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({ onRefresh: handleRefresh });

  useEffect(() => { fetchData(true); }, [fetchData]);

  useEffect(() => {
    if (isLoadMoreVisible && !loading && !isRefreshing && hasMoreRef.current && !isTourRunning) {
      fetchData(false);
    }
  }, [isLoadMoreVisible, loading, isRefreshing, fetchData, isTourRunning]);
  
  // ✅ [수정] useMemo 로직을 실시간 예약 수량(reservedQuantitiesMap)을 사용하도록 변경
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
      
      // 실시간 예약 수량을 ProductCard에 전달하기 위해 객체 생성
      const liveReservedQuantities: Record<string, number> = {};
      round.variantGroups.forEach(vg => {
          const key = `${product.id}-${round.roundId}-${vg.id}`;
          liveReservedQuantities[key] = reservedQuantitiesMap.get(key) || 0;
      });

      const productWithState: ProductWithUIState = { 
          ...product, 
          phase: currentPhase, 
          deadlines: { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate }, 
          displayRound: round,
          liveReservedQuantities // 실시간 수량 정보 추가
      };
      
      if (currentPhase === 'primary') {
        tempPrimary.push(productWithState);
      } else if (currentPhase === 'secondary') {
        const isSoldOut = round.variantGroups.every(vg => {
          const totalStock = vg.totalPhysicalStock;
          if (totalStock === null || totalStock === -1) return false;
          if (totalStock === 0) return true;
          // 여기서도 실시간 예약 수량을 사용
          const key = `${product.id}-${round.roundId}-${vg.id}`;
          const reserved = reservedQuantitiesMap.get(key) || 0;
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
    
    // 의존성 배열에 reservedQuantitiesMap 추가
    return { primarySaleProducts: tempPrimary, secondarySaleProducts: tempSecondary, pastProductsByDate: sortedPastGroups, primarySaleEndDate: firstPrimarySaleEndDate };
  }, [products, userDocument, reservedQuantitiesMap]); 
      
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
      {/* ... (나머지 JSX 코드는 동일) ... */}
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