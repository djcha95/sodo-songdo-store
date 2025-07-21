// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { recordDailyVisit } from '@/firebase/pointService';
import type { UserDocument } from '../types';

interface AuthContextType {
  user: User | null;
  userDocument: UserDocument | null;
  isAdmin: boolean;
  isMaster: boolean; // ✨ [추가] 마스터 권한 확인용
  isSuspendedUser: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDocument: null,
  isAdmin: false,
  isMaster: false, // ✨ [추가]
  isSuspendedUser: false,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDocument, setUserDocument] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const unsubSnapshot = onSnapshot(userRef, (doc) => {
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
        return () => unsubSnapshot();
      } else {
        setUserDocument(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ✨ [수정] 'master' 또는 'admin'일 경우 isAdmin을 true로 설정
  const isAdmin = userDocument?.role === 'admin' || userDocument?.role === 'master';
  // ✨ [추가] 'master' 역할인지 명확히 확인하는 변수
  const isMaster = userDocument?.role === 'master';
  const isSuspendedUser = userDocument?.loyaltyTier === '참여 제한';

  const value = {
    user,
    userDocument,
    isAdmin,
    isMaster, // ✨ [추가]
    isSuspendedUser,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};