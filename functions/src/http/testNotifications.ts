// functions/src/http/testNotifications.ts
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from "firebase-functions/logger";
import { executePickupReminders } from "../scheduled/notifications.js";

/**
 * @description [단일 테스트용] 특정 사용자에게 픽업 안내 알림톡을 즉시 발송하는 함수
 */
export const testSendPickupReminders = onRequest(
  { 
    region: 'asia-northeast3',
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"] 
  },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    try {
      const payload = req.method === 'POST' ? req.body : req.query;
      const userPhone = payload.phone as string;
      if (!userPhone) {
        res.status(400).send({ ok: false, error: "Please provide a 'phone' in the query string or request body."});
        return;
      }
      logger.info(`HTTP 트리거를 통해 테스트 알림톡 발송을 시작합니다. 대상: ${userPhone}`);
      await executePickupReminders(userPhone);
      const successMessage = `Successfully triggered pickup reminders for ${userPhone}. Check Cloud Functions logs for details.`;
      res.status(200).send({ ok: true, message: successMessage });
    } catch (err) {
      logger.error('[testSendPickupReminders] Error:', err);
      res.status(500).send({ ok: false, error: (err as Error)?.message ?? String(err) });
    }
  }
);

/**
 * @description [전체 발송용] 오늘 픽업 예정인 모든 사용자에게 알림톡을 즉시 발송하는 함수
 */
export const triggerAllPickupReminders = onRequest(
  {
    region: 'asia-northeast3',
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
    // 타임아웃을 2분으로 늘려 많은 사용자에게 보낼 시간을 확보합니다.
    timeoutSeconds: 120,
  },
  async (req, res) => {
    logger.info("HTTP 트리거를 통해 '모든 사용자 대상' 픽업 안내 알림톡 발송을 시작합니다.");
    try {
      // executePickupReminders 함수를 파라미터 없이 호출하면 전체 대상에게 발송됩니다.
      await executePickupReminders();
      
      const successMessage = "Successfully triggered pickup reminders for all eligible users. Check Cloud Functions logs for details.";
      logger.info(successMessage);
      res.status(200).send(successMessage);
    } catch (error) {
      logger.error("전체 사용자 대상 알림톡 발송 중 심각한 오류 발생:", error);
      res.status(500).send("An error occurred while sending notifications to all users.");
    }
  }
);