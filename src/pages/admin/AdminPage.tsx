// src/pages/admin/AdminPage.tsx

import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useMatches, Link } from 'react-router-dom';
import AdminSidebar from '../../components/admin/AdminSidebar';
import './AdminPage.css';
import { Home } from 'lucide-react';

const LoadingSpinner = () => <div className="admin-loading-spinner">페이지를 불러오는 중...</div>;

// --- 페이지 컴포넌트 Lazy Loading ---
const DashboardPage = React.lazy(() => import('./DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('./ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('./ProductAddAdminPage'));
const SalesRoundEditPage = React.lazy(() => import('./SalesRoundEditPage'));
const CategoryManagementPage = React.lazy(() => import('./CategoryManagementPage'));
const OrderManagementPage = React.lazy(() => import('./OrderManagementPage')); // ✅ 새로 추가
const PickupProcessingPage = React.lazy(() => import('./PickupProcessingPage'));
const UserListPage = React.lazy(() => import('./UserListPage'));
const UserDetailPage = React.lazy(() => import('./UserDetailPage'));
const BannerAdminPage = React.lazy(() => import('./BannerAdminPage'));

// --- 라우트 정보 배열 (정리된 버전) ---
const adminRoutes = [
  { path: 'dashboard', handle: { title: '대시보드' }, element: <DashboardPage /> },
  { path: 'products', handle: { title: '상품 목록' }, element: <ProductListPageAdmin /> },
  { path: 'products/add', handle: { title: '신규 상품 등록' }, element: <ProductAddAdminPage /> },
  { path: 'rounds/add', handle: { title: '새 회차 추가' }, element: <ProductAddAdminPage /> },
  { path: 'rounds/edit/:productId/:roundId', handle: { title: '판매 회차 수정' }, element: <SalesRoundEditPage /> },
  { path: 'categories', handle: { title: '카테고리 관리' }, element: <CategoryManagementPage /> },
  // ✅ '/admin/orders' 경로의 element를 OrderManagementPage로 교체합니다.
  { path: 'orders', handle: { title: '주문 통합 관리' }, element: <OrderManagementPage /> },
  { path: 'pickup', handle: { title: '픽업 처리' }, element: <PickupProcessingPage /> },
  { path: 'users', handle: { title: '고객 목록' }, element: <UserListPage /> },
  { path: 'users/:userId', handle: { title: '고객 상세 정보' }, element: <UserDetailPage /> },
  { path: 'banners', handle: { title: '배너 관리' }, element: <BannerAdminPage /> },
];

const AdminPage = () => {
  const matches = useMatches();
  const currentPageTitle = (matches[matches.length - 1]?.handle as { title: string })?.title || '관리자 페이지';

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <header className="admin-header">
          <h1>{currentPageTitle}</h1>
          <Link to="/" className="customer-page-quick-link" title="고객 페이지로 이동">
            <Home size={20} />
            <span>고객 페이지</span>
          </Link>
        </header>
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
      </main>
    </div>
  );
};

export default AdminPage;