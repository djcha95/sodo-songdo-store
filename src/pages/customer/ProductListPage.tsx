// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { getProducts, getActiveBanners } from '@/firebase';
import type { Product, Banner, SalesRound } from '@/types';
import toast from 'react-hot-toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import ProductSection from '@/components/customer/ProductSection';
import BannerSlider from '@/components/BannerSlider';
import ProductCard from '@/components/customer/ProductCard';
import dayjs from 'dayjs';

import './ProductListPage.css';
import '@/styles/common.css';

const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) {
    return null;
  }
  const activeRounds = product.salesHistory.filter((r: SalesRound) => r.status === 'selling' || r.status === 'scheduled');
  if (activeRounds.length > 0) {
    return activeRounds.sort((a: SalesRound, b: SalesRound) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  }
  const nonDraftRounds = product.salesHistory.filter((r: SalesRound) => r.status !== 'draft');
  if (nonDraftRounds.length > 0) {
    return nonDraftRounds.sort((a: SalesRound, b: SalesRound) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  }
  return null;
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

      const deadline = dayjs(round.deadlineDate.toDate());
      const finalPickupDeadline = dayjs(round.pickupDate.toDate()).hour(13).minute(0).second(0);
      
      const isTerminalStatus = round.status === 'ended' || round.status === 'sold_out';
      if (isTerminalStatus || now.isAfter(finalPickupDeadline)) {
        tempPast.push(product);
        return;
      }

      const totalStock = round.variantGroups?.reduce((acc, vg) => {
          if (vg.totalPhysicalStock != null && vg.totalPhysicalStock !== -1) return acc + vg.totalPhysicalStock;
          return acc + (vg.items?.reduce((itemAcc, item) => itemAcc + (item.stock === -1 ? Infinity : (item.stock || 0)), 0) || 0);
      }, 0) ?? 0;

      if (totalStock <= 0 && totalStock !== Infinity) {
          tempPast.push(product);
          return;
      }

      if (now.isBefore(deadline)) {
        tempOngoing.push(product);
      } else {
        tempAdditional.push(product);
      }
    });

    tempAdditional.sort((a, b) => (getDisplayRound(a)?.pickupDate.toMillis() || 0) - (getDisplayRound(b)?.pickupDate.toMillis() || 0));
    
    const oneWeekAgo = dayjs().subtract(7, 'day');
    const filteredPast = tempPast.filter(product => {
      const round = getDisplayRound(product);
      if (!round) return false;
      const pickupDate = dayjs(round.pickupDate.toDate());
      return pickupDate.isAfter(oneWeekAgo);
    });
    filteredPast.sort((a, b) => (getDisplayRound(b)?.pickupDate.toMillis() || 0) - (getDisplayRound(a)?.pickupDate.toMillis() || 0));

    return {
      ongoingProducts: tempOngoing,
      additionalProducts: tempAdditional,
      visiblePastProducts: filteredPast,
    };
  }, [products]);

  useEffect(() => {
    if (ongoingProducts.length === 0) { setCountdown(null); return; }
    const deadlines = ongoingProducts.map(p => getDisplayRound(p)!.deadlineDate.toDate().getTime());
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