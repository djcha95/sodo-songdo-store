// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig'; // 경로 수정
import { recordDailyVisit } from '@/firebase/pointService';
import type { UserDocument } from '../types';

interface AuthContextType {
  user: User | null;
  userDocument: UserDocument | null;
  isAdmin: boolean;
  isMaster: boolean;
  isSuspendedUser: boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDocument: null,
  isAdmin: false,
  isMaster: false,
  isSuspendedUser: false,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDocument, setUserDocument] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ [수정] onSnapshot 구독 해제 함수를 저장할 변수를 외부에서 선언합니다.
    let unsubscribeFromSnapshot: Unsubscribe | null = null;

    const unsubscribeFromAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // ✅ [수정] 사용자 상태가 변경될 때, 기존의 snapshot 구독이 있다면 먼저 해제합니다.
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        setLoading(true); // 새 사용자 정보 로딩 시작
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // 새로운 snapshot 리스너를 구독하고, 해제 함수를 변수에 저장합니다.
        unsubscribeFromSnapshot = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const userData = { uid: doc.id, ...doc.data() } as UserDocument;
            setUserDocument(userData);
            recordDailyVisit(firebaseUser.uid);
          } else {
            setUserDocument(null);
          }
          setLoading(false);
        }, (error) => {
            console.error("사용자 문서 스냅샷 오류:", error);
            setUserDocument(null);
            setLoading(false);
        });
      } else {
        // 사용자가 로그아웃한 경우, 모든 상태를 초기화합니다.
        setUserDocument(null);
        setLoading(false);
      }
    });

    // 컴포넌트가 언마운트될 때 auth 리스너와 snapshot 리스너를 모두 해제합니다.
    return () => {
      unsubscribeFromAuth();
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }
    };
  }, []);
  
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("로그아웃 실패:", error);
    }
  }, []);

  // ✅ [수정] useMemo를 사용해 context value 객체의 불필요한 재생성을 방지합니다.
  const value = useMemo(() => {
    const isAdmin = userDocument?.role === 'admin' || userDocument?.role === 'master';
    const isMaster = userDocument?.role === 'master';
    const isSuspendedUser = userDocument?.loyaltyTier === '참여 제한';
    
    return {
      user,
      userDocument,
      isAdmin,
      isMaster,
      isSuspendedUser,
      loading,
      logout,
    };
  }, [user, userDocument, loading, logout]);

  return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};