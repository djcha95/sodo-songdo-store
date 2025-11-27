// src/main.tsx
import '@/utils/dayjsSetup'; // ⬅️ 이 줄을 최상단에 추가합니다.
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
const SimpleOrderPage = React.lazy(() => import('./pages/customer/SimpleOrderPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const TermsPage = React.lazy(() => import('./pages/customer/TermsPage'));
const PrivacyPolicyPage = React.lazy(() => import('./pages/customer/PrivacyPolicyPage'));

// 2. ✅ [복원] 관리자용 페이지
const AdminLayout = React.lazy(() => import('@/components/admin/AdminLayout')); // ✅ 이렇게 수정해주세요.
const DashboardPage = React.lazy(() => import('@/pages/admin/DashboardPage'));const ProductListPageAdmin = React.lazy(() => import('@/pages/admin/ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('@/pages/admin/ProductAddAdminPage'));
const SalesRoundEditPage = React.lazy(() => import('@/pages/admin/SalesRoundEditPage'));
// const RaffleEventAdminPage = React.lazy(() => import('@/pages/admin/RaffleEventAdminPage')); // ❌ 삭제됨
const UserListPage = React.lazy(() => import('@/pages/admin/UserListPage'));
const UserDetailPage = React.lazy(() => import('@/pages/admin/UserDetailPage'));
// const BannerAdminPage = React.lazy(() => import('@/pages/admin/BannerAdminPage')); // ❌ 삭제됨
const OrderManagementPage = React.lazy(() => import('@/pages/admin/OrderManagementPage'));
const QuickCheckPage = React.lazy(() => import('@/pages/admin/QuickCheckPage'));
const CreateOrderPage = React.lazy(() => import('@/pages/admin/CreateOrderPage'));
const PrepaidCheckPage = React.lazy(() => import('@/pages/admin/PrepaidCheckPage'));
const PickupCheckPage = React.lazy(() => import('@/pages/admin/PickupCheckPage')); // ⬅️ [추가] 픽업 체크 페이지
// const DataAdminPage = React.lazy(() => import('@/pages/admin/DataAdminPage')); // ❌ 삭제됨


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 30, retry: 1, },
  },
});

// --- 접근 제어 레이아웃 ---

// 1. 로그인이 필요한 모든 사용자를 위한 레이아웃
const AuthLayout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SodomallLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
};

// 2. 로그인하지 않은 사용자만 접근 가능한 레이아웃
const PublicLayout = () => {
  const { user, loading } = useAuth();
  if (loading) return <SodomallLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
};

// 3. ✅ [수정] 관리자만 접근 가능한 레이아웃
const AdminRoute = () => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <SodomallLoader />;
  // AuthLayout에서 이미 user를 확인하지만, 이중으로 보호
  if (!user || !isAdmin) return <Navigate to="/" replace />; 
  return <AdminLayout />; // 관리자용 레이아웃을 렌더링
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
              { 
                path: "/", // ✅ [수정] 'index: true'를 'path: "/"'로 변경
                element: <SimpleOrderPage />, 
                children: [ // ✅ [추가] 상세 페이지를 자식으로 중첩
                  { 
                    path: "product/:productId", 
                    element: <ProductDetailPage /> 
                  }
                ]
              },
              { path: "mypage/history", element: <OrderHistoryPage /> },
            ]
          },
          // ❌ [제거] 별도로 분리되어 있던 상세 페이지 경로를 제거합니다.
          // { path: "product/:productId", element: <ProductDetailPage /> },
          
          // --- ✅ [복원] 관리자용 전체 경로 ---
          {
            path: "admin",
            element: <AdminRoute />, // 관리자 접근 제어
            children: [
                { index: true, element: <DashboardPage /> },
                { path: 'dashboard', element: <DashboardPage /> },
                { path: 'pickup-check', element: <PickupCheckPage /> }, // ⬅️ [추가] 픽업 체크 라우트
                { path: 'quick-check', element: <QuickCheckPage /> },
                { path: 'prepaid-check', element: <PrepaidCheckPage /> },
                { path: 'products', element: <ProductListPageAdmin /> },
                { path: 'products/add', element: <ProductAddAdminPage /> },
                { path: 'products/edit/:productId/:roundId', element: <SalesRoundEditPage /> },
                // { path: 'events/:productId/:roundId', element: <RaffleEventAdminPage /> }, // ❌ 삭제됨
                { path: 'orders', element: <OrderManagementPage /> },
                { path: 'create-order', element: <CreateOrderPage /> },
                { path: 'users', element: <UserListPage /> },
                { path: 'users/:userId', element: <UserDetailPage /> },
                // { path: 'banners', element: <BannerAdminPage /> }, // ❌ 삭제됨
                // { path: 'data-tools', element: <DataAdminPage /> }, // ❌ 삭제됨
            ]
          }
        ]
      },
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);


// --- ✅ [수정] 간소화된 AppProviders ---
const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Cart, Tutorial, Encore 등 불필요한 Provider는 모두 제외
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