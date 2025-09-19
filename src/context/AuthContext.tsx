// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
// ✅ [수정] 규칙에 맞게 import 경로를 분리합니다.
import { auth, db } from '@/firebase/firebaseConfig';      // 규칙 1
import { recordDailyVisit } from '@/firebase'; // 규칙 2
import type { UserDocument } from '../types';

console.log('5. AuthContext가 로드될 때의 db:', db);

interface AuthContextType {
  user: User | null;
  userDocument: UserDocument | null;
  isAdmin: boolean;
  isMaster: boolean;
  isSuspendedUser: boolean;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUserDocument: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDocument: null,
  isAdmin: false,
  isMaster: false,
  isSuspendedUser: false,
  loading: true,
  logout: async () => {},
  refreshUserDocument: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDocument, setUserDocument] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUserDocument = useCallback(async () => {
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userRef);
      if (userDocSnap.exists()) {
        setUserDocument({ uid: userDocSnap.id, ...userDocSnap.data() } as UserDocument);
      }
    }
  }, []);

  useEffect(() => {
    // ✅ [수정] onSnapshot을 사용하지 않는 1회성 조회 로직으로 변경
    const unsubscribeFromAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setLoading(true);
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userRef);
          if (userDocSnap.exists()) {
            const userData = { uid: userDocSnap.id, ...userDocSnap.data() } as UserDocument;
            setUserDocument(userData);
            recordDailyVisit(firebaseUser.uid);
          } else {
            setUserDocument(null);
          }
        } catch (error) {
          console.error("사용자 문서 조회 오류:", error);
          setUserDocument(null);
        } finally {
          setLoading(false);
        }
      } else {
        setUserDocument(null);
        setLoading(false);
      }
    });
    return () => {
      unsubscribeFromAuth();
    };
  }, []);
  
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("로그아웃 실패:", error);
    }
  }, []);

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
      refreshUserDocument,
    };
  }, [user, userDocument, loading, logout, refreshUserDocument]);

  return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};