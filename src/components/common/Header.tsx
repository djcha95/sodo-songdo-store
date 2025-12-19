import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import SideMenu from './SideMenu';
import { db } from '../../firebase/firebaseConfig'; // Firebase 설정 확인 필요
import { collection, getDocs, query } from 'firebase/firestore';
import dayjs from 'dayjs';
import './Header.css';

const ALL_CATEGORIES = [
  { id: 'home', label: '스토어홈' },
  { id: 'today', label: '🔥 오늘공구' },
  { id: 'tomorrow', label: '🚀 내일픽업' },
  { id: 'special', label: '✨ 기획전' },
  { id: 'additional', label: '🔁 추가공구' },
  { id: 'onsite', label: '🏢 현장판매' },
];

const Header: React.FC = () => {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  // ✅ 동적으로 변하는 카테고리 상태
  const [visibleCategories, setVisibleCategories] = useState(ALL_CATEGORIES);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentTab = searchParams.get('tab') || 'home';
  const isModernPage = location.pathname === '/' || location.pathname.startsWith('/product');
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
        const allProducts = querySnapshot.docs.map(doc => doc.data());

        const tomorrowDate = dayjs().add(1, 'day').format('YYYY-MM-DD');
        
        // 1. 내일 픽업 상품 여부 확인
        const hasTomorrow = allProducts.some(p => {
          const rounds = p.salesRounds || [];
          return rounds.some((r: any) => 
            (r.arrivalDate === tomorrowDate || r.pickupDate === tomorrowDate) && r.status !== 'draft'
          );
        });

        // 2. 추가 공구 상품 여부 확인
        const hasAdditional = allProducts.some(p => p.sourceType === 'SODOMALL');

        // 필터링 logic
        const nextCategories = ALL_CATEGORIES.filter(cat => {
          if (cat.id === 'tomorrow') return hasTomorrow;
          if (cat.id === 'additional') return hasAdditional;
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
                송도PICK
              </NavLink>
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
                    {visibleCategories.map((cat) => (
                      <li key={cat.id}>
                        <NavLink
                          to={`/?tab=${cat.id}`}
                          replace
                          ref={(node) => {
                            tabRefs.current[cat.id] = node;
                          }}
                          className={`category-item ${currentTab === cat.id ? 'active' : ''}`}
                        >
                          <span className="tab-label">{cat.label}</span>
                        </NavLink>
                      </li>
                    ))}

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