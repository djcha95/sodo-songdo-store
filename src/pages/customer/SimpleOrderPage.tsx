// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPaginatedProductsWithStock } from '@/firebase/productService'; // ✅ [수정] 새 서비스 함수 import
import type { Product, SalesRound } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isBetween from 'dayjs/plugin/isBetween';
import { PackageSearch, Clock } from 'lucide-react';
import { getDisplayRound, getDeadlines, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { usePageRefs } from '@/layouts/CustomerLayout';
import { showToast } from '@/utils/toastUtils';
import './SimpleOrderPage.css';
import '@/styles/common.css';
import { Outlet } from 'react-router-dom';

dayjs.extend(isBetween);
dayjs.locale('ko');

interface ProductWithUIState extends Product {
  phase: 'primary' | 'secondary' | 'onsite' | 'past';
  displayRound: SalesRound;
  actionState: ProductActionState;
}

const SimpleOrderPage: React.FC = () => {
  const { userDocument } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // ✅ [추가] 인피니트 스크롤을 위한 상태
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);
  const observerRef = useRef<HTMLDivElement | null>(null);

  const { primaryRef, secondaryRef } = usePageRefs();

  // ✅ [수정] 데이터 로딩 함수 (페이지네이션 적용)
  const loadMoreProducts = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const { products: newProducts, lastVisible: newLastVisible } = await getPaginatedProductsWithStock(10, lastVisible, null);
      
      setProducts(prev => [...prev, ...newProducts]);
      setLastVisible(newLastVisible);
      
      if (!newLastVisible || newProducts.length < 10) {
        setHasMore(false);
      }
    } catch (err: any) {
      showToast('error', err?.message || '상품을 더 불러오는 중 문제가 발생했습니다.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, lastVisible]);

  // ✅ [추가] IntersectionObserver를 사용한 인피니트 스크롤 구현
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMoreProducts();
        }
      },
      { threshold: 1.0 }
    );

    const currentObserverRef = observerRef.current;
    if (currentObserverRef) {
      observer.observe(currentObserverRef);
    }

    return () => {
      if (currentObserverRef) {
        observer.unobserve(currentObserverRef);
      }
    };
  }, [hasMore, isLoadingMore, loadMoreProducts]);

  // ✅ [수정] 최초 데이터 로딩 로직 (첫 페이지만 불러옴)
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { products: initialProducts, lastVisible: initialLastVisible } = await getPaginatedProductsWithStock(10, null, null);
        setProducts(initialProducts);
        setLastVisible(initialLastVisible);
        if (!initialLastVisible || initialProducts.length < 10) {
          setHasMore(false);
        }
      } catch (err: any) {
        setError('상품을 불러오는 중 오류가 발생했습니다.');
        showToast('error', err?.message || '데이터 로딩 중 문제가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []); // 최초 한 번만 실행


  const { primarySaleProducts, secondarySaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    // ... (상품 분류 로직은 기존과 동일)
    const now = dayjs();
    const tempPrimary: ProductWithUIState[] = [];
    const tempSecondary: ProductWithUIState[] = [];
    products.forEach(product => {
      const round = getDisplayRound(product);
      // ✅ [수정] getDisplayRound에서 수동 종료/매진된 상품은 이미 필터링되지만, 한번 더 확인합니다.
      if (!round || round.status === 'draft') return; 
      
      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      
      // ✅ [수정] determineActionState를 호출하여 'ENDED' 상태인지 확인합니다.
      const actionState = determineActionState(round, userDocument as any);
      
      // 'ENDED' 상태(수동 종료, 재고 소진 등)인 상품은 노출하지 않습니다.
      if (actionState === 'ENDED') return;

      const finalPhase = (round.isManuallyOnsite) ? 'onsite' : (primaryEndDate && now.isBefore(primaryEndDate)) ? 'primary' : (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '(]')) ? 'secondary' : 'past';
      
      // 'past'나 'onsite'는 SimpleOrderPage에서 노출하지 않습니다.
      if (finalPhase === 'past' || finalPhase === 'onsite') return; 
      
      const productWithState: ProductWithUIState = { ...product, phase: finalPhase, displayRound: round, actionState };
      
      if (finalPhase === 'primary') tempPrimary.push(productWithState);
      else if (finalPhase === 'secondary') tempSecondary.push(productWithState);
    });
    return {
      primarySaleProducts: tempPrimary,
      secondarySaleProducts: tempSecondary,
      generalPrimarySaleEndDate: tempPrimary.length > 0 ? getDeadlines(tempPrimary[0].displayRound).primaryEnd : null,
    };
  }, [products, userDocument]);

  useEffect(() => {
    // ... (카운트다운 로직은 기존과 동일)
    if (!generalPrimarySaleEndDate) { setCountdown(null); return; }
    const interval = setInterval(() => {
      const diff = dayjs(generalPrimarySaleEndDate).diff(dayjs(), 'second');
      if (diff <= 0) { setCountdown('마감!'); clearInterval(interval); return; }
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setCountdown(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [generalPrimarySaleEndDate]);


  if (loading && products.length === 0) return <SodomallLoader />;
  if (error) return <div className="error-message-container">{error}</div>;

  return (
    <> {/* ✅ [수정] 전체를 Fragment로 감싸줍니다. */}
      <div className="customer-page-container simple-order-page">
        <div className="tab-content-area">
        <div ref={primaryRef} className="content-section">
          {primarySaleProducts.length > 0 && ( <div className="section-header-split"><h2 className="section-title"><span className="tab-icon">🔥</span> 공동구매 진행중</h2>{countdown && (<div className="countdown-timer-inline"><Clock size={16} /><span>{countdown}</span></div>)}</div>)}
          {primarySaleProducts.length > 0 ? (
            <div className="simple-product-list">{primarySaleProducts.map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p} actionState={p.actionState} />)}</div>
          ) : ( !loading && secondarySaleProducts.length === 0 && products.length === 0 && <div className="product-list-placeholder"><PackageSearch size={48} /><p>현재 예약 가능한 상품이 없습니다.</p><span>새로운 상품을 준비 중입니다!</span></div> )}
        </div>
        <div ref={secondaryRef} className="content-section">
          {secondarySaleProducts.length > 0 && (<> <h2 className="section-title"><span className="tab-icon">⏰</span> 추가예약 (픽업시작 전까지)</h2><div className="simple-product-list">{secondarySaleProducts.map(p => <SimpleProductCard key={`${p.id}-${p.displayRound.roundId}`} product={p} actionState={p.actionState} />)}</div></>)}
        </div>
      </div>
      
      <div ref={observerRef} className="infinite-scroll-trigger">
        {isLoadingMore && <SodomallLoader isInline />}
        {!hasMore && products.length > 0 && <div className="end-of-list">모든 상품을 불러왔습니다.</div>}
      </div>
    </div>

      {/* ✅ [추가] 상세 페이지 모달(ProductDetailPage)이 렌더링될 위치입니다. */}
      <Outlet />
    </>
  );
};

export default SimpleOrderPage;
