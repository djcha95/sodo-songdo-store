// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import type { UserDocument } from '../root-types';

// ❌ refreshUserDocument, isSuspendedUser 제거
interface AuthContextType {
  user: User | null;
  userDocument: UserDocument | null;
  isAdmin: boolean;
  isMaster: boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDocument: null,
  isAdmin: false,
  isMaster: false,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDocument, setUserDocument] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // ❌ 수동 새로고침 함수(refreshUserDocument) 제거

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
            // ❌ 포인트 관련 함수 호출(recordDailyVisit) 제거
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
    // ❌ 'loyaltyTier'를 사용하는 'isSuspendedUser' 로직 제거
    
    return {
      user,
      userDocument,
      isAdmin,
      isMaster,
      loading,
      logout,
      // ❌ refreshUserDocument 제거
    };
  }, [user, userDocument, loading, logout]);

  return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};