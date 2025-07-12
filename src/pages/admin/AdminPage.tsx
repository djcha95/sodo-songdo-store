// src/pages/admin/AdminPage.tsx

import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './AdminPage.css';

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
// ✅ [추가] 새로 만들 페이지를 lazy import 합니다.
const ProductCategoryBatchPage = React.lazy(() => import('@/pages/admin/ProductCategoryBatchPage'));


const adminRoutes = [
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'products', element: <ProductListPageAdmin /> },
  { path: 'products/add', element: <ProductAddAdminPage /> },
  { path: 'products/edit/:productId', element: <SalesRoundEditPage /> },
  // ✅ [추가] 상품 관리 하위에 새 페이지 경로를 추가합니다.
  { path: 'products/batch-category', element: <ProductCategoryBatchPage /> },
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
  return (
    <div className="admin-content">
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          {adminRoutes.map(route => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      </Suspense>
    </div>
  );
};

export default AdminPage;