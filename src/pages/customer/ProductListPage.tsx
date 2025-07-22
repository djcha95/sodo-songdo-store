// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
// getReservedQuantitiesMap 임포트 제거
import { getProducts, getActiveBanners } from '@/firebase';
import type { Product, Banner } from '@/types';
import type { DocumentData } from 'firebase/firestore';
import toast from 'react-hot-toast';
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

import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

const convertTimestampToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000);
  }
  return null;
};


interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'past';
  deadlines: {
    primaryEnd: Date | null;
    secondaryEnd: Date | null;
  }
}

const ProductListPage: React.FC = () => {
  const { userDocument } = useAuth();
  
  const [banners, setBanners] = useState<Banner[]>([]);
  
  const [currentTime, setCurrentTime] = useState(dayjs());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  // reservedQuantitiesMap 상태 제거
  const [countdown, setCountdown] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 10;

  const fetchProductsCallback = useCallback(async (isInitial: boolean) => {
    if (!isInitial) setLoadingMore(true);

    try {
      if (isInitial) {
        // getReservedQuantitiesMap 호출 제거
        const activeBanners = await getActiveBanners();
        setBanners(activeBanners);
      }

      const response = await getProducts(false, PAGE_SIZE, isInitial ? null : lastVisible);
      const newProducts = response.products;

      setProducts(prevProducts => isInitial ? newProducts : [...prevProducts, ...newProducts]);
      setLastVisible(response.lastVisible);
      if (!response.lastVisible || newProducts.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error(error);
      toast.error("데이터를 불러오는 중 문제가 발생했습니다.");
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  }, [lastVisible]);

  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({
    onRefresh: async () => {
      await fetchProductsCallback(true);
    },
  });

  useEffect(() => {
    setLoading(true);
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
  
  // reservedQuantitiesMap 의존성 제거
  const { primarySaleProducts, secondarySaleProducts, pastProductsByDate, primarySaleEndDate } = useMemo(() => {
    const now = currentTime;
    const userTier = userDocument?.loyaltyTier;

    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    const tempPast: ProductWithUIState[] = [];

    products.forEach(product => {
      if (!product.salesHistory || product.salesHistory.length === 0) return;
      
      const sortedHistory = [...product.salesHistory].sort((a, b) => {
        const dateA = convertTimestampToDate(a.publishAt)?.getTime() || 0;
        const dateB = convertTimestampToDate(b.publishAt)?.getTime() || 0;
        return dateB - dateA;
      });
      
      const round = sortedHistory[0];
      if (!round || round.status === 'draft') return;
      
      const secretTiers = round.secretForTiers;
      if (secretTiers && secretTiers.length > 0 && (!userTier || !secretTiers.includes(userTier))) {
        return;
      }

      const publishAtDate = convertTimestampToDate(round.publishAt);
      const primaryEndDate = convertTimestampToDate(round.deadlineDate);
      
      const pickupStartDate = convertTimestampToDate(round.pickupDate);
      let secondaryEndDate: Date | null = null;
      if (pickupStartDate) {
        const tempDate = new Date(pickupStartDate);
        tempDate.setHours(13, 0, 0, 0);
        secondaryEndDate = tempDate;
      }

      if (!publishAtDate || !primaryEndDate || !secondaryEndDate) return;
      
      const publishAt = dayjs(publishAtDate);
      const primaryEnd = dayjs(primaryEndDate);
      const secondaryEnd = dayjs(secondaryEndDate);
      
      if (now.isBefore(publishAt)) return;

      let currentPhase: 'primary' | 'secondary' | 'past';
      if (now.isBefore(primaryEnd)) {
        currentPhase = 'primary';
      } else if (now.isBefore(secondaryEnd)) {
        currentPhase = 'secondary';
      } else {
        currentPhase = 'past';
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
            if (totalStock === null || totalStock === -1 || totalStock === 0) {
                return false;
            }
            const reservedKey = `${product.id}-${round.roundId}-${vg.id}`;
            // product.reservedQuantities 에서 직접 값을 읽도록 수정
            const reserved = product.reservedQuantities?.[reservedKey] || 0;
            const remainingStock = totalStock - reserved;
            const minDeductionAmount = Math.min(...vg.items.map(item => item.stockDeductionAmount || 1));
            return remainingStock < minDeductionAmount;
        });

        if (!isSoldOut) {
            tempSecondary.push(productWithState);
        }
      } else { // 'past'
        if (now.diff(secondaryEnd, 'day') <= 7) {
            tempPast.push(productWithState);
        }
      }
    });

    tempPrimary.sort((a, b) => {
      return (a.deadlines.primaryEnd?.getTime() || 0) - (b.deadlines.primaryEnd?.getTime() || 0);
    });
    
    tempSecondary.sort((a, b) => {
      return (a.deadlines.secondaryEnd?.getTime() || 0) - (b.deadlines.secondaryEnd?.getTime() || 0);
    });

    const pastGroups: { [key: string]: ProductWithUIState[] } = {};
    tempPast.forEach(p => {
      const dateKey = dayjs(p.deadlines.secondaryEnd).format('YYYY-MM-DD');
      if (!pastGroups[dateKey]) {
        pastGroups[dateKey] = [];
      }
      pastGroups[dateKey].push(p);
    });
    
    const sortedPastKeys = Object.keys(pastGroups).sort((a, b) => b.localeCompare(a));
    const sortedPastGroups: { [key: string]: ProductWithUIState[] } = {};
    sortedPastKeys.forEach(key => {
      sortedPastGroups[key] = pastGroups[key].sort((productA, productB) => {
        const roundNameA = productA.salesHistory[0]?.roundName || '';
        const roundNameB = productB.salesHistory[0]?.roundName || '';
        return roundNameB.localeCompare(roundNameA);
      });
    });

    const firstPrimarySaleEndDate = tempPrimary.length > 0 ? dayjs(tempPrimary[0].deadlines.primaryEnd) : null;

    return {
      primarySaleProducts: tempPrimary,
      secondarySaleProducts: tempSecondary,
      pastProductsByDate: sortedPastGroups,
      primarySaleEndDate: firstPrimarySaleEndDate,
    };
  }, [products, userDocument, currentTime]);
  
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
            // ProductCard에 reservedQuantitiesMap prop 제거
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
             {/* ProductCard에 reservedQuantitiesMap prop 제거 */}
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
                   // ProductCard에 reservedQuantitiesMap prop 제거
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