// src/components/common/Header.tsx

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/layouts/CustomerLayout';
import { Flame, Clock, ShieldCheck } from 'lucide-react'; 
import './Header.css';

const Header: React.FC = () => {
  const { isAdmin } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();
  const tabContext = useTabs();

  // ✅ 경로 확인 로직
  const isModernPage = 
    location.pathname === '/' || 
    location.pathname.startsWith('/modern') || 
    location.pathname.startsWith('/product'); 

  const isHistoryPage = location.pathname === '/mypage/history';
  
  // ✅ 스위칭 버튼 로직 (텍스트 약간 수정)
  const navButtonConfig = isHistoryPage
    ? { to: '/', label: '홈으로', styleClass: 'shop-mode' } 
    : { to: '/mypage/history', label: '예약내역', styleClass: 'history-mode' };

  const shouldShowTabs = location.pathname.startsWith('/simple');
  const isOnLegacyOrderPage = location.pathname.startsWith('/simple');

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
    return () => { window.removeEventListener('scroll', handleScroll); };
  }, [tabContext?.isNavigating]);

  const handleTabClick = (section: 'primary' | 'secondary') => {
    if (isOnLegacyOrderPage) {
      tabContext?.scrollToSection(section);
    } else {
      navigate('/simple', { state: { scrollTo: section } });
    }
  };

  return (
    <header className={`new-customer-header ${isVisible ? 'visible' : 'hidden'}`}>
      <div className={`header-content ${isModernPage || isHistoryPage ? 'modern-layout' : ''}`}>
        <div className="header-left">
          {shouldShowTabs && tabContext ? (
            <div className="header-page-tabs">
              <button
                className={`page-tab primary ${tabContext.activeSection === 'primary' ? 'active' : ''}`}
                onClick={() => handleTabClick('primary')}
              >
                <Flame size={16} />
                <span>공동구매</span>
              </button>
              <button
                className={`page-tab secondary ${tabContext.activeSection === 'secondary' ? 'active' : ''}`}
                onClick={() => handleTabClick('secondary')}
              >
                <Clock size={16} />
                <span>추가예약</span>
              </button>
            </div>
          ) : (
            <div className="header-brand">
              <NavLink to="/" className="brand-link">
                {/* 🎄 크리스마스 분위기 로고 + 송도픽 네이밍 */}
                🎄 송도PICK
              </NavLink>
            </div>
          )}
        </div>

        <div className="header-right">
          <nav className="header-nav">
            {/* 스위칭 버튼 */}
            <NavLink
              to={navButtonConfig.to}
              className={`nav-item modern-text-btn ${navButtonConfig.styleClass}`}
            >
              {navButtonConfig.label}
            </NavLink>

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