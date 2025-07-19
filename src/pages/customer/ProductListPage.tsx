// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { getProducts, getActiveBanners, getReservedQuantitiesMap } from '@/firebase';
import type { Product, Banner, SalesRound } from '@/types';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import SodamallLoader from '@/components/common/SodamallLoader';
import ProductSection from '@/components/customer/ProductSection';
import BannerSlider from '@/components/common/BannerSlider';
import ProductCard from '@/components/customer/ProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch } from 'lucide-react';

import './ProductListPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  return null;
};

const getDisplayRound = (product: Product): SalesRound | null => {
    if (!product.salesHistory || product.salesHistory.length === 0) return null;
    const sellingRound = product.salesHistory.find(r => r.status === 'selling');
    if (sellingRound) return sellingRound;
    
    const now = new Date();
    const futureScheduledRounds = product.salesHistory
      .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! > now)
      .sort((a, b) => safeToDate(a.publishAt)!.getTime() - safeToDate(b.publishAt)!.getTime());
    if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];
  
    const pastRounds = product.salesHistory
      .filter(r => r.status === 'ended' || r.status === 'sold_out')
      .sort((a, b) => safeToDate(b.deadlineDate)!.getTime() - safeToDate(a.deadlineDate)!.getTime());
    if (pastRounds.length > 0) return pastRounds[0];
    
    const nonDraftRounds = product.salesHistory
      .filter(r => r.status !== 'draft')
      .sort((a,b) => safeToDate(b.createdAt)!.getTime() - safeToDate(a.createdAt)!.getTime());
  
    return nonDraftRounds[0] || null;
};

const isLimitedStock = (round: SalesRound): boolean => {
    if (!round.variantGroups || round.variantGroups.length === 0) return false;
    return round.variantGroups.some(vg => vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1);
};


const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [reservedQuantitiesMap, setReservedQuantitiesMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [fetchedProducts, activeBanners, reservedMap] = await Promise.all([
          getProducts(false),
          getActiveBanners(),
          getReservedQuantitiesMap()
        ]);
        setProducts(fetchedProducts);
        setBanners(activeBanners);
        setReservedQuantitiesMap(reservedMap);
      } catch (error) {
        toast.error("데이터를 불러오는 중 문제가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const { todaysProducts, closingSoonProducts, otherActiveProducts, pastProductsByDate } = useMemo(() => {
    const now = dayjs();
    const todayStart = now.startOf('day');
    const todayEnd = now.endOf('day');
    
    const tempTodays: Product[] = [];
    const tempClosingSoon: Product[] = [];
    const tempOthers: Product[] = [];
    const tempPast: Product[] = [];

    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft' || round.status === 'scheduled') return;
      
      const createdAt = safeToDate(round.createdAt);
      const pickupDate = safeToDate(round.pickupDate);
      if (!createdAt || !pickupDate) return;

      const firstDeadline = dayjs(createdAt).add(1, 'day').hour(13).minute(0).second(0);
      const finalDeadline = dayjs(pickupDate).hour(13).minute(0).second(0);

      // ✅ [수정] 품절 여부를 판매 기간 종료 조건과 분리
      if (now.isAfter(finalDeadline)) {
        tempPast.push(product);
      } else if (dayjs(createdAt).isBetween(todayStart, todayEnd, null, '[]')) {
        tempTodays.push(product); // 품절 상품도 여기에 포함
      } else if (now.isAfter(firstDeadline) && isLimitedStock(round)) {
        tempClosingSoon.push(product); // 품절 상품도 여기에 포함
      } else {
        tempOthers.push(product);
      }
    });
    
    // ✅ [수정] 오늘의 공동구매 정렬 로직
    tempTodays.sort((a, b) => {
        const getSortState = (p: Product) => {
            const r = getDisplayRound(p)!;
            const isMultiOption = r.variantGroups.length > 1 || r.variantGroups[0]?.items.length > 1;
            if (isMultiOption) return { sortGroup: 1, value: 0 }; // 옵션 상품은 일단 앞으로

            const vg = r.variantGroups[0];
            const item = vg.items[0];
            const key = `${p.id}-${r.roundId}-${vg.id}`;
            const reserved = reservedQuantitiesMap.get(key) || 0;
            const stock = vg.totalPhysicalStock;
            const remaining = (stock === null || stock === -1) ? Infinity : stock - reserved;

            // 1. 대기(품절) 상품 그룹
            if (remaining < (item.stockDeductionAmount || 1)) {
                return { sortGroup: 3, value: 0 }; 
            }
            // 2. 한정 수량 상품 그룹
            if (stock !== null && stock !== -1) {
                return { sortGroup: 1, value: remaining };
            }
            // 3. 무제한 수량 상품 그룹
            return { sortGroup: 2, value: item.price };
        };

        const stateA = getSortState(a);
        const stateB = getSortState(b);

        // 1순위: 그룹별 정렬 (한정수량 > 무제한 > 대기)
        if (stateA.sortGroup !== stateB.sortGroup) {
            return stateA.sortGroup - stateB.sortGroup;
        }

        // 2순위: 그룹 내 정렬
        if (stateA.sortGroup === 1) { // 한정 수량 그룹
            return stateA.value - stateB.value; // 재고 적은 순 (오름차순)
        }
        if (stateA.sortGroup === 2) { // 무제한 그룹
            return stateB.value - stateA.value; // 가격 높은 순 (내림차순)
        }

        return 0; // 그 외 정렬 불필요
    });
    
    tempClosingSoon.sort((a, b) => {
        const pickupA = safeToDate(getDisplayRound(a)?.pickupDate)?.getTime() || Infinity;
        const pickupB = safeToDate(getDisplayRound(b)?.pickupDate)?.getTime() || Infinity;
        return pickupA - pickupB;
    });

    const pastGroups: { [key: string]: Product[] } = {};
    tempPast.forEach(p => {
        const round = getDisplayRound(p);
        const uploadDate = safeToDate(round?.createdAt);
        if (uploadDate) {
            const dateKey = dayjs(uploadDate).format('YYYY-MM-DD');
            if (!pastGroups[dateKey]) pastGroups[dateKey] = [];
            pastGroups[dateKey].push(p);
        }
    });
    
    const recentPastGroups: { [key: string]: Product[] } = {};
    for (let i = 1; i <= 3; i++) {
        const targetDate = now.subtract(i, 'day').format('YYYY-MM-DD');
        if (pastGroups[targetDate]) {
            recentPastGroups[targetDate] = pastGroups[targetDate];
        }
    }

    return {
      todaysProducts: tempTodays,
      closingSoonProducts: tempClosingSoon,
      otherActiveProducts: tempOthers,
      pastProductsByDate: recentPastGroups,
    };
  }, [products, reservedQuantitiesMap]);

  useEffect(() => {
    if (todaysProducts.length === 0) {
        setCountdown(null);
        return;
    }
    const countdownInterval = setInterval(() => {
        const tomorrow1pm = dayjs().add(1, 'day').hour(13).minute(0).second(0);
        const now = dayjs();
        const diff = tomorrow1pm.diff(now, 'second');
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
  }, [todaysProducts]);

  if (loading) return <SodamallLoader />;

  return (
    <div className="customer-page-container">
      <div className="page-section banner-section"><BannerSlider banners={banners} /></div>
      
      <ProductSection 
        title={<>🔥 오늘의 공동구매</>} 
        countdownText={todaysProducts.length > 0 ? countdown : null}
      >
        {todaysProducts.length > 0 
            ? todaysProducts.map(p => <ProductCard key={p.id} product={p} reservedQuantitiesMap={reservedQuantitiesMap} />)
            : (
                <div className="product-list-placeholder">
                    <PackageSearch size={48} className="placeholder-icon" />
                    <p className="placeholder-text">상품을 준비중입니다</p>
                    <span className="placeholder-subtext">매일 새로운 상품을 기대해주세요!</span>
                </div>
            )
        }
      </ProductSection>
      
      {otherActiveProducts.length > 0 && (
        <ProductSection title={<>🛍️ 진행중인 다른 공구</>}>
            {otherActiveProducts.map(p => <ProductCard key={p.id} product={p} reservedQuantitiesMap={reservedQuantitiesMap} />)}
        </ProductSection>
      )}

      {closingSoonProducts.length > 0 && (
        <ProductSection title={<>⏰ 마감임박! 추가공구</>}>
          {closingSoonProducts.map(p => <ProductCard key={p.id} product={p} reservedQuantitiesMap={reservedQuantitiesMap} />)}
        </ProductSection>
      )}

      <div className="past-products-section">
        {Object.keys(pastProductsByDate).map(date => {
            const productsForDate = pastProductsByDate[date];
            if (!productsForDate || productsForDate.length === 0) return null;

            return (
              <ProductSection 
                key={date} 
                title={<>{dayjs(date).locale('ko').format('M월 D일 (dddd)')} 마감 공구</>}
              >
                {productsForDate.map(p => (
                  <ProductCard key={p.id} product={p} reservedQuantitiesMap={reservedQuantitiesMap} isPastProduct={true} />
                ))}
              </ProductSection>
            );
        })}
      </div>
      
    </div>
  );
};

export default ProductListPage;