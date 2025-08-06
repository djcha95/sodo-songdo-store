// functions/src/triggers/points.ts

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
// ✅ [수정] dbAdmin을 db라는 별칭으로 가져옵니다.
import { dbAdmin as db } from "../firebase/admin.js";
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
      message = `🎉 '${reason}'으로 ${amount.toLocaleString()}P가 적립되었어요!`;
    } else {
      message = `🛍️ '${reason}'으로 ${Math.abs(
        amount
      ).toLocaleString()}P를 사용했어요.`;
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