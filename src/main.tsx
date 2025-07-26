// src/main.tsx

import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import './index.css';

import App from './App';
import ProtectedRoute from './components/common/ProtectedRoute';
import SodomallLoader from './components/common/SodomallLoader'; 

import { AuthProvider } from './context/AuthContext';
// 더 이상 사용하지 않는 CSS 파일 import를 삭제합니다.
// import './styles/toast-styles.css';

// --- 페이지 컴포넌트 lazy loading ---

// 레이아웃 컴포넌트
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));

// 고객 페이지
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
const ProductListPage = React.lazy(() => import('./pages/customer/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const CustomerCenterPage = React.lazy(() => import('./pages/customer/CustomerCenterPage'));
const PointHistoryPage = React.lazy(() => import('./pages/customer/PointHistoryPage'));
const OnsiteSalePage = React.lazy(() => import('./pages/customer/OnsiteSalePage'));
const TermsPage = React.lazy(() => import('./pages/customer/TermsPage'));
const PrivacyPolicyPage = React.lazy(() => import('./pages/customer/PrivacyPolicyPage'));
// ✨ [추가] 픽업 캘린더 페이지 import
const OrderCalendarPage = React.lazy(() => import('@/components/customer/OrderCalendar'));
// ✅ [추가] 앵콜 페이지 import
const EncorePage = React.lazy(() => import('./pages/customer/EncorePage'));


// 관리자 페이지
const DashboardPage = React.lazy(() => import('@/pages/admin/DashboardPage'));
const ProductListPageAdmin = React.lazy(() => import('@/pages/admin/ProductListPageAdmin'));
const ProductAddAdminPage = React.lazy(() => import('@/pages/admin/ProductAddAdminPage'));
const SalesRoundEditPage = React.lazy(() => import('@/pages/admin/SalesRoundEditPage'));
const UserListPage = React.lazy(() => import('@/pages/admin/UserListPage'));
const UserDetailPage = React.lazy(() => import('@/pages/admin/UserDetailPage'));
const BannerAdminPage = React.lazy(() => import('@/pages/admin/BannerAdminPage'));
const CategoryManagementPage = React.lazy(() => import('@/pages/admin/CategoryManagementPage'));
// ✨ [수정] 사용되지 않는 페이지 import 제거
// const MinimalTestPage = React.lazy(() => import('@/pages/admin/MinimalTestPage')); 
// const AiProductPage = React.lazy(() => import('@/pages/admin/AiProductPage'));
// const BoardAdminPage = React.lazy(() => import('@/pages/admin/BoardAdminPage'));
// const CouponAdminPage = React.lazy(() => import('@/pages/admin/CouponAdminPage'));
// const EncoreAdminPage = React.lazy(() => import('@/pages/admin/EncoreAdminPage'));
const OrderManagementPage = React.lazy(() => import('@/pages/admin/OrderManagementPage'));
// const PickupProcessingPage = React.lazy(() => import('@/pages/admin/PickupProcessingPage'));
// const ProductArrivalCalendar = React.lazy(() => import('@/components/admin/ProductArrivalCalendar'));
const ProductCategoryBatchPage = React.lazy(() => import('@/pages/admin/ProductCategoryBatchPage'));
// 새로 만든 페이지 import
const QuickCheckPage = React.lazy(() => import('@/pages/admin/QuickCheckPage'));


const ProductDetailPageWrapper = () => {
  const { productId } = useParams<{ productId: string }>();
  return productId ? <ProductDetailPage productId={productId} isOpen={true} onClose={() => window.history.back()} /> : null;
};


// ✨ [수정] 라우팅 구조를 최신 표준에 맞게 재설계
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      // --- 공용 경로 ---
      { path: "login", element: <Suspense fallback={<SodomallLoader />}><LoginPage /></Suspense> },
      { path: "terms", element: <Suspense fallback={<SodomallLoader />}><TermsPage /></Suspense> },
      { path: "privacy", element: <Suspense fallback={<SodomallLoader />}><PrivacyPolicyPage /></Suspense> },

      // --- 관리자 전용 경로 ---
      {
        element: <ProtectedRoute adminOnly={true} />,
        children: [
          {
            path: "admin",
            element: <Suspense fallback={<SodomallLoader />}><AdminLayout /></Suspense>,
            children: [
              // ✅ [수정] Redirect 대신 QuickCheckPage를 직접 index 컴포넌트로 렌더링합니다.
              { index: true, element: <QuickCheckPage /> },
              { path: 'dashboard', element: <DashboardPage /> },
              // '빠른 예약 확인' 페이지는 /admin 경로에서도 접근 가능하도록 유지합니다.
              { path: 'quick-check', element: <QuickCheckPage /> },
              { path: 'products', element: <ProductListPageAdmin /> },
              { path: 'products/add', element: <ProductAddAdminPage /> },
              { path: 'products/edit/:productId/:roundId', element: <SalesRoundEditPage /> },
              { path: 'products/batch-category', element: <ProductCategoryBatchPage /> },
              { path: 'categories', element: <CategoryManagementPage /> },
              { path: 'orders', element: <OrderManagementPage /> },
              { path: 'users', element: <UserListPage /> },
              { path: 'users/:userId', element: <UserDetailPage /> },
              { path: 'banners', element: <BannerAdminPage /> },
            ]
          }
        ]
      },
      
      // --- 로그인한 모든 사용자를 위한 경로 ---
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <Suspense fallback={<SodomallLoader />}><CustomerLayout /></Suspense>,
            children: [
              { index: true, element: <ProductListPage /> },
              { path: "cart", element: <CartPage /> },
              { path: "onsite-sale", element: <OnsiteSalePage /> },
              { path: "customer-center", element: <CustomerCenterPage /> },
              // ✅ [추가] 앵콜 페이지 경로 추가
              { path: "encore", element: <EncorePage /> },
              {
                path: "mypage",
                children: [
                  { index: true, element: <MyPage /> },
                  { path: "history", element: <OrderHistoryPage /> },
                  { path: "points", element: <PointHistoryPage /> },
                  // ✨ [추가] 픽업 캘린더 경로 추가
                  { path: "orders", element: <OrderCalendarPage /> },
                ]
              },
            ]
          },
          {
            path: "product/:productId",
            element: <Suspense fallback={<SodomallLoader />}><ProductDetailPageWrapper /></Suspense>,
          },
        ]
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
  <React.Fragment>
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
        success: {
          iconTheme: {
            primary: 'var(--accent-color, #28a745)',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--danger-color, #dc3545)',
            secondary: '#fff',
          },
        },
      }}
      containerStyle={{
        zIndex: 9999,
        transform: 'translateZ(0)',
      }}
    />
    <AuthProvider> 
      <Suspense fallback={<SodomallLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  </React.Fragment>
);