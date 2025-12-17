import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import SideMenu from './SideMenu';
import './Header.css';

const CATEGORIES = [
  { id: 'home', label: '스토어홈' },
  { id: 'today', label: '🔥 오늘공구' },
  { id: 'tomorrow', label: '🚀 내일픽업' },
  { id: 'special', label: '✨ 기획전' },
  { id: 'additional', label: '🔁 추가공구' },
  { id: 'onsite', label: '🏢 현장판매' },
];

const Header: React.FC = () => {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentTab = searchParams.get('tab') || 'home';
  const isModernPage = location.pathname === '/' || location.pathname.startsWith('/product');
  const isHistoryPage = location.pathname === '/mypage/history';

  const categories = useMemo(() => CATEGORIES, []);

  // 인디케이터 위치/폭
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // 스크롤 컨테이너/리스트 ref
  const trackRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // 탭별 엘리먼트 ref
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const updateIndicator = () => {
    const el = tabRefs.current[currentTab];
    const listEl = listRef.current;
    const trackEl = trackRef.current;
    if (!el || !listEl || !trackEl) return;

    // list 기준 좌표 + 스크롤값으로 계산
    const elRect = el.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();
    const left = elRect.left - listRect.left;
    const width = elRect.width;

    setIndicator({ left, width });

    // ✅ 모바일: 활성 탭이 안 보이면 track 안에서 부드럽게 보이게
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  useEffect(() => {
    updateIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, location.pathname]);

  useEffect(() => {
    const onResize = () => updateIndicator();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

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
                {/* ✅ 모바일 가로 스크롤 컨테이너 */}
                <div className="category-track" ref={trackRef}>
                  <ul className="category-list" ref={listRef}>
                    {categories.map((cat) => (
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

                    {/* ✅ 이동하는 인디케이터 */}
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
