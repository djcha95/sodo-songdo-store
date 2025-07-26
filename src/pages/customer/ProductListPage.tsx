// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
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
// ✅ [수정] 유틸리티 함수 import
import { getDisplayRound, safeToDate } from '@/utils/productUtils';
import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

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
  const [products, setProducts] = useState<Product[]>([]);
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
  
  // ✅ [수정] useMemo 훅을 useEffect 밖으로 이동하고 로직을 개선
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
    
    tempPrimary.sort((a, b) => (a.deadlines.primaryEnd?.getTime() || 0) - (b.deadlines.primaryEnd?.getTime() || 0));
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