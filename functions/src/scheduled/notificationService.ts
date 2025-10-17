import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import type { NotificationType } from "@/shared/types";

/**
 * 특정 사용자에게 앱 내 알림(Firestore 문서)을 생성하는 공통 함수
 * @param userId 알림을 받을 사용자의 ID
 * @param message 알림 메시지 내용
 * @param options 알림 타입과 클릭 시 이동할 링크
 */
export const createNotification = async (
  userId: string,
  message: string,
  options: { type: NotificationType; link?: string }
): Promise<void> => {
  if (!userId || !message) {
    logger.error("Notification creation failed: userId or message is missing.", { userId, message });
    return;
  }
  
  try {
    const userRef = db.collection("users").doc(userId);
    const notificationRef = userRef.collection("notifications").doc();

    const newNotification = {
      message,
      read: false,
      timestamp: FieldValue.serverTimestamp(),
      type: options.type,
      // 링크가 제공되지 않으면 기본 알림 목록 페이지로 설정
      link: options.link || "/mypage/notifications", 
    };

    await notificationRef.set(newNotification);
    logger.info(`Successfully created notification for user ${userId}: "${message}"`);
  } catch (error) {
    logger.error(`Error creating notification for user ${userId}:`, error);
  }
};