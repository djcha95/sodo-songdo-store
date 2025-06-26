// src/App.tsx

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

import './index.css';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

const LoadingSpinner = () => <div className="loading-spinner">로딩 중...</div>;

// --- FIX: 아래 import 경로의 파일 이름(대소문자)을 실제 파일과 정확히 일치시켜주세요 ---
// 1. 실제 파일 이름이 'CustomerLayout.tsx'가 맞는지 확인합니다.
// 2. 만약 'customerlayout.tsx' 나 'Customerlayout.tsx' 등 다르다면 아래 코드도 똑같이 변경해야 합니다.
const CustomerLayout = React.lazy(() => import('./layouts/CustomerLayout'));
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
// [수정] 절대 경로 별칭 @/를 사용하여 LoginPage import 경로 수정
const LoginPage = React.lazy(() => import('@/pages/customer/LoginPage')); 

// [추가] 로그인 여부에 따라 페이지를 보호하는 Wrapper 컴포넌트
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      // 로딩이 끝나고 유저 정보가 없으면 로그인 페이지로 리디렉션
      navigate('/login');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    // 유저가 없는 경우, ProtectedRoute의 children을 렌더링하지 않음
    return null;
  }

  // 유저가 있으면 children 렌더링
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      {/* 최상단에 Suspense를 적용하여 Lazy Loading 컴포넌트 로딩 시 스피너 표시 */}
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