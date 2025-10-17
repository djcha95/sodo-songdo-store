// src/components/admin/AdminLayout.tsx
import { useState, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from '@/components/admin/AdminSidebar';
import SodomallLoader from '@/components/common/SodomallLoader';
import './AdminLayout.css';

const AdminLayout = () => {
  // 사이드바의 열림/닫힘 상태는 데스크톱에서만 사용됩니다.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // ❗ [중요] 화면 크기를 감지하던 useEffect를 완전히 삭제합니다.
  // 이 로직이 모바일 레이아웃 오류의 핵심 원인이었습니다.

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
        <Suspense fallback={<SodomallLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default AdminLayout;