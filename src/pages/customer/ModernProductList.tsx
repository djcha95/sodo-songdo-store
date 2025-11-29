// src/pages/customer/ModernProductList.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/context/AuthContext';
// 👇 getPaginatedProductsWithStock 외에 이벤트 상품만 가져오는 함수가 필요합니다.
// 만약 서비스 파일에 없다면 아래 useEffect 안에서 직접 구현하거나 서비스에 추가해야 합니다.
import { getPaginatedProductsWithStock } from '@/firebase/productService'; 
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore'; // 👈 직접 쿼리용 (임시)
import { getApp } from 'firebase/app'; // 👈 Firebase App

import type { Product } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import ModernProductCard from '@/components/customer/ModernProductCard';
import {
  getDisplayRound,
  getDeadlines,
  determineActionState,
  getStockInfo,
} from '@/utils/productUtils';
import { usePageRefs } from '@/layouts/CustomerLayout';
import { Outlet, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import Snowfall from 'react-snowfall';
import '@/styles/ModernProduct.css';

// ✅ 탭 구성
const TABS = [
  { id: 'all', label: '전체' },
  { id: 'today', label: '🔥 오늘의 공구' },
  { id: 'additional', label: '🔁 추가예약' },
  { id: 'onsite', label: '🏢 현장판매' },
];

const PAGE_SIZE = 20;

const ModernProductList: React.FC = () => {
  const navigate = useNavigate();
  const { userDocument } = useAuth();

  // ✅ 1. 이벤트(Hero) 상품을 위한 별도 state 추가
  const [heroProducts, setHeroProducts] = useState<Product[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  // 일반 상품 state
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'today' | 'additional' | 'onsite'>('all');

  // 무한 스크롤 상태
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);

  const autoFetchCount = useRef(0);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastVisibleRef = useRef<any | null>(null);

  const { primaryRef } = usePageRefs();

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    lastVisibleRef.current = lastVisible;
  }, [lastVisible]);

  // ✅ 2. [신규 로직] 이벤트 상품만 별도로 '먼저' 불러오기
  // 페이지네이션(스크롤)을 기다리지 않고 즉시 로딩합니다.
  useEffect(() => {
    const fetchHeroProducts = async () => {
      try {
        // ※ 주의: 아래는 예시 쿼리입니다. 실제 DB 구조(컬렉션명, 필드명)에 맞춰야 합니다.
        // 보통 'rounds'나 'products'에서 eventType이 NONE이 아닌 것을 쿼리합니다.
        // 만약 productService에 'getActiveEventProducts()' 같은 함수를 만들었다면 그걸 쓰세요.
        
        const db = getFirestore(getApp());
        // 예: 현재 진행중이고, 이벤트 타입이 있는 라운드/상품을 가져온다고 가정
        // (실제로는 기존 getPaginatedProductsWithStock 로직을 참고하여 필터링만 다르게 적용)
        
        // 💡 팁: 가장 쉬운 방법은 '페이지네이션 없이' getPaginatedProductsWithStock을 
        // 탭이 'all'일 때 한 50개 정도 넉넉히 가져와서 클라이언트에서 필터링하는 방법도 있지만,
        // 여기서는 "이벤트"만 타겟팅하는 별도 쿼리를 권장합니다.
        
        // 임시 방편: 일단 로직 분리를 위해 기존 함수를 쓰되, 
        // 실제로는 '이벤트 상품만 가져오는 API'를 호출하는 것이 정석입니다.
        // 여기선 "기존 리스트와 별개로 동작한다"는 구조를 잡습니다.
        
        // (가상 코드: 이벤트 상품 전용 Fetch)
        const { products: events } = await getPaginatedProductsWithStock(50, null, null, 'all'); 
        
        // 받아온 것 중 진짜 이벤트 상품만 골라내기
        const filteredEvents = events.filter(p => {
             const r = getDisplayRound(p);
             return r && r.eventType && r.eventType !== 'NONE';
        });

        setHeroProducts(filteredEvents);
      } catch (e) {
        console.error("이벤트 상품 로드 실패", e);
      } finally {
        setHeroLoading(false);
      }
    };

    fetchHeroProducts();
  }, []);

  // 3. 탭 변경 로직 (일반 상품)
  useEffect(() => {
    const loadTabProducts = async () => {
      setLoading(true);
      setProducts([]); // 탭 바뀔 때 일반 상품 초기화
      setLastVisible(null);
      setHasMore(true);
      autoFetchCount.current = 0;
      isFetchingRef.current = true;

      try {
        const {
          products: initialProducts,
          lastVisible: initialLastVisible,
        } = await getPaginatedProductsWithStock(
          PAGE_SIZE,
          null,
          null,
          activeTab
        );

        setProducts(initialProducts);
        setLastVisible(initialLastVisible);
        setHasMore(!!initialLastVisible && initialProducts.length === PAGE_SIZE);
      } catch (err) {
        console.error('상품 로드 실패:', err);
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    loadTabProducts();
  }, [activeTab]);

  // 4. 무한 스크롤 로직 (기존 유지)
  const fetchNextPage = useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) return;

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const cursor = lastVisibleRef.current;
      const {
        products: newProducts,
        lastVisible: newLastVisible,
      } = await getPaginatedProductsWithStock(
        PAGE_SIZE,
        cursor,
        null,
        activeTab
      );

      setProducts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const uniqueNewProducts = newProducts.filter(
          (p) => !existingIds.has(p.id)
        );
        return [...prev, ...uniqueNewProducts];
      });

      setLastVisible(newLastVisible);
      setHasMore(!!newLastVisible && newProducts.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [activeTab]);

  // ... (IntersectionObserver 부분 기존 유지) ...
  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !isFetchingRef.current && hasMoreRef.current) {
        fetchNextPage();
      }
    },
    [fetchNextPage]
  );

  useEffect(() => {
    if (ioRef.current) ioRef.current.disconnect();
    ioRef.current = new IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: '600px 0px',
      threshold: 0,
    });
    return () => {
      ioRef.current?.disconnect();
    };
  }, [onIntersect]);

  useEffect(() => {
    const node = observerRef.current;
    if (loading || !hasMore || !node || !ioRef.current) return;
    ioRef.current.observe(node);
    return () => {
      if (node) ioRef.current?.unobserve(node);
    };
  }, [loading, hasMore]);


  // ✅ 5. 데이터 가공 (이벤트 섹션용 / 일반 리스트용 분리)
  
  // (1) 상단 배너용: heroProducts State 기반으로 가공
  const processedEventProducts = useMemo(() => {
    return heroProducts.map(product => {
       const round = getDisplayRound(product);
       // 필요하면 actionState 등 계산...
       return { ...product, displayRound: round };
    }).filter(p => p.displayRound);
  }, [heroProducts]);

  // (2) 하단 리스트용: products State 기반 + ✨상단에 있는건 제외✨
  const normalProducts = useMemo(() => {
    const now = dayjs();
    
    // 상단 배너에 이미 떠있는 상품 ID 목록
    const heroIds = new Set(processedEventProducts.map(p => p.id));

    const processed = products
      .filter(p => !heroIds.has(p.id)) // 👈 [중복 제거] 이미 상단에 떴으면 리스트에선 숨김 (선택사항)
      .map((product) => {
        const round = getDisplayRound(product);
        if (!round || round.status === 'draft') return null;

        const { primaryEnd, secondaryEnd } = getDeadlines(round);
        const actionState = determineActionState(
          round,
          userDocument as any
        );

        let phase: 'primary' | 'secondary' | 'onsite' = 'primary';

        if (round.isManuallyOnsite) {
          phase = 'onsite';
        } else {
          if (actionState === 'ENDED' || actionState === 'AWAITING_STOCK')
            return null;

          if (primaryEnd && now.isBefore(primaryEnd)) phase = 'primary';
          else if (secondaryEnd && now.isBefore(secondaryEnd)) phase = 'secondary';
          else return null;
        }

        const vg = round.variantGroups?.[0];
        const stockInfo = vg ? getStockInfo(vg) : null;
        const remaining = stockInfo?.remainingUnits ?? 0;

        return {
          ...product,
          displayRound: round,
          actionState,
          phase,
          isLowStock: remaining > 0 && remaining < 10,
          isClosingSoon:
            phase === 'secondary' &&
            secondaryEnd &&
            secondaryEnd.diff(now, 'hour') < 6,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // 이벤트 타입이 없는(일반) 상품만 필터링 (혹은 탭 로직 적용)
    // *주의: 이미 heroIds로 걸러냈으므로 여기서 eventType 체크는 굳이 안 해도 되지만, 안전장치로 둠
    const normalBase = processed.filter(
       p => (!p.displayRound?.eventType || p.displayRound.eventType === 'NONE')
    );

    // 탭 필터링 적용
    let normalVisible = normalBase;
    if (activeTab === 'today') {
      normalVisible = normalBase.filter((p) => p.phase === 'primary');
    } else if (activeTab === 'additional') {
      normalVisible = normalBase.filter((p) => p.phase === 'secondary');
    } else if (activeTab === 'onsite') {
      normalVisible = normalBase.filter((p) => p.phase === 'onsite');
    } else {
      const score = (p: (typeof normalBase)[number]) =>
        p.phase === 'primary' ? 3 : p.phase === 'secondary' ? 2 : 1;
      normalVisible = [...normalBase].sort((a, b) => score(b) - score(a));
    }

    return normalVisible;
  }, [products, userDocument, activeTab, processedEventProducts]);

  // ... (자동 다음 페이지 로드 useEffect 유지) ...
  useEffect(() => {
     if (
      loading ||
      isLoadingMore ||
      !hasMore ||
      activeTab === 'all' ||
      activeTab === 'onsite'
    )
      return;

    const totalVisible = normalProducts.length;
    if (totalVisible === 0 && autoFetchCount.current < 50) {
      autoFetchCount.current += 1;
      fetchNextPage();
    } else {
      autoFetchCount.current = 0;
    }
  }, [loading, isLoadingMore, hasMore, activeTab, normalProducts.length, fetchNextPage]);


  // ✅ 이벤트 섹션 메타데이터 (processedEventProducts 사용)
  const eventSectionMeta = useMemo(() => {
    if (processedEventProducts.length === 0) return null;

    const types = new Set(
      processedEventProducts
        .map(
          (p) => (p.displayRound as any)?.eventType
        )
        .filter(Boolean)
    );
    // ... (기존 텍스트 로직 그대로 유지) ...
    let chip = '🎄 연말 & 기획전';
    let title = '지금만 진행되는 한정 특가 모음';
    let sub = '케이크, 계란 같은 특별 기획 상품을 가장 먼저 확인해보세요!';
    
    if (types.has('COSMETICS') && types.size === 1) { /*...*/ } 
    // ...
    // (기존 코드의 if/else 로직 복붙해서 쓰시면 됩니다)
    
    // (편의상 중략, 기존 로직 그대로 사용)
    if (types.has('COSMETICS') && types.size === 1) {
      chip = '💄 뷰티 기획전';
      title = '예뻐지는 시간, 뷰티 기획전';
      sub = '클렌징부터 선크림까지, 매일 쓰기 좋은 뷰티템을 모았어요.';
    } else if (types.has('CHRISTMAS') && types.size === 1) {
      chip = '🎄 크리스마스 한정';
      title = '올해만 만나볼 수 있는 크리스마스 특가';
      sub = '연말 파티, 가족 모임을 위한 케이크와 간식을 준비했어요.';
    } else if (types.has('ANNIVERSARY') && types.size === 1) {
      chip = '🎉 1주년 기념';
      title = '소도몰 1주년 감사 기획전';
      sub = '1년 동안 사랑해주셔서 감사합니다.';
    }

    return { chip, title, sub };
  }, [processedEventProducts]);

  const bannerContent = useMemo(() => {
      // ... (기존과 동일)
      switch (activeTab) {
      case 'today': return { title: '🔥 오늘의 공구', desc: '오늘 오후 1시 ~ 내일 오후 1시까지 진행되는 하루 한정 공구입니다.' };
      case 'additional': return { title: '🔁 추가 예약', desc: '1차 공구 후 남은 수량을 픽업일 오후 1시까지 추가로 예약 받습니다.' };
      case 'onsite': return { title: '🏢 현장 판매', desc: '온라인 예약 없이 매장에서 바로 구매 가능한 상품입니다.' };
      default: return { title: '📢 송도공구마켓', desc: '매일 오후 1시 오픈! 오늘 진행 중인 공구를 한눈에 확인해보세요.' };
    }
  }, [activeTab]);

  // ✅ 로딩 처리: 일반 상품 로딩 중이라도 이벤트 상품이 있으면 화면 보여줌
  // (둘 다 로딩 중일 때만 로더 표시)
  if (loading && heroLoading && products.length === 0 && heroProducts.length === 0) {
    return <SodomallLoader />;
  }

  // 데이터 여부 확인
  const isEmptyAll = processedEventProducts.length === 0 && normalProducts.length === 0;

  return (
    <>
      <Snowfall
        snowflakeCount={60}
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }}
      />

      <div className="customer-page-container modern-list-page">
        {/* 2. 🎄 연말/기획전 섹션 (processedEventProducts 사용) */}
        {processedEventProducts.length > 0 && eventSectionMeta && (
          <section className="songdo-event-section">
            <div className="songdo-event-header">
               {/* ... 기존 UI ... */}
              <div>
                <div className="songdo-event-chip">{eventSectionMeta.chip}</div>
                <h2 className="songdo-event-title">{eventSectionMeta.title}</h2>
                <p className="songdo-event-sub">{eventSectionMeta.sub}</p>
              </div>
            </div>

            <div className="songdo-event-track">
              {processedEventProducts.map((p) => {
                const type = (p.displayRound as any)?.eventType;
                let badge = '🎁 기획전';
                if (type === 'ANNIVERSARY') badge = '🎉 1주년 기념';
                else if (type === 'CHRISTMAS') badge = '🎄 크리스마스 한정';
                else if (type === 'COSMETICS') badge = '💄 뷰티 특가';

                return (
                  <button
                    key={`${p.id}-${(p.displayRound as any).roundId}-event`}
                    type="button"
                    className="songdo-event-banner"
                    onClick={() => navigate(`/product/${p.id}`)}
                  >
                    <img src={p.imageUrls?.[0]} alt={p.groupName} className="event-banner-img" />
                    <div className="event-banner-tag">{badge}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 안내 문구 */}
        {processedEventProducts.length > 0 && normalProducts.length > 0 && (
          <section style={{ textAlign: 'center', padding: '6px 0 12px', fontSize: 13, color: '#64748B' }}>
            ↓ 아래로 스크롤하시면 일반 상품들이 나옵니다
          </section>
        )}

        <section className="songdo-notice-banner">
            {/* ... 기존 배너 UI ... */}
            <span className="notice-text">
            <span className="notice-highlight">{bannerContent.title}: </span>
            {bannerContent.desc}
          </span>
        </section>

        {/* 탭 & 리스트 영역 */}
        <nav className="songdo-tabs-wrapper">
          <div className="songdo-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`songdo-tab-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <div ref={primaryRef} className="songdo-product-list">
          {/* normalProducts 사용 */}
          {!isEmptyAll && normalProducts.length > 0 ? (
            normalProducts.map((p) => (
              <ModernProductCard
                key={`${p.id}-${p.displayRound.roundId}`}
                product={p}
                actionState={p.actionState}
                phase={p.phase}
              />
            ))
          ) : (
             // 로딩이 끝났는데도 없으면
             !loading && (
              <div className="empty-state">
                <p style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8' }}>
                  해당하는 상품이 없습니다.
                </p>
              </div>
            )
          )}
        </div>

        <div ref={observerRef} className="infinite-scroll-trigger" style={{ minHeight: '60px' }}>
          {isLoadingMore && <SodomallLoader isInline />}
        </div>
      </div>
      <Outlet />
    </>
  );
};

export default ModernProductList;