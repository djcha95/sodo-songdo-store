// src/main.tsx

import React, { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';
import './index.css';

import { Toaster } from 'react-hot-toast';

import App from './App';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

// 페이지 컴포넌트 lazy loading
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const ProductListPage = React.lazy(() => import('./pages/customer/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));
// ✅ [추가] 마이페이지 관련 컴포넌트들을 lazy import 합니다.
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const StoreInfoPage = React.lazy(() => import('./pages/customer/StoreInfoPage'));


const ProductDetailPageWrapper = () => {
  const { productId } = useParams<{ productId: string }>();
  // ✅ onClose 로직을 window.history.back()으로 변경하여 모달처럼 동작하게 합니다.
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
            <Suspense fallback={<LoadingSpinner />}> <AdminPage /> </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        element: (
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}> <CustomerLayout /> </Suspense>
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <ProductListPage /> },
          { path: "cart", element: <CartPage /> },
          // ✅ [추가] '/mypage' 와 그 하위 경로들을 설정합니다.
          {
            path: "mypage",
            children: [
              {
                index: true, // '/mypage' 경로로 접속 시 MyPage 컴포넌트를 보여줍니다.
                element: <MyPage />
              },
              {
                path: "history", // '/mypage/history' 경로
                element: <OrderHistoryPage />
              },
              {
                path: "store-info", // '/mypage/store-info' 경로
                element: <StoreInfoPage />
              },
              // TODO: 픽업 달력 페이지 추가 필요
              // {
              //   path: "orders",
              //   element: <OrderCalendarPage />
              // }
            ]
          }
        ]
      },
      {
        path: "/product/:productId",
        element: (
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}> <ProductDetailPageWrapper /> </Suspense>
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toaster 
      position="top-center" 
      reverseOrder={false}
      toastOptions={{
        style: {
          borderRadius: '8px',
          background: '#333',
          color: '#fff',
        },
        success: { duration: 2000 },
        error: { duration: 4000 },
      }}
    />
    <RouterProvider router={router} />
  </StrictMode>,
);