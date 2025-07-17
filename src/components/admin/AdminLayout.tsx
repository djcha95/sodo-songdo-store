// src/components/admin/AdminLayout.tsx
import { useState, useEffect, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from '@/components/admin/AdminSidebar';
// ✅ [추가] InlineSodamallLoader를 import 합니다.
import InlineSodamallLoader from '@/components/common/InlineSodamallLoader';
import './AdminLayout.css';

// ❗ [제거] 로컬 LoadingSpinner 컴포넌트는 더 이상 사용하지 않으므로 제거합니다.

const AdminLayout = () => {
  // 사이드바의 열림/닫힘 상태를 AdminLayout에서 관리합니다.
  // main.tsx의 관리자 라우팅 복원과 일관성을 위해 초기값 true로 복원
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 화면 크기에 따라 사이드바 상태를 자동으로 조절하는 로직 복원
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 컴포넌트 마운트 시 한번 실행

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className={`admin-layout ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
      <AdminSidebar
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
      />
      <main className="admin-main-content">
        {/* ✅ [수정] Suspense의 fallback을 InlineSodamallLoader로 교체합니다. */}
        <Suspense fallback={<InlineSodamallLoader />}>
          {/* 자식 라우트(각 관리자 페이지)가 여기에 렌더링됩니다. */}
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default AdminLayout;