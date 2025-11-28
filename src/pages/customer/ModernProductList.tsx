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
import type { Product } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import ModernProductCard from '@/components/customer/ModernProductCard';
import { ShoppingBag } from 'lucide-react'; // 💡 User, ChevronRight 제거
import {
  getDisplayRound,
  getDeadlines,
  determineActionState,
  getStockInfo,
} from '@/utils/productUtils';
import { usePageRefs } from '@/layouts/CustomerLayout';
import { Outlet, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
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

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { lastVisibleRef.current = lastVisible; }, [lastVisible]);

  // 1. 탭 변경 로직
  useEffect(() => {
    const loadTabProducts = async () => {
      setLoading(true);
      setProducts([]);
      setLastVisible(null);
      setHasMore(true);
      autoFetchCount.current = 0;
      isFetchingRef.current = true;

      try {
        console.log(`[탭 변경] ${activeTab} 데이터를 불러옵니다...`);
        const {
          products: initialProducts,
          lastVisible: initialLastVisible,
        } = await getPaginatedProductsWithStock(PAGE_SIZE, null, null, activeTab);

        setProducts(initialProducts);
        setLastVisible(initialLastVisible);
        setHasMore(!!initialLastVisible && initialProducts.length === PAGE_SIZE);
      } catch (err) {
        console.error("상품 로드 실패:", err);
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    loadTabProducts();
  }, [activeTab]);

  // 2. 무한 스크롤 로직
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

      setProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const uniqueNewProducts = newProducts.filter(p => !existingIds.has(p.id));
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
    ioRef.current = new IntersectionObserver(onIntersect, { root: null, rootMargin: '600px 0px', threshold: 0 });
    return () => { ioRef.current?.disconnect(); };
  }, [onIntersect]);

  useEffect(() => {
    const node = observerRef.current;
    if (loading || !hasMore || !node || !ioRef.current) return;
    ioRef.current.observe(node);
    return () => { if (node) ioRef.current?.unobserve(node); };
  }, [loading, hasMore]);

  // 3. 필터링 로직
  const filteredProducts = useMemo(() => {
    const now = dayjs();

    const processed = products
      .map(product => {
        const round = getDisplayRound(product);
        if (!round || round.status === 'draft') return null;

        const { primaryEnd, secondaryEnd } = getDeadlines(round);
        const actionState = determineActionState(round, userDocument as any);
        let phase: 'primary' | 'secondary' | 'onsite' = 'primary';

        if (round.isManuallyOnsite) {
           phase = 'onsite';
        } else {
           if (actionState === 'ENDED' || actionState === 'AWAITING_STOCK') return null;
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
          isClosingSoon: phase === 'secondary' && secondaryEnd && secondaryEnd.diff(now, 'hour') < 6,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (activeTab === 'today') return processed.filter(p => p.phase === 'primary');
    if (activeTab === 'additional') return processed.filter(p => p.phase === 'secondary');
    if (activeTab === 'onsite') return processed.filter(p => p.phase === 'onsite');

    return processed.sort((a, b) => {
      const score = (p: (typeof processed)[number]) => p.phase === 'primary' ? 3 : p.phase === 'secondary' ? 2 : 1;
      return score(b) - score(a);
    });
  }, [products, userDocument, activeTab]);

  useEffect(() => {
    if (loading || isLoadingMore || !hasMore || activeTab === 'all' || activeTab === 'onsite') return;
    if (filteredProducts.length === 0 && autoFetchCount.current < 50) {
        autoFetchCount.current += 1;
        fetchNextPage();
    } else {
      autoFetchCount.current = 0;
    }
  }, [loading, isLoadingMore, hasMore, filteredProducts.length, activeTab, fetchNextPage]);


  const bannerContent = useMemo(() => {
    switch (activeTab) {
      case 'today': return { title: '🔥 오늘의 공구', desc: '오늘 오후 1시 ~ 내일 오후 1시까지 진행되는 하루 한정 공구입니다.' };
      case 'additional': return { title: '🔁 추가 예약', desc: '1차 공구 후 남은 수량을 픽업일 오후 1시까지 추가로 예약 받습니다.' };
      case 'onsite': return { title: '🏢 현장 판매', desc: '온라인 예약 없이 매장에서 바로 구매 가능한 상품입니다.' };
      default: return { title: '📢 송도공구마켓', desc: '매일 오후 1시 오픈! 오늘 진행 중인 공구를 한눈에 확인해보세요.' };
    }
  }, [activeTab]);

  if (loading && products.length === 0) {
    return <SodomallLoader />;
  }

  return (
    <>
      <div className="customer-page-container modern-list-page">
        {/* ✅ [수정] 헤더: 이모티콘 제거, 텍스트 버튼으로 변경 */}

        {/* 1. 공지사항 배너 */}
        <section className="songdo-notice-banner">
          <span className="notice-text">
            <span className="notice-highlight">{bannerContent.title}: </span>
            {bannerContent.desc}
          </span>
        </section>

        {/* ❌ [삭제] 예약내역 바로가기 섹션 제거됨 */}

        {/* 3. 탭 네비게이션 */}
        <nav className="songdo-tabs-wrapper">
          <div className="songdo-tabs">
            {TABS.map(tab => (
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

        {/* 4. 상품 리스트 */}
        <div ref={primaryRef} className="songdo-product-list">
          {filteredProducts.length > 0 ? (
            filteredProducts.map(p => (
              <ModernProductCard
                key={`${p.id}-${p.displayRound.roundId}`}
                product={p}
                actionState={p.actionState}
                phase={p.phase}
              />
            ))
          ) : (
            <div className="empty-state">
              <p style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8' }}>
                {isLoadingMore 
                  ? '상품을 불러오는 중입니다...' 
                  : '해당하는 상품이 없습니다.'}
              </p>
            </div>
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