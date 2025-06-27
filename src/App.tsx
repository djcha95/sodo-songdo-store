// src/App.tsx (수정안)

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

import './index.css';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { AdminBulkSelectionProvider } from './context/AdminBulkSelectionContext';

const LoadingSpinner = () => <div className="loading-spinner">로딩 중...</div>;

const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const LoginPage = React.lazy(() => import('@/pages/customer/LoginPage'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        if (window.location.pathname !== '/login') {
            navigate('/login');
        }
      }
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <AuthProvider>
          <CartProvider>
            {/* 고객용 수량 선택 Provider */}
            <SelectionProvider>
              {/* 관리자용 일괄 선택 Provider */}
              <AdminBulkSelectionProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/admin/*" element={<AdminPage />} />
                  {/* CustomerLayout을 ProtectedRoute로 감싸서 모든 고객 페이지에 적용 */}
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <CustomerLayout />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </AdminBulkSelectionProvider>
            </SelectionProvider>
          </CartProvider>
        </AuthProvider>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;