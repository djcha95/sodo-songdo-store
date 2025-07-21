// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getProducts, getActiveBanners, getReservedQuantitiesMap } from '@/firebase';
import { safeToDate, getDisplayRound } from '@/utils/productUtils';
import type { Product, Banner } from '@/types';
import type { DocumentData } from 'firebase/firestore';
import toast from 'react-hot-toast';
import SodamallLoader from '@/components/common/SodamallLoader';
import InlineSodamallLoader from '@/components/common/InlineSodamallLoader';
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

interface ProductWithUIState extends Product {
  isPreOrder?: boolean;
  isTodaySoldOut?: boolean;
}

const ProductListPage: React.FC = () => {
  const { userDocument } = useAuth();
  const [products, setProducts] = useState<ProductWithUIState[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [reservedQuantitiesMap, setReservedQuantitiesMap] = useState<Map<string, number>>(new Map());
  const [countdown, setCountdown] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef(null);
  const pageContainerRef = useRef<HTMLDivElement>(null); // 메인 컨테이너 ref

  const PAGE_SIZE = 9;

  const fetchProductsCallback = useCallback(async (isInitial: boolean) => {
    if (isInitial) {
      // '당겨서 새로고침' 시에는 전체 로더를 띄우지 않기 위해 setLoading(true)를 isRefreshing 외부로 옮깁니다.
    } else {
      setLoadingMore(true);
    }

    try {
      if (isInitial) {
        const [activeBanners, reservedMap] = await Promise.all([
          getActiveBanners(),
          getReservedQuantitiesMap()
        ]);
        setBanners(activeBanners);
        setReservedQuantitiesMap(reservedMap);
      }

      const response = await getProducts(false, PAGE_SIZE, isInitial ? null : lastVisible);
      const newProducts = response.products.map(p => ({ ...p }));

      setProducts(prevProducts => isInitial ? newProducts : [...prevProducts, ...newProducts]);
      setLastVisible(response.lastVisible);

      if (!response.lastVisible || response.products.length < PAGE_SIZE) {
        setHasMore(false);
      }

    } catch (error) {
      console.error(error);
      toast.error("데이터를 불러오는 중 문제가 발생했습니다.");
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [lastVisible]);

  const { pullDistance, isRefreshing, isThresholdReached } = usePullToRefresh({
    onRefresh: async () => {
      // isInitial=true 이지만, setLoading(true)는 호출하지 않습니다.
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
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [hasMore, loadingMore, loading, fetchProductsCallback]);
  
  // ... (useMemo, countdown useEffect 등 나머지 로직은 동일) ...

  const { todaysProducts, closingSoonProducts, pastProductsByDate, todaysSalesEnd } = useMemo(() => {
    const now = dayjs();
    const userTier = userDocument?.loyaltyTier;

    let salesStart, salesEnd;
    const today1pm = now.clone().hour(13).minute(0).second(0);

    let lastSat1pm = now.clone().day(6).hour(13).minute(0).second(0).millisecond(0);
    if (lastSat1pm.isAfter(now)) {
      lastSat1pm = lastSat1pm.subtract(1, 'week');
    }
    const weekendCycleEnd = lastSat1pm.add(2, 'days');

    if (now.isAfter(lastSat1pm) && now.isBefore(weekendCycleEnd)) {
      salesStart = lastSat1pm;
      salesEnd = weekendCycleEnd;
    } else {
      if (now.isBefore(today1pm)) {
        salesStart = today1pm.subtract(1, 'day');
        salesEnd = today1pm;
      } else {
        salesStart = today1pm;
        salesEnd = today1pm.add(1, 'day');
      }
    }

    const tempTodays: ProductWithUIState[] = [];
    const tempClosingSoon: ProductWithUIState[] = [];
    const tempPast: ProductWithUIState[] = [];

    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft') return;

      const secretTiers = round.secretForTiers;
      if (secretTiers && secretTiers.length > 0) {
        if (!userTier || !secretTiers.includes(userTier)) {
          return;
        }
      }

      const publishAt = safeToDate(round.publishAt);
      const preOrderEndDate = safeToDate(round.preOrderEndDate);
      const preOrderStartDate = publishAt ? dayjs(publishAt).subtract(1, 'hour').toDate() : null;

      let isVisible = false;
      let isPreOrder = false;

      if (publishAt && now.isAfter(publishAt)) {
        isVisible = true;
      } else if (userTier && preOrderStartDate && preOrderEndDate && round.preOrderTiers?.includes(userTier)) {
        if (now.isAfter(preOrderStartDate) && now.isBefore(preOrderEndDate)) {
          isVisible = true;
          isPreOrder = true;
        }
      }

      if (!isVisible) return;

      const createdAtDate = safeToDate(round.createdAt);
      const pickupDate = safeToDate(round.pickupDate);
      if (!createdAtDate || !pickupDate) return;

      const createdAt = dayjs(createdAtDate);
      const finalDeadline = dayjs(pickupDate).hour(13).minute(0).second(0);

      if (now.isAfter(finalDeadline) || round.status === 'ended' || round.status === 'sold_out') {
        tempPast.push({ ...product, isPreOrder });
        return;
      }

      if (createdAt.isBetween(salesStart, salesEnd, null, '[)')) {
        tempTodays.push({ ...product, isPreOrder });
      } else if (round.status === 'selling') {
        tempClosingSoon.push({ ...product, isPreOrder });
      }
    });

    tempTodays.sort((a, b) => {
      const getSortState = (p: Product) => {
        const r = getDisplayRound(p)!;
        const isMultiOption = (r.variantGroups?.length ?? 0) > 1 || (r.variantGroups?.[0]?.items?.length ?? 0) > 1;

        let sortGroup: number;
        let remaining = Infinity;
        let price = 0;

        if (isMultiOption) {
          sortGroup = 2;
          price = r.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        } else {
          const vg = r.variantGroups?.[0];
          const item = vg?.items?.[0];
          price = item?.price ?? 0;
          const stock = vg?.totalPhysicalStock;

          if (stock !== null && stock !== -1) {
            sortGroup = 1;
            remaining = stock;
          } else {
            sortGroup = 2;
          }
        }
        return { sortGroup, remaining, price };
      };

      const stateA = getSortState(a);
      const stateB = getSortState(b);

      if (stateA.sortGroup !== stateB.sortGroup) {
        return stateA.sortGroup - stateB.sortGroup;
      }

      if (stateA.sortGroup === 1 && stateA.remaining !== stateB.remaining) {
        return stateA.remaining - stateB.remaining;
      }

      return stateB.price - stateA.price;
    });

    tempClosingSoon.sort((a, b) => {
      const pickupA = safeToDate(getDisplayRound(a)?.pickupDate)?.getTime() || Infinity;
      const pickupB = safeToDate(getDisplayRound(b)?.pickupDate)?.getTime() || Infinity;
      return pickupA - pickupB;
    });

    const pastGroups: { [key: string]: ProductWithUIState[] } = {};
    tempPast.forEach(p => {
      const round = getDisplayRound(p);
      const uploadDate = safeToDate(round?.createdAt);
      if (uploadDate) {
        const dateKey = dayjs(uploadDate).format('YYYY-MM-DD');
        if (!pastGroups[dateKey]) {
          pastGroups[dateKey] = [];
        }
        pastGroups[dateKey].push(p);
      }
    });

    const sortedPastKeys = Object.keys(pastGroups).sort((a, b) => b.localeCompare(a));
    const recentPastGroups: { [key: string]: ProductWithUIState[] } = {};
    sortedPastKeys.forEach(key => {
      recentPastGroups[key] = pastGroups[key];
    });

    return {
      todaysProducts: tempTodays,
      closingSoonProducts: tempClosingSoon,
      pastProductsByDate: recentPastGroups,
      todaysSalesEnd: salesEnd,
    };
  }, [products, userDocument]);

  useEffect(() => {
    if (todaysProducts.length === 0 || !todaysSalesEnd) {
      setCountdown(null);
      return;
    }
    const countdownInterval = setInterval(() => {
      const now = dayjs();
      const diff = todaysSalesEnd.diff(now, 'second');

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
  }, [todaysProducts.length, todaysSalesEnd]);

  if (loading && !isRefreshing) return <SodamallLoader />;

  return (
    <div className="customer-page-container">
      <div 
        className="pull-to-refresh-indicator"
        style={{ height: `${pullDistance}px` }}
      >
        <div className="indicator-content">
          {isRefreshing ? (
            <RefreshCw size={24} className="refreshing-icon" />
          ) : (
            <>
              <ArrowDown
                size={20}
                className="arrow-icon"
                style={{ transform: isThresholdReached ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
              <span className="indicator-text">
                {isThresholdReached ? '놓아서 새로고침' : '아래로 당겨서 새로고침'}
              </span>
            </>
          )}
        </div>
      </div>
      <div
        ref={pageContainerRef}
        className="pull-to-refresh-content"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        {/* 기존 페이지 콘텐츠 */}
        <div className="page-section banner-section"><BannerSlider banners={banners} /></div>

        <ProductSection
          title={<>🔥 오늘의 공동구매</>}
          countdownText={todaysProducts.length > 0 ? countdown : null}
        >
          {todaysProducts.length > 0
            ? todaysProducts.map(p => <ProductCard key={`${p.id}-${getDisplayRound(p)?.roundId}`} product={p} isPreOrder={p.isPreOrder} reservedQuantitiesMap={reservedQuantitiesMap} />)
            : !loading && (
              <div className="product-list-placeholder">
                <PackageSearch size={48} className="placeholder-icon" />
                <p className="placeholder-text">상품을 준비중입니다</p>
                <span className="placeholder-subtext">매일 새로운 상품을 기대해주세요!</span>
              </div>
            )
          }
        </ProductSection>

        {closingSoonProducts.length > 0 && (
          <ProductSection title={<>⏰ 마감임박! 추가공구</>}>
            {closingSoonProducts.map(p => <ProductCard key={`${p.id}-${getDisplayRound(p)?.roundId}`} product={p} isPreOrder={p.isPreOrder} reservedQuantitiesMap={reservedQuantitiesMap} />)}
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
                  <ProductCard key={`${p.id}-${getDisplayRound(p)?.roundId}`} product={p} isPastProduct={true} reservedQuantitiesMap={reservedQuantitiesMap} />
                ))}
              </ProductSection>
            );
          })}
        </div>

        <div ref={loader} className="infinite-scroll-loader">
          {loadingMore && <InlineSodamallLoader />}
          {!hasMore && products.length > PAGE_SIZE && (
            <div className="end-of-list-message">
              <p>모든 상품을 확인했어요!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductListPage;