// src/main.tsx

import React, { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';
import './index.css';

import App from './App';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

// 페이지 컴포넌트 lazy loading
import ProductListPage from './pages/customer/ProductListPage';
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));

// ✅ [수정] ProductDetailPage에 props를 전달하기 위한 Wrapper 컴포넌트
const ProductDetailPageWrapper = () => {
  const { productId } = useParams<{ productId: string }>();
  // 단독 페이지로 열렸을 때는 항상 열려있고, 닫기 버튼은 뒤로 가기 동작을 하도록 설정
  // productId가 없을 경우를 대비해 null을 반환하는 방어 코드 추가
  return productId ? <ProductDetailPage productId={productId} isOpen={true} onClose={() => window.history.back()} /> : null;
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "admin/*",
        element: (
          <ProtectedRoute adminOnly={true}>
            <Suspense fallback={<LoadingSpinner />}>
              <AdminPage />
            </Suspense>
          </ProtectedRoute>
        ),
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
          {
            index: true,
            element: <ProductListPage />,
          },
        ]
      },
      // ✅ [수정] 모달이 아닌 단독 페이지로 열릴 상세 페이지 경로
      // 모달 라우팅은 CustomerLayout 내부에서 처리됩니다.
      {
        path: "/product/:productId",
        element: (
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <ProductDetailPageWrapper />
            </Suspense>
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);