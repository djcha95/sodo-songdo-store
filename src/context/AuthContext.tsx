// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
// ✅ [수정] signOut 함수를 firebase/auth에서 가져옵니다.
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { recordDailyVisit } from '@/firebase/pointService';
import type { UserDocument } from '../types';

// ✅ [수정] logout 함수의 타입 정의를 추가합니다.
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
  // ✅ [추가] 기본값에도 logout 함수를 추가합니다.
  logout: async () => {},
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
  
  // ✅ [추가] 로그아웃 함수를 구현합니다.
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("로그아웃 실패:", error);
    }
  }, []);

  const isAdmin = userDocument?.role === 'admin' || userDocument?.role === 'master';
  const isMaster = userDocument?.role === 'master';
  const isSuspendedUser = userDocument?.loyaltyTier === '참여 제한';

  const value = {
    user,
    userDocument,
    isAdmin,
    isMaster,
    isSuspendedUser,
    loading,
    // ✅ [추가] value 객체에 logout 함수를 포함시켜 다른 컴포넌트에서 사용할 수 있도록 합니다.
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};