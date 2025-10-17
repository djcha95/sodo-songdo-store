// src/components/common/Header.tsx

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/layouts/CustomerLayout';
// ✅ [추가] 관리자 아이콘 import
import { Flame, Clock, ShieldCheck } from 'lucide-react';
import './Header.css';

const Header: React.FC = () => {
  // ✅ [수정] isAdmin 값을 가져옵니다.
  const { isAdmin } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();
  const tabContext = useTabs();

  const shouldShowTabs = ['/', '/mypage/history'].includes(location.pathname);
  const isOnOrderPage = location.pathname === '/';

  const handleScroll = () => {
    if (!tabContext || tabContext.isNavigating) return;
    
    const currentScrollY = window.scrollY;
    if (currentScrollY < lastScrollY.current || currentScrollY < 10) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
    lastScrollY.current = currentScrollY;
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [tabContext?.isNavigating]);

  const handleTabClick = (section: 'primary' | 'secondary') => {
    if (isOnOrderPage) {
      tabContext?.scrollToSection(section);
    } else {
      navigate('/', { state: { scrollTo: section } });
    }
  };

  return (
    <header className={`new-customer-header ${isVisible ? 'visible' : 'hidden'}`}>
      <div className="header-content">
        <div className="header-left">
          {shouldShowTabs && tabContext ? (
            <div className="header-page-tabs">
              <button
                className={`page-tab primary ${tabContext.activeSection === 'primary' && isOnOrderPage ? 'active' : ''}`}
                onClick={() => handleTabClick('primary')}
              >
                <Flame size={16} />
                <span>공동구매</span>
              </button>
              <button
                className={`page-tab secondary ${tabContext.activeSection === 'secondary' && isOnOrderPage ? 'active' : ''}`}
                onClick={() => handleTabClick('secondary')}
              >
                <Clock size={16} />
                <span>추가예약</span>
              </button>
            </div>
          ) : (
            <div className="header-brand">
              <NavLink to="/" className="brand-link">
                소도몰
              </NavLink>
            </div>
          )}
        </div>

        <div className="header-right">
          <nav className="header-nav">
            <NavLink
              to="/mypage/history"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              예약내역
            </NavLink>

            {/* ✅ [추가] isAdmin이 true일 때만 이 버튼이 렌더링됩니다. */}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-item admin-link ${isActive ? 'active' : ''}`}
              >
                <ShieldCheck size={16} />
                <span>관리</span>
              </NavLink>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;