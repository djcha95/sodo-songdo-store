// src/context/NotificationContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/firebase/firebaseConfig';
import { collection, query, onSnapshot, orderBy, limit, doc, writeBatch, updateDoc } from 'firebase/firestore';
import type { Notification } from '@/types';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAllAsRead: () => Promise<void>;
  // ✅ [추가] 알림 한 개를 읽음 처리하는 함수 타입을 추가합니다.
  markOneAsRead: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (user?.uid) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current(); 
      }
      setLoading(true);
      const notificationsRef = collection(db, 'users', user.uid, 'notifications');
      const q = query(notificationsRef, orderBy('timestamp', 'desc'), limit(50));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedNotifications: Notification[] = [];
        let newUnreadCount = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          
          fetchedNotifications.push({ 
            id: doc.id, 
            ...data,
          } as Notification);

          if (!data.read) {
            newUnreadCount++;
          }
        });
        
        setNotifications(fetchedNotifications);
        setUnreadCount(newUnreadCount);
        setLoading(false);
      }, (error) => {
        console.error("알림 실시간 감지 중 오류:", error);
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

    } else {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user]);

  // ✅ [추가] 알림 한 개를 읽음 처리하는 함수를 구현합니다.
  const markOneAsRead = useCallback(async (id: string) => {
    if (!user) return;
    const notifRef = doc(db, 'users', user.uid, 'notifications', id);
    try {
      await updateDoc(notifRef, { read: true });
      // 실시간 리스너가 Firestore의 변경을 감지하고 UI를 자동으로 업데이트합니다.
    } catch (error) {
      console.error("알림을 읽음 처리하는 중 오류 발생:", error);
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user || unreadCount === 0) return;

    const batch = writeBatch(db);
    notifications.forEach(notification => {
      if (!notification.read) {
        const notifRef = doc(db, 'users', user.uid, 'notifications', notification.id);
        batch.update(notifRef, { read: true });
      }
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("알림 읽음 처리 중 오류 발생:", error);
    }
  }, [user, unreadCount, notifications]);

  // ✅ [수정] 새로 만든 markOneAsRead 함수를 context value에 포함합니다.
  const value = { notifications, unreadCount, loading, markAllAsRead, markOneAsRead };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};