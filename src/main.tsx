// src/main.tsx

import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

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
 * ✅ [개선] 인증 상태에 따라 라우팅을 결정하는 컴포넌트
 * useAuth 훅의 로딩 상태를 처리하고, 사용자가 없으면 로그인 페이지로 리디렉션합니다.
 */
const AuthLayout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SodomallLoader />;
  }

  if (!user) {
    // 로그인 페이지로 리디렉션하되, 현재 경로를 state에 저장하여 로그인 후 돌아올 수 있도록 함
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // 인증된 사용자는 요청한 페이지를 보여줍니다.
  return <Outlet />;
};

/**
 * ✅ [개선] Public 페이지들을 위한 레이아웃
 * 이미 로그인한 사용자가 /login, /terms, /privacy 등에 접근하면 메인 페이지로 보냅니다.
 */
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

// 라우터 설정을 더 명확하게 변경
const router = createBrowserRouter([
  // 1. 인증이 필요 없는 Public 라우트 (로그인, 약관 등)
  {
    element: <PublicLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/terms", element: <TermsPage /> },
      { path: "/privacy", element: <PrivacyPolicyPage /> },
    ]
  },
  // 2. 인증이 필요한 모든 Private 라우트
  {
    path: "/",
    element: <AuthLayout />,
    children: [
      {
        element: <App />, // App 컴포넌트가 공통 레이아웃 역할을 할 수 있음
        children: [
          // 2-1. 관리자 전용 라우트
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
              { path: 'products/batch-category', element: <ProductCategoryBatchPage /> },
              { path: 'categories', element: <CategoryManagementPage /> },
              { path: 'orders', element: <OrderManagementPage /> },
              { path: 'create-order', element: <CreateOrderPage /> },
              { path: 'users', element: <UserListPage /> },
              { path: 'users/:userId', element: <UserDetailPage /> },
              { path: 'banners', element: <BannerAdminPage /> },
              { path: 'data-tools', element: <DataAdminPage /> }
            ],
          },
          // 2-2. 일반 사용자 라우트
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
          // 2-3. 상품 상세 페이지 (CustomerLayout 외부에 있으므로 별도 정의)
          {
            path: "product/:productId",
            element: <ProtectedRoute><ProductDetailPage /></ProtectedRoute>,
          },
        ]
      },
    ]
  },
  // 3. 404 페이지
  {
    path: "*",
    element: (
      <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.5rem', color: '#666' }}>
        404 - 페이지를 찾을 수 없습니다.
      </div>
    ),
  },
]);

/**
 * ✅ [개선] Context Provider 중첩을 깔끔하게 처리하는 컴포넌트
 * 복잡한 중첩 구조를 배열과 reduce를 사용하여 가독성 및 유지보수성을 높입니다.
 */
const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Provider들을 배열로 정의
  const providers = [
    HelmetProvider,
    AuthProvider,
    LaunchProvider,
    TutorialProvider,
    NotificationProvider,
    CartProvider,
    SelectionProvider,
    EncoreRequestProvider,
  ];

  // 배열을 순회하며 Provider들을 중첩시킴
  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000, 
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
        containerStyle={{ zIndex: 9999, transform: 'translateZ(0)' }}
      />
      {providers.reduceRight((acc, Provider) => {
        return <Provider>{acc}</Provider>;
      }, children)}
    </>
  );
};


// 최종 렌더링
createRoot(document.getElementById('root')!).render(
  // ✅ [개선] React.StrictMode를 사용하여 잠재적인 문제를 감지합니다.
  <React.StrictMode>
    <AppProviders>
      <Suspense fallback={<SodomallLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </AppProviders>
  </React.StrictMode>
);