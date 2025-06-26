// src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, onSnapshot, orderBy, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase"; // src/context/ 에서 src/firebase.ts 로 접근

import type { ReactNode } from 'react';
import type { User } from "firebase/auth";

// [수정] NotificationBell과 공유할 타입을 여기서 정의하고 export 합니다.
export interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  timestamp: Date;
  link?: string;
}

interface AppUserContextType {
  user: User | null;
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
  const [user, setUser] = useState<User | null>(null);
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
            });
            setIsAdmin(false);
            console.log("Firestore에 새 유저 정보를 생성했습니다.");
          } else {
            setIsAdmin(userSnap.data().isAdmin === true);
          }
          
          setUser(currentUser); // [수정] 비동기 작업 후 user 상태 업데이트
          
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
          setUser(null); // 오류 발생 시 사용자 상태 초기화
          setIsAdmin(false);
          setNotifications([]);
        }

      } else {
        setUser(null);
        setIsAdmin(false);
        setNotifications([]);
      }

      setLoading(false); // [수정] 사용자 상태 업데이트 로직이 끝난 후 loading을 false로 설정
      
      return () => unsubNotifs(); // 클린업 함수는 unsubAuth와 함께 반환
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