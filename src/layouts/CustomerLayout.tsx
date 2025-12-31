// src/layouts/CustomerLayout.tsx

import React, { useState, useRef, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
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

  // ✅ 고객 페이지는 모두 "Modern Shell" 기준으로 통일합니다.
  // (헤더 폭 900px / 바깥 #F9FAFB / 안쪽 흰 시트)
  const isModernPage = true;

  const scrollToSection = useCallback((section: 'primary' | 'secondary') => {
    const ref = section === 'primary' ? primaryRef : secondaryRef;
    if (!ref.current) return;
    
    setActiveSection(section);
    setIsNavigating(true);
    
    // 모던 페이지(desktop-app-wrapper)에서는 window 스크롤을 사용
    const STICKY_HEADER_TOP_OFFSET = 60; 
    const EXTRA_MARGIN = 15;
    const elementPosition = ref.current.getBoundingClientRect().top;
    const offsetPosition = window.pageYOffset + elementPosition - (STICKY_HEADER_TOP_OFFSET + EXTRA_MARGIN);
    
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });

    setTimeout(() => {
      setIsNavigating(false);
    }, 1000);
  }, []); // 의존성 배열 비움 (Ref는 stable하므로)

  // 기존 스크롤 스파이 로직 (레거시 페이지용)
  useEffect(() => {
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

  // ✅ [중요 최적화] Context 객체들을 useMemo로 감싸서
  // 라우트 이동(location 변경) 시에도 객체 참조가 유지되도록 함
  const tabContextValue = useMemo(() => ({ 
    activeSection, 
    scrollToSection, 
    isNavigating 
  }), [activeSection, scrollToSection, isNavigating]);

  const outletContextValue = useMemo(() => ({ 
    primaryRef, 
    secondaryRef 
  }), [primaryRef, secondaryRef]); // Refs는 변경되지 않지만 명시

  return (
    <TabContext.Provider value={tabContextValue}>
      {/* 1. Header는 최상위에 위치 */}
      <Header />
      
      {/* 2. 래퍼는 메인 컨텐츠만 감싸도록 변경 */}
      <div className={isModernPage ? "desktop-app-wrapper" : "customer-layout-container"}>
        <main className={isModernPage ? "mobile-app-view" : "customer-main-content"}>
          {/* Outlet에 전달되는 context가 변경되지 않아야 하위 컴포넌트가 유지됨 */}
          <Outlet context={outletContextValue} />
        </main>
      </div>
      
    </TabContext.Provider>
  );
};

export default CustomerLayout;