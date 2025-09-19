// src/context/NotificationContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
// ✅ [수정] db를 firebaseConfig에서 직접 가져옵니다 (lite 버전 사용)
import { db } from '@/firebase/firebaseConfig';
// ✅ [수정] onSnapshot -> getDocs
import { collection, query, getDocs, orderBy, limit, doc, writeBatch, updateDoc } from 'firebase/firestore';
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

  // ✅ [수정] 1회성으로 알림을 가져오는 함수
  const fetchNotifications = useCallback(async () => {
    if (!user?.uid) {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        return;
    };
    
    setLoading(true);
    try {
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
    const notifRef = doc(db, 'users', user.uid, 'notifications', id);
    try {
      await updateDoc(notifRef, { read: true });
      // UI 즉시 반영
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
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
      // UI 즉시 반영
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