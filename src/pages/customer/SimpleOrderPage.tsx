// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import type { Product, SalesRound } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, Clock } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { getDisplayRound, getDeadlines, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import toast from 'react-hot-toast';
import './SimpleOrderPage.css';
import '@/styles/common.css';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'past';
  displayRound: SalesRound;
  actionState: ProductActionState;
}

const SimpleOrderPage: React.FC = () => {
  const { userDocument } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary'>('primary');
  const [countdown, setCountdown] = useState<string | null>(null);

  const PAGE_SIZE = 10;
  const lastVisibleRef = useRef<number | null>(null);
  const hasMoreRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const getProductsWithStockCallable = useMemo(() => httpsCallable(functions, 'getProductsWithStock'), [functions]);
  
  const { ref: loadMoreRef, inView: isLoadMoreVisible } = useInView({ threshold: 0.1, triggerOnce: false });

  const fetchData = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isInitial) {
      setLoading(true);
      setError(null);
      lastVisibleRef.current = null;
      hasMoreRef.current = true;
    } else {
      if (!hasMoreRef.current) { isFetchingRef.current = false; return; }
      setLoadingMore(true);
    }

    try {
      const result: HttpsCallableResult<any> = await getProductsWithStockCallable({
        pageSize: PAGE_SIZE,
        lastVisible: lastVisibleRef.current
      });

      const { products: newProducts, lastVisible: newLastVisible } = result.data as {
        products: Product[],
        lastVisible: number | null
      };

      startTransition(() => {
        setProducts(prev => {
            const map = new Map(prev.map(p => [p.id, p]));
            (newProducts || []).forEach(p => map.set(p.id, p));
            return isInitial ? (newProducts || []) : Array.from(map.values());
        });
      });
      
      lastVisibleRef.current = newLastVisible;
      hasMoreRef.current = newProducts?.length === PAGE_SIZE && newLastVisible !== null;
    } catch (err: any) {
      setError('상품을 불러오는 중 오류가 발생했습니다.');
      toast.error(err?.message || '데이터 로딩 중 문제가 발생했습니다.');
      hasMoreRef.current = false;
    } finally {
      if (isInitial) setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [getProductsWithStockCallable]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  useEffect(() => {
    if (isLoadMoreVisible && !loading && !loadingMore && hasMoreRef.current) {
      fetchData(false);
    }
  }, [isLoadMoreVisible, loading, loadingMore, fetchData]);

  const { primarySaleProducts, secondarySaleProducts, primarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    
    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft') return;

      const actionState = determineActionState(round as SalesRound, userDocument);
      const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION'].includes(actionState);
      if (!isDisplayableState) return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      
      let finalPhase: 'primary' | 'secondary';
      if (primaryEndDate && now.isBefore(primaryEndDate)) {
          finalPhase = 'primary';
      } else if (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '[]')) {
          finalPhase = 'secondary';
      } else {
          return;
      }

      const productWithState: ProductWithUIState = { 
        ...product, 
        phase: finalPhase,
        displayRound: round as SalesRound,
        actionState,
      };
      
      if (finalPhase === 'primary') tempPrimary.push(productWithState);
      else if (finalPhase === 'secondary') tempSecondary.push(productWithState);
    });
    
    const firstPrimarySaleEndDate = tempPrimary.length > 0
      ? getDeadlines(tempPrimary[0].displayRound).primaryEnd
      : null;

    return {
      primarySaleProducts: tempPrimary.sort((a, b) => {
        // ✅ 1. '대기' 상품을 맨 아래로 보내는 정렬 로직
        const isAWaitlist = a.actionState === 'WAITLISTABLE';
        const isBWaitlist = b.actionState === 'WAITLISTABLE';

        if (isAWaitlist && !isBWaitlist) return 1; // a가 대기면 뒤로
        if (!isAWaitlist && isBWaitlist) return -1; // b가 대기면 앞으로 (a가 앞으로)

        // 둘 다 대기이거나 둘 다 예약 가능이면 가격순으로 정렬
        const priceA = a.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        const priceB = b.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        return priceB - priceA;
      }),
      secondarySaleProducts: tempSecondary.sort((a, b) => {
        const dateA = safeToDate(a.displayRound.pickupDate)?.getTime() ?? Infinity;
        const dateB = safeToDate(b.displayRound.pickupDate)?.getTime() ?? Infinity;
        return dateA - dateB;
      }),
      primarySaleEndDate: firstPrimarySaleEndDate,
    };
  }, [products, userDocument]); 

  useEffect(() => {
    if (!primarySaleEndDate) {
      setCountdown(null);
      return;
    }
    const interval = setInterval(() => {
      const diff = dayjs(primarySaleEndDate).diff(dayjs(), 'second');
      if (diff <= 0) {
        setCountdown('마감!');
        clearInterval(interval);
        return;
      }
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setCountdown(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [primarySaleEndDate]);

  if (loading && products.length === 0) return <SodomallLoader />;
  if (error) return <div className="error-message-container">{error}</div>;

  const productsToShow = activeTab === 'primary' ? primarySaleProducts : secondarySaleProducts;

  return (
    <div className="customer-page-container simple-order-page">
        <div className="tab-container">
            <button className={`tab-btn ${activeTab === 'primary' ? 'active' : ''}`} onClick={() => setActiveTab('primary')}>
                <span className="tab-title">🔥 오늘의 공동구매 ({primarySaleProducts.length})</span>
            </button>
            <button className={`tab-btn ${activeTab === 'secondary' ? 'active' : ''}`} onClick={() => setActiveTab('secondary')}>
                <span className="tab-title">⏰ 추가 예약 ({secondarySaleProducts.length})</span>
            </button>
        </div>

        <div className="simple-product-list">
            {activeTab === 'primary' && countdown && productsToShow.length > 0 && (
              <div className="list-countdown-timer">
                <Clock size={16} />
                <span>마감까지 {countdown}</span>
              </div>
            )}

            {productsToShow.length > 0 ? (
                productsToShow.map(p => <SimpleProductCard key={p.id} product={p as Product & { displayRound: SalesRound }} actionState={p.actionState} />)
            ) : !loading && (
                <div className="product-list-placeholder">
                    <PackageSearch size={48} />
                    <p>현재 예약 가능한 상품이 없습니다.</p>
                </div>
            )}
        </div>

        <div ref={loadMoreRef} className="infinite-scroll-loader">
            {loadingMore && <InlineSodomallLoader />}
        </div>
    </div>
  );
};

export default SimpleOrderPage;