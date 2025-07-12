// src/pages/admin/AdminPage.tsx
// AdminPage는 이제 AdminRoute의 자식으로 렌더링되며, AdminLayout 내에서 메인 콘텐츠를 담당합니다.
// AdminLayout에서 사이드바를 렌더링하므로, AdminPage에서는 사이드바를 제거하고 Outlet 대신 Routes를 직접 사용합니다.

import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom'; // useLocation, matchPath 제거
import './AdminPage.css'; // AdminPage의 메인 콘텐츠 영역 스타일

const LoadingSpinner = () => <div className="loading-spinner">콘텐츠 로딩 중...</div>;

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


// 라우트 정보를 배열로 관리하여 제목을 동적으로 처리
// AdminLayout.tsx로 이동하여 AdminLayout에서 currentPageTitle을 결정하도록 변경되었습니다.
// 여기서는 라우트 설정 자체만 유지합니다.
const adminRoutes = [
  { path: 'dashboard', element: <DashboardPage /> }, // '/admin/' 접두사 제외
  { path: 'products', element: <ProductListPageAdmin /> },
  { path: 'products/add', element: <ProductAddAdminPage /> },
  { path: 'products/edit/:productId', element: <SalesRoundEditPage /> },
  { path: 'categories', element: <CategoryManagementPage /> },
  { path: 'encore-requests', element: <EncoreAdminPage /> },
  { path: 'ai-product', element: <AiProductPage /> },
  { path: 'orders', element: <OrderListPage /> },
  { path: 'pickup', element: <PickupProcessingPage /> },
  { path: 'users', element: <UserListPage /> },
  { path: 'users/:userId', element: <UserDetailPage /> },
  { path: 'coupons', element: <CouponAdminPage /> },
  { path: 'banners', element: <BannerAdminPage /> },
  { path: 'board', element: <BoardAdminPage /> },
  { path: 'product-arrivals', element: <ProductArrivalCalendar /> },
  { path: 'test', element: <MinimalTestPage /> },
];

const AdminPage = () => {
  // useLocation, matchPath는 더 이상 필요하지 않으므로 제거
  return (
    <div className="admin-content">
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* 기본 경로는 대시보드로 리디렉션 */}
          <Route index element={<Navigate to="dashboard" replace />} />

          {/* 배열에 정의된 라우트를 동적으로 생성 */}
          {adminRoutes.map(route => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      </Suspense>
    </div>
  );
};

export default AdminPage;