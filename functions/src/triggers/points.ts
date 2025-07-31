// functions/src/triggers/points.ts
// ✅ [수정] 사용하지 않는 FirestoreEvent, DocumentSnapshot 타입을 import 목록에서 제거했습니다.
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/config.js";
import { FieldValue } from "firebase-admin/firestore";
import type { PointLog } from "../types.js";

export const createNotificationOnPointChange = onDocumentCreated(
  {
    document: "users/{userId}/pointLogs/{logId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data in the event.", {params: event.params});
      return;
    }

    const {userId} = event.params;
    const pointLog = snapshot.data() as PointLog;
    const {amount, reason} = pointLog;

    if (amount === 0) {
      return;
    }

    if (amount === undefined || !reason) {
      logger.error("The point log is missing the amount or reason field.", {
        data: pointLog,
      });
      return;
    }

    let message = "";
    if (amount > 0) {
      message = `🎉 You've earned ${amount.toLocaleString()}P for '${reason}'!`;
    } else {
      message = `🛍️ You've used ${Math.abs(
        amount
      ).toLocaleString()}P for '${reason}'.`;
    }

    const newNotification = {
      message,
      type: amount > 0 ? "POINTS_EARNED" : "POINTS_USED",
      read: false,
      timestamp: FieldValue.serverTimestamp(),
      link: "/mypage/points",
    };

    try {
      await db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .add(newNotification);
      logger.info(`Successfully sent a notification to user [${userId}].`);
    } catch (error) {
      logger.error(
        `An error occurred while sending a notification to user [${userId}]:`,
        error
      );
    }
  }
);