// src/firebase/notificationService.ts

import { db } from './firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { NotificationType } from '@/types';

/**
 * @description 특정 사용자에게 새로운 알림을 생성합니다.
 * @param userId 알림을 받을 사용자의 ID
 * @param message 알림에 표시될 메시지
 * @param options 알림 타입, 링크 등 추가 정보
 */
export const createNotification = async (
  userId: string,
  message: string,
  options: { type?: NotificationType; link?: string } = {}
): Promise<void> => {
  if (!userId || !message) {
    console.error("Notification creation failed: userId and message are required.");
    return;
  }

  try {
    const notificationsColRef = collection(db, 'users', userId, 'notifications');
    
    await addDoc(notificationsColRef, {
      message,
      read: false,
      timestamp: serverTimestamp(),
      type: options.type || 'GENERAL_INFO',
      link: options.link || '',
    });
  } catch (error) {
    console.error(`Failed to create notification for user ${userId}:`, error);
  }
};