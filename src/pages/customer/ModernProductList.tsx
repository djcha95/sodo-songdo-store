// src/pages/customer/ModernProductList.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPaginatedProductsWithStock } from '@/firebase/productService'; 
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { getApp } from 'firebase/app';

import type { Product, SalesRound } from '@/shared/types';
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
import { ChevronRight, Gift } from 'lucide-react'; // ✅ Gift 아이콘 추가
import { showToast } from '@/utils/toastUtils'; // ✅ 토스트 메시지 추가
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

  // ✅ 1. 이벤트(Hero) & 뷰티(Beauty) 상품을 위한 state
  const [heroProducts, setHeroProducts] = useState<Product[]>([]);
  const [beautyProducts, setBeautyProducts] = useState<Product[]>([]);
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

  // ✅ 2. [신규 로직] 이벤트 및 뷰티 상품 먼저 불러오기
  useEffect(() => {
    const fetchSpecialProducts = async () => {
      try {
        const { products: fetched } = await getPaginatedProductsWithStock(100, null, null, 'all'); 
        
        // 1) 이벤트 상품 필터
        const events = fetched.filter(p => {
           const r = getDisplayRound(p);
           const hasEventTag = r && r.eventType && r.eventType !== 'NONE';
           if (!hasEventTag) return false;
           const actionState = determineActionState(r, null); 
           return actionState !== 'ENDED'; 
        });
        setHeroProducts(events);
        
        // 2) 뷰티 상품 필터 (이벤트 타입이 COSMETICS인 것들)
        // 현재는 '아무것도 없는' 상태이므로 빈 배열일 확률이 높지만 로직은 유지
        const beauty = fetched.filter(p => {
          const r = getDisplayRound(p);
          return r && r.eventType === 'COSMETICS';
        });
        setBeautyProducts(beauty);

      } catch (e) {
        console.error("특수 상품 로드 실패", e);
      } finally {
        setHeroLoading(false);
      }
    };

    fetchSpecialProducts();
  }, []);

  // 3. 탭 변경 로직 (일반 상품)
  useEffect(() => {
    const loadTabProducts = async () => {
      setLoading(true);
      setProducts([]); 
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

  // 4. 무한 스크롤 로직
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


  // ✅ 5. 데이터 가공
  
  // (1) 상단 배너용: heroProducts
  const processedEventProducts = useMemo(() => {
    return heroProducts.map(product => {
       const round = getDisplayRound(product);
       return { 
         ...product, 
         displayRound: round as any 
       };
    }).filter(p => p.displayRound);
  }, [heroProducts]);

  // (2) 뷰티 섹션용: beautyProducts
  const processedBeautyProducts = useMemo(() => {
    return beautyProducts.map(product => {
      const round = getDisplayRound(product);
      return { 
        ...product, 
        displayRound: round as any,
        isPreorder: true
      };
    })
    .filter(p => p.displayRound)
    .slice(0, 7);
  }, [beautyProducts]);

  // (3) 하단 리스트용: products
  const normalProducts = useMemo(() => {
    const now = dayjs();
    
    const processed = products
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
          displayRound: round as any,
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

    const normalBase = processed;

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
  }, [products, userDocument, activeTab]); // 중복 필터링 제거하여 모든 상품 표시

  // 자동 페이징
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


  // 이벤트 섹션 메타데이터
  const eventSectionMeta = useMemo(() => {
    if (processedEventProducts.length === 0) return null;
    return { 
      chip: '🎄 연말 & 기획전', 
      title: '지금만 진행되는 한정 특가 모음', 
      sub: '케이크, 계란 같은 특별 기획 상품을 가장 먼저 확인해보세요!' 
    };
  }, [processedEventProducts]);

  const bannerContent = useMemo(() => {
    switch (activeTab) {
      case 'today': return { title: '🔥 오늘의 공구', desc: '오늘 오후 1시 ~ 내일 오후 1시까지 진행되는 하루 한정 공구입니다.' };
      case 'additional': return { title: '🔁 추가 예약', desc: '1차 공구 후 남은 수량을 픽업일 오후 1시까지 추가로 예약 받습니다.' };
      case 'onsite': return { title: '🏢 현장 판매', desc: '온라인 예약 없이 매장에서 바로 구매 가능한 상품입니다.' };
      default: return { title: '📢 송도PICK', desc: '매일 오후 1시 오픈! 오늘 진행 중인 공구를 한눈에 확인해보세요.' };
    }
  }, [activeTab]);

  if (loading && heroLoading && products.length === 0 && heroProducts.length === 0) {
    return <SodomallLoader />;
  }

  const isEmptyAll = processedEventProducts.length === 0 && normalProducts.length === 0 && processedBeautyProducts.length === 0;

  return (
    <>
      {/* ❄️ 눈송이 효과 */}
      <Snowfall
        snowflakeCount={60}
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }}
      />

      <div className="customer-page-container modern-list-page">
        {/* 1. 🎄 기존 이벤트 섹션 */}
        {processedEventProducts.length > 0 && eventSectionMeta && (
          <section className="songdo-event-section">
            <div className="songdo-event-header">
              <div>
                <div className="songdo-event-chip">{eventSectionMeta.chip}</div>
                <h2 className="songdo-event-title">{eventSectionMeta.title}</h2>
                <p className="songdo-event-sub">{eventSectionMeta.sub}</p>
              </div>
            </div>
            <div className="songdo-event-track">
              {processedEventProducts.map((p) => (
                <button
                  key={`event-${p.id}`}
                  className="songdo-event-banner"
                  onClick={() => navigate(`/product/${p.id}`)}
                >
                  <img src={p.imageUrls?.[0]} alt={p.groupName} className="event-banner-img" />
                  <div className="event-banner-tag">기획전</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ✅ 2. [수정됨] 뷰티 런칭 배너 (티저 형태) */}
        {/* 클릭 시 페이지 이동 대신 토스트 메시지 띄움 */}
        <div 
          className="beauty-launch-banner" 
          onClick={() => showToast('info', '🎅 산타가 열심히 포장 중이에요!')}
        >
          <div className="beauty-banner-content">
            {/* 칩 색상을 그레이톤으로 차분하게 변경하여 '준비중' 느낌 전달 */}
            <span className="beauty-chip" style={{background: '#64748B'}}>COMING SOON</span>
            <h2 className="beauty-title">베리맘 · 끌리글램 런칭 준비중!</h2>
            <p className="beauty-desc">설레는 만남을 준비하고 있어요 💖</p>
            {/* CTA 텍스트 변경 */}
            <span className="beauty-cta" style={{color: '#64748B', display:'flex', alignItems:'center'}}>
              조금만 기다려주세요! <Gift size={14} style={{marginLeft:'4px'}} />
            </span>
          </div>
          <div className="beauty-banner-deco">🎁</div>
        </div>

        {/* ✅ 3. 뷰티 사전예약 섹션 (상품이 없으면 자동으로 숨겨짐) */}
        {processedBeautyProducts.length > 0 && (
          <section className="beauty-curation-section">
            <div className="section-header" onClick={() => navigate('/beauty')}>
              <div>
                <span className="small-label">💄 Beauty Pick</span>
                <h3 className="section-title">베리맘 · 끌리글램 뷰티 사전예약</h3>
                <p className="section-sub">송도픽에서만 먼저 만나는 겨울 뷰티 라인</p>
              </div>
              <button className="view-all-btn">
                전체보기 <ChevronRight size={16} />
              </button>
            </div>
            <div className="beauty-product-grid">
              {processedBeautyProducts.map((p) => (
                <ModernProductCard
                  key={`beauty-${p.id}`}
                  product={p}
                  actionState={determineActionState(p.displayRound as any, userDocument as any)}
                  phase={'primary'} 
                  isPreorder={true}
                />
              ))}
            </div>
          </section>
        )}


        {/* 공지사항 배너 */}
        <section 
          className="songdo-notice-banner" 
          style={{background:'rgba(255,255,255,0.1)', border:'none', color:'#fff'}}
        >
            <span className="notice-text" style={{color:'#fff'}}>
            <span className="notice-highlight" style={{color:'#FFD700'}}>{bannerContent.title}: </span>
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
             !loading && (
              <div className="empty-state">
                <p style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8' }}>
                  진행 중인 일반 공구가 없습니다.
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