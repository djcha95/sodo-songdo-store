// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { getProducts, getActiveBanners } from '@/firebase';
import type { Product, Banner, SalesRound } from '@/types';
import { Timestamp } from 'firebase/firestore'; // Timestamp 타입을 명시적으로 가져옵니다.
import toast from 'react-hot-toast';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ProductSection from '@/components//customer/ProductSection';
import BannerSlider from '@/components/common/BannerSlider';
import ProductCard from '@/components/customer/ProductCard';
import dayjs from 'dayjs';

import './ProductListPage.css';
import '@/styles/common.css';

// ✅ [FIX] 다양한 날짜 형식을 안전하게 Date 객체로 변환하는 헬퍼 함수
const safeToDate = (date: any): Date | null => {
  if (!date) {
    return null;
  }
  // 1. 이미 JavaScript Date 객체인 경우
  if (date instanceof Date) {
    return date;
  }
  // 2. Firestore Timestamp 객체인 경우
  if (typeof date.toDate === 'function') {
    return date.toDate();
  }
  // 3. JSON.stringify를 통해 변환된 객체인 경우 (e.g., { seconds: ..., nanoseconds: ... })
  if (typeof date === 'object' && date.seconds !== undefined && date.nanoseconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds).toDate();
  }
  // 4. 날짜 형식의 문자열인 경우
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }
  // 그 외의 경우, 변환 실패
  console.warn("Unsupported date format:", date);
  return null;
};


const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) {
    return null;
  }
  const activeRounds = product.salesHistory.filter((r: SalesRound) => r.status === 'selling' || r.status === 'scheduled');
  if (activeRounds.length > 0) {
    // ✅ [FIX] 날짜 비교 시 safeToDate 헬퍼 함수 사용
    return activeRounds.sort((a: SalesRound, b: SalesRound) => {
        const dateA = safeToDate(b.createdAt)?.getTime() || 0;
        const dateB = safeToDate(a.createdAt)?.getTime() || 0;
        return dateA - dateB;
    })[0];
  }
  const nonDraftRounds = product.salesHistory.filter((r: SalesRound) => r.status !== 'draft');
  if (nonDraftRounds.length > 0) {
    // ✅ [FIX] 날짜 비교 시 safeToDate 헬퍼 함수 사용
    return nonDraftRounds.sort((a: SalesRound, b: SalesRound) => {
        const dateA = safeToDate(b.createdAt)?.getTime() || 0;
        const dateB = safeToDate(a.createdAt)?.getTime() || 0;
        return dateA - dateB;
    })[0];
  }
  return null;
};

const getTotalStock = (round: SalesRound | null): number => {
  if (!round) return 0;
  return round.variantGroups?.reduce((acc, vg) => {
    if (vg.totalPhysicalStock != null && vg.totalPhysicalStock !== -1) {
      return acc + vg.totalPhysicalStock;
    }
    const itemsStock = vg.items?.reduce((itemAcc, item) => itemAcc + (item.stock === -1 ? Infinity : (item.stock || 0)), 0) || 0;
    return acc + itemsStock;
  }, 0) ?? 0;
};

const getRepresentativePrice = (round: SalesRound | null): number => {
  return round?.variantGroups?.[0]?.items?.[0]?.price ?? 0;
};


const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const fetchedProducts = await getProducts(false);
        const activeBanners = await getActiveBanners();
        setProducts(fetchedProducts);
        setBanners(activeBanners);
      } catch (error) {
        console.error("데이터 로딩 중 오류 발생:", error);
        toast.error("데이터를 불러오는 중 문제가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const { ongoingProducts, additionalProducts, visiblePastProducts } = useMemo(() => {
    const now = dayjs();
    const tempOngoing: Product[] = [];
    const tempAdditional: Product[] = [];
    const tempPast: Product[] = [];

    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round) return;

      // ✅ [FIX] .toDate() 대신 safeToDate 헬퍼 함수 사용
      const deadlineDate = safeToDate(round.deadlineDate);
      const pickupDate = safeToDate(round.pickupDate);

      // 날짜 변환 실패 시 해당 상품은 처리하지 않음
      if (!deadlineDate || !pickupDate) return;

      const deadline = dayjs(deadlineDate);
      const finalPickupDeadline = dayjs(pickupDate).hour(13).minute(0).second(0);
      
      const isTerminalStatus = round.status === 'ended' || round.status === 'sold_out';
      if (isTerminalStatus || now.isAfter(finalPickupDeadline)) {
        tempPast.push(product);
        return;
      }
      
      if (now.isBefore(deadline)) {
        tempOngoing.push(product);
      } else {
        tempAdditional.push(product);
      }
    });
    
    tempOngoing.sort((a, b) => {
      const roundA = getDisplayRound(a);
      const roundB = getDisplayRound(b);

      const stockA = getTotalStock(roundA);
      const stockB = getTotalStock(roundB);

      const isWaitlistA = stockA === 0;
      const isWaitlistB = stockB === 0;

      if (isWaitlistA && !isWaitlistB) return 1;
      if (!isWaitlistA && isWaitlistB) return -1;

      if (stockA !== stockB) {
        return stockA - stockB;
      }

      const priceA = getRepresentativePrice(roundA);
      const priceB = getRepresentativePrice(roundB);
      return priceB - priceA;
    });


    tempAdditional.sort((a, b) => {
        const dateA = safeToDate(getDisplayRound(a)?.pickupDate)?.getTime() || 0;
        const dateB = safeToDate(getDisplayRound(b)?.pickupDate)?.getTime() || 0;
        return dateA - dateB;
    });
    
    const oneWeekAgo = dayjs().subtract(7, 'day');
    const filteredPast = tempPast.filter(product => {
      const round = getDisplayRound(product);
      if (!round) return false;
      // ✅ [FIX] .toDate() 대신 safeToDate 헬퍼 함수 사용
      const pickupDate = safeToDate(round.pickupDate);
      return pickupDate ? dayjs(pickupDate).isAfter(oneWeekAgo) : false;
    });
    
    filteredPast.sort((a, b) => {
        const dateA = safeToDate(getDisplayRound(b)?.pickupDate)?.getTime() || 0;
        const dateB = safeToDate(getDisplayRound(a)?.pickupDate)?.getTime() || 0;
        return dateA - dateB;
    });

    return {
      ongoingProducts: tempOngoing,
      additionalProducts: tempAdditional,
      visiblePastProducts: filteredPast,
    };
  }, [products]);

  useEffect(() => {
    if (ongoingProducts.length === 0) { setCountdown(null); return; }
    
    const deadlines = ongoingProducts
      // ✅ [FIX] .toDate() 대신 safeToDate 헬퍼 함수 사용
      .map(p => safeToDate(getDisplayRound(p)?.deadlineDate)?.getTime())
      .filter((d): d is number => d !== undefined && d !== null);

    if (deadlines.length === 0) return;
    
    const fastestDeadline = Math.min(...deadlines);
    
    const intervalId = setInterval(() => {
      const remainingSeconds = dayjs(fastestDeadline).diff(dayjs(), 'second');
      if (remainingSeconds <= 0) { setCountdown("마감!"); clearInterval(intervalId); return; }
      const days = Math.floor(remainingSeconds / 86400);
      const hours = Math.floor((remainingSeconds % 86400) / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;
      setCountdown(`${days > 0 ? `${days}일 ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [ongoingProducts]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="customer-page-container">
      <div className="page-section banner-section">
        <BannerSlider banners={banners} />
      </div>

      <ProductSection title={<>🔥 오늘의 공동구매</>} countdownText={countdown}>
        {ongoingProducts.length > 0
          ? ongoingProducts.map(p => <ProductCard key={p.id} product={p} status="ONGOING" />)
          : <div className="no-products-message">진행중인 공동구매가 없습니다.</div>
        }
      </ProductSection>
      
      {additionalProducts.length > 0 && (
        <ProductSection title="⏳ 마감 임박! 추가 예약">
          {additionalProducts.map(p => <ProductCard key={p.id} product={p} status="ADDITIONAL_RESERVATION" />)}
        </ProductSection>
      )}

      {visiblePastProducts.length > 0 && (
        <ProductSection title="🗓️ 지난 공동구매">
          {visiblePastProducts.map(p => <ProductCard key={p.id} product={p} status="PAST" />)}
        </ProductSection>
      )}
    </div>
  );
};

export default ProductListPage;
