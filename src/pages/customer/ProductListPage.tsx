// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
// ✅ [수정] getProducts, getReservedQuantitiesMap을 직접 import 합니다.
import { getProducts, getActiveBanners, getReservedQuantitiesMap } from '@/firebase';
import type { Product, Banner } from '@/types';
import type { DocumentData } from 'firebase/firestore';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import ProductSection from '@/components/customer/ProductSection';
import BannerSlider from '@/components/common/BannerSlider';
import ProductCard from '@/components/customer/ProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, RefreshCw, ArrowDown } from 'lucide-react';

import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { getDisplayRound, safeToDate } from '@/utils/productUtils';
import { showToast } from '@/utils/toastUtils';
import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

// reservedQuantities 속성을 포함하는 타입 정의
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
  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 10;

  // ✅ [수정] Cloud Function 호출 대신 getProducts와 getReservedQuantitiesMap을 직접 호출
  const fetchProductsCallback = useCallback(async (isInitial: boolean) => {
    if (loadingMore && !isInitial) return;

    if (!isInitial) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLastVisible(null);
      setHasMore(true);
    }
  
    try {
      const currentLastVisible = isInitial ? null : lastVisible;
  
      // 1. 상품 목록과 예약 수량 정보를 병렬로 가져옵니다. (관리자 페이지와 동일한 로직)
      const [productResponse, reservedQuantitiesMap] = await Promise.all([
        getProducts(false, PAGE_SIZE, currentLastVisible),
        getReservedQuantitiesMap(),
      ]);
  
      if (isInitial) {
        const activeBanners = await getActiveBanners();
        setBanners(activeBanners);
      }
  
      const { products: newProducts, lastVisible: newLastVisible } = productResponse;

      // 2. 가져온 상품 목록에 예약 수량 정보를 주입합니다.
      const productsWithReservedData = newProducts.map(product => {
        const reservedQuantities: Record<string, number> = {};
        (product.salesHistory || []).forEach(round => {
            (round.variantGroups || []).forEach(vg => {
                const key = `${product.id}-${round.roundId}-${vg.id}`;
                if (reservedQuantitiesMap.has(key)) {
                    reservedQuantities[key] = reservedQuantitiesMap.get(key)!;
                }
            });
        });
        return { ...product, reservedQuantities };
      });
  
      setProducts(prevProducts =>
        isInitial ? productsWithReservedData : [...prevProducts, ...productsWithReservedData]
      );
  
      setLastVisible(newLastVisible);
      if (!newLastVisible || newProducts.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error(error);
      showToast('error', "데이터를 불러오는 중 문제가 발생했습니다.");
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [lastVisible, loadingMore]);

  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({
    onRefresh: async () => {
      await fetchProductsCallback(true);
    },
  });

  useEffect(() => {
    fetchProductsCallback(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchProductsCallback(false);
        }
      },
      { threshold: 1.0 }
    );
    const currentLoader = loader.current;
    if (currentLoader) observer.observe(currentLoader);
    return () => { if (currentLoader) observer.unobserve(currentLoader); };
  }, [hasMore, loadingMore, loading, fetchProductsCallback]);
  
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
        salesHistory: [round], 
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

      if (isALimited && isBLimited && stockA !== stockB) {
        return stockA - stockB;
      }
      
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
      sortedPastGroups[key] = pastGroups[key].sort((a, b) => (a.salesHistory[0]?.roundName || '').localeCompare(b.salesHistory[0]?.roundName || ''));
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

  if (loading && !isRefreshing) return <SodomallLoader />;

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
        ref={pageContainerRef}
        className="pull-to-refresh-content"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        <div className="page-section banner-section"><BannerSlider banners={banners} /></div>

        <ProductSection
          title={<>🔥 오늘의 공동구매</>}
          countdownText={primarySaleProducts.length > 0 ? countdown : null}
        >
          {primarySaleProducts.length > 0
            ? primarySaleProducts.map(p => <ProductCard key={`${p.id}-${p.salesHistory[0].roundId}`} product={p} />)
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
          <ProductSection title={<>⏰ 마감임박! 추가공구</>}>
            {secondarySaleProducts.map(p => <ProductCard key={`${p.id}-${p.salesHistory[0].roundId}`} product={p} />)}
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
                {productsForDate.map(p => (
                  <ProductCard key={`${p.id}-${p.salesHistory[0].roundId}`} product={p} />
                ))}
              </ProductSection>
            );
          })}
        </div>

        <div ref={loader} className="infinite-scroll-loader">
          {loadingMore && <InlineSodomallLoader />}
          {!hasMore && products.length > PAGE_SIZE && (
            <div className="end-of-list-message"><p>모든 상품을 확인했어요!</p></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductListPage;