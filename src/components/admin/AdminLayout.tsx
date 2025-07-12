// src/components/admin/AdminLayout.tsx
import { Outlet } from 'react-router-dom';
import AdminSidebar from '@/components/admin/AdminSidebar';
import './AdminLayout.css';

import { useLocation, matchPath } from 'react-router-dom';
import React, { Suspense, useState, useEffect } from 'react';

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
// ✅ [추가] 새로 만든 페이지 import
const ProductCategoryBatchPage = React.lazy(() => import('@/pages/admin/ProductCategoryBatchPage'));


// 라우트 정보를 배열로 관리하여 제목을 동적으로 처리 (AdminLayout에서 사용)
const adminRoutes = [
  { path: '/admin/dashboard', title: '대시보드', element: <DashboardPage /> },
  { path: '/admin/products', title: '상품 목록', element: <ProductListPageAdmin /> },
  { path: '/admin/products/add', title: '상품 등록', element: <ProductAddAdminPage /> },
  { path: '/admin/products/edit/:productId', title: '상품 수정', element: <SalesRoundEditPage /> },
  // ✅ [추가] 새 페이지의 제목 정보를 배열에 추가
  { path: '/admin/products/batch-category', title: '카테고리 일괄 관리', element: <ProductCategoryBatchPage /> },
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const currentRoute = adminRoutes.find(route => matchPath(route.path, location.pathname));
  const currentPageTitle = currentRoute ? currentRoute.title : '관리자 페이지';

  // 페이지 제목을 document.title에 설정 (브라우저 탭에 표시)
  useEffect(() => {
    document.title = `${currentPageTitle} - 소도몰 관리자`;
  }, [currentPageTitle]);


  return (
    <div className={`admin-layout ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
      <AdminSidebar
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
      />

      <main className="admin-main-content">
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default AdminLayout;