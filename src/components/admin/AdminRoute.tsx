// src/components/admin/AdminRoute.tsx

import { useState, useEffect } from 'react'; // React 제거
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // 경로 확인 필요
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase'; // 경로 확인 필요

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
      return;
    }

    const checkAdminStatus = async () => {
      // user.uid가 null일 수 있으므로 검사 추가
      if (!user.uid) { 
        setIsChecking(false);
        return;
      }
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data()?.role === 'admin') { // ?.role 추가
          setIsAdmin(true);
        }
      } catch (error) {
        console.error("관리자 권한 확인 중 오류:", error);
        // 오류 발생 시 관리자 아님으로 처리하거나, 별도 에러 페이지로 리다이렉트
      } finally {
        setIsChecking(false);
      }
    };

    checkAdminStatus();
  }, [user, loading]); // user 객체가 변경될 때마다 재실행

  if (loading || isChecking) {
    return <div style={{ 
        padding: 'var(--spacing-xl)', 
        textAlign: 'center', 
        fontSize: 'var(--font-size-lg)', 
        color: 'var(--text-color-medium)' 
    }}>권한을 확인하는 중...</div>;
  }

  // 관리자면 관리자 페이지를, 아니면 홈페이지로 이동
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
};

export default AdminRoute;