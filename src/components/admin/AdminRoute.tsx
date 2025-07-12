// src/components/admin/AdminRoute.tsx

import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext'; // ✅ 절대 경로 별칭 사용
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase'; // ✅ 절대 경로 별칭 사용
import toast from 'react-hot-toast'; // react-hot-toast 임포트

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
      // 토스트 메시지 추가: 로그인 필요
      toast.error('로그인이 필요합니다.');
      return;
    }

    const checkAdminStatus = async () => {
      if (!user.uid) {
        setIsChecking(false);
        // 토스트 메시지 추가: 사용자 정보 불완전
        toast.error('사용자 정보를 불러올 수 없습니다.');
        return;
      }
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data()?.role === 'admin') {
          setIsAdmin(true);
          // 토스트 메시지 추가: 관리자 로그인 성공 (선택 사항, 너무 자주 뜨면 피로도 증가)
          // toast.success('관리자 페이지에 오신 것을 환영합니다!');
        } else {
          // 관리자 권한이 없는 경우
          toast.error('관리자 권한이 없습니다. 접근이 제한됩니다.');
        }
      } catch (error) {
        console.error("관리자 권한 확인 중 오류:", error);
        // 오류 발생 시 토스트 메시지
        toast.error('권한 확인 중 오류가 발생했습니다.');
      } finally {
        setIsChecking(false);
      }
    };

    checkAdminStatus();
  }, [user, loading]); // user 객체가 변경될 때마다 재실행

  if (loading || isChecking) {
    return (
      <div style={{
        padding: 'var(--spacing-xl)',
        textAlign: 'center',
        fontSize: 'var(--font-size-lg)',
        color: 'var(--text-color-medium)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh', // 전체 화면 중앙에 표시
        backgroundColor: 'var(--bg-color-gray-soft, #f8f9fa)'
      }}>
        <div className="loading-spinner-large"></div> {/* 더 크고 눈에 띄는 스피너 */}
        <p style={{ marginTop: 'var(--spacing-md)' }}>권한을 확인하는 중입니다...</p>
      </div>
    );
  }

  // 관리자면 관리자 페이지를, 아니면 홈페이지로 이동
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
};

export default AdminRoute;