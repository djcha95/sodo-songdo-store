// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, recordDailyVisit } from '../firebase'; // ✅ recordDailyVisit import
import type { UserDocument } from '../types';

interface AuthContextType {
  user: User | null;
  userDocument: UserDocument | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDocument: null,
  isAdmin: false,
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
            
            // ✅ [추가] 일일 방문 포인트 지급 함수 호출
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

  const isAdmin = userDocument?.role === 'admin';

  const value = {
    user,
    userDocument,
    isAdmin,
    loading,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};