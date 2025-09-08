// src/main.tsx

import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
// ✅ [추가] TanStack Query 관련 모듈 import
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import './styles/variables.css';
import './styles/common.css';

import App from './App';
import ProtectedRoute from './components/common/ProtectedRoute';
import SodomallLoader from '@/components/common/SodomallLoader'; 

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext';
import { TutorialProvider } from './context/TutorialContext';
import { LaunchProvider } from './context/LaunchContext';

// --- 페이지 컴포넌트 lazy loading (기존과 동일) ---
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const SimpleOrderPage = React.lazy(() => import('./pages/customer/SimpleOrderPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const CustomerCenterPage = React.lazy(() => import('./pages/customer/CustomerCenterPage'));
const PointHistoryPage = React.lazy(() => import('./pages/customer/PointHistoryPage'));
const TermsPage = React.lazy(() => import('./pages/customer/TermsPage'));
const PrivacyPolicyPage = React.lazy(() => import('./pages/customer/PrivacyPolicyPage'));
const OrderCalendarPage = React.lazy(() => import('@/components/customer/OrderCalendar'));
const EncorePage = React.lazy(() => import('./pages/customer/EncorePage'));
const DashboardPage = React.lazy(() => import('@/pages/admin/DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('@/pages/admin/ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('@/pages/admin/ProductAddAdminPage'));
const SalesRoundEditPage = React.lazy(() => import('@/pages/admin/SalesRoundEditPage'));
const RaffleEventAdminPage = React.lazy(() => import('@/pages/admin/RaffleEventAdminPage'));
const UserListPage = React.lazy(() => import('@/pages/admin/UserListPage'));
const UserDetailPage = React.lazy(() => import('@/pages/admin/UserDetailPage'));
const BannerAdminPage = React.lazy(() => import('@/pages/admin/BannerAdminPage'));
const CategoryManagementPage = React.lazy(() => import('@/pages/admin/CategoryManagementPage'));
const OrderManagementPage = React.lazy(() => import('@/pages/admin/OrderManagementPage'));
const ProductCategoryBatchPage = React.lazy(() => import('@/pages/admin/ProductCategoryBatchPage'));
const QuickCheckPage = React.lazy(() => import('@/pages/admin/QuickCheckPage'));
const CreateOrderPage = React.lazy(() => import('@/pages/admin/CreateOrderPage'));
const PrepaidCheckPage = React.lazy(() => import('@/pages/admin/PrepaidCheckPage'));
const DataAdminPage = React.lazy(() => import('@/pages/admin/DataAdminPage'));

/**
 * ✅ [추가] QueryClient 인스턴스 생성
 * 앱 전역에서 사용할 쿼리 클라이언트를 만듭니다.
 * defaultOptions로 캐시 시간 등을 설정할 수 있습니다.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5분 동안 데이터를 '신선함'으로 간주 (재요청 X)
      gcTime: 1000 * 60 * 30,       // 30분 동안 사용되지 않으면 캐시에서 제거
      retry: 1,                     // API 요청 실패 시 1번 재시도
    },
  },
});

const AuthLayout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SodomallLoader />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <Outlet />;
};

const PublicLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <SodomallLoader />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

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
          {
            path: "admin",
            element: <ProtectedRoute adminOnly={true}><AdminLayout /></ProtectedRoute>,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'quick-check', element: <QuickCheckPage /> },
              { path: 'prepaid-check', element: <PrepaidCheckPage /> },
              { path: 'products', element: <ProductListPageAdmin /> },
              { path: 'products/add', element: <ProductAddAdminPage /> },
               { path: 'products/edit/:productId/:roundId', element: <SalesRoundEditPage /> },
              // ✅ [추가] 새로운 이벤트 관리 페이지 라우트
              { path: 'events/:productId/:roundId', element: <RaffleEventAdminPage /> },
              { path: 'products/batch-category', element: <ProductCategoryBatchPage /> },
              { path: 'orders', element: <OrderManagementPage /> },
              { path: 'create-order', element: <CreateOrderPage /> },
              { path: 'users', element: <UserListPage /> },
              { path: 'users/:userId', element: <UserDetailPage /> },
              { path: 'banners', element: <BannerAdminPage /> },
              { path: 'data-tools', element: <DataAdminPage /> }
            ],
          },
          {
            element: <ProtectedRoute><CustomerLayout /></ProtectedRoute>,
            children: [
              { index: true, element: <SimpleOrderPage /> },
              { path: "cart", element: <CartPage /> },
              { path: "customer-center", element: <CustomerCenterPage /> },
              { path: "encore", element: <EncorePage /> },
              {
                path: "mypage",
                children: [
                  { index: true, element: <MyPage /> },
                  { path: "history", element: <OrderHistoryPage /> },
                  { path: "points", element: <PointHistoryPage /> },
                  { path: "orders", element: <OrderCalendarPage /> },
                ]
              },
            ]
          },
          {
            path: "product/:productId",
            element: <ProtectedRoute><ProductDetailPage /></ProtectedRoute>,
          },
        ]
      },
    ]
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

const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const providers = [
    // ✅ [추가] QueryClientProvider를 Context Provider 목록에 추가합니다.
    (props: { children: React.ReactNode }) => <QueryClientProvider client={queryClient} {...props} />,
    HelmetProvider,
    AuthProvider,
    LaunchProvider,
    TutorialProvider,
    NotificationProvider,
    CartProvider,
    SelectionProvider,
    EncoreRequestProvider,
  ];

  return (
    <>
      <MotionConfig reducedMotion="always">
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#fff',
              color: 'var(--text-color-dark, #343a40)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              borderRadius: '10px',
              border: '1px solid #f0f0f0',
              padding: '12px 16px',
              fontSize: '1rem',
              fontWeight: '500',
            },
            success: { iconTheme: { primary: 'var(--accent-color, #28a745)', secondary: '#fff' } },
            error: { iconTheme: { primary: 'var(--danger-color, #dc3545)', secondary: '#fff' } },
          }}
          containerStyle={{ zIndex: 9999 }}
        />
      </MotionConfig>

      {providers.reduceRight((acc, Provider) => {
        return <Provider>{acc}</Provider>;
      }, children)}
    </>
  );
};


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <Suspense fallback={<SodomallLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </AppProviders>
  </React.StrictMode>
);