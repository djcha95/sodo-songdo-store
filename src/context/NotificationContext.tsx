// src/context/NotificationContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// ✅ [수정] getFirebaseServices를 import 합니다.
import { getFirebaseServices } from '@/firebase/firebaseInit';
import { collection, query, getDocs, orderBy, limit, doc, writeBatch, updateDoc } from 'firebase/firestore/lite';
import type { Notification } from '@/types';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAllAsRead: () => Promise<void>;
  markOneAsRead: (id: string) => Promise<void>;
  // ✅ [추가] 수동 새로고침 함수
  fetchNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.uid) {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        return;
    };
    
    setLoading(true);
    try {
        // ✅ 함수 내에서 db를 받아옵니다.
        const { db } = await getFirebaseServices();
        const notificationsRef = collection(db, 'users', user.uid, 'notifications');
        const q = query(notificationsRef, orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);

        const fetchedNotifications: Notification[] = [];
        let newUnreadCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            fetchedNotifications.push({ id: doc.id, ...data } as Notification);
            if (!data.read) newUnreadCount++;
        });
        
        setNotifications(fetchedNotifications);
        setUnreadCount(newUnreadCount);
    } catch (error) {
        console.error("알림 조회 중 오류:", error);
    } finally {
        setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markOneAsRead = useCallback(async (id: string) => {
    if (!user) return;
    try {
      // ✅ 함수 내에서 db를 받아옵니다.
      const { db } = await getFirebaseServices();
      const notifRef = doc(db, 'users', user.uid, 'notifications', id);
      await updateDoc(notifRef, { read: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("알림을 읽음 처리하는 중 오류 발생:", error);
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user || unreadCount === 0) return;
    
    try {
      // ✅ 함수 내에서 db를 받아옵니다.
      const { db } = await getFirebaseServices();
      const batch = writeBatch(db);
      notifications.forEach(notification => {
        if (!notification.read) {
          const notifRef = doc(db, 'users', user.uid, 'notifications', notification.id);
          batch.update(notifRef, { read: true });
        }
      });
      await batch.commit();
      setNotifications(prev => prev.map(n => ({...n, read: true})));
      setUnreadCount(0);
    } catch (error) {
      console.error("알림 읽음 처리 중 오류 발생:", error);
    }
  }, [user, unreadCount, notifications]);

  const value = { notifications, unreadCount, loading, markAllAsRead, markOneAsRead, fetchNotifications };

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