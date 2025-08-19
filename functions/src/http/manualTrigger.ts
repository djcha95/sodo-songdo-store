// functions/src/http/manualTrigger.ts

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { executePickupReminders } from "../scheduled/notifications.js";

/**
 * @description 오늘자 픽업 리마인더를 수동으로 즉시 실행하기 위한 임시 HTTP 함수
 */
export const manualSendPickupReminders = onRequest(
  {
    region: "asia-northeast3",
    // 시크릿은 executePickupReminders를 실행하는 데 필요합니다.
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"], 
  },
  async (req, res) => {
    logger.info("수동으로 픽업 리마인더 발송을 시작합니다.");
    try {
      // scheduled/notifications.ts 에 있는 핵심 로직을 그대로 호출합니다.
      await executePickupReminders();
      
      const successMessage = "오늘자 픽업 리마인더가 성공적으로 발송되었습니다.";
      logger.info(successMessage);
      res.status(200).send(successMessage);
    } catch (error) {
      const errorMessage = "수동 픽업 리마인더 발송 중 오류가 발생했습니다.";
      logger.error(errorMessage, error);
      res.status(500).send(errorMessage);
    }
  }
);