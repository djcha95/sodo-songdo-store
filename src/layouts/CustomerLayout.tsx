// src/layouts/CustomerLayout.tsx

import React, { useLayoutEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';

const CustomerLayout: React.FC = () => {
  const location = useLocation();
  // ✅ [수정] 모달 라우팅의 핵심: state에 background가 있으면, 현재 location 대신 배경 페이지의 location을 사용합니다.
  const background = location.state?.background;

  // 모달이 열렸을 때 배경 스크롤을 막는 로직
  useLayoutEffect(() => {
    if (background) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [background]);

  return (
    <div className="app-layout">
      <Header />
      <main className="main-content">
        {/* ✅ [수정] 자식 페이지(ProductListPage 등)를 보여주는 Outlet만 남깁니다. */}
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default CustomerLayout;