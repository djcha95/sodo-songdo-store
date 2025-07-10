// src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, onSnapshot, orderBy, updateDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

// ✨ [수정] UserDocument와 Notification 타입을 types.ts에서 가져옵니다.
import type { UserDocument, Notification } from '@/types'; 

export type AuthUser = User & Partial<UserDocument>;

// ✨ [삭제] 여기서 중복으로 정의했던 Notification 인터페이스를 제거합니다.

interface AppUserContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  notifications: Notification[];
  handleMarkAsRead: (id: string) => void;
}

export const AuthContext = createContext<AppUserContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      let unsubNotifs: () => void = () => {};

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
              isAdmin: false,
              encoreRequestedProductIds: [],
            });
            setIsAdmin(false);
            setUser({ ...currentUser, isAdmin: false, encoreRequestedProductIds: [] } as AuthUser);
          } else {
            const userData = userSnap.data() as UserDocument;
            setIsAdmin(userData.isAdmin === true);
            const updatedUserState: AuthUser = { ...currentUser, ...userData };
            setUser(updatedUserState);
          }
          
          const q = query(collection(db, "notifications"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
          unsubNotifs = onSnapshot(q, (snapshot) => {
            const newNotifications = snapshot.docs.map(d => ({
              id: d.id,
              ...d.data(),
              // isRead 속성 이름이 일치하므로 별도 매핑이 필요 없습니다.
            }) as Notification);
            setNotifications(newNotifications);
          });
          
        } catch (error) {
          console.error("인증 상태 변경 처리 중 오류:", error);
          setUser(null);
          setIsAdmin(false);
          setNotifications([]);
        }

      } else {
        setUser(null);
        setIsAdmin(false);
        setNotifications([]);
      }

      setLoading(false);
      
      return () => unsubNotifs();
    });

    return () => unsubAuth();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    const notifRef = doc(db, "notifications", id);
    // ✨ [수정] 데이터베이스 필드 이름인 'isRead'로 업데이트합니다.
    await updateDoc(notifRef, { isRead: true });
  };

  const value = { user, isAdmin, loading, notifications, handleMarkAsRead };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};