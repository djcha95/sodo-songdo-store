// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, recordDailyVisit } from '../firebase'; // recordDailyVisit은 그대로 사용
import type { UserDocument } from '../types';

// AuthContextType에서 triggerConsent 제거
interface AuthContextType {
  user: User | null;
  userDocument: UserDocument | null;
  isAdmin: boolean;
  loading: boolean;
}

// createContext 기본값에서 triggerConsent 제거
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

  // isConsentRequired, triggerConsent 관련 로직 모두 제거

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const unsubSnapshot = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const userData = { uid: doc.id, ...doc.data() } as UserDocument;
            setUserDocument(userData);
            
            // 일일 방문 포인트 지급은 그대로 유지
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

  // value에서 triggerConsent 제거
  const value = {
    user,
    userDocument,
    isAdmin,
    loading,
  };

  return (
    // PhoneNumberConsentModal 렌더링 로직 제거
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
  );
};