// src/main.tsx (수정본)

import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import './index.css';

import App from './App';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

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
const StoreInfoPage = React.lazy(() => import('./pages/customer/StoreInfoPage'));
const OnsiteSalePage = React.lazy(() => import('./pages/customer/OnsiteSalePage'));


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
const OrderListPage = React.lazy(() => import('@/pages/admin/OrderListPage'));
const PickupProcessingPage = React.lazy(() => import('@/pages/admin/PickupProcessingPage'));
const ProductArrivalCalendar = React.lazy(() => import('@/components/admin/ProductArrivalCalendar'));
// ✅ [추가] '카테고리 일괄 변경' 페이지 import
const ProductCategoryBatchPage = React.lazy(() => import('@/pages/admin/ProductCategoryBatchPage'));


const ProductDetailPageWrapper = () => {
  const { productId } = useParams<{ productId: string }>();
  return productId ? <ProductDetailPage productId={productId} isOpen={true} onClose={() => window.history.back()} /> : null;
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "login", element: <LoginPage /> },

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
              { path: 'products/edit/:productId', element: <SalesRoundEditPage /> },
              // ✅ [추가] '카테고리 일괄 변경' 페이지 경로 추가
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
          { path: "store-info", element: <StoreInfoPage /> },
          {
            path: "mypage",
            children: [
              { index: true, element: <MyPage /> },
              { path: "history", element: <OrderHistoryPage /> },
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
  <>
    <Toaster
      position="top-center"
      reverseOrder={false}
      toastOptions={{
        style: {
          borderRadius: '8px',
          background: 'var(--toast-bg-dark, #333)',
          color: 'var(--toast-text-light, #fff)',
        },
        success: { duration: 2000 },
        error: { duration: 4000 },
      }}
    />
    <RouterProvider router={router} />
  </>
);