import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import SideMenu from './SideMenu';
import { db } from '../../firebase/firebaseConfig'; // Firebase 설정 확인 필요
import { collection, getDocs, query } from 'firebase/firestore';
import dayjs from 'dayjs';
import { getDisplayRound, safeToDate, determineActionState, getStockInfo } from '../../utils/productUtils';
import './Header.css';

const ALL_CATEGORIES = [
  { id: 'home', label: '스토어홈' },
  // ✅ 내일 픽업 탭은 "내일 픽업 상품이 있을 때만" 노출됩니다. (아래 필터링 로직)
  { id: 'tomorrow', label: '🚀 내일픽업' },
  // ✅ 오늘공구/추가공구는 항상 노출
  { id: 'today', label: '🔥 오늘공구' },
  { id: 'additional', label: '🔁 추가공구' },
  { id: 'seollal', label: '🧧 설날공구' },
  { id: 'lastchance', label: '⚡ 마지막찬스' },
  { id: 'reviews', label: '💬 후기' },
  { id: 'onsite', label: '🏢 현장판매' },
];

const Header: React.FC = () => {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  // ✅ 동적으로 변하는 카테고리 상태
  const [visibleCategories, setVisibleCategories] = useState(ALL_CATEGORIES);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentTab = location.pathname === '/reviews'
    ? 'reviews'
    : location.pathname === '/seollal'
    ? 'seollal'
    : (searchParams.get('tab') || 'home');
  const isModernPage =
    location.pathname === '/' ||
    location.pathname.startsWith('/product') ||
    location.pathname === '/reviews' ||
    location.pathname === '/seollal';
  const isHistoryPage = location.pathname === '/mypage/history';

  // 인디케이터 위치/폭
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // 스크롤 컨테이너/리스트 ref
  const trackRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // ✅ [수정] Firebase 데이터를 확인하여 탭 노출 여부 결정
  useEffect(() => {
    const checkTabsVisibility = async () => {
      try {
        const q = query(collection(db, 'products'));
        const querySnapshot = await getDocs(q);
        const allProducts = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

        const tomorrowTarget = dayjs().add(1, 'day');
        
        // 1. 내일 픽업 상품 여부 확인 (ModernProductList와 동일한 로직)
        const hasTomorrow = allProducts.some(p => {
          const round = getDisplayRound(p as any);
          if (!round || round.status === 'draft') return false;
          
          // 현장판매는 제외
          if ((round as any).isManuallyOnsite) return false;
          
          // actionState가 ENDED이면 제외
          const actionState = determineActionState(round, null as any);
          if (['ENDED', 'AWAITING_STOCK', 'SCHEDULED'].includes(actionState)) return false;
          
          // arrivalDate 또는 pickupDate가 내일인지 확인
          const arrivalDate = safeToDate(round.arrivalDate);
          const pickupDate = safeToDate(round.pickupDate);
          const targetDate = arrivalDate ?? pickupDate;
          
          return targetDate && dayjs(targetDate).isSame(tomorrowTarget, 'day');
        });

        // 2. 마지막 찬스 상품 여부 확인 (재고 3개 이하)
        const hasLastChance = allProducts.some((p: any) => {
          const round = getDisplayRound(p as any);
          if (!round || round.status === 'draft') return false;
          
          // 현장판매는 제외
          if ((round as any).isManuallyOnsite) return false;
          
          // actionState가 ENDED이면 제외
          const actionState = determineActionState(round, null as any);
          if (['ENDED', 'AWAITING_STOCK', 'SCHEDULED'].includes(actionState)) return false;
          
          // 재고 3개 이하 확인
          const vg = round.variantGroups?.[0];
          if (!vg) return false;
          const stockInfo = getStockInfo(vg);
          return stockInfo.isLimited && stockInfo.remainingUnits > 0 && stockInfo.remainingUnits <= 3;
        });

        // 3. 설날 공구 상품 여부 확인
        const hasSeollal = allProducts.some((p: any) => {
          const round = getDisplayRound(p as any);
          if (!round || round.status === 'draft') return false;
          
          // 현장판매는 제외
          if ((round as any).isManuallyOnsite) return false;
          
          // actionState가 ENDED이면 제외
          const actionState = determineActionState(round, null as any);
          if (['ENDED', 'AWAITING_STOCK', 'SCHEDULED'].includes(actionState)) return false;
          
          // eventType이 SEOLLAL인지 확인
          return round.eventType === 'SEOLLAL';
        });

        // 필터링 logic
        const nextCategories = ALL_CATEGORIES.filter(cat => {
          if (cat.id === 'tomorrow') return hasTomorrow;
          if (cat.id === 'lastchance') return hasLastChance;
          if (cat.id === 'seollal') return hasSeollal;
          return true; 
        });

        setVisibleCategories(nextCategories);
      } catch (err) {
        console.error("탭 목록 로드 중 에러 발생:", err);
      }
    };

    checkTabsVisibility();
  }, []);

  const updateIndicator = () => {
    const el = tabRefs.current[currentTab];
    const listEl = listRef.current;
    const trackEl = trackRef.current;
    if (!el || !listEl || !trackEl) return;

    const elRect = el.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();
    const left = elRect.left - listRect.left;
    const width = elRect.width;

    setIndicator({ left, width });

    // 모바일 활성 탭 중앙 정렬 스크롤
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  // 탭 변경이나 카테고리 목록 변경 시 인디케이터 업데이트
  useEffect(() => {
    updateIndicator();
  }, [currentTab, location.pathname, visibleCategories]);

  useEffect(() => {
    const onResize = () => updateIndicator();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [currentTab, visibleCategories]);

  return (
    <>
      <header className="new-customer-header">
        <div className="header-shell">
          <div className="header-top-row">
            <div className="header-left">
              <button className="icon-btn" onClick={() => setIsSideMenuOpen(true)}>
                <Menu size={24} />
              </button>
              <NavLink to="/?tab=home" className="brand-logo">
                <span className="brand-emoji">🧧</span> 송도PICK
              </NavLink>
            </div>

            <div className="header-search-wrap">
              <form
                className="header-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchKeyword.trim();
                  if (q) navigate(`/?tab=home&q=${encodeURIComponent(q)}`);
                }}
              >
                <input
                  type="search"
                  className="header-search-input"
                  placeholder="송도PICK에서 검색하기"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  aria-label="상품 검색"
                  autoComplete="off"
                />
                <button type="submit" className="header-search-submit" aria-label="검색">
                  <Search size={20} strokeWidth={2} />
                </button>
              </form>
            </div>

            <div className="header-right">
              {isHistoryPage ? (
                <button className="header-action-btn btn-home" onClick={() => navigate('/')}>
                  홈으로
                </button>
              ) : (
                <button className="header-action-btn btn-history" onClick={() => navigate('/mypage/history')}>
                  예약내역
                </button>
              )}
            </div>
          </div>

          {isModernPage && (
            <nav className="header-category-nav">
              <div className="header-inner">
                <div className="category-track" ref={trackRef}>
                  <ul className="category-list" ref={listRef}>
                    {visibleCategories.map((cat) => {
                      // 설날 공구는 별도 페이지로 이동
                      const toPath = cat.id === 'reviews' 
                        ? '/reviews' 
                        : cat.id === 'seollal' 
                        ? '/seollal'
                        : `/?tab=${cat.id}`;
                      
                      return (
                        <li key={cat.id}>
                          <NavLink
                            to={toPath}
                            replace
                            ref={(node) => {
                              tabRefs.current[cat.id] = node;
                            }}
                            className={`category-item ${currentTab === cat.id ? 'active' : ''}`}
                          >
                            <span className="tab-label">{cat.label}</span>
                          </NavLink>
                        </li>
                      );
                    })}

                    <span
                      className="tab-indicator"
                      style={{
                        transform: `translateX(${indicator.left}px)`,
                        width: `${indicator.width}px`,
                      }}
                    />
                  </ul>
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>

      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        onOpenNotifications={() => {}}
      />
    </>
  );
};

export default Header;