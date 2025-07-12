// src/components/admin/AdminLayout.tsx
import { Outlet } from 'react-router-dom';
import AdminSidebar from '@/components/admin/AdminSidebar';
import './AdminLayout.css';

import { useLocation, matchPath } from 'react-router-dom';
import React, { Suspense, useState, useEffect } from 'react';
// import { Menu } from 'lucide-react'; // 햄버거 아이콘은 이제 AdminSidebar에서 사용

// 페이지 컴포넌트 lazy import - 절대 경로 별칭 사용
const DashboardPage = React.lazy(() => import('@/pages/admin/DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('@/pages/admin/ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('@/pages/admin/ProductAddAdminPage'));
const SalesRoundEditPage = React.lazy(() => import('@/pages/admin/SalesRoundEditPage'));
const UserListPage = React.lazy(() => import('@/pages/admin/UserListPage'));
const UserDetailPage = React.lazy(() => import('@/pages/admin/UserDetailPage'));
const BannerAdminPage = React.lazy(() => import('@/pages/admin/BannerAdminPage'));
const CategoryManagementPage = React.lazy(() => import('@/pages/admin/CategoryManagementPage'));
const MinimalTestPage = React.lazy(() => import('@/pages/admin/MinimalTestPage'));
const AiProductPage = React.lazy(() => import('@/pages/admin/AiProductPage'));
const BoardAdminPage = React.lazy(() => import('@/pages/admin/BoardAdminPage'));
const CouponAdminPage = React.lazy(() => import('@/pages/admin/CouponAdminPage'));
const EncoreAdminPage = React.lazy(() => import('@/pages/admin/EncoreAdminPage'));
const OrderListPage = React.lazy(() => import('@/pages/admin/OrderListPage'));
const PickupProcessingPage = React.lazy(() => import('@/pages/admin/PickupProcessingPage'));
const ProductArrivalCalendar = React.lazy(() => import('@/components/admin/ProductArrivalCalendar'));


// 라우트 정보를 배열로 관리하여 제목을 동적으로 처리 (AdminLayout에서 사용)
const adminRoutes = [
  { path: '/admin/dashboard', title: '대시보드', element: <DashboardPage /> },
  { path: '/admin/products', title: '상품 목록', element: <ProductListPageAdmin /> },
  { path: '/admin/products/add', title: '상품 등록', element: <ProductAddAdminPage /> },
  { path: '/admin/products/edit/:productId', title: '상품 수정', element: <SalesRoundEditPage /> },
  { path: '/admin/categories', title: '카테고리 관리', element: <CategoryManagementPage /> },
  { path: '/admin/encore-requests', title: '앙코르 요청 관리', element: <EncoreAdminPage /> },
  { path: '/admin/ai-product', title: 'AI 상품 추천', element: <AiProductPage /> },
  { path: '/admin/orders', title: '주문 목록', element: <OrderListPage /> },
  { path: '/admin/pickup', title: '픽업 처리', element: <PickupProcessingPage /> },
  { path: '/admin/users', title: '고객 목록', element: <UserListPage /> },
  { path: '/admin/users/:userId', title: '고객 상세 정보', element: <UserDetailPage /> },
  { path: '/admin/coupons', title: '쿠폰 관리', element: <CouponAdminPage /> },
  { path: '/admin/banners', title: '배너 관리', element: <BannerAdminPage /> },
  { path: '/admin/board', title: '게시판 관리', element: <BoardAdminPage /> },
  { path: '/admin/product-arrivals', title: '상품 입고 관리', element: <ProductArrivalCalendar /> },
  { path: '/admin/test', title: '테스트 페이지', element: <MinimalTestPage /> },
];

const LoadingSpinner = () => <div className="loading-spinner">콘텐츠 로딩 중...</div>;

const AdminLayout = () => {
  const location = useLocation();
  // 사이드바의 열림/닫힘 상태를 AdminLayout에서 관리하며, 초기 상태는 '닫힘'으로 설정합니다.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 초기 상태를 false (닫힘)로 변경

  // 화면 너비가 작아지면 사이드바를 자동으로 닫도록 설정 (기존 로직 유지)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false); // 모바일에서는 항상 닫힘
      }
      // 데스크탑에서는 초기 상태가 false이므로, resize 시 열지 않습니다.
      // 수동으로만 열 수 있게 됩니다.
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 컴포넌트 마운트 시 초기 상태 설정

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // 현재 경로에 맞는 라우트 정보를 찾아 제목을 가져옵니다.
  const currentRoute = adminRoutes.find(route => matchPath(route.path, location.pathname));
  const currentPageTitle = currentRoute ? currentRoute.title : '관리자 페이지';


  return (
    <div className={`admin-layout ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
      <AdminSidebar
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar} // 사이드바 내 햄버거 버튼 제어를 위해 전달
      />

      {/* AdminSidebar 내부에 햄버거 버튼과 제목이 있으므로, 여기서의 고정 헤더는 제거 */}
      {/* <div className="admin-header-fixed">
        <button
          className="fixed-toggle-btn"
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? "메뉴 닫기" : "메뉴 펼치기"}
          title={isSidebarOpen ? "메뉴 닫기" : "메뉴 펼치기"}
        >
          <Menu size={24} />
        </button>
        <h1 className="admin-page-title">관리자페이지</h1>
      </div> */}

      <main className="admin-main-content">
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default AdminLayout;