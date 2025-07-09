// src/main.tsx

import React, { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';
import './index.css';

// ✅ Toaster를 여기서 import 합니다.
import { Toaster } from 'react-hot-toast';

import App from './App';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

// 페이지 컴포넌트 lazy loading
import ProductListPage from './pages/customer/ProductListPage';
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));


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
    {/* ✅ Toaster를 RouterProvider 바깥에, 최상단에 위치시킵니다. */}
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