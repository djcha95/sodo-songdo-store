// src/components/admin/AdminRoute.tsx

import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import toast from 'react-hot-toast';
// ✅ 1. 'SodamallLoader' 컴포넌트를 import 합니다.
import SodamallLoader from '@/components/common/SodamallLoader';

const AdminRoute = () => {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (loading) {
      return; // auth 로딩이 끝나면 시작
    }
    if (!user) {
      // 로그인하지 않은 사용자는 바로 접근 차단
      setIsChecking(false);
      toast.error('로그인이 필요합니다.');
      return;
    }

    const checkAdminStatus = async () => {
      if (!user.uid) {
        setIsChecking(false);
        toast.error('사용자 정보를 불러올 수 없습니다.');
        return;
      }
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data()?.role === 'admin') {
          setIsAdmin(true);
        } else {
          toast.error('관리자 권한이 없습니다. 접근이 제한됩니다.');
        }
      } catch (error) {
        console.error("관리자 권한 확인 중 오류:", error);
        toast.error('권한 확인 중 오류가 발생했습니다.');
      } finally {
        setIsChecking(false);
      }
    };

    checkAdminStatus();
  }, [user, loading]);

  if (loading || isChecking) {
    // ✅ 2. 기존 div 로딩 화면을 SodamallLoader 컴포넌트로 교체합니다.
    return <SodamallLoader message="권한을 확인하는 중입니다..." />;
  }

  // 관리자면 관리자 페이지를, 아니면 홈페이지로 이동
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
};

export default AdminRoute;