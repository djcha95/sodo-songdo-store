// functions/src/utils/notificationService.ts

import { dbAdmin as db } from '../firebase/admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { NotificationType } from '../types.js';
import * as logger from "firebase-functions/logger";

/**
 * 서버 환경에서 특정 사용자에게 앱 내 알림을 생성합니다.
 * @param {string} userId - 알림을 받을 사용자의 ID
 * @param {string} message - 알림 메시지
 * @param {object} options - 알림 옵션 (link, type 등)
 */
export const createNotification = async (
  userId: string,
  message: string,
  options: { type: NotificationType; link?: string }
): Promise<void> => {
  // ✅ [개선] 안정성을 위해 필수 값들을 확인하고 로그를 남깁니다.
  if (!userId || !message) {
    logger.error("Notification creation failed: userId or message is missing.", { userId, message });
    return;
  }

  // ✅ 기존 코드를 그대로 유지하여 데이터 구조의 일관성을 보장합니다.
  const newNotification = {
    message,
    read: false,
    timestamp: FieldValue.serverTimestamp(),
    type: options.type,
    link: options.link || '',
  };

  // ✅ [개선] 데이터베이스 작업 중 발생할 수 있는 오류를 처리합니다.
  try {
    await db.collection('users').doc(userId).collection('notifications').add(newNotification);
    logger.info(`Successfully created notification for user ${userId}.`);
  } catch (error) {
    logger.error(`Failed to create notification for user ${userId}:`, error);
  }
};