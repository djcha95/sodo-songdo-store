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

  const scrollToSection = useCallback((section: 'primary' | 'secondary') => {
    const ref = section === 'primary' ? primaryRef : secondaryRef;
    if (!ref.current) return;
    
    // ✅ [수정] 스크롤 시작 전에 탭 활성 상태를 즉시 업데이트합니다.
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
  }, []);

  useEffect(() => {
    if (location.state?.scrollTo) {
      const { scrollTo } = location.state;
      setTimeout(() => {
        scrollToSection(scrollTo);
        navigate(location.pathname, { replace: true, state: {} });
      }, 100);
    }
  }, [location.state, navigate, scrollToSection]);

  useEffect(() => {
    if (location.pathname !== '/') return;
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
  }, [location.pathname, activeSection, isNavigating]);

  return (
    <TabContext.Provider value={{ activeSection, scrollToSection, isNavigating }}>
      <div className="customer-layout-container">
        <Header />
        <main className="customer-main-content">
          <Outlet context={{ primaryRef, secondaryRef }} />
        </main>
      </div>
    </TabContext.Provider>
  );
};

export default CustomerLayout;