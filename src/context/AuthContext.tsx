// src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, onSnapshot, orderBy, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { UserDocument, Notification } from '@/types'; 

// ✅ phone 필드가 추가된 UserDocument를 AuthUser에 반영
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

          // ✅ [추가] 카카오 프로필에서 전화번호를 가져오는 로직
          // Firebase의 currentUser.providerData에서 'oidc.kakao' 공급자 정보를 찾습니다.
          const kakaoProviderData = currentUser.providerData.find(p => p.providerId === 'oidc.kakao');
          // 카카오에서 제공하는 phoneNumber 정보를 추출합니다. 없으면 null로 설정합니다.
          const phoneNumber = kakaoProviderData?.phoneNumber || null;

          if (!userSnap.exists()) {
            // ✅ [수정] 새 사용자 문서 생성 시, 추출한 전화번호를 함께 저장합니다.
            const newUserDoc: UserDocument = {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              phone: phoneNumber, // 전화번호 저장
              createdAt: serverTimestamp(),
              isAdmin: false,
              encoreRequestedProductIds: [],
            };
            await setDoc(userRef, newUserDoc);
            
            setIsAdmin(false);
            setUser({ ...currentUser, ...newUserDoc });

          } else {
            const userData = userSnap.data() as UserDocument;

            // ✅ [추가] 기존 사용자의 DB에 전화번호가 없지만, 카카오에서 제공된 경우 업데이트합니다.
            if (phoneNumber && !userData.phone) {
              await updateDoc(userRef, { phone: phoneNumber });
              userData.phone = phoneNumber; // 로컬 상태에도 반영
            }
            
            setIsAdmin(userData.isAdmin === true);
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