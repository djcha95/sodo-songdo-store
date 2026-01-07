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
  getRemainingPurchasableCount,
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
const LazyAlertTriangle = React.lazy(() =>
  import('lucide-react').then((module) => ({ default: module.AlertTriangle }))
);
const LazyRefreshCw = React.lazy(() =>
  import('lucide-react').then((module) => ({ default: module.RefreshCw }))
);

type TabId = 'all' | 'today' | 'tomorrow' | 'special' | 'additional' | 'onsite' | 'lastchance';
const PAGE_SIZE = 30;

const getRoundReservedTotal = (round: any): number => {
  const vgs = round?.variantGroups ?? [];
  return vgs.reduce((sum: number, vg: any) => {
    const r = typeof vg?.reservedCount === 'number' && Number.isFinite(vg.reservedCount) ? vg.reservedCount : 0;
    return sum + r;
  }, 0);
};

const computeBestSellerRankMap = <T extends { id: string; displayRound?: any }>(
  items: T[],
  topN = 3,
  includeZero = false
): Record<string, number> => {
  // reservedCount 기반 "인기상품" TOP N (상대 랭킹)
  const unique = new Map<string, T>();
  items.forEach((p) => unique.set(p.id, p));

  const sorted = [...unique.values()]
    .map((p) => ({ id: p.id, reservedTotal: getRoundReservedTotal(p.displayRound) }))
    .filter((x) => (includeZero ? true : x.reservedTotal > 0))
    .sort((a, b) => b.reservedTotal - a.reservedTotal);

  const rankMap: Record<string, number> = {};
  sorted.slice(0, topN).forEach((x, idx) => {
    rankMap[x.id] = idx + 1;
  });
  return rankMap;
};

const DragHScroll: React.FC<{
  children: React.ReactNode;
  className?: string;
  hintLabel?: string;
}> = ({ children, className, hintLabel = '오른쪽으로 스크롤' }) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef(false);
  const hasPointerCaptureRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const didDragRef = useRef(false);

  const [showHint, setShowHint] = useState(false);

  const recomputeHint = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 오른쪽으로 더 갈 수 있을 때만 힌트 표시
    setShowHint(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    recomputeHint();
    const el = elRef.current;
    if (!el) return;

    const onScroll = () => recomputeHint();
    el.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => recomputeHint());
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [recomputeHint]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 모바일은 기존 스와이프 동작이 잘 되므로, 데스크탑(마우스)만 드래그 스크롤 활성화
    if (e.pointerType !== 'mouse') return;
    const el = elRef.current;
    if (!el) return;

    isPointerDownRef.current = true;
    hasPointerCaptureRef.current = false;
    didDragRef.current = false;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;

    // ✅ 클릭만 하는 경우엔 포인터 캡처를 걸지 않습니다.
    // 실제 드래그로 판단되는 순간(onPointerMove에서 임계값 초과)부터 캡처를 잡아
    // 카드 클릭(상세 진입)이 씹히는 문제를 방지합니다.
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    if (!isPointerDownRef.current) return;
    const el = elRef.current;
    if (!el) return;

    const dx = e.clientX - startXRef.current;
    // ✅ 너무 작은 흔들림은 클릭으로 취급(상세 진입이 잘 되도록)
    if (Math.abs(dx) <= 6) return;

    // ✅ 드래그로 확정되는 순간에만 pointer capture + dragging class 적용
    if (!didDragRef.current) {
    didDragRef.current = true;
      el.classList.add('dragging');
      try {
        el.setPointerCapture(e.pointerId);
        hasPointerCaptureRef.current = true;
      } catch {
        hasPointerCaptureRef.current = false;
      }
    }
    el.scrollLeft = startScrollLeftRef.current - dx;
    e.preventDefault();
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = elRef.current;
    isPointerDownRef.current = false;
    if (el) el.classList.remove('dragging');
    if (hasPointerCaptureRef.current) {
    try { el?.releasePointerCapture(e.pointerId); } catch {}
    }
    hasPointerCaptureRef.current = false;
    // 클릭 방지 플래그는 한 틱 뒤에 초기화(드래그 후 버튼 클릭 방지)
    setTimeout(() => { didDragRef.current = false; }, 0);
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 실제로 드래그가 발생했을 때만 클릭 방지 (작은 흔들림은 클릭으로 허용)
    if (!didDragRef.current) return;
    // 버튼/링크 등 클릭 가능한 요소는 클릭 허용
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) {
      return; // 클릭 가능한 요소는 클릭 허용
    }
    e.preventDefault();
    e.stopPropagation();
    didDragRef.current = false;
  }, []);

  return (
    <div className="sp-hscroll-wrap">
      <div
        ref={elRef}
        className={`sp-hscroll ${className ?? ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        aria-label={hintLabel}
      >
        {children}
      </div>

      {showHint && (
        <>
          <div className="sp-hscroll-fade" aria-hidden="true" />
          <div className="sp-hscroll-hint" aria-hidden="true">
            <Suspense fallback={null}>
              <LazyChevronRight size={20} strokeWidth={2.25} />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
};

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
  // ✅ [수정] 신년 리뷰 이벤트 배너
  {
    id: 'review-event-2026-newyear',
    chip: '🎁 신년 리뷰 이벤트',
    title: '신년 리뷰이벤트!',
    desc: '카톡방에 사진+글로 후기 남기면 7,500원 상당 미주라 크래커 드려요',
    cta: '카톡방에 후기 남기기',
    // ✅ 밝고 깔끔한 배경
    bg: 'linear-gradient(135deg, #FFF7ED 0%, #FFFBEB 40%, #ECFEFF 100%)',
    linkType: 'external',
    href: 'https://open.kakao.com/o/g917Hh9g',
    image: '/images/events/미주라크래커.png',
    imageAlt: '미주라 크래커',
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
  
  // ✅ 에러 상태 추가
  const [error, setError] = useState<string | null>(null);
  const [heroError, setHeroError] = useState<string | null>(null);

  const observerRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastVisibleRef = useRef<any | null>(null);
  const requestSeqRef = useRef(0);

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

  // 특수 상품(기획전) 로드 함수 (재시도용으로 분리)
  const fetchSpecialProducts = useCallback(async () => {
    try {
      setHeroError(null);
      const { products: fetched } = await getPaginatedProductsWithStock(300, null, null, 'all');
      const events = fetched.filter((p) => {
        const r = getDisplayRound(p);
        // ✅ [수정] 'PREMIUM'과 'COSMETICS'를 제외 목록에서 삭제하여 기획전 탭에 노출되도록 변경
        const hasEventTag = r && r.eventType && !['NONE'].includes(r.eventType);
        return hasEventTag && determineActionState(r, null) !== 'ENDED';
      });
      setHeroProducts(events);
    } catch (e: any) { 
      console.error('기획전 상품 로드 실패:', e);
      setHeroError('기획전 상품을 불러오는 중 문제가 발생했습니다.');
    }
  }, []);

  useEffect(() => {
    fetchSpecialProducts();
  }, [fetchSpecialProducts]);

  // 탭별 상품 로드 함수 (재시도용으로 분리)
  const loadTabProducts = useCallback(async () => {
    const reqId = ++requestSeqRef.current;
    setLoading(true);
    setProducts([]);
    setLastVisible(null);
    setHasMore(true);
    setError(null); // ✅ 에러 상태 초기화
    isFetchingRef.current = true;

    try {
      const { products: initialProducts, lastVisible: initialLastVisible } =
        await getPaginatedProductsWithStock(PAGE_SIZE, null, null, fetchTab);

      // ✅ stale response 방지 (탭 전환/연속 호출 시 뒤늦은 응답 무시)
      if (reqId !== requestSeqRef.current) return;

      setProducts(initialProducts);
      setLastVisible(initialLastVisible);
      setHasMore(!!initialLastVisible && initialProducts.length === PAGE_SIZE);
      setError(null); // ✅ 성공 시 에러 초기화
    } catch (err: any) {
      console.error('상품 로드 실패:', err);
      // ✅ 사용자 친화적인 에러 메시지
      const errorMessage = err?.message || err?.code 
        ? '상품을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        : '네트워크 연결을 확인하고 다시 시도해주세요.';
      setError(errorMessage);
      setProducts([]); // ✅ 에러 시 빈 배열 유지
      setHasMore(false);
    } finally {
      if (reqId !== requestSeqRef.current) return;
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetchTab]);

  useEffect(() => {
    loadTabProducts();
  }, [activeTab, loadTabProducts]);

const fetchNextPage = useCallback(async () => {
  if (isFetchingRef.current || !hasMoreRef.current) return;

  isFetchingRef.current = true;
  setIsLoadingMore(true);

  try {
    const reqId = requestSeqRef.current;
    const { products: newProducts, lastVisible: newLastVisible } =
      await getPaginatedProductsWithStock(PAGE_SIZE, lastVisibleRef.current, null, fetchTab);

    if (reqId !== requestSeqRef.current) return;

    setProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...newProducts.filter((p) => !existingIds.has(p.id))];
    });

    setLastVisible(newLastVisible);
    setHasMore(!!newLastVisible && newProducts.length === PAGE_SIZE);
    setError(null); // ✅ 성공 시 에러 초기화
  } catch (err: any) {
    console.error('다음 페이지 로드 실패:', err);
    setError('추가 상품을 불러오는 중 문제가 발생했습니다.');
    setHasMore(false); // ✅ 에러 시 더 이상 로드하지 않음
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
        // ✅ 판매 가능 기준(차감 단위 반영)
        const vg = p.displayRound.variantGroups?.[0] as any;
        const purchasable = getRemainingPurchasableCount(vg);
        return purchasable > 0;
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

  const badgeSeed = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const bestSellerRankMap = useMemo(() => {
    return computeBestSellerRankMap([...(processedNormal as any[]), ...(processedEventProducts as any[])], 3);
  }, [processedNormal, processedEventProducts]);

  const tomorrowPickupProducts = useMemo(() => {
    const target = dayjs().add(1, 'day');
    return processedNormal.filter((p) => {
      if (p.phase === 'onsite') return false;
      const d = safeToDate(p.displayRound.arrivalDate) ?? safeToDate(p.displayRound.pickupDate);
      return d && dayjs(d).isSame(target, 'day');
    });
  }, [processedNormal]);

  const DEBUG_STOCK = import.meta.env.VITE_DEBUG_STOCK === 'true';

  // ✅ 마지막 찬스: 재고 3개 이하인 상품 필터링 (visibleNormalProducts보다 먼저 정의)
  const lastChanceProducts = useMemo(() => {
    const filtered = processedNormal.filter((p) => {
      if (p.phase === 'onsite') return false;
      const vg = p.displayRound.variantGroups?.[0];
      if (!vg) return false;
      // ✅ "구매 가능 개수" 기준으로 마지막 찬스(<=3) 판단 (차감 단위 반영)
      const purchasable = getRemainingPurchasableCount(vg as any);
      const stockInfo = getStockInfo(vg);
      // ✅ 디버깅: 필요 시에만 로그 출력 (기본 OFF)
      if (DEBUG_STOCK && purchasable > 0 && purchasable <= 10) {
        console.log(`[마지막찬스] ${(p as any).groupName || p.id}: purchasable=${purchasable}, remainingUnits=${stockInfo.remainingUnits}, unitPerBox=${stockInfo.unitPerBox}, totalStock=${(vg as any).totalPhysicalStock}, reservedCount=${(vg as any).reservedCount}`);
      }
      return Number.isFinite(purchasable) && purchasable > 0 && purchasable <= 3;
    });
    // ✅ 디버깅: 필요 시에만 로그 출력 (기본 OFF)
    if (DEBUG_STOCK) {
      console.log(`[마지막찬스] processedNormal=${processedNormal.length}개, 필터링 후=${filtered.length}개`);
    }
    return filtered;
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
  const todayPrimarySorted = useMemo(() => {
    // ✅ 오늘의 공구: 인기(예약수) 높은 순으로 왼쪽부터 보이도록 정렬
    const copy = [...todayPrimary];
    copy.sort((a: any, b: any) => {
      const ra = getRoundReservedTotal(a.displayRound);
      const rb = getRoundReservedTotal(b.displayRound);
      if (rb !== ra) return rb - ra;
      // tie-breaker: 최신 라운드 우선
      const aT = safeToDate(a.displayRound?.createdAt)?.getTime() ?? 0;
      const bT = safeToDate(b.displayRound?.createdAt)?.getTime() ?? 0;
      return bT - aT;
    });
    return copy;
  }, [todayPrimary]);

  const todayBestSellerRankMap = useMemo(() => {
    // ✅ 요청: 14개 중 1개만 인기상품이면 허전하니, 상대 랭킹으로 2~3개 지정
    // (예약수가 전부 0이어도 topN은 찍히도록 includeZero=true)
    return computeBestSellerRankMap(todayPrimarySorted as any[], 3, true);
  }, [todayPrimarySorted]);
  const additionalSorted = useMemo(() => [...processedNormal].filter(p => p.phase === 'secondary'), [processedNormal]);
  const onsite = useMemo(() => processedNormal.filter(p => p.phase === 'onsite'), [processedNormal]);

  const currentTabBanner = TAB_BANNERS[activeTab];

  return (
    <div className="customer-page-container modern-list-page">
      <div className="modern-inner-shell">
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
                      {(banner.image || banner.id === 'review-event-2026-newyear') && (
                        <div className="event-hero-image-wrap">
                          {banner.image ? (
                            <img src={banner.image} alt={banner.imageAlt || ''} />
                          ) : (
                            <div className="event-hero-image-placeholder">
                              <div className="event-hero-image-placeholder-title">미주라 크래커</div>
                              <div className="event-hero-image-placeholder-sub">사진 자리</div>
                            </div>
                          )}
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
          {error && todayPrimary.length === 0 && processedNormal.length === 0 ? (
            <section className="sp-section">
              <div className="sp-error-view" style={{ marginTop: '20px', padding: '60px 20px' }}>
                <Suspense fallback={null}><LazyAlertTriangle size={48} strokeWidth={1.5} /></Suspense>
                <p>{error}</p>
                <button 
                  className="sp-retry-button" 
                  onClick={loadTabProducts}
                  type="button"
                >
                  <Suspense fallback={null}><LazyRefreshCw size={16} /></Suspense>
                  다시 시도
                </button>
              </div>
            </section>
          ) : (
            <section className="sp-section">
              <div className="sp-section-head">
                <div className="sp-section-left">
                  <h3 className="sp-section-title">🔥 오늘의 공구</h3>
                  <span className="sp-section-desc">오늘의 새로운 공동구매</span>
                </div>
                <button className="sp-viewall" onClick={() => navigate('/?tab=today')} type="button">전체보기</button>
              </div>
              <DragHScroll>
                {todayPrimarySorted.map((p) => (
                  <ModernProductThumbCard
                    key={p.id}
                    product={p as any}
                    variant="row"
                    bestsellerRank={todayBestSellerRankMap[p.id]}
                    badgeSeed={badgeSeed}
                  />
                ))}
              </DragHScroll>
            </section>
          )}

          {tomorrowPickupProducts.length > 0 && (
            <section className="sp-section">
              <div className="sp-section-head">
                <div className="sp-section-left">
                  <h3 className="sp-section-title">내일 픽업 가능</h3>
                  <span className="sp-section-desc">내일 바로 받을 수 있는 상품</span>
                </div>
                <button className="sp-viewall" onClick={() => navigate('/?tab=tomorrow')} type="button">전체보기</button>
              </div>
              <DragHScroll>
                {tomorrowPickupProducts.map((p) => (
                  <ModernProductThumbCard
                    key={p.id}
                    product={p as any}
                    variant="row"
                    bestsellerRank={bestSellerRankMap[p.id]}
                    badgeSeed={badgeSeed}
                  />
                ))}
              </DragHScroll>
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
               <DragHScroll>
                 {processedEventProducts.map((p) => (
                   <ModernProductThumbCard 
                     key={`special-${p.id}`} 
                     product={p as any} 
                     variant="row" 
                     bestsellerRank={bestSellerRankMap[p.id]}
                     badgeSeed={badgeSeed}
                   />
                 ))}
               </DragHScroll>
             </section>
          )}
          
          {/* ✅ 기획전 로드 실패 시 에러 표시 */}
          {heroError && processedEventProducts.length === 0 && (
            <section className="sp-section">
              <div className="sp-section-head">
                <div className="sp-section-left">
                  <h3 className="sp-section-title">기획전</h3>
                  <span className="sp-section-desc"> 시즌 한정 기획 공동구매 </span>
                </div>
              </div>
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#EF4444' }}>
                <p style={{ marginBottom: '16px' }}>{heroError}</p>
                <button 
                  className="sp-retry-button" 
                  onClick={fetchSpecialProducts}
                  type="button"
                  style={{ margin: '0 auto' }}
                >
                  <Suspense fallback={null}><LazyRefreshCw size={16} /></Suspense>
                  다시 시도
                </button>
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
              <DragHScroll>
                {additionalSorted.map((p) => (
                  <ModernProductThumbCard
                    key={p.id}
                    product={p as any}
                    variant="row"
                    bestsellerRank={bestSellerRankMap[p.id]}
                    badgeSeed={badgeSeed}
                  />
                ))}
              </DragHScroll>
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
               <DragHScroll>
                 {onsite.map((p) => (
                  <ModernProductThumbCard
                    key={p.id}
                    product={p as any}
                    variant="row"
                    bestsellerRank={bestSellerRankMap[p.id]}
                    badgeSeed={badgeSeed}
                  />
                 ))}
               </DragHScroll>
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
              <DragHScroll>
                {lastChanceProducts.map((p) => (
                  <ModernProductThumbCard
                    key={p.id}
                    product={p as any}
                    variant="row"
                    bestsellerRank={bestSellerRankMap[p.id]}
                    badgeSeed={badgeSeed}
                  />
                ))}
              </DragHScroll>
            </section>
          )}
        </>
      )}

      {/* ================================================= */}
{/* 📑 개별 탭 화면 (그리드 + 번호표 index) */}
{/* ================================================= */}
{activeTab !== 'all' && (
  <div ref={primaryRef} className="sp-grid-container"> {/* 컨테이너 클래스 추가 권장 */}
    {/* ✅ 에러 표시 */}
    {error && !loading && (
      <div className="sp-error-view">
        <Suspense fallback={null}><LazyAlertTriangle size={48} strokeWidth={1.5} /></Suspense>
        <p>{error}</p>
        <button 
          className="sp-retry-button" 
          onClick={loadTabProducts}
          type="button"
        >
          <Suspense fallback={null}><LazyRefreshCw size={16} /></Suspense>
          다시 시도
        </button>
      </div>
    )}
    
    {!error && (
      activeTab === 'special' ? (
        processedEventProducts.length > 0 ? (
          <div className="sp-grid">
            {processedEventProducts.map((p, idx) => (
              <ModernProductThumbCard
                key={`special-${p.id}`}
                product={p as any}
                variant="grid"
                index={idx}
                bestsellerRank={bestSellerRankMap[p.id]}
                badgeSeed={badgeSeed}
              />
            ))}
          </div>
        ) : (
          !loading && (
            <div className="sp-empty-view">
              <Suspense fallback={null}><LazyShoppingBag size={48} strokeWidth={1} /></Suspense>
              <p>현재 진행 중인 기획전이 없습니다.</p>
            </div>
          )
        )
      ) : visibleNormalProducts.length > 0 ? (
        <div className="sp-grid">
          {visibleNormalProducts.map((p, idx) => (
            <ModernProductThumbCard
              key={p.id}
              product={p as any}
              variant="grid"
              index={idx}
              bestsellerRank={bestSellerRankMap[p.id]}
              badgeSeed={badgeSeed}
            />
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
      )
    )}
  </div>
)}

      {activeTab !== 'all' && <div ref={observerRef} style={{ height: 1 }} />}
      {isLoadingMore && <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>불러오는 중...</div>}
      <Outlet />
      </div>
    </div>
  );
};

export default ModernProductList;