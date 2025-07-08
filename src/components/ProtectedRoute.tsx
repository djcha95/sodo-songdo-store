// src/components/ProtectedRoute.tsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  // 1. AuthContext가 로딩 중일 때는 로딩 스피너를 보여줍니다.
  if (loading) {
    return <LoadingSpinner />;
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

// ❌ [삭제] useEffect를 사용한 리디렉션은 렌더링 도중 문제를 일으킬 수 있으므로,
// Navigate 컴포넌트를 사용한 선언적인 방식으로 변경합니다.

export default ProtectedRoute;