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

// --- 페이지 컴포넌트 lazy loading ---
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage'));
// ✅ [제거] ProductListPage는 더 이상 사용되지 않으므로 제거합니다.
// const ProductListPage = React.lazy(() => import('./pages/customer/ProductListPage'));
const SimpleOrderPage = React.lazy(() => import('./pages/customer/SimpleOrderPage'));
const ProductDetailPage = React.lazy(() => import('./pages/customer/ProductDetailPage'));
const CartPage = React.lazy(() => import('./pages/customer/CartPage'));
const MyPage = React.lazy(() => import('./pages/customer/MyPage'));
const OrderHistoryPage = React.lazy(() => import('./pages/customer/OrderHistoryPage'));
const CustomerCenterPage = React.lazy(() => import('./pages/customer/CustomerCenterPage'));
const PointHistoryPage = React.lazy(() => import('./pages/customer/PointHistoryPage'));
const OnsiteSalePage = React.lazy(() => import('./pages/customer/OnsiteSalePage'));
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
const Root = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SodomallLoader />;
  }
  
  if (!user) {
    const allowedPaths = ['/login', '/terms', '/privacy'];
    if (!allowedPaths.includes(location.pathname)) {
      return <Navigate to="/login" replace />;
    }
  }
  
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      { path: "login", element: <Suspense fallback={<SodomallLoader />}><LoginPage /></Suspense> },
      { path: "terms", element: <Suspense fallback={<SodomallLoader />}><TermsPage /></Suspense> },
      { path: "privacy", element: <Suspense fallback={<SodomallLoader />}><PrivacyPolicyPage /></Suspense> },
      {
        path: "/",
        element: <App />,
        children: [
          {
            element: <ProtectedRoute adminOnly={true} />,
            children: [
              {
                path: "admin",
                element: <Suspense fallback={<SodomallLoader />}><AdminLayout /></Suspense>,
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
                ]
              }
            ]
          },
          {
            element: <ProtectedRoute />,
            children: [
              {
                element: <Suspense fallback={<SodomallLoader />}><CustomerLayout /></Suspense>,
                children: [
                  // ✅ [수정] 기본 경로 ('/')를 SimpleOrderPage로 변경합니다.
                  { index: true, element: <SimpleOrderPage /> },
                  // ✅ [제거] '/' 가 SimpleOrderPage를 렌더링하므로 중복되는 경로는 제거합니다.
                  // { path: "simple-order", element: <SimpleOrderPage /> },
                  { path: "cart", element: <CartPage /> },
                  { path: "onsite-sale", element: <OnsiteSalePage /> },
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
                element: <Suspense fallback={<SodomallLoader />}><ProductDetailPage /></Suspense>,
              },
            ]
          },
        ]
      }
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

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <HelmetProvider>
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
      <AuthProvider>
        <LaunchProvider>
          <TutorialProvider>
            <NotificationProvider>
              <CartProvider>
                <SelectionProvider>
                  <EncoreRequestProvider>
                    <Suspense fallback={<SodomallLoader />}>
                      {children}
                    </Suspense>
                  </EncoreRequestProvider>
                </SelectionProvider>
              </CartProvider>
            </NotificationProvider>
          </TutorialProvider>
        </LaunchProvider>
      </AuthProvider>
    </HelmetProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <React.Fragment>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.Fragment>
);