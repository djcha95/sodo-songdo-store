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
import SodomallInfoPage from './pages/customer/SodomallInfoPage'; // import 추가

// --- 페이지 컴포넌트 lazy loading ---

// 1. 고객용 페이지
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const HeyUBeautyPage = React.lazy(() => import('./pages/customer/HeyUBeautyPage'));
// ✅ 기존 심플 디자인 (이제 레거시 경로로 이동)
const SimpleOrderPage = React.lazy(() => import('./pages/customer/SimpleOrderPage')); 
const SongdoPickAboutPage = React.lazy(() => import('./pages/customer/SongdoPickAboutPage'));
const SongdoPickGuidePage = React.lazy(() => import('./pages/customer/SongdoPickGuidePage'));
const SongdoPickPartnerBenefitsPage = React.lazy(() => import('./pages/customer/SongdoPickPartnerBenefitsPage'));

// ✅ 모던 디자인 (이제 메인 페이지!)
const ModernProductList = React.lazy(() => import('./pages/customer/ModernProductList')); 
const BeautyProductList = React.lazy(() => import('./pages/customer/BeautyProductList'));
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
  // 🔓 로그인 안 된 사람 전용 라우트 (로그인/약관/개인정보)
  {
    element: <PublicLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/terms", element: <TermsPage /> },
      { path: "/privacy", element: <PrivacyPolicyPage /> },
    ],
  },

  // 🔧 메인 앱 루트
  {
    path: "/",
    element: <App />,
    children: [
      // ─────────────────────────────
      // ① 고객용 레이아웃 (공개 + 보호 섞여 있음)
      // ─────────────────────────────
      {
        path: "/",
        element: <CustomerLayout />,
        children: [
          // 🔓 공개 페이지들 (소개/안내/제휴/소도몰 안내)

          { path: "about", element: <SongdoPickAboutPage /> },
          { path: "guide", element: <SongdoPickGuidePage /> },
          { path: "partner/benefits", element: <SongdoPickPartnerBenefitsPage /> },
          { path: "partner/hey-u-beauty", element: <HeyUBeautyPage /> },
          {
            path: "sodomall-info",
            element: <SodomallInfoPage />,
          },

{
  element: <AuthLayout />, // 🔐 여기부터 안쪽 children만 로그인 필수
  children: [
    // 메인 모던 리스트 ("/")
    {
      index: true, // == path: ""
      element: <ModernProductList />,
    },
    // ▶ 메인 상세페이지 ("/product/:productId")
    {
      path: "product/:productId",
      element: <ProductDetailPage />,
    },

    // 기존 심플 디자인 ("/simple")
    {
      path: "simple",
      element: <SimpleOrderPage />,
      children: [
        { path: "product/:productId", element: <ProductDetailPage /> },
      ],
    },

    // "/modern" 경로 (호환용)
    {
      path: "modern",
      element: <ModernProductList />,
      children: [
        { path: "product/:productId", element: <ProductDetailPage /> },
      ],
    },

    // 뷰티 리스트 ("/beauty")
    {
      path: "beauty",
      element: <BeautyProductList />,
      children: [
        { path: "product/:productId", element: <ProductDetailPage /> },
      ],
    },

    // 마이페이지 > 예약 내역 ("/mypage/history")
    {
      path: "mypage/history",
      element: <OrderHistoryPage />,
    },
  ],
},
        ],
      },

      // ─────────────────────────────
      // ② 관리자용 라우트 (그대로 유지)
      // ─────────────────────────────
      {
        path: "admin",
        element: <AdminRoute />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "pickup-check", element: <PickupCheckPage /> },
          { path: "quick-check", element: <QuickCheckPage /> },
          { path: "prepaid-check", element: <PrepaidCheckPage /> },
          { path: "products", element: <ProductListPageAdmin /> },
          { path: "products/add", element: <ProductAddAdminPage /> },
          { path: "products/edit/:productId/:roundId", element: <SalesRoundEditPage /> },
          { path: "stock", element: <AdminStockPage /> },
          { path: "orders", element: <OrderManagementPage /> },
          { path: "create-order", element: <CreateOrderPage /> },
          { path: "users", element: <UserListPage /> },
          { path: "users/:userId", element: <UserDetailPage /> },
        ],
      },
    ],
  },

  // 기타 모든 경로 → 루트로
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