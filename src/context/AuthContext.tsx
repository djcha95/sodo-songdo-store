// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
// ✅ [수정] getDoc을 import 합니다.
import { doc, onSnapshot, getDoc, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { recordDailyVisit } from '@/firebase/pointService';
import type { UserDocument } from '../types';

// ✅ [수정] AuthContextType에 refreshUserDocument 함수 타입을 추가합니다.
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
  // ✅ 기본값을 추가합니다.
  refreshUserDocument: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDocument, setUserDocument] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ [추가] 사용자 정보를 수동으로 새로고침하는 함수
  const refreshUserDocument = useCallback(async () => {
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userRef);
      if (userDocSnap.exists()) {
        setUserDocument(userDocSnap.data() as UserDocument);
      }
    }
  }, []);

  useEffect(() => {
    let unsubscribeFromSnapshot: Unsubscribe | null = null;
    const unsubscribeFromAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }
      setUser(firebaseUser);
      if (firebaseUser) {
        setLoading(true);
        const userRef = doc(db, 'users', firebaseUser.uid);
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
        setUserDocument(null);
        setLoading(false);
      }
    });
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
      // ✅ Context 값으로 refreshUserDocument 함수를 전달합니다.
      refreshUserDocument,
    };
  }, [user, userDocument, loading, logout, refreshUserDocument]);

  return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};
