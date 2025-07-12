// src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, onSnapshot, orderBy, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
// ✅ [수정] types에서 UserDocument와 Notification을 가져옵니다.
import type { UserDocument, Notification } from '@/types'; 

// AuthUser 타입은 Firebase User와 UserDocument의 부분집합을 결합합니다.
// UserDocument에 이미 phone이 옵셔널하게 정의되어 있으므로 여기서는 Partial<UserDocument>만 사용합니다.
export type AuthUser = User & Partial<UserDocument>;

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

          const kakaoProviderData = currentUser.providerData.find(p => p.providerId === 'oidc.kakao');
          const phoneNumber = kakaoProviderData?.phoneNumber || null;

          if (!userSnap.exists()) {
            // ✅ [수정] 새로운 사용자 문서 생성 시 'role' 필드를 'customer'로 설정합니다.
            const newUserDoc: UserDocument = {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              phone: phoneNumber,
              createdAt: serverTimestamp(),
              role: 'customer', // 'isAdmin' 대신 'role' 사용
              encoreRequestedProductIds: [],
            };
            await setDoc(userRef, newUserDoc);
            
            setIsAdmin(false); // 새로 가입한 사용자는 관리자가 아님
            setUser({ ...currentUser, ...newUserDoc });

          } else {
            const userData = userSnap.data() as UserDocument;

            // 기존 사용자의 DB에 전화번호가 없지만, 카카오에서 제공된 경우 업데이트합니다.
            // UserDocument의 phone 필드가 이미 옵셔널이므로 !userData.phone? 로 체크하는게 더 정확할 수 있습니다.
            if (phoneNumber && !userData.phone) {
              await updateDoc(userRef, { phone: phoneNumber });
              userData.phone = phoneNumber; // 로컬 상태에도 반영
            }
            
            // ✅ [수정] role 필드를 기반으로 isAdmin 상태를 설정합니다.
            setIsAdmin(userData.role === 'admin'); 
            const updatedUserState: AuthUser = { ...currentUser, ...userData };
            setUser(updatedUserState);
          }
          
          const q = query(collection(db, "notifications"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
          unsubNotifs = onSnapshot(q, (snapshot) => {
            const newNotifications = snapshot.docs.map(d => ({
              id: d.id,
              ...d.data(),
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