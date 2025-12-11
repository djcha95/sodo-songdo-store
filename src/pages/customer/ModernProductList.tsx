// src/pages/customer/ModernProductList.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense, // ✅ Suspense 유지
} from 'react';
import { useAuth } from '../../context/AuthContext';
import { getPaginatedProductsWithStock } from '../../firebase/productService';
import { getUserOrders } from '../../firebase/orderService';

import type { Product } from '../../shared/types';
import SodomallLoader from '../../components/common/SodomallLoader';
import ModernProductCard from '../../components/customer/ModernProductCard';
import {
  getDisplayRound,
  getDeadlines,
  determineActionState,
  getStockInfo,
  safeToDate,
} from '../../utils/productUtils';
import { usePageRefs } from '../../layouts/CustomerLayout';
import { Outlet, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import './ModernProductList.css';

// ❌ [삭제] React.lazy를 사용한 Snowfall 동적 Import 제거
// const LazySnowfall = React.lazy(() => import('react-snowfall'));

// 아이콘은 유지 (Lazy loading)
const LazyChevronRight = React.lazy(() =>
  import('lucide-react').then((module) => ({ default: module.ChevronRight }))
);

// ✅ 탭 구성
const TABS = [
  { id: 'all', label: '전체' },
  { id: 'today', label: '🔥 오늘의 공구' },
  { id: 'additional', label: '🔁 추가예약' },
  { id: 'onsite', label: '🏢 현장판매' },
];

// ✅ 필터 타입 정의
type SourceFilterType = 'all' | 'sodomall' | 'songdopick';

const PAGE_SIZE = 20;

// ✅ 배너 데이터 타입 정의
interface EventBanner {
  id: string;
  chip: string;
  title: string;
  desc: string;
  cta: string;
  bg: string;
  linkType: 'internal' | 'external' | 'none';
  href?: string;
  image?: string;
  imageAlt?: string;
}

// ✅ 상단 배너 데이터
const EVENT_BANNERS: EventBanner[] = [
  {
    id: 'hey-u-beauty',
    chip: '💄 헤이유뷰티룸 제휴',
    title: '멜라즈마 풀페이스 50% 할인',
    desc: '송도픽 고객 전 시술 10% 추가 혜택! 기미·잡티 케어(60만→30만) 단독 특가.',
    cta: '혜택 자세히 보기',
    bg: 'linear-gradient(120deg, #fdfbfb 0%, #ebedee 100%)',
    linkType: 'internal',
    href: '/partner/hey-u-beauty',
    image: '/images/heyu/asd.jpg',
    imageAlt: '헤이유 뷰티룸 매장 전경',
  },
  {
    id: 'berrymom-coming-soon',
    chip: 'Coming Soon',
    title: '베리맘(VERY MOM)',
    desc: '단 1% 나의 아기를 위한 프리미엄 베이비 케어 브랜드',
    cta: '제품을 준비중입니다',
    bg: 'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)',
    linkType: 'none',
    href: '',
    image: '/images/verymom/logo.jpg',
    imageAlt: 'Coming Soon',
  },
];

const ModernProductList: React.FC = () => {
  const navigate = useNavigate();
  const { user, userDocument } = useAuth();

  const [activeBanner, setActiveBanner] = useState(0);

  // ❌ [삭제] 눈 효과 관련 상태 제거
  // const [showSnow, setShowSnow] = useState(false);
  // const [snowflakeCount, setSnowflakeCount] = useState(60);

  // ✅ 이벤트(Hero) & 뷰티 상품
  const [heroProducts, setHeroProducts] = useState<Product[]>([]);
  const [beautyProducts, setBeautyProducts] = useState<Product[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  // ✅ 일반 상품
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'today' | 'additional' | 'onsite'>('all');

  // ✅ 출처 필터
  const [sourceFilter, setSourceFilter] = useState<SourceFilterType>('all');

  // ✅ 사용자 주문 내역 캐싱
  const [myOrderMap, setMyOrderMap] = useState<Record<string, number>>({});

  // ✅ 무한 스크롤 상태
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);

  const autoFetchCount = useRef(0);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastVisibleRef = useRef<any | null>(null);

  // ✅ PageRefs
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = usePageRefs();
  const primaryRef = pageRefs?.primaryRef ?? fallbackRef;

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    lastVisibleRef.current = lastVisible;
  }, [lastVisible]);

  // ❌ [삭제] 눈 효과 (지연 로딩 트리거) useEffect 제거
  /*
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobile = window.innerWidth < 768;
    setSnowflakeCount(isMobile ? 30 : 60);

    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq && mq.matches) {
      setShowSnow(false);
      return;
    }

    const t = setTimeout(() => {
      setShowSnow(true);
    }, 400);

    return () => clearTimeout(t);
  }, []);
  */

  // ✅ 배너 슬라이드
  useEffect(() => {
    if (EVENT_BANNERS.length <= 1) return;
    const timer = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % EVENT_BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // ✅ 주문 내역 한 번에 불러오기
  const fetchMyOrders = useCallback(async () => {
    if (!user) return;
    try {
      const orders = await getUserOrders(user.uid);
      const counts: Record<string, number> = {};

      orders.forEach((order) => {
        if (order.status === 'CANCELED' || order.status === 'LATE_CANCELED') return;
        order.items.forEach((item) => {
          const key = `${item.roundId}_${item.itemId}`;
          counts[key] = (counts[key] || 0) + item.quantity;
        });
      });

      setMyOrderMap(counts);
    } catch (err) {
      console.error('주문 내역 로드 실패:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchMyOrders();
  }, [fetchMyOrders]);

  // ✅ 특수 상품 로드
  useEffect(() => {
    const fetchSpecialProducts = async () => {
      try {
        const { products: fetched } = await getPaginatedProductsWithStock(300, null, null, 'all');

        // 이벤트 상품
        const events = fetched.filter((p) => {
          const r = getDisplayRound(p);
          const hasEventTag = r && r.eventType && r.eventType !== 'NONE';
          if (!hasEventTag) return false;
          const actionState = determineActionState(r, null);
          return actionState !== 'ENDED';
        });
        setHeroProducts(events);

        // 뷰티 상품
        const beauty = fetched.filter((p) => {
          const r = getDisplayRound(p);
          return r && r.eventType === 'COSMETICS';
        });
        setBeautyProducts(beauty);
      } catch (e) {
        console.error('특수 상품 로드 실패', e);
      } finally {
        setHeroLoading(false);
      }
    };

    fetchSpecialProducts();
  }, []);

  // ✅ 탭 변경 시 로드
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
        } = await getPaginatedProductsWithStock(PAGE_SIZE, null, null, activeTab);

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

  // ✅ 무한 스크롤 - 다음 페이지
  const fetchNextPage = useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) return;

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const cursor = lastVisibleRef.current;
      const {
        products: newProducts,
        lastVisible: newLastVisible,
      } = await getPaginatedProductsWithStock(PAGE_SIZE, cursor, null, activeTab);

      setProducts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const uniqueNewProducts = newProducts.filter((p) => !existingIds.has(p.id));
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

  // ✅ IntersectionObserver
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

  // ✅ 데이터 가공 로직들...
  const processedEventProducts = useMemo(() => {
    return heroProducts
      .map((product) => {
        const round = getDisplayRound(product);
        return { ...product, displayRound: round as any };
      })
      .filter((p) => p.displayRound);
  }, [heroProducts]);

  const processedBeautyProducts = useMemo(() => {
    return beautyProducts
      .map((product) => {
        const round = getDisplayRound(product);
        return { ...product, displayRound: round as any, isPreorder: true };
      })
      .filter((p) => p.displayRound)
      .slice(0, 7);
  }, [beautyProducts]);

  const normalProducts = useMemo(() => {
    const now = dayjs();
    const processed = products
      .map((product) => {
        const round = getDisplayRound(product);
        if (!round || round.status === 'draft') return null;

        const { primaryEnd, secondaryEnd } = getDeadlines(round);
        const actionState = determineActionState(round, userDocument as any);
        let phase: 'primary' | 'secondary' | 'onsite' = 'primary';

        if (round.isManuallyOnsite) {
          phase = 'onsite';
        } else {
          if (
            actionState === 'ENDED' ||
            actionState === 'AWAITING_STOCK' ||
            actionState === 'SCHEDULED'
          )
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

    let normalVisible = processed;

    if (activeTab === 'today') {
      normalVisible = processed.filter((p) => p.phase === 'primary');
    } else if (activeTab === 'additional') {
      const filtered = processed.filter((p) => p.phase === 'secondary');
      normalVisible = filtered.sort((a, b) => {
        const dateA = safeToDate(a.displayRound.pickupDate)?.getTime() || 0;
        const dateB = safeToDate(b.displayRound.pickupDate)?.getTime() || 0;
        return dateA - dateB;
      });
    } else if (activeTab === 'onsite') {
      normalVisible = processed.filter((p) => p.phase === 'onsite');
    } else {
      const score = (p: (typeof processed)[number]) =>
        p.phase === 'primary' ? 3 : p.phase === 'secondary' ? 2 : 1;
      normalVisible = [...processed].sort((a, b) => score(b) - score(a));
    }

    if (sourceFilter === 'sodomall') {
      normalVisible = normalVisible.filter((p) => {
        const sourceType = p.displayRound.sourceType ?? 'SODOMALL';
        return sourceType !== 'SONGDOPICK_ONLY';
      });
    } else if (sourceFilter === 'songdopick') {
      normalVisible = normalVisible.filter((p) => {
        const sourceType = p.displayRound.sourceType ?? 'SODOMALL';
        return sourceType === 'SONGDOPICK_ONLY';
      });
    }

    return normalVisible;
  }, [products, userDocument, activeTab, sourceFilter]);

  // ✅ 자동 페이징
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
    if (totalVisible === 0 && autoFetchCount.current < 3) {
      autoFetchCount.current += 1;
      fetchNextPage();
    } else {
      autoFetchCount.current = 0;
    }
  }, [loading, isLoadingMore, hasMore, activeTab, normalProducts.length, fetchNextPage]);

  // ✅ 섹션 메타 및 배너 콘텐츠
  const eventSectionMeta = useMemo(() => {
  if (processedEventProducts.length === 0) return null;
  return {
    chip: 'SPECIAL 기획전',
    title: '지금만 진행되는 한정 특가 모음',
    sub: '케이크, 계란 같은 특별 기획 상품을 가장 먼저 확인해보세요!',
  };
}, [processedEventProducts]);


  const bannerContent = useMemo(() => {
    switch (activeTab) {
      case 'today':
        return {
          title: '🔥 오늘의 공구',
          desc: '오늘 오후 1시 ~ 내일 오후 1시까지 진행되는 하루 한정 공구입니다.',
        };
      case 'additional':
        return {
          title: '🔁 추가 예약',
          desc: '1차 공구 후 남은 수량을 픽업일 오후 1시까지 추가로 예약 받습니다.',
        };
      case 'onsite':
        return {
          title: '🏢 현장 판매',
          desc: '온라인 예약 없이 매장에서 바로 구매 가능한 상품입니다.',
        };
      default:
        return {
          title: '📢 송도PICK',
          desc: '매일 오후 1시 오픈! 오늘 진행 중인 공구를 한눈에 확인해보세요.',
        };
    }
  }, [activeTab]);

  const getPurchasedCountForProduct = (product: Product): number => {
    const round = getDisplayRound(product);
    if (!round) return 0;
    const vg = round.variantGroups?.[0];
    const item = vg?.items?.[0];
    if (!item) return 0;
    return myOrderMap[`${round.roundId}_${item.id}`] || 0;
  };

  if (loading && products.length === 0) {
    return <SodomallLoader />;
  }

  const isEmptyAll =
    processedEventProducts.length === 0 &&
    normalProducts.length === 0 &&
    processedBeautyProducts.length === 0;

  return (
    <>
      {/* ❌ [삭제] Snowfall Lazy Loading 적용 부분 제거 */}
      {/*
      {showSnow && (
        <Suspense fallback={<div />}>
          <LazySnowfall
            snowflakeCount={snowflakeCount}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          />
        </Suspense>
      )}
      */}

      <div className="customer-page-container modern-list-page">
        {EVENT_BANNERS.length > 0 && !heroLoading && (
          <section className="event-hero-wrapper">
             <div
              className="event-hero-slider"
              style={{ transform: `translateX(-${activeBanner * 100}%)` }}
            >
              {EVENT_BANNERS.map((banner) => (
                <div
                  key={banner.id}
                  className="event-hero-slide"
                  style={{ background: banner.bg }}
                  onClick={() => {
                    if (banner.linkType === 'internal' && banner.href) {
                      navigate(banner.href);
                    } else if (banner.linkType === 'external' && banner.href) {
                      window.open(banner.href, '_blank');
                    }
                  }}
                >
                  <div className="event-hero-inner">
                    <div className="event-hero-content">
                      <span className="event-hero-chip">{banner.chip}</span>
                      <h2 className="event-hero-title">{banner.title}</h2>
                      <p className="event-hero-desc">{banner.desc}</p>
                      <div className="event-hero-cta">{banner.cta}</div>
                    </div>

                    {banner.image && (
                      <div
                        className={`event-hero-image-wrap ${
                          banner.id === 'hey-u-beauty' ? 'heyu-bw' : ''
                        }`}
                      >
                        <img
                          src={banner.image}
                          alt={banner.imageAlt ?? banner.title}
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="event-hero-dots">
              {EVENT_BANNERS.map((banner, index) => (
                <button
                  key={banner.id}
                  type="button"
                  className={`event-hero-dot ${
                    index === activeBanner ? 'active' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBanner(index);
                  }}
                />
              ))}
            </div>
          </section>
        )}

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
                  <img
                    src={p.imageUrls?.[0]}
                    alt={p.groupName}
                    className="event-banner-img"
                  />
                  <div className="event-banner-tag">기획전</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {processedBeautyProducts.length > 0 && (
          <section className="beauty-curation-section">
            <div className="section-header" onClick={() => navigate('/beauty')}>
              <div>
                <span className="small-label">💄 Beauty Pick</span>
                <h3 className="section-title">베리맘 · 끌리글램 뷰티 사전예약</h3>
                <p className="section-sub">
                  송도픽에서만 먼저 만나는 겨울 뷰티 라인
                </p>
              </div>
              <button className="view-all-btn">
                {/* ✅ LazyChevronRight 사용 (Suspense 적용) */}
                전체보기 
                <Suspense fallback={null}>
                  <LazyChevronRight size={16} />
                </Suspense>
              </button>
            </div>
            <div className="beauty-product-grid">
              {processedBeautyProducts.map((p) => (
                <ModernProductCard
                  key={`beauty-${p.id}`}
                  product={p}
                  actionState={determineActionState(
                    p.displayRound as any,
                    userDocument as any
                  )}
                  phase={'primary'}
                  isPreorder={true}
                  myPurchasedCount={getPurchasedCountForProduct(p)}
                  onPurchaseComplete={fetchMyOrders}
                />
              ))}
            </div>
          </section>
        )}

        {/* ✅ [수정] 공지사항 배너: 인라인 스타일 제거 (CSS 클래스로 제어) */}
        <section className="songdo-notice-banner">
          <span className="notice-text">
            <span className="notice-highlight">
              {bannerContent.title}:
            </span>
            {' '}{bannerContent.desc}
          </span>
        </section>

        <nav className="songdo-tabs-wrapper">
          <div className="songdo-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`songdo-tab-item ${
                  activeTab === tab.id ? 'active' : ''
                }`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="source-filter-row">
            <button
              className={`source-filter-btn ${
                sourceFilter === 'all' ? 'active' : ''
              }`}
              onClick={() => setSourceFilter('all')}
            >
              전체
            </button>
            <div className="filter-divider"></div>
            <button
              className={`source-filter-btn ${
                sourceFilter === 'sodomall' ? 'active' : ''
              }`}
              onClick={() => setSourceFilter('sodomall')}
            >
              소도몰 공구
            </button>
            <button
              className={`source-filter-btn ${
                sourceFilter === 'songdopick' ? 'active' : ''
              }`}
              onClick={() => setSourceFilter('songdopick')}
            >
              송도픽 단독
            </button>
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
                myPurchasedCount={getPurchasedCountForProduct(p)}
                onPurchaseComplete={fetchMyOrders}
              />
            ))
          ) : (
            !loading && (
              <div className="empty-state">
                <p
                  style={{
                    padding: '60px 0',
                    textAlign: 'center',
                    color: '#94A3B8',
                  }}
                >
                  진행 중인 일반 공구가 없습니다.
                </p>
              </div>
            )
          )}
        </div>

        <div
          ref={observerRef}
          className="infinite-scroll-trigger"
          style={{ minHeight: '60px' }}
        >
          {isLoadingMore && <SodomallLoader isInline />}
        </div>
      </div>

      <Outlet />
    </>
  );
};

export default ModernProductList;