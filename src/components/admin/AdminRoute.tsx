// src/components/admin/AdminRoute.tsx

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

const AdminRoute = () => {
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // 로딩이 끝났는데 관리자가 아닐 경우에만 토스트 메시지를 보여줍니다.
    if (!loading && !isAdmin) {
      toast.error('관리자 권한이 없습니다. 접근이 제한됩니다.');
    }
  }, [loading, isAdmin, location]);


  if (loading) {
    return <SodomallLoader message="권한을 확인하는 중입니다..." />;
  }

  // 관리자면 관리자 페이지(자식 라우트)를 보여주고, 아니면 홈페이지로 이동시킵니다.
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
};

export default AdminRoute;