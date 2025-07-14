// src/main.tsx

import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import './index.css';

import App from './App';
// 경로 수정: components/common/ 에서 components/ 로 변경
import ProtectedRoute from './components/common/ProtectedRoute';
import LoadingSpinner from './components/common/LoadingSpinner';

// Context impor  (AuthContext의 loading 상태를 사용하기 위함)
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/toast-styles.css';

// --- 페이지 컴포넌트 lazy loading ---

// 레이아웃 컴포넌트
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));
const AdminRoute = React.lazy(() => import('./components/admin/AdminRoute'));

// 고객 페이지
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const ProductListPage = React.lazy(() => import('./pages/customer/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
// CustomerCenterPage와 PointHistoryPage 복원
const CustomerCenterPage = React.lazy(() => import('./pages/customer/CustomerCenterPage'));
const PointHistoryPage = React.lazy(() => import('./pages/customer/PointHistoryPage'));
const OnsiteSalePage = React.lazy(() => import('./pages/customer/OnsiteSalePage'));
const TermsPage = React.lazy(() => import('./pages/customer/TermsPage'));
const PrivacyPolicyPage = React.lazy(() => import('./pages/customer/PrivacyPolicyPage'));


// 관리자 페이지 (AdminLayout에서 이전)
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
const OrderManagementPage = React.lazy(() => import('@/pages/admin/OrderManagementPage'));
const PickupProcessingPage = React.lazy(() => import('@/pages/admin/PickupProcessingPage'));
const ProductArrivalCalendar = React.lazy(() => import('@/components/admin/ProductArrivalCalendar'));
const ProductCategoryBatchPage = React.lazy(() => import('@/pages/admin/ProductCategoryBatchPage'));


const ProductDetailPageWrapper = () => {
  const { productId } = useParams<{ productId: string }>();
  return productId ? <ProductDetailPage productId={productId} isOpen={true} onClose={() => window.history.back()} /> : null;
};

// AuthContext의 loading 상태에 따라 RouterProvider 렌더링을 제어할 컴포넌트
const RouterWrapper = () => {
  const { loading } = useAuth(); // AuthContext에서 loading 상태를 가져옵니다.

  if (loading) {
    return <LoadingSpinner />;
  }

  return <RouterProvider router={router} />;
};


const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "login", element: <LoginPage /> },
      {
        path: "terms",
        element: (
          <Suspense fallback={<LoadingSpinner />}>
            <TermsPage />
          </Suspense>
        ),
      },
      {
        path: "privacy",
        element: (
          <Suspense fallback={<LoadingSpinner />}>
            <PrivacyPolicyPage />
          </Suspense>
        ),
      },

      // --- 관리자 경로 ---
      {
        path: "admin",
        element: (
          <Suspense fallback={<LoadingSpinner />}>
            <AdminRoute />
          </Suspense>
        ),
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="/admin/dashboard" replace /> },
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'products', element: <ProductListPageAdmin /> },
              { path: 'products/add', element: <ProductAddAdminPage /> },
              { path: 'products/edit/:productId/:roundId', element: <SalesRoundEditPage /> },
              { path: 'products/batch-category', element: <ProductCategoryBatchPage /> },
              { path: 'categories', element: <CategoryManagementPage /> },
              { path: 'encore-requests', element: <EncoreAdminPage /> },
              { path: 'ai-product', element: <AiProductPage /> },
              { path: 'orders', element: <OrderManagementPage /> },
              { path: 'pickup', element: <PickupProcessingPage /> },
              { path: 'users', element: <UserListPage /> },
              { path: 'users/:userId', element: <UserDetailPage /> },
              { path: 'coupons', element: <CouponAdminPage /> },
              { path: 'banners', element: <BannerAdminPage /> },
              { path: 'board', element: <BoardAdminPage /> },
              { path: 'product-arrivals', element: <ProductArrivalCalendar /> },
              { path: 'test', element: <MinimalTestPage /> },
            ]
          }
        ]
      },
      // --- End of Admin Routes ---

      // --- 고객 페이지 레이아웃 ---
      {
        element: (
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <CustomerLayout />
            </Suspense>
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <ProductListPage /> },
          { path: "cart", element: <CartPage /> },
          { path: "onsite-sale", element: <OnsiteSalePage /> },
          { path: "store-info", element: <CustomerCenterPage /> }, // CustomerCenterPage 복원
          {
            path: "mypage",
            children: [
              { index: true, element: <MyPage /> },
              { path: "history", element: <OrderHistoryPage /> },
              { path: "points", element: <PointHistoryPage /> }, // PointHistoryPage 복원
            ]
          },
        ]
      },
      {
        path: "product/:productId",
        element: (
          <Suspense fallback={<LoadingSpinner />}>
            <ProductDetailPageWrapper />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "*",
    element: (
      <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.5rem', color: '#666' }}>
        404 - 페이지를 찾을 수 없습니다.
      </div>
    ),
  },
]);

createRoot(document.getElementById('root')!).render(
  // ✅ [수정] StrictMode를 제거하여 배포 오류를 해결합니다.
  <React.Fragment>
    <Toaster
      position="top-center"
      reverseOrder={false}
      toastOptions={{
        style: { // toastOptions.style 추가
          borderRadius: '8px',
          background: 'var(--toast-bg-dark, #333)',
          color: 'var(--toast-text-light, #fff)',
        },
        success: { duration: 2000 },
        error: { duration: 4000 },
      }}
    />
    {/* AuthProvider로 RouterWrapper 감싸기 */}
    <AuthProvider> 
      <RouterWrapper />
    </AuthProvider>
  </React.Fragment>
);