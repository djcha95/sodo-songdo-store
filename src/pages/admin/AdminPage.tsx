// src/pages/admin/AdminPage.tsx

import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, Link, useMatches } from 'react-router-dom';
import AdminSidebar from '../../components/admin/AdminSidebar';
import './AdminPage.css';
import { Home } from 'lucide-react';

const LoadingSpinner = () => <div className="loading-spinner">로딩 중...</div>;

// --- 페이지 컴포넌트 Lazy Loading ---
const DashboardPage = React.lazy(() => import('./DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('./ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('./ProductAddAdminPage'));
const ProductCoreInfoEditPage = React.lazy(() => import('./ProductCoreInfoEditPage'));
const SalesRoundEditPage = React.lazy(() => import('./SalesRoundEditPage'));
const CategoryManagementPage = React.lazy(() => import('./CategoryManagementPage'));
const OrderListPage = React.lazy(() => import('./OrderListPage'));
const PickupProcessingPage = React.lazy(() => import('./PickupProcessingPage'));
const UserListPage = React.lazy(() => import('./UserListPage'));
const UserDetailPage = React.lazy(() => import('./UserDetailPage'));
const BannerAdminPage = React.lazy(() => import('./BannerAdminPage'));

// --- 라우트 정보 배열 ---
// ✅ [개선] path를 상대 경로로 변경하고, 페이지 제목을 handle 객체에 담아 관리합니다.
const adminRoutes = [
  { path: 'dashboard', handle: { title: '대시보드' }, element: <DashboardPage /> },
  { path: 'products', handle: { title: '상품 목록' }, element: <ProductListPageAdmin /> },
  { path: 'products/add', handle: { title: '신규 상품 등록' }, element: <ProductAddAdminPage /> },
  { path: 'rounds/add', handle: { title: '새 회차 추가' }, element: <ProductAddAdminPage /> },
  { path: 'products/edit-core/:productId', handle: { title: '대표 정보 수정' }, element: <ProductCoreInfoEditPage /> },
  { path: 'rounds/edit/:productId/:roundId', handle: { title: '판매 회차 수정' }, element: <SalesRoundEditPage /> },
  { path: 'categories', handle: { title: '카테고리 관리' }, element: <CategoryManagementPage /> },
  { path: 'orders', handle: { title: '주문 목록' }, element: <OrderListPage /> },
  { path: 'pickup', handle: { title: '픽업 처리' }, element: <PickupProcessingPage /> },
  { path: 'users', handle: { title: '고객 목록' }, element: <UserListPage /> },
  { path: 'users/:userId', handle: { title: '고객 상세 정보' }, element: <UserDetailPage /> },
  { path: 'banners', handle: { title: '배너 관리' }, element: <BannerAdminPage /> },
];

const AdminPage = () => {
  // ✅ [개선] useMatches 훅을 사용하여 현재 경로의 정보를 더 효율적으로 가져옵니다.
  const matches = useMatches();
  
  // 현재 경로와 일치하는 가장 마지막 match의 handle에서 title을 찾습니다.
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
              {/* /admin 접속 시 /admin/dashboard로 자동 이동 */}
              <Route index element={<Navigate to="dashboard" replace />} />
              
              {/* ✅ [개선] path를 직접 사용하여 라우트를 생성합니다. */}
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