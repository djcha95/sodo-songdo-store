// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import type { Product, SalesRound } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import dayjs from 'dayjs';
import { PackageSearch, Clock } from 'lucide-react';
import { getDisplayRound, getDeadlines, determineActionState } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { usePageRefs } from '@/layouts/CustomerLayout';
import { showToast } from '@/utils/toastUtils';
import './SimpleOrderPage.css';
import '@/styles/common.css';
import { Outlet } from 'react-router-dom';

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

  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);

  const observerRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  // 렌더와 분리된 동기 락/상태 미러
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastVisibleRef = useRef<any | null>(null);

  // 디바운싱(Debouncing)을 위한 ref
  const lastLoadAtRef = useRef(0);
  const MIN_INTERVAL = 300;

  const { primaryRef, secondaryRef } = usePageRefs();

  // 상태 → ref 동기화
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { lastVisibleRef.current = lastVisible; }, [lastVisible]);

  // 최초 데이터 로딩
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { products: initialProducts, lastVisible: initialLastVisible } =
          await getPaginatedProductsWithStock(10, null, null);

        setProducts(initialProducts);
        setLastVisible(initialLastVisible);
        setHasMore(!!initialLastVisible && initialProducts.length === 10);
      } catch (err: any) {
        setError('상품을 불러오는 중 오류가 발생했습니다.');
        showToast('error', err?.message || '데이터 로딩 중 문제가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // 다음 페이지 로드
  const fetchNextPage = useCallback(async () => {
    const cursor = lastVisibleRef.current;
    const { products: newProducts, lastVisible: newLastVisible } =
      await getPaginatedProductsWithStock(10, cursor, null);

    setProducts(prev => [...prev, ...newProducts]);
    setLastVisible(newLastVisible);
    setHasMore(!!newLastVisible && newProducts.length === 10);
  }, []);

  // 옵저버 콜백
  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) return;

    // 디바운스
    const nowTs = Date.now();
    if (nowTs - lastLoadAtRef.current < MIN_INTERVAL) return;
    lastLoadAtRef.current = nowTs;

    // 동기 락으로 즉시 차단
    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    // 로딩 중에는 센티넬 관찰 해제
    if (ioRef.current) ioRef.current.unobserve(entry.target);

    (async () => {
      try {
        await fetchNextPage();
      } catch (err: any) {
        showToast('error', err?.message || '상품을 더 불러오는 중 문제가 발생했습니다.');
      } finally {
        setIsLoadingMore(false);
        loadingRef.current = false;

        // 레이아웃 안정화 후 관찰 재개
        if (hasMoreRef.current && observerRef.current && ioRef.current) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              ioRef.current && observerRef.current && ioRef.current.observe(observerRef.current);
            });
          });
        } else {
          ioRef.current?.disconnect();
        }
      }
    })();
  }, [fetchNextPage]);

  // 옵저버 생성
  useEffect(() => {
    ioRef.current?.disconnect();
    ioRef.current = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: '600px 0px',
      threshold: 0,
    });

    return () => {
      ioRef.current?.disconnect();
      ioRef.current = null;
    };
  }, [onIntersect]);

  // 옵저버 관찰 시작 제어
  useEffect(() => {
    const node = observerRef.current;
    if (loading || !hasMore || !node || !ioRef.current) return;
    ioRef.current.observe(node);
    return () => {
      ioRef.current?.unobserve(node);
    }
  }, [loading, hasMore]);

  // 파생 리스트 메모
  const { primarySaleProducts, secondarySaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    const now = dayjs();
    const tempPrimary: (ProductWithUIState & { sortPrice: number; isSoldOut: boolean })[] = [];
    const tempSecondary: (ProductWithUIState & { sortPrice: number; isSoldOut: boolean })[] = [];
    let earliestPrimaryEnd: dayjs.Dayjs | null = null;

    products.forEach(product => {
      const round = getDisplayRound(product);
      // productUtils 수정으로 인해 여기서 round가 null이면 '표시할 수 있는 유효한 회차가 없음'을 의미함
      if (!round || round.status === 'draft') return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const actionState = determineActionState(round, userDocument as any);

      // 1. 'ENDED'(판매 종료) 또는 'SCHEDULED'(판매 예정) 상태는 숨김
      if (actionState === 'ENDED' || actionState === 'SCHEDULED') return;

      const finalPhase = (round.isManuallyOnsite)
        ? 'onsite'
        : (primaryEndDate && now.isBefore(primaryEndDate))
          ? 'primary'
          : (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '(]'))
            ? 'secondary'
            : 'past';

      // 2. 'past' 또는 'onsite'는 이 페이지에서 숨김
      if (finalPhase === 'past' || finalPhase === 'onsite') return;

      // 2차 공구(secondary)이고 품절(AWAITING_STOCK)이면 리스트에서 제외
      if (finalPhase === 'secondary' && actionState === 'AWAITING_STOCK') {
        return;
      }

      // 1차 공구 품절 여부 확인
      const isSoldOut = (actionState === 'AWAITING_STOCK');

      const productWithState: ProductWithUIState = { ...product, phase: finalPhase, displayRound: round, actionState };
      const priceForSort = productWithState.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;

      const productWithSortPrice: ProductWithUIState & { sortPrice: number; isSoldOut: boolean } = {
        ...productWithState,
        sortPrice: priceForSort,
        isSoldOut: isSoldOut
      };

      if (finalPhase === 'primary') {
        tempPrimary.push(productWithSortPrice);
        if (primaryEndDate && (!earliestPrimaryEnd || primaryEndDate.isBefore(earliestPrimaryEnd))) {
          earliestPrimaryEnd = primaryEndDate;
        }
      } else if (finalPhase === 'secondary') {
        tempSecondary.push(productWithSortPrice);
      }
    });

    // 정렬 로직
    const sortedPrimary = tempPrimary.sort((a, b) => {
      const isAnniversaryA = a.displayRound.eventType === 'ANNIVERSARY';
      const isAnniversaryB = b.displayRound.eventType === 'ANNIVERSARY';

      if (isAnniversaryA && !isAnniversaryB) return -1;
      if (!isAnniversaryA && isAnniversaryB) return 1;

      if (a.isSoldOut !== b.isSoldOut) {
        return a.isSoldOut ? 1 : -1;
      }

      return b.sortPrice - a.sortPrice;
    });

    const sortedSecondary = tempSecondary.sort((a, b) => b.sortPrice - a.sortPrice);

    return {
      primarySaleProducts: sortedPrimary as ProductWithUIState[],
      secondarySaleProducts: sortedSecondary as ProductWithUIState[],
      generalPrimarySaleEndDate: earliestPrimaryEnd,
    };
  }, [products, userDocument]);

  // 카운트다운
  useEffect(() => {
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
    <>
      <div className="customer-page-container simple-order-page">
        <div className="tab-content-area">
          <div ref={primaryRef} className="content-section">
            {primarySaleProducts.length > 0 && (
              <div className="section-header-split">
                <h2 className="section-title">
                  <span className="tab-icon">🔥</span> 공동구매 진행중
                </h2>
                {countdown && (
                  <div className="countdown-timer-inline">
                    <Clock size={16} />
                    <span>{countdown}</span>
                  </div>
                )}
              </div>
            )}

            {primarySaleProducts.length > 0 ? (
              <div className="simple-product-list">
                {primarySaleProducts.map(p => (
                  <SimpleProductCard
                    key={`${p.id}-${p.displayRound.roundId}`}
                    product={p}
                    actionState={p.actionState}
                  />
                ))}
              </div>
            ) : (
              !loading && secondarySaleProducts.length === 0 && products.length === 0 && (
                <div className="product-list-placeholder">
                  <PackageSearch size={48} />
                  <p>현재 예약 가능한 상품이 없습니다.</p>
                  <span>새로운 상품을 준비 중입니다!</span>
                </div>
              )
            )}
          </div>

          <div ref={secondaryRef} className="content-section">
            {secondarySaleProducts.length > 0 && (
              <>
                <h2 className="section-title">
                  <span className="tab-icon">⏰</span> 추가예약 (픽업시작 전까지)
                </h2>
                <div className="simple-product-list">
                  {secondarySaleProducts.map(p => (
                    <SimpleProductCard
                      key={`${p.id}-${p.displayRound.roundId}`}
                      product={p}
                      actionState={p.actionState}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          ref={observerRef}
          className="infinite-scroll-trigger"
          style={{
            minHeight: '120px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <div
            className="loader-stable"
            style={{
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isLoadingMore ? 1 : 0,
              transition: 'opacity 120ms linear',
              willChange: 'opacity',
              transform: 'translateZ(0)'
            }}
            aria-hidden={!isLoadingMore}
          >
            <SodomallLoader isInline />
          </div>

          {!hasMore && products.length > 0 && (
            <div className="end-of-list">모든 상품을 불러왔습니다.</div>
          )}
        </div>
      </div>

      <Outlet />
    </>
  );
};

export default SimpleOrderPage;