// src/App.tsx

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

import './index.css';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

const LoadingSpinner = () => <div className="loading-spinner">로딩 중...</div>;

const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const LoginPage = React.lazy(() => import('@/pages/customer/LoginPage')); 

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  // [수정] user 상태 변경 시 페이지 전환 로직을 더 명확하게 구성
  useEffect(() => {
    // 로딩이 완료된 시점에만 동작
    if (!loading) {
      if (user) {
        // 유저가 로그인했으면 메인 페이지로 이동
        console.log("DEBUG: ProtectedRoute - User logged in. Navigating to home.");
        navigate('/', { replace: true }); // 'replace: true'를 사용하여 히스토리 스택을 대체
      } else {
        // 유저가 로그인하지 않았으면 로그인 페이지로 이동
        console.log("DEBUG: ProtectedRoute - User not logged in. Navigating to login.");
        if (window.location.pathname !== '/login') {
            navigate('/login');
        }
      }
    }
  }, [user, loading, navigate]); // user, loading, navigate가 변경될 때마다 훅 실행

  if (loading) {
    return <LoadingSpinner />;
  }
  
  // 유저가 없는 상태에서 자식 컴포넌트 렌더링 방지
  if (!user) {
    return null;
  }

  // 유저가 있으면 children 렌더링
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <AuthProvider>
          <CartProvider>
            <Routes>
              {/* [수정] 로그인 페이지 라우트 추가 */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* [수정] 관리자 페이지는 로그인 여부와 무관하게 접근 가능 */}
              <Route path="/admin/*" element={<AdminPage />} />

              {/* [수정] 메인 고객 페이지는 로그인 보호 적용 */}
              <Route 
                path="/*" 
                element={
                  <ProtectedRoute>
                    <CustomerLayout />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;