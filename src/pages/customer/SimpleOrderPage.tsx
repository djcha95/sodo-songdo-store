// src/pages/customer/SimpleOrderPage.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import type { Product, SalesRound } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import SimpleProductCard from '@/components/customer/SimpleProductCard';
import dayjs from 'dayjs';
// ❌ import 'dayjs/locale/ko'; // 2단계에서 주석처리된 부분은 그대로 유지 (필요하다면) -> 삭제
// ❌ import isBetween from 'dayjs/plugin/isBetween'; // ✅ [수정 1] 플러그인 import 해제 -> 삭제

import { PackageSearch, Clock } from 'lucide-react';
import { getDisplayRound, getDeadlines, determineActionState } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { usePageRefs } from '@/layouts/CustomerLayout';
import { showToast } from '@/utils/toastUtils';
import './SimpleOrderPage.css';
import '@/styles/common.css';
import { Outlet } from 'react-router-dom';

// ❌ [수정 2] 플러그인을 컴포넌트 외부에서 한 번만 확장 -> 삭제
// dayjs.extend(isBetween);
// dayjs.locale('ko');

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

  // ✅ [수정 1] 디바운싱(Debouncing)을 위한 ref 추가
  const lastLoadAtRef = useRef(0);
  const MIN_INTERVAL = 300; // ms (ChatGPT 제안)

  const { primaryRef, secondaryRef } = usePageRefs();

  // 상태 → ref 동기화 (렌더와 분리)
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { lastVisibleRef.current = lastVisible; }, [lastVisible]);

  // 최초 데이터 로딩 (첫 페이지)
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

  // 다음 페이지 로드 (상태 의존 제거, ref 기반)
  const fetchNextPage = useCallback(async () => {
    const cursor = lastVisibleRef.current;
    const { products: newProducts, lastVisible: newLastVisible } =
      await getPaginatedProductsWithStock(10, cursor, null);

    setProducts(prev => [...prev, ...newProducts]);
    setLastVisible(newLastVisible);
    setHasMore(!!newLastVisible && newProducts.length === 10);
  }, []);

  // ✅ [수정 2] 옵저버 콜백 (디바운싱 및 관찰 지연 적용)
  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) return;

    // ★ 디바운스: 최소 간격(300ms) 이내의 중복 호출 방지
    const nowTs = Date.now();
    if (nowTs - lastLoadAtRef.current < MIN_INTERVAL) return;
    lastLoadAtRef.current = nowTs;

    // 동기 락으로 즉시 차단
    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    // 로딩 중에는 센티넬 관찰 해제 → 연쇄 호출 차단
    if (ioRef.current) ioRef.current.unobserve(entry.target);

    (async () => {
      try {
        await fetchNextPage();
      } catch (err: any) {
        showToast('error', err?.message || '상품을 더 불러오는 중 문제가 발생했습니다.');
      } finally {
        setIsLoadingMore(false);
        loadingRef.current = false;

        // ★ 레이아웃 안정화 후 관찰 재개 (Double requestAnimationFrame)
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

  // ✅ [수정 3] 옵저버는 한 번만 생성/유지 (rootMargin 확장)
  useEffect(() => {
    // 기존 옵저버 정리
    ioRef.current?.disconnect();

    // 옵저버 객체 생성
    ioRef.current = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: '600px 0px', // ★ 더 일찍 로드 (300 -> 600)
      threshold: 0,
    });

    // 이 useEffect에서는 관찰 시작하지 않음 (return에서 정리만 담당)
    return () => {
      ioRef.current?.disconnect();
      ioRef.current = null;
    };
  }, [onIntersect]);
  
  // 🚀 [추가된 코드] 옵저버 관찰 지연: 초기 로딩이 완료된 후에만 관찰 시작
  useEffect(() => {
    const node = observerRef.current;
    
    // 로딩 중이거나, 더 볼 상품이 없거나, 옵저버가 준비되지 않았다면 관찰하지 않습니다.
    if (loading || !hasMore || !node || !ioRef.current) return;
    
    // ★ 최초 관찰 시작
    ioRef.current.observe(node);

    // cleanup: 이펙트가 다시 실행되거나 언마운트될 때 관찰 해제
    return () => {
        ioRef.current?.unobserve(node);
    }
  }, [loading, hasMore]); // loading 상태와 hasMore 상태에 의존

  // ✅ 1단계: 진단용 로그 (p.name -> p.id 로 최종 수정)
  useEffect(() => {
    if (!products || products.length === 0) return;

    console.log(`===== [F5/HMR 진단 시작] 총 상품: ${products.length}개 =====`);

    products.forEach((p: Product) => {
      try {
        // 1. productUtils.ts의 실제 함수 시그니처에 맞게 호출
        const round = getDisplayRound(p);
        
        // 2. round가 없으면(표시할 회차가 없으면) 스킵
        if (!round) {
          console.log(`[상품] ${p.id}`, { action: 'NO_DISPLAY_ROUND' }); // 🚨 최종 수정: p.id
          return;
        }

        // 3. 실제 시그니처에 맞게 호출
        const deadlines = getDeadlines(round);
        const action = determineActionState(round, userDocument as any); // useAuth의 userDocument 사용

        console.log(`[상품] ${p.id}`, { // 🚨 최종 수정: p.id
          roundId: round.roundId,
          status: round.status,
          manualStatus: round.manualStatus,
          // (참고) deadlines 객체는 dayjs 객체이므로 .format()으로 봐야 편합니다.
          deadlines: { 
            primaryEnd: deadlines.primaryEnd?.format('YYYY-MM-DD HH:mm:ss'), 
            secondaryEnd: deadlines.secondaryEnd?.format('YYYY-MM-DD HH:mm:ss') 
          },
          action, // (중요) 이 값이 F5와 HMR에서 다른지 확인
        });
      } catch (e: any) {
        console.warn(`[진단오류] ${p.id}`, e.message); // 🚨 최종 수정: p.id
      }
    });

    console.log('===== [F5/HMR 진단 끝] =====');
  }, [products, userDocument]); // ✅ [수정] userDocument 의존성 추가

  // 파생 리스트 메모
  const { primarySaleProducts, secondarySaleProducts, generalPrimarySaleEndDate } = useMemo(() => {
    // dayjs import는 상단에서 처리되었으므로 isBetween 플러그인을 여기서 추가합니다.
    // 이전 require 오류 코드는 제거되었음을 확인합니다.
    // ⚠️ dayjs.extend(isBetween)과 dayjs.locale('ko')가 중앙 초기화되었으므로
    // 이 파일에서는 별도의 플러그인 설정 없이 dayjs를 바로 사용합니다.

    const now = dayjs();
    // ✅ 정렬을 위한 임시 배열의 타입에 sortPrice를 추가합니다.
    const tempPrimary: (ProductWithUIState & { sortPrice: number })[] = [];
    const tempSecondary: (ProductWithUIState & { sortPrice: number })[] = [];
    let earliestPrimaryEnd: dayjs.Dayjs | null = null;

    products.forEach(product => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft') return;

      const { primaryEnd: primaryEndDate, secondaryEnd: secondaryEndDate } = getDeadlines(round);
      const actionState = determineActionState(round, userDocument as any);
      if (actionState === 'ENDED') return;

      const finalPhase = (round.isManuallyOnsite)
        ? 'onsite'
        : (primaryEndDate && now.isBefore(primaryEndDate))
          ? 'primary'
          : (secondaryEndDate && primaryEndDate && now.isBetween(primaryEndDate, secondaryEndDate, null, '(]'))
            ? 'secondary'
            : 'past';

      if (finalPhase === 'past' || finalPhase === 'onsite') return;

      const productWithState: ProductWithUIState = { ...product, phase: finalPhase, displayRound: round, actionState };

      // ⚠️ 상품의 가격을 결정합니다. (SimpleProductCard 로직과 동일하게 첫 번째 옵션 가격 사용)
      const priceForSort = productWithState.displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
      
      const productWithSortPrice: ProductWithUIState & { sortPrice: number } = {
          ...productWithState,
          sortPrice: priceForSort
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

    // ✅ [추가된 정렬 로직] 가격(sortPrice)이 높은 순(내림차순)으로 정렬
    // Array.prototype.sort()는 원본을 변경하므로, map/filter 이후에는 새로운 배열을 받아 정렬해야 합니다.
    // 여기서 tempPrimary와 tempSecondary는 이미 새로운 배열이므로 .sort()를 사용해도 안전합니다.
    const sortedPrimary = tempPrimary.sort((a, b) => b.sortPrice - a.sortPrice);
    const sortedSecondary = tempSecondary.sort((a, b) => b.sortPrice - a.sortPrice);

    return {
      // ✅ 정렬된 배열을 반환
      // 반환 시에는 임시로 추가했던 sortPrice 속성을 제거하고 ProductWithUIState 타입으로 캐스팅합니다.
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

        {/* ✅ [수정 4] 센티넬 + 로더 (레이아웃 점프 방지를 위해 구조 변경) */}
        <div
          ref={observerRef}
          className="infinite-scroll-trigger"
          style={{
            minHeight: '120px', // (↑) 여유 공간 확보 (80 -> 120)
            display: 'flex',
            flexDirection: 'column', // 로더와 end-of-list를 수직 정렬
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          {/* ★ 항상 존재하는 고정 높이 컨테이너 → 레이아웃 점프 방지 */}
          <div
            className="loader-stable"
            style={{
              height: 48, // 로더 실제 높이에 맞춰 고정
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isLoadingMore ? 1 : 0, // ★ 토글은 opacity로
              transition: 'opacity 120ms linear',
              willChange: 'opacity', // 페인트 최적화
              transform: 'translateZ(0)' // GPU 합성
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