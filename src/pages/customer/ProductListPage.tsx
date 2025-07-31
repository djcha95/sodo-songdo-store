// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getActiveBanners } from '@/firebase';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import type { Product, Banner } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import ProductSection from '@/components/customer/ProductSection';
import BannerSlider from '@/components/common/BannerSlider';
import ProductCard from '@/components/customer/ProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, RefreshCw, ArrowDown, Flame, Clock } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { getDisplayRound, safeToDate } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductForList extends Product {
  reservedQuantities?: Record<string, number>;
}

interface ProductWithUIState extends ProductForList {
  phase: 'primary' | 'secondary' | 'past';
  deadlines: {
    primaryEnd: Date | null;
    secondaryEnd: Date | null;
  };
}

const ProductListPage: React.FC = () => {
  const { userDocument } = useAuth();
  
  const [banners, setBanners] = useState<Banner[]>([]);
  const [products, setProducts] = useState<ProductForList[]>([]);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastVisibleRef = useRef<number | null>(null); 
  const hasMoreRef = useRef<boolean>(true);

  const PAGE_SIZE = 10;

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'callable-getProductsWithStock'), [functions]);

  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({
    threshold: 0,
    triggerOnce: false,
  });

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
      if (isInitial) {
        const activeBanners = await getActiveBanners();
        setBanners(activeBanners);
      }
      
      const result: HttpsCallableResult<any> = await getProductsWithStockCallable({
        pageSize: PAGE_SIZE,
        lastVisible: lastVisibleRef.current
      });

      const { products: newProducts, lastVisible: newLastVisible } = result.data as { products: ProductForList[], lastVisible: number | null };
  
      setProducts(prevProducts => {
        const productsMap = new Map(prevProducts.map(p => [p.id, p]));
        newProducts.forEach(p => {
          productsMap.set(p.id, p);
        });
        const allUniqueProducts = Array.from(productsMap.values());
        return isInitial ? newProducts : allUniqueProducts;
      });
  
      lastVisibleRef.current = newLastVisible;
      if (!newLastVisible || newProducts.length < PAGE_SIZE) {
        hasMoreRef.current = false;
      }
    } catch (err: any) {
      console.error("Error fetching products:", err);
      setError("상품을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      showToast('error', err.message || "데이터를 불러오는 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [loadingMore, getProductsWithStockCallable]);

  const handleRefresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // ✅ [핵심 수정] 의존성 배열을 비워서 최초 1회만 실행되도록 변경합니다.
  // 이렇게 해야 스크롤 시 `loadingMore` 상태가 바뀌어도 이 useEffect가 재실행되지 않아 무한 루프가 발생하지 않습니다.
  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoadMoreVisible && !loading && !isRefreshing && hasMoreRef.current) {
      fetchData(false);
    }
  }, [isLoadMoreVisible, loading, isRefreshing, fetchData]);
  
  // ... (이하 나머지 코드는 동일) ...
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
      if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier))) {
        return;
      }

      const primaryEndDate = safeToDate(round.deadlineDate);
      const pickupStartDate = safeToDate(round.pickupDate);
      const secondaryEndDate = pickupStartDate ? dayjs(pickupStartDate).hour(13).minute(0).second(0).toDate() : null;

      if (!primaryEndDate || !secondaryEndDate) return;

      let currentPhase: 'primary' | 'secondary' | 'past';
      if (now.isBefore(dayjs(primaryEndDate))) {
        currentPhase = 'primary';
      } else if (now.isBefore(dayjs(secondaryEndDate))) {
        currentPhase = 'secondary';
      } else {
        currentPhase = 'past';
      }

      const publishAtDate = safeToDate(round.publishAt);
      if (round.status === 'scheduled' && publishAtDate && now.isBefore(publishAtDate)) {
        return;
      }

      const productWithState: ProductWithUIState = {
        ...product,
        salesHistory: product.salesHistory, 
        phase: currentPhase,
        deadlines: { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate },
      };

      if (currentPhase === 'primary') {
        tempPrimary.push(productWithState);
      } else if (currentPhase === 'secondary') {
        const isSoldOut = round.variantGroups.every(vg => {
            const totalStock = vg.totalPhysicalStock;
            if (totalStock === null || totalStock === -1) return false;
            if (totalStock === 0) return true;
            
            const reserved = product.reservedQuantities?.[`${product.id}-${round.roundId}-${vg.id}`] || 0;
            return totalStock - reserved <= 0;
        });

        if (!isSoldOut) {
            tempSecondary.push(productWithState);
        }
      } else {
        if (now.diff(dayjs(secondaryEndDate), 'day') <= 7) {
            tempPast.push(productWithState);
        }
      }
    });
    
    const getProductRemainingStock = (product: ProductWithUIState): number => {
      const round = getDisplayRound(product);
      if (!round) return Infinity;

      let totalRemaining = 0;
      let isLimited = false;

      round.variantGroups.forEach(vg => {
        const totalStock = vg.totalPhysicalStock;
        if (totalStock !== null && totalStock !== -1) {
          isLimited = true;
          const reservedKey = `${product.id}-${round.roundId}-${vg.id}`;
          const reserved = product.reservedQuantities?.[reservedKey] || 0;
          totalRemaining += (totalStock - reserved);
        }
      });
      
      return isLimited ? totalRemaining : Infinity;
    };

    tempPrimary.sort((a, b) => {
      const stockA = getProductRemainingStock(a);
      const stockB = getProductRemainingStock(b);
      const isALimited = stockA !== Infinity;
      const isBLimited = stockB !== Infinity;
      if (isALimited && !isBLimited) return -1;
      if (!isALimited && isBLimited) return 1;
      if (isALimited && isBLimited && stockA !== stockB) return stockA - stockB;
      const deadlineA = a.deadlines.primaryEnd?.getTime() || 0;
      const deadlineB = b.deadlines.primaryEnd?.getTime() || 0;
      return deadlineA - deadlineB;
    });

    tempSecondary.sort((a, b) => (a.deadlines.secondaryEnd?.getTime() || 0) - (b.deadlines.secondaryEnd?.getTime() || 0));

    const pastGroups: { [key: string]: ProductWithUIState[] } = {};
    tempPast.forEach(p => {
      const dateKey = dayjs(p.deadlines.secondaryEnd).format('YYYY-MM-DD');
      if (!pastGroups[dateKey]) pastGroups[dateKey] = [];
      pastGroups[dateKey].push(p);
    });
    
    const sortedPastKeys = Object.keys(pastGroups).sort((a, b) => b.localeCompare(a));
    const sortedPastGroups: { [key: string]: ProductWithUIState[] } = {};
    sortedPastKeys.forEach(key => {
      sortedPastGroups[key] = pastGroups[key].sort((a, b) => (getDisplayRound(a)?.roundName || '').localeCompare(getDisplayRound(b)?.roundName || ''));
    });

    const firstPrimarySaleEndDate = tempPrimary.length > 0 ? dayjs(tempPrimary[0].deadlines.primaryEnd) : null;

    return {
      primarySaleProducts: tempPrimary,
      secondarySaleProducts: tempSecondary,
      pastProductsByDate: sortedPastGroups,
      primarySaleEndDate: firstPrimarySaleEndDate,
    };
  }, [products, userDocument]);
      
  useEffect(() => {
    if (primarySaleProducts.length === 0 || !primarySaleEndDate) {
      setCountdown(null);
      return;
    }
    const countdownInterval = setInterval(() => {
      const now = dayjs();
      const diff = primarySaleEndDate.diff(now, 'second');

      if (diff <= 0) {
        setCountdown("마감!");
        clearInterval(countdownInterval);
        return;
      }

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setCountdown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [primarySaleProducts.length, primarySaleEndDate]);

  if (loading && products.length === 0) {
    return <SodomallLoader />;
  }

  if (error) {
    return <div className="error-message-container">{error}</div>;
  }

  return (
    <div className="customer-page-container">
      <div 
        className="pull-to-refresh-indicator"
        style={{ height: `${pullDistance}px` }}
      >
        <div className="indicator-content">
          {isRefreshing ? <RefreshCw size={24} className="refreshing-icon" />
            : <>
                <ArrowDown size={20} className="arrow-icon" style={{ transform: isThresholdReached ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                <span className="indicator-text">{isThresholdReached ? '놓아서 새로고침' : '아래로 당겨서 새로고침'}</span>
              </>
          }
        </div>
      </div>
      <div
        className="pull-to-refresh-content"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        <div className="page-section banner-section"><BannerSlider banners={banners} /></div>

        <ProductSection
          key="primary-section"
          icon={<Flame />}
          title={<>🔥 오늘의 공동구매</>}
          countdownText={primarySaleProducts.length > 0 ? countdown : null}
        >
          {primarySaleProducts.length > 0
            ? primarySaleProducts.map(p => <ProductCard key={p.id} product={p} />)
            : !loading && (
              <div className="product-list-placeholder">
                <PackageSearch size={48} className="placeholder-icon" />
                <p className="placeholder-text">오늘의 상품을 준비중입니다</p>
                <span className="placeholder-subtext">매일 오후 1시에 새로운 상품을 기대해주세요!</span>
              </div>
            )
          }
        </ProductSection>
        
        {secondarySaleProducts.length > 0 && (
          <ProductSection 
            key="secondary-section"
            icon={<Clock />}
            title={<>⏰ 마감임박! 추가공구</>}
          >
            {secondarySaleProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </ProductSection>
        )}

        <div className="past-products-section">
          {Object.keys(pastProductsByDate).map(date => {
            const productsForDate = pastProductsByDate[date];
            if (!productsForDate || productsForDate.length === 0) return null;

            return (
              <ProductSection
                key={date}
                title={<>{dayjs(date).format('M월 D일 (dddd)')} 마감 공구</>}
              >
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