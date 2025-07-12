// src/main.tsx (수정본)

// ✅ [수정] StrictMode는 제거하고 React만 남깁니다.
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; 

import './index.css';

import App from './App'; 
import ProtectedRoute from './components/ProtectedRoute'; 
import LoadingSpinner from './components/LoadingSpinner'; 

// 페이지 컴포넌트 lazy loading
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));
const AdminRoute = React.lazy(() => import('./components/admin/AdminRoute'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const ProductListPage = React.lazy(() => import('./pages/customer/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const StoreInfoPage = React.lazy(() => import('./pages/customer/StoreInfoPage'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));

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
      {
        path: "admin/*", 
        element: (
          <ProtectedRoute adminOnly={true}>
            <Suspense fallback={<LoadingSpinner />}>
              <AdminLayout /> 
            </Suspense>
          </ProtectedRoute>
        ),
        children: [
          {
            path: "*", 
            element: (
              <Suspense fallback={<LoadingSpinner />}>
                <AdminPage />
              </Suspense>
            ),
          },
        ],
      },
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
          {
            path: "mypage",
            children: [
              { index: true, element: <MyPage /> },
              { path: "history", element: <OrderHistoryPage /> },
              { path: "store-info", element: <StoreInfoPage /> },
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
  // ✅ [수정] StrictMode를 제거하고 React Fragment(<></>)로 감쌉니다.
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