// src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, onSnapshot, orderBy, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase"; // src/context/ 에서 src/firebase.ts 로 접근

import type { ReactNode } from 'react';
import type { User } from "firebase/auth";
import type { UserDocument } from '@/types'; // [추가] UserDocument 타입 임포트

// [수정] User 타입과 UserDocument 타입을 병합한 새로운 타입을 정의
export type AuthUser = User & Partial<UserDocument>;

// [수정] NotificationBell과 공유할 타입을 여기서 정의하고 export 합니다.
export interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  timestamp: Date;
  link?: string;
}

interface AppUserContextType {
  user: AuthUser | null; // [수정] 타입을 AuthUser로 변경
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
  const [user, setUser] = useState<AuthUser | null>(null); // [수정] 타입을 AuthUser로 변경
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
            // [수정] Firebase User 객체와 Firestore 데이터를 병합하여 상태 업데이트
            setUser({ ...currentUser, isAdmin: false, encoreRequestedProductIds: [] } as AuthUser);
            console.log("Firestore에 새 유저 정보를 생성했습니다.");
          } else {
            const userData = userSnap.data() as UserDocument;
            setIsAdmin(userData.isAdmin === true);
            // [수정] Firebase User 객체와 Firestore 데이터를 병합하여 상태 업데이트
            const updatedUserState: AuthUser = { ...currentUser, ...userData };
            setUser(updatedUserState);
          }
          
          const q = query(collection(db, "notifications"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
          unsubNotifs = onSnapshot(q, (snapshot) => {
            const newNotifications = snapshot.docs.map(d => ({
              id: d.id,
              ...d.data(),
              timestamp: d.data().createdAt?.toDate() || new Date()
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
    await updateDoc(notifRef, { isRead: true });
  };

  const value = { user, isAdmin, loading, notifications, handleMarkAsRead };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};