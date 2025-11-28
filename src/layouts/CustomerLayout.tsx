// src/layouts/CustomerLayout.tsx

import React, { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import Header from '@/components/common/Header';
import './CustomerLayout.css';

interface TabContextType {
  activeSection: 'primary' | 'secondary';
  scrollToSection: (section: 'primary' | 'secondary') => void;
  isNavigating: boolean;
}
export const TabContext = createContext<TabContextType | null>(null);
export const useTabs = () => useContext(TabContext);

type OutletContextType = {
  primaryRef: React.RefObject<HTMLDivElement>;
  secondaryRef: React.RefObject<HTMLDivElement>;
};
export const usePageRefs = () => useOutletContext<OutletContextType>();

const CustomerLayout: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'primary' | 'secondary'>('primary');
  const [isNavigating, setIsNavigating] = useState(false);
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ [수정] 메인('/')도 이제 모던 페이지입니다.
  const isModernPage = 
    location.pathname === '/' ||
    location.pathname.startsWith('/modern') || 
    location.pathname.includes('/history') ||
    location.pathname.includes('/product/'); // 상세 페이지 포함

  const scrollToSection = useCallback((section: 'primary' | 'secondary') => {
    const ref = section === 'primary' ? primaryRef : secondaryRef;
    if (!ref.current) return;
    
    setActiveSection(section);
    setIsNavigating(true);
    
    const STICKY_HEADER_TOP_OFFSET = 60; 
    const EXTRA_MARGIN = 15;
    const elementPosition = ref.current.getBoundingClientRect().top;
    const offsetPosition = window.pageYOffset + elementPosition - (STICKY_HEADER_TOP_OFFSET + EXTRA_MARGIN);
    
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });

    setTimeout(() => {
      setIsNavigating(false);
    }, 1000);
  }, [location.pathname]);

  // 기존 스크롤 스파이 로직 (레거시 페이지용)
  useEffect(() => {
    // ✅ 모던 페이지인 경우 작동하지 않음
    if (isModernPage) return;

    const handleScroll = () => {
      if (!primaryRef.current || !secondaryRef.current || isNavigating) return;
      
      const triggerLine = 60 + 15;
      const primaryTop = primaryRef.current.getBoundingClientRect().top;
      const secondaryTop = secondaryRef.current.getBoundingClientRect().top;
      
      if (primaryTop <= triggerLine && secondaryTop > triggerLine) {
        if (activeSection !== 'primary') setActiveSection('primary');
      } else if (secondaryTop <= triggerLine) {
        if (activeSection !== 'secondary') setActiveSection('secondary');
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname, activeSection, isNavigating, isModernPage]);

  return (
    <TabContext.Provider value={{ activeSection, scrollToSection, isNavigating }}>
      {/* 1. Header는 최상위에 위치 */}
      <Header />
      
      {/* 2. 래퍼는 메인 컨텐츠만 감싸도록 변경 */}
      <div className={isModernPage ? "desktop-app-wrapper" : "customer-layout-container"}>
        <main className={isModernPage ? "mobile-app-view" : "customer-main-content"}>
          <Outlet context={{ primaryRef, secondaryRef }} />
        </main>
      </div>
      
    </TabContext.Provider>
  );
};

export default CustomerLayout;