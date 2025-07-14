// src/components/ProtectedRoute.tsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
// ✅ 1. SodamallLoader를 import 합니다.
import SodamallLoader from '@/components/common/SodamallLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  // 1. AuthContext가 로딩 중일 때는 로딩 스피너를 보여줍니다.
  if (loading) {
    // ✅ 2. 기존 LoadingSpinner를 SodamallLoader로 교체합니다.
    return <SodamallLoader message="사용자 정보를 확인하는 중..." />;
  }

  // 2. 로딩이 끝났지만, 로그인한 사용자가 없으면 로그인 페이지로 보냅니다.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. 관리자 전용 페이지인데 관리자가 아니면, 메인 페이지로 보냅니다.
  if (adminOnly && !isAdmin) {
    // toast.error("접근 권한이 없습니다."); // 이 부분은 페이지 이동 후 표시하는 것이 더 좋습니다.
    return <Navigate to="/" replace />;
  }

  // 4. 모든 조건을 통과하면, 요청한 페이지를 보여줍니다.
  return <>{children}</>;
};

export default ProtectedRoute;