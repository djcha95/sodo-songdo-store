// src/components/common/ProtectedRoute.tsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import SodomallLoader from '@/components/common/SodomallLoader';

// ✅ [수정] props 타입에 children을 추가합니다.
interface ProtectedRouteProps {
  children: React.ReactNode; // 자식 컴포넌트를 받을 수 있도록 타입을 정의합니다.
  adminOnly?: boolean;
}

// ✅ [수정] props로 children을 받도록 수정합니다.
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SodomallLoader message="사용자 정보를 확인하는 중..." />;
  }

  if (!user) {
    // 사용자가 없으면 로그인 페이지로 리디렉션합니다.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    // 관리자 전용 페이지에 일반 사용자가 접근하면 메인 페이지로 리디렉션합니다.
    return <Navigate to="/" replace />;
  }

  // ✅ [수정] 모든 검사를 통과하면 <Outlet /> 대신, props로 받은 children을 렌더링합니다.
  return <>{children}</>;
};

export default ProtectedRoute;