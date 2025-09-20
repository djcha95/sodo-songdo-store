// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore/lite';
import { getFirebaseServices } from '@/firebase/firebaseInit'; // ✅ firebaseInit 사용
import { recordDailyVisit } from '@/firebase';
import type { UserDocument } from '../types';

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
    const { auth, db } = await getFirebaseServices();
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userRef);
      if (userDocSnap.exists()) {
        setUserDocument({ uid: userDocSnap.id, ...userDocSnap.data() } as UserDocument);
      }
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initializeAuth = async () => {
      const { auth, db } = await getFirebaseServices();
      
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
    };

    initializeAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);
  
  const logout = useCallback(async () => {
    try {
      const { auth } = await getFirebaseServices();
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