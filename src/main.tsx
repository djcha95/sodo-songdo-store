// src/main.tsx
import '@/utils/dayjsSetup';
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GlobalErrorBoundary from '@/components/common/GlobalErrorBoundary';
import AdminBlockedPage from '@/components/admin/AdminBlockedPage';
import { ADMIN_HIDDEN_ROUTES } from "@/admin/adminHiddenRoutes";

import './index.css';

import App from './App';
import SodomallLoader from '@/components/common/SodomallLoader';
import { AuthProvider, useAuth } from './context/AuthContext';
import SodomallInfoPage from './pages/customer/SodomallInfoPage'; // import 추가

// 👇 [수정] 서비스워커 강력 제거 및 캐시 비우기 로직
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    // 등록된 워커가 있다면
    if (registrations.length > 0) {
      for (const registration of registrations) {
        registration.unregister().then((boolean) => {
          // 해제 성공 시 로그
          console.log('[ServiceWorker] Unregistered:', boolean);
        });
      }
      // 워커가 있었다면, 해제 후 혹시 모르니 강제로 리로드(선택 사항이나 추천)
      // window.location.reload(); 
      // ▲ 너무 잦은 리로드가 걱정되면 이 줄은 주석 처리하되, 
      // 1단계의 sw.js 파일이 리로드를 수행하게 두는 것이 좋습니다.
    }
  });

  // 혹시 모를 캐시 스토리지 비우기 (오래된 PWA 캐시 삭제)
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name);
      });
    });
  }
}

// ✅ [추가] 동적 import 오류 전역 핸들러
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const errorMessage = error?.message || String(error);
  
  // 동적 import 실패 오류 감지
  if (
    typeof errorMessage === 'string' && 
    errorMessage.includes('Failed to fetch dynamically imported module')
  ) {
    event.preventDefault(); // 기본 오류 표시 방지
    
    // 이미 처리 중이면 무시 (중복 처리 방지)
    if (sessionStorage.getItem('chunk-error-handled') === 'true') {
      return;
    }
    
    sessionStorage.setItem('chunk-error-handled', 'true');
    
    // 3초 후 자동으로 홈으로 리다이렉트
    setTimeout(() => {
      sessionStorage.removeItem('chunk-error-handled');
      window.location.href = '/';
    }, 3000);
    
    // 사용자에게 친화적인 메시지 표시
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 24px;
    `;
    errorDiv.innerHTML = `
      <div style="
        background: white;
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      ">
        <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
        <h2 style="
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 12px;
          color: #111;
        ">사이트가 업데이트되었습니다</h2>
        <p style="
          font-size: 14px;
          color: #666;
          line-height: 1.6;
          margin: 0 0 24px;
        ">최신 버전으로 자동 이동합니다...</p>
        <div style="
          width: 100%;
          height: 4px;
          background: #f0f0f0;
          border-radius: 2px;
          overflow: hidden;
        ">
          <div style="
            width: 100%;
            height: 100%;
            background: #000;
            animation: progress 3s linear;
          "></div>
        </div>
        <style>
          @keyframes progress {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        </style>
      </div>
    `;
    document.body.appendChild(errorDiv);
  }
});
// 1. 고객용 페이지
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const HeyUBeautyPage = React.lazy(() => import('./pages/customer/HeyUBeautyPage'));
const SongdoPickAboutPage = React.lazy(() => import('./pages/customer/SongdoPickAboutPage'));
const SongdoPickGuidePage = React.lazy(() => import('./pages/customer/SongdoPickGuidePage'));
const SongdoPickPartnerBenefitsPage = React.lazy(() => import('./pages/customer/SongdoPickPartnerBenefitsPage'));
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));

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
// ✅ [수정] 동적 import 실패 시 재시도 로직 추가
const QuickCheckPage = React.lazy(() => {
  return import('@/pages/admin/QuickCheckPage').catch((error) => {
    // 동적 import 실패 시 홈으로 리다이렉트
    if (error?.message?.includes('Failed to fetch dynamically imported module')) {
      console.warn('[QuickCheckPage] Dynamic import failed, redirecting to home');
      window.location.href = '/';
      // 빈 컴포넌트 반환 (리다이렉트 중 표시)
      return { default: () => <SodomallLoader message="페이지를 불러오는 중..." /> };
    }
    throw error;
  });
});
const CreateOrderPage = React.lazy(() => import('@/pages/admin/CreateOrderPage'));
const PrepaidCheckPage = React.lazy(() => import('@/pages/admin/PrepaidCheckPage'));
const PickupCheckPage = React.lazy(() => import('@/pages/admin/PickupCheckPage'));
const AdminStockPage = React.lazy(() => import('@/pages/admin/AdminStockPage'));
const AdminToolsPage = React.lazy(() => import('@/pages/admin/AdminToolsPage')); // 👈 추가

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

// ✅ Master 전용 라우트 (위험 기능 보호)
const MasterOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isMaster, loading } = useAuth();
  if (loading) return <SodomallLoader />;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  if (!isMaster) return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
};

// ✅ 숨김/차단 대상 라우트는 단일 소스(adminHiddenRoutes.ts)에서 관리합니다.

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
  element: <AuthLayout />, 
  children: [
    // ✅ ModernProductList가 "부모"가 되어야 합니다.
    {
      path: "/",  // index: true 대신 path: "/" 사용
      element: <ModernProductList />,
      children: [
        // ✅ 상세 페이지가 "자식"으로 들어가야 리스트 위에 뜹니다 (리스트 유지됨)
        {
          path: "product/:productId",
          element: <ProductDetailPage />,
        },
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
          {
            path: "mypage",
            element: <AuthLayout />, // 로그인 체크
            children: [
              { index: true, element: <MyPage /> }, // /mypage 접속 시 MyPage 보여줌
              { path: "history", element: <OrderHistoryPage /> }, // /mypage/history
              { path: "orders", element: <OrderHistoryPage /> }, // 캘린더 페이지가 별도로 있다면 교체, 일단 히스토리로 연결
            ]
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
          // 👇 [추가] 시스템 도구 페이지 경로 설정
          { path: "tools", element: <MasterOnlyRoute><AdminToolsPage /></MasterOnlyRoute> },

          // ✅ 숨김/차단 대상 라우트는 여기서 자동으로 잡아서 안내 페이지로 연결
          ...ADMIN_HIDDEN_ROUTES.map((r) => ({
            path: r.path,
            element: <AdminBlockedPage title={r.title} message={r.message} reason="hidden" />,
          })),
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
    (props: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient} {...props} />
    ),
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

// ✅ 이 줄 다시 추가
const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <AppProviders>
        <GlobalErrorBoundary>
          <Suspense fallback={<SodomallLoader />}>
            <RouterProvider router={router} />
          </Suspense>
        </GlobalErrorBoundary>
      </AppProviders>
    </React.StrictMode>
  );
}