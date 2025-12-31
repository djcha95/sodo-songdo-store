// src/pages/customer/ModernProductList.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from 'react';
import { useAuth } from '../../context/AuthContext';
import { getPaginatedProductsWithStock } from '../../firebase/productService';
import { getUserOrders } from '../../firebase/orderService';
import type { Product } from '../../shared/types';
import ModernProductThumbCard from '../../components/customer/ModernProductThumbCard';
import { useSearchParams, Outlet, useNavigate } from 'react-router-dom';
import {
  getDisplayRound,
  getDeadlines,
  determineActionState,
  getStockInfo,
  safeToDate,
} from '../../utils/productUtils';
import { usePageRefs } from '../../layouts/CustomerLayout';
import dayjs from 'dayjs';
import './ModernProductList.css';

const LazyChevronRight = React.lazy(() =>
  import('lucide-react').then((module) => ({ default: module.ChevronRight }))
);
const LazyShoppingBag = React.lazy(() =>
  import('lucide-react').then((module) => ({ default: module.ShoppingBag }))
);

type TabId = 'all' | 'today' | 'tomorrow' | 'special' | 'additional' | 'onsite' | 'lastchance';
const PAGE_SIZE = 30;

// ✅ [복구] 메인 홈 슬라이드 배너 데이터 (베리맘, 헤이유 등)
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

const EVENT_BANNERS: EventBanner[] = [
  // ✅ [추가] 2026 새해 축하 배너
  {
    id: 'new-year-2026',
    chip: '🎊 Happy New Year',
    title: '2026년 새해를 맞이하며',
    desc: '새로운 한 해에도 송도픽과 함께하세요! 감사합니다 ✨',
    cta: '',
    bg: 'linear-gradient(135deg, #FF6B6B 0%, #FFD93D 50%, #6BCF7F 100%)',
    linkType: 'none',
    image: undefined,
    imageAlt: '2026 새해',
  },
  {
    id: 'berrymom-open',
    chip: '단독 예약특가 런칭',
    title: '베리맘(VERY MOM) 프리미엄',
    desc: '온 가족이 함께 쓰는 최상급 케어, 오직 송도픽에서만 ✨',
    cta: '특별 혜택가로 예약하기',
    bg: 'linear-gradient(135deg, #FDFBF7 0%, #EFE5D6 100%)',
    linkType: 'internal',
    href: '/beauty',
    image: '/images/verymom/logo.jpg',
    imageAlt: '베리맘 런칭',
  },
  {
    id: 'hey-u-beauty',
    chip: '💄 헤이유뷰티룸 제휴',
    title: '멜라즈마 풀페이스 50% 할인',
    desc: '송도픽 고객 전 시술 10% 추가 혜택! 기미·잡티 케어 특가.',
    cta: '혜택 자세히 보기',
    bg: 'linear-gradient(120deg, #fdfbfb 0%, #ebedee 100%)',
    linkType: 'internal',
    href: '/partner/hey-u-beauty',
    image: '/images/heyu/asd.jpg',
    imageAlt: '헤이유 뷰티룸',
  },
  {
    id: 'last-chance',
    chip: '⚡ 마지막 찬스',
    title: '⚡ 마지막 찬스',
    desc: '재고 3개 이하! 놓치면 후회하는 특가 상품',
    cta: '지금 바로 확인하기',
    bg: '#FEF2F2',
    linkType: 'internal',
    href: '/?tab=lastchance',
    image: undefined,
    imageAlt: '마지막 찬스',
  },
  {
    id: 'additional-sale',
    chip: '🔁 추가공구',
    title: '🔁 추가공구',
    desc: '아쉽게 놓친 상품, 잔여 수량 줍줍 찬스',
    cta: '추가공구 보기',
    bg: '#F3F4F6',
    linkType: 'internal',
    href: '/?tab=additional',
    image: undefined,
    imageAlt: '추가공구',
  },
];

// ✅ [유지] 탭별 상단 배너 (각 탭 진입 시 보이는 배너)
const TAB_BANNERS: Record<string, { title: string; desc: string; bg: string; imageUrl?: string }> = {
  today: {
    title: "🔥 오늘의 공구",
    desc: "매일 오후 2~3시 오픈! 미리미리 좋은 물건 예약해요!",
    bg: "#FFF1F2",
  },
  tomorrow: {
    title: "🚀 내일 바로 픽업가능",
    desc: "기다림 없이 내일 바로 픽업하세요!",
    bg: "#ECFEFF",
  },
  special: {
    title: "✨ 기획전",
    desc: "특별한 가격과 구성, 한정 수량 이벤트",
    bg: "#FFFBEB",
  },
  additional: {
    title: "🔁 추가공구",
    desc: "아쉽게 놓친 상품, 잔여 수량 줍줍 찬스",
    bg: "#F3F4F6",
  },
  onsite: {
    title: "🏢 현장판매",
    desc: "예약 없이 매장에서 바로 구매 가능",
    bg: "#F0FDF4",
  },
  lastchance: {
    title: "⚡ 마지막 찬스",
    desc: "재고 3개 이하! 놓치면 후회하는 특가 상품",
    bg: "#FEF2F2",
  },
};

const ModernProductList: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const rawTab = searchParams.get('tab') || 'home';
  const activeTab = (rawTab === 'home') ? 'all' : rawTab as TabId;
  const fetchTab: TabId = activeTab === 'onsite' ? 'onsite' : 'all';
  const { user, userDocument } = useAuth();

  // ✅ [복구] 배너 슬라이드 상태
  const [activeBanner, setActiveBanner] = useState(0);

  const [heroProducts, setHeroProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [myOrderMap, setMyOrderMap] = useState<Record<string, number>>({});

  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);

  const observerRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastVisibleRef = useRef<any | null>(null);

  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = usePageRefs();
  const primaryRef = pageRefs?.primaryRef ?? fallbackRef;

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { lastVisibleRef.current = lastVisible; }, [lastVisible]);

  // ✅ [복구] 배너 자동 슬라이드 타이머
  useEffect(() => {
    if (EVENT_BANNERS.length <= 1) return;
    const timer = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % EVENT_BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // 주문 내역 로드
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
    } catch (err) { console.error(err); }
  }, [user]);
  useEffect(() => { fetchMyOrders(); }, [fetchMyOrders]);

  // 특수 상품(기획전) 로드
  useEffect(() => {
  const fetchSpecialProducts = async () => {
    try {
      const { products: fetched } = await getPaginatedProductsWithStock(300, null, null, 'all');
      const events = fetched.filter((p) => {
        const r = getDisplayRound(p);
        // ✅ [수정] 'PREMIUM'과 'COSMETICS'를 제외 목록에서 삭제하여 기획전 탭에 노출되도록 변경
        const hasEventTag = r && r.eventType && !['NONE'].includes(r.eventType);
        return hasEventTag && determineActionState(r, null) !== 'ENDED';
      });
      setHeroProducts(events);
    } catch (e) { console.error(e); }
  };
  fetchSpecialProducts();
}, []);

useEffect(() => {
  const loadTabProducts = async () => {
    setLoading(true);
    setProducts([]);
    setLastVisible(null);
    setHasMore(true);
    isFetchingRef.current = true;

    try {
      const { products: initialProducts, lastVisible: initialLastVisible } =
        await getPaginatedProductsWithStock(PAGE_SIZE, null, null, fetchTab);

      setProducts(initialProducts);
      setLastVisible(initialLastVisible);
      setHasMore(!!initialLastVisible && initialProducts.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  loadTabProducts();
}, [activeTab, fetchTab]);

const fetchNextPage = useCallback(async () => {
  if (isFetchingRef.current || !hasMoreRef.current) return;

  isFetchingRef.current = true;
  setIsLoadingMore(true);

  try {
    const { products: newProducts, lastVisible: newLastVisible } =
      await getPaginatedProductsWithStock(PAGE_SIZE, lastVisibleRef.current, null, fetchTab);

    setProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...newProducts.filter((p) => !existingIds.has(p.id))];
    });

    setLastVisible(newLastVisible);
    setHasMore(!!newLastVisible && newProducts.length === PAGE_SIZE);
  } catch (err) {
    console.error(err);
  } finally {
    setIsLoadingMore(false);
    isFetchingRef.current = false;
  }
}, [fetchTab]);

  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting && !isFetchingRef.current && hasMoreRef.current) { fetchNextPage(); }
  }, [fetchNextPage]);

  useEffect(() => {
    if (ioRef.current) ioRef.current.disconnect();
    ioRef.current = new IntersectionObserver(onIntersect, { root: null, rootMargin: '600px 0px', threshold: 0 });
    return () => ioRef.current?.disconnect();
  }, [onIntersect]);

  useEffect(() => {
    const node = observerRef.current;
    if (activeTab === 'all' || loading || !hasMore || !node || !ioRef.current) return;
    ioRef.current.observe(node);
    return () => { if (node) ioRef.current?.unobserve(node); };
  }, [loading, hasMore, activeTab]);

  // --- 데이터 가공 ---
  const processedEventProducts = useMemo(() => {
    return heroProducts.map(p => ({ ...p, displayRound: getDisplayRound(p) as any }))
      .filter(p => {
        if (!p.displayRound) return false;
        const stock = getStockInfo(p.displayRound.variantGroups?.[0]);
        return !(stock.isLimited && stock.remainingUnits <= 0);
      });
  }, [heroProducts]);


  const processedNormal = useMemo(() => {
    const now = dayjs();
    return products.map((product) => {
      const round = getDisplayRound(product);
      if (!round || round.status === 'draft' || round.eventType === 'PREMIUM') return null;
      const { primaryEnd, secondaryEnd } = getDeadlines(round);
      const actionState = determineActionState(round, userDocument as any);
      let phase: 'primary' | 'secondary' | 'onsite' = 'primary';
      if ((round as any).isManuallyOnsite) phase = 'onsite';
      else {
        if (['ENDED', 'AWAITING_STOCK', 'SCHEDULED'].includes(actionState)) return null;
        if (primaryEnd && now.isBefore(primaryEnd)) phase = 'primary';
        else if (secondaryEnd && now.isBefore(secondaryEnd)) phase = 'secondary';
        else return null;
      }
      return { ...product, displayRound: round as any, actionState, phase };
    }).filter((p): p is NonNullable<typeof p> => p !== null);
  }, [products, userDocument]);

  const tomorrowPickupProducts = useMemo(() => {
    const target = dayjs().add(1, 'day');
    return processedNormal.filter((p) => {
      if (p.phase === 'onsite') return false;
      const d = safeToDate(p.displayRound.arrivalDate) ?? safeToDate(p.displayRound.pickupDate);
      return d && dayjs(d).isSame(target, 'day');
    });
  }, [processedNormal]);

  // ✅ 마지막 찬스: 재고 3개 이하인 상품 필터링 (visibleNormalProducts보다 먼저 정의)
  const lastChanceProducts = useMemo(() => {
    return processedNormal.filter((p) => {
      if (p.phase === 'onsite') return false;
      const vg = p.displayRound.variantGroups?.[0];
      if (!vg) return false;
      const stockInfo = getStockInfo(vg);
      // 재고가 제한적이고 남은 수량이 3개 이하인 경우
      return stockInfo.isLimited && stockInfo.remainingUnits > 0 && stockInfo.remainingUnits <= 3;
    });
  }, [processedNormal]);

  const visibleNormalProducts = useMemo(() => {
    if (activeTab === 'today') return processedNormal.filter(p => p.phase === 'primary');
    if (activeTab === 'additional') return processedNormal.filter(p => p.phase === 'secondary');
    if (activeTab === 'onsite') return processedNormal.filter(p => p.phase === 'onsite');
    if (activeTab === 'tomorrow') return tomorrowPickupProducts;
    if (activeTab === 'lastchance') return lastChanceProducts;
    return processedNormal;
  }, [activeTab, processedNormal, tomorrowPickupProducts, lastChanceProducts]);

  const todayPrimary = useMemo(() => processedNormal.filter(p => p.phase === 'primary'), [processedNormal]);
  const additionalSorted = useMemo(() => [...processedNormal].filter(p => p.phase === 'secondary'), [processedNormal]);
  const onsite = useMemo(() => processedNormal.filter(p => p.phase === 'onsite'), [processedNormal]);

  const currentTabBanner = TAB_BANNERS[activeTab];

  return (
    <div className="customer-page-container modern-list-page">
      
      {/* 뷰티 섹션 (홈에서만) - 배너 아래에 위치하길 원하면 순서 조정 가능 */}
      {/* 일단 요청하신대로 '배너' 복구에 집중 */}

      {/* ✅ [탭별 배너] : 홈이 아닐 때만 노출 (오늘공구, 내일픽업 등) */}
      {activeTab !== 'all' && currentTabBanner && (
        <div 
          className={`tab-banner ${currentTabBanner.imageUrl ? 'has-image' : ''}`}
          style={{ 
            backgroundColor: currentTabBanner.bg,
            backgroundImage: currentTabBanner.imageUrl ? `url(${currentTabBanner.imageUrl})` : 'none',
          }}
        >
          {currentTabBanner.imageUrl && <div className="tab-banner-overlay" />}
          <div className="tab-banner-content">
            <h2 className="tab-banner-title">{currentTabBanner.title}</h2>
            <p className="tab-banner-desc">{currentTabBanner.desc}</p>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* 🏠 스토어 홈 (activeTab === 'all') */}
      {/* ================================================= */}
      {activeTab === 'all' && (
        <>
          {/* ✅ [복구] 이벤트/기획전 슬라이드 배너 (베리맘, 헤이유 등) */}
          {EVENT_BANNERS.length > 0 && (
            <section className="event-hero-wrapper new-year-banner">
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
                      if (banner.linkType === 'internal' && banner.href) navigate(banner.href);
                      else if (banner.linkType === 'external' && banner.href) window.open(banner.href, '_blank');
                    }}
                  >
                    <div className="event-hero-inner">
                      <div className="event-hero-content">
                        <span className="event-hero-chip">{banner.chip}</span>
                        <h2 className="event-hero-title">{banner.title}</h2>
                        <p className="event-hero-desc">{banner.desc}</p>
                        {banner.cta && <div className="event-hero-cta">{banner.cta}</div>}
                      </div>
                      {banner.image && (
                        <div className="event-hero-image-wrap">
                           {/* alt 텍스트 안전하게 처리 */}
                           <img src={banner.image} alt={banner.imageAlt || ''} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 도트 네비게이션 */}
              {EVENT_BANNERS.length > 1 && (
                <div className="event-hero-dots">
                  {EVENT_BANNERS.map((_, idx) => (
                    <button
                      key={idx}
                      className={`event-hero-dot ${idx === activeBanner ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveBanner(idx);
                      }}
                      type="button"
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ✅ 오늘의 공구 섹션 (배너 바로 아래로 이동) */}
          <section className="sp-section">
            <div className="sp-section-head">
              <div className="sp-section-left">
                <h3 className="sp-section-title">🔥 오늘의 공구</h3>
                <span className="sp-section-desc">오늘의 새로운 공동구매</span>
              </div>
              <button className="sp-viewall" onClick={() => navigate('/?tab=today')} type="button">전체보기</button>
            </div>
            <div className="sp-hscroll">
              {todayPrimary.map((p) => (
                <ModernProductThumbCard key={p.id} product={p as any} variant="row" />
              ))}
            </div>
          </section>

          {tomorrowPickupProducts.length > 0 && (
            <section className="sp-section">
              <div className="sp-section-head">
                <div className="sp-section-left">
                  <h3 className="sp-section-title">내일 픽업 가능</h3>
                  <span className="sp-section-desc">내일 바로 받을 수 있는 상품</span>
                </div>
                <button className="sp-viewall" onClick={() => navigate('/?tab=tomorrow')} type="button">전체보기</button>
              </div>
              <div className="sp-hscroll">
                {tomorrowPickupProducts.map((p) => (
                  <ModernProductThumbCard key={p.id} product={p as any} variant="row" />
                ))}
              </div>
            </section>
          )}

          {/* 기획전 상품 리스트 (홈 화면 가로 스크롤) */}
          {processedEventProducts.length > 0 && (
             <section className="sp-section">
               <div className="sp-section-head">
                 <div className="sp-section-left">
                   <h3 className="sp-section-title">기획전</h3>
                   <span className="sp-section-desc"> 시즌 한정 기획 공동구매 </span>
                 </div>
                 <button className="sp-viewall" onClick={() => navigate('/?tab=special')} type="button">전체보기</button>
               </div>
               <div className="sp-hscroll">
                 {processedEventProducts.map((p) => (
                   <ModernProductThumbCard 
                     key={`special-${p.id}`} 
                     product={p as any} 
                     variant="row" 
                   />
                 ))}
               </div>
             </section>
          )}

          {additionalSorted.length > 0 && (
            <section className="sp-section">
              <div className="sp-section-head">
                <div className="sp-section-left">
                  <h3 className="sp-section-title">추가공구</h3>
                  <span className="sp-section-desc">예약 놓친사람은 여기에서 예약!</span>
                </div>
                <button className="sp-viewall" onClick={() => navigate('/?tab=additional')} type="button">전체보기</button>
              </div>
              <div className="sp-hscroll">
                {additionalSorted.map((p) => (
                  <ModernProductThumbCard key={p.id} product={p as any} variant="row" />
                ))}
              </div>
            </section>
          )}
          
          {onsite.length > 0 && (
             <section className="sp-section">
               <div className="sp-section-head">
                 <div className="sp-section-left">
                   <h3 className="sp-section-title">현장판매</h3>
                   <span className="sp-section-desc">매장에서 바로 구매</span>
                 </div>
                 <button className="sp-viewall" onClick={() => navigate('/?tab=onsite')} type="button">전체보기</button>
               </div>
               <div className="sp-hscroll">
                 {onsite.map((p) => (
                   <ModernProductThumbCard key={p.id} product={p as any} variant="row" />
                 ))}
               </div>
             </section>
          )}

          {/* 마지막 찬스 섹션 */}
          {lastChanceProducts.length > 0 && (
            <section className="sp-section">
              <div className="sp-section-head">
                <div className="sp-section-left">
                  <h3 className="sp-section-title">⚡ 마지막 찬스</h3>
                  <span className="sp-section-desc">재고 3개 이하! 놓치면 후회</span>
                </div>
                <button className="sp-viewall" onClick={() => navigate('/?tab=lastchance')} type="button">전체보기</button>
              </div>
              <div className="sp-hscroll">
                {lastChanceProducts.map((p) => (
                  <ModernProductThumbCard key={p.id} product={p as any} variant="row" />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ================================================= */}
{/* 📑 개별 탭 화면 (그리드 + 번호표 index) */}
{/* ================================================= */}
{activeTab !== 'all' && (
  <div ref={primaryRef} className="sp-grid-container"> {/* 컨테이너 클래스 추가 권장 */}
    {activeTab === 'special' ? (
      processedEventProducts.length > 0 ? (
        <div className="sp-grid">
          {processedEventProducts.map((p, idx) => (
            <ModernProductThumbCard key={`special-${p.id}`} product={p as any} variant="grid" index={idx} />
          ))}
        </div>
      ) : (
        <div className="sp-empty-view">
          <Suspense fallback={null}><LazyShoppingBag size={48} strokeWidth={1} /></Suspense>
          <p>현재 진행 중인 기획전이 없습니다.</p>
        </div>
      )
    ) : visibleNormalProducts.length > 0 ? (
      <div className="sp-grid">
        {visibleNormalProducts.map((p, idx) => (
          <ModernProductThumbCard key={p.id} product={p as any} variant="grid" index={idx} />
        ))}
      </div>
    ) : (
      !loading && (
        <div className="sp-empty-view">
          <Suspense fallback={null}><LazyShoppingBag size={48} strokeWidth={1} /></Suspense>
          <p>내일 픽업 가능한 상품이 아직 없어요.</p>
          <span>새로운 상품이 곧 준비될 예정입니다!</span>
        </div>
      )
    )}
  </div>
)}

      {activeTab !== 'all' && <div ref={observerRef} style={{ height: 1 }} />}
      {isLoadingMore && <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>불러오는 중...</div>}
      <Outlet />
    </div>
  );
};

export default ModernProductList;