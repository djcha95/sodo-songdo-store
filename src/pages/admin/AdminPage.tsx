// src/pages/admin/AdminPage.tsx

import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, matchPath, Link } from 'react-router-dom';
import AdminSidebar from '../../components/admin/AdminSidebar';
import './AdminPage.css';
import { Home } from 'lucide-react';

const LoadingSpinner = () => <div className="loading-spinner">로딩 중...</div>;

// 페이지 컴포넌트 lazy import
const DashboardPage = React.lazy(() => import('./DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('./ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('./ProductAddAdminPage'));
const ProductEditAdminPage = React.lazy(() => import('./ProductEditAdminPage'));
const UserListPage = React.lazy(() => import('./UserListPage'));
const UserDetailPage = React.lazy(() => import('./UserDetailPage'));
const BannerAdminPage = React.lazy(() => import('./BannerAdminPage'));
const CategoryManagementPage = React.lazy(() => import('./CategoryManagementPage'));
const MinimalTestPage = React.lazy(() => import('./MinimalTestPage'));
const AiProductPage = React.lazy(() => import('./AiProductPage'));
const BoardAdminPage = React.lazy(() => import('./BoardAdminPage'));
const CouponAdminPage = React.lazy(() => import('./CouponAdminPage'));
const EncoreAdminPage = React.lazy(() => import('./EncoreAdminPage'));
const OrderListPage = React.lazy(() => import('./OrderListPage'));
const PickupProcessingPage = React.lazy(() => import('./PickupProcessingPage'));
// [추가] 관리자용 입고 달력 컴포넌트 import
const ProductArrivalCalendar = React.lazy(() => import('../../components/admin/ProductArrivalCalendar'));


// --- 개선: 라우트 정보를 배열로 관리하여 제목을 동적으로 처리 ---
const adminRoutes = [
  { path: '/admin/dashboard', title: '대시보드', element: <DashboardPage /> },
  { path: '/admin/products', title: '상품 목록', element: <ProductListPageAdmin /> },
  { path: '/admin/products/add', title: '상품 등록', element: <ProductAddAdminPage /> },
  { path: '/admin/products/edit/:productId', title: '상품 수정', element: <ProductEditAdminPage /> },
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
  // [추가] ProductArrivalCalendar 라우트 추가
  { path: '/admin/product-arrivals', title: '상품 입고 관리', element: <ProductArrivalCalendar /> },
  { path: '/admin/test', title: '테스트 페이지', element: <MinimalTestPage /> },
];

const AdminPage = () => {
  const location = useLocation();

  // 현재 경로에 맞는 라우트 정보를 찾아 제목을 가져옵니다.
  const currentRoute = adminRoutes.find(route => matchPath(route.path, location.pathname));
  const currentPageTitle = currentRoute ? currentRoute.title : '관리자 페이지';

  return (
    <div className="admin-layout">
      <AdminSidebar />
      {/* --- 개선: CSS 구조에 맞춰 main 영역을 header와 content로 분리 --- */}
      <main className="admin-main">
        <header className="admin-header">
          <h1>{currentPageTitle}</h1>
          {/* 고객 페이지로 이동하는 퀵메뉴 추가 */}
          <Link to="/" className="customer-page-quick-link" title="고객 페이지로 이동">
            <Home size={20} />
            <span>고객 페이지</span>
          </Link>
        </header>
        <div className="admin-content">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* 기본 경로는 대시보드로 리디렉션 */}
              <Route index element={<Navigate to="dashboard" replace />} />

              {/* 배열에 정의된 라우트를 동적으로 생성 */}
              {adminRoutes.map(route => (
                // '/admin' 접두사를 제외한 경로를 path로 사용
                <Route key={route.path} path={route.path.substring(7)} element={route.element} />
              ))}
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default AdminPage;