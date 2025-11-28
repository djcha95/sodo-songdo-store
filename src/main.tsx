// src/main.tsx
import '@/utils/dayjsSetup';
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';

import App from './App';
import SodomallLoader from '@/components/common/SodomallLoader';
import { AuthProvider, useAuth } from './context/AuthContext';

// --- 페이지 컴포넌트 lazy loading ---

// 1. 고객용 페이지
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));

// ✅ 기존 심플 디자인 (이제 레거시 경로로 이동)
const SimpleOrderPage = React.lazy(() => import('./pages/customer/SimpleOrderPage')); 

// ✅ 모던 디자인 (이제 메인 페이지!)
const ModernProductList = React.lazy(() => import('./pages/customer/ModernProductList')); 

const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const TermsPage = React.lazy(() => import('./pages/customer/TermsPage'));
const PrivacyPolicyPage = React.lazy(() => import('./pages/customer/PrivacyPolicyPage'));

// 2. 관리자용 페이지
const AdminLayout = React.lazy(() => import('@/components/admin/AdminLayout'));
const DashboardPage = React.lazy(() => import('@/pages/admin/DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('@/pages/admin/ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('@/pages/admin/ProductAddAdminPage'));
const SalesRoundEditPage = React.lazy(() => import('@/pages/admin/SalesRoundEditPage'));
const UserListPage = React.lazy(() => import('@/pages/admin/UserListPage'));
const UserDetailPage = React.lazy(() => import('@/pages/admin/UserDetailPage'));
const OrderManagementPage = React.lazy(() => import('@/pages/admin/OrderManagementPage'));
const QuickCheckPage = React.lazy(() => import('@/pages/admin/QuickCheckPage'));
const CreateOrderPage = React.lazy(() => import('@/pages/admin/CreateOrderPage'));
const PrepaidCheckPage = React.lazy(() => import('@/pages/admin/PrepaidCheckPage'));
const PickupCheckPage = React.lazy(() => import('@/pages/admin/PickupCheckPage'));
const AdminStockPage = React.lazy(() => import('@/pages/admin/AdminStockPage'));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 30, retry: 1, },
  },
});

// --- 접근 제어 레이아웃 ---
const AuthLayout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SodomallLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
};

const PublicLayout = () => {
  const { user, loading } = useAuth();
  if (loading) return <SodomallLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
};

const AdminRoute = () => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <SodomallLoader />;
  if (!user || !isAdmin) return <Navigate to="/" replace />; 
  return <AdminLayout />;
};


// --- ✅ [수정] 최종 라우터 설정 ---
const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/terms", element: <TermsPage /> },
      { path: "/privacy", element: <PrivacyPolicyPage /> },
    ]
  },
  {
    path: "/",
    element: <AuthLayout />,
    children: [
      {
        element: <App />,
        children: [
          // --- 고객용 경로 ---
          {
            element: <CustomerLayout />,
            children: [
              // ✅ 1. 메인 페이지를 'ModernProductList'로 교체
              { 
                path: "/", 
                element: <ModernProductList />, 
                children: [
                  { path: "product/:productId", element: <ProductDetailPage /> }
                ]
              },
              
              // ✅ 2. 기존 심플 디자인은 '/simple' 경로로 보존 (선택 사항)
              { 
                path: "simple", 
                element: <SimpleOrderPage />, 
                children: [
                  { path: "product/:productId", element: <ProductDetailPage /> }
                ]
              },

              // ✅ 3. 기존 '/modern' 경로도 호환성을 위해 유지 (메인과 동일)
              { 
                path: "modern", 
                element: <ModernProductList />, 
                children: [
                  { path: "product/:productId", element: <ProductDetailPage /> }
                ]
              },

              { path: "mypage/history", element: <OrderHistoryPage /> },
            ]
          },
          
          // --- 관리자용 경로 (그대로 유지) ---
          {
            path: "admin",
            element: <AdminRoute />,
            children: [
                { index: true, element: <DashboardPage /> },
                { path: 'dashboard', element: <DashboardPage /> },
                { path: 'pickup-check', element: <PickupCheckPage /> },
                { path: 'quick-check', element: <QuickCheckPage /> },
                { path: 'prepaid-check', element: <PrepaidCheckPage /> },
                { path: 'products', element: <ProductListPageAdmin /> },
                { path: 'products/add', element: <ProductAddAdminPage /> },
                { path: 'products/edit/:productId/:roundId', element: <SalesRoundEditPage /> },
                { path: 'stock', element: <AdminStockPage /> },
                { path: 'orders', element: <OrderManagementPage /> },
                { path: 'create-order', element: <CreateOrderPage /> },
                { path: 'users', element: <UserListPage /> },
                { path: 'users/:userId', element: <UserDetailPage /> },
            ]
          }
        ]
      },
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);


// --- AppProviders ---
const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const providers = [
    (props: { children: React.ReactNode }) => <QueryClientProvider client={queryClient} {...props} />,
    HelmetProvider,
    AuthProvider,
  ];

  return (
    <>
      <MotionConfig reducedMotion="always">
        <Toaster
          position="top-center"
          toastOptions={{ /* ... toast options ... */ }}
          containerStyle={{ zIndex: 9999 }}
        />
      </MotionConfig>
      {providers.reduceRight((acc, Provider) => <Provider>{acc}</Provider>, children)}
    </>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <AppProviders>
        <Suspense fallback={<SodomallLoader />}>
          <RouterProvider router={router} />
        </Suspense>
      </AppProviders>
    </React.StrictMode>
  );
}