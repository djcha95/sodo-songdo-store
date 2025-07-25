// src/context/NotificationContext.tsx

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, writeBatch } from 'firebase/firestore';
import type { Notification } from '../types';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  handleMarkAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.uid) {
      setLoading(true);
      const q = query(
        collection(db, 'users', user.uid, 'notifications'),
        orderBy('timestamp', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedNotifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Notification));
        setNotifications(fetchedNotifications);
        setLoading(false);
      }, (error) => {
        console.error("알림 데이터 로딩 실패:", error);
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      setNotifications([]);
      setLoading(false);
    }
  }, [user]);

  const unreadCount = useMemo(() => {
    // ✅ [수정] n.isRead -> n.read
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  const handleMarkAsRead = async (id: string) => {
    if (!user) return;
    const notifDocRef = doc(db, 'users', user.uid, 'notifications', id);
    // ✅ [수정] isRead: true -> read: true
    await updateDoc(notifDocRef, { read: true });
  };
  
const markAllAsRead = async () => {
    if (!user || unreadCount === 0) return;
    // ✅ [수정] n.isRead -> n.read
    const unreadNotifications = notifications.filter(n => !n.read);
    
    const batch = writeBatch(db); 
    
    unreadNotifications.forEach(n => {
        const notifDocRef = doc(db, 'users', user.uid, 'notifications', n.id);
        // ✅ [수정] isRead: true -> read: true
        batch.update(notifDocRef, { read: true });
    });
    
    await batch.commit();
  };

  const value = {
    notifications,
    unreadCount,
    loading,
    handleMarkAsRead,
    markAllAsRead
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};