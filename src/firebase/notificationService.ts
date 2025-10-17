// src/firebase/notificationService.ts

import { db } from './firebaseConfig';
// ✅ [수정] Firebase v9 SDK에 맞는 정확한 import 경로로 수정합니다.
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'; 
import type { NotificationType as OriginalNotificationType } from '@/shared/types';

// ✅ [수정] 대기 확정 알림 타입을 추가합니다. (이전 수정사항 유지)
type NotificationType = OriginalNotificationType | 'WAITLIST_CONFIRMED';


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
    
    // ✅ [수정] 오타(notificationsColleRef -> notificationsColRef)를 수정합니다.
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
