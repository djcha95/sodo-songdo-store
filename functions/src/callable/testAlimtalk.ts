// functions/src/callable/testAlimtalk.ts

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { sendAlimtalk } from "../utils/nhnApi.js";

// 테스트 데이터 생성 로직 (기존과 동일)
const getTestTemplateVariables = (templateCode: string) => {
  const commonVars = {
    고객명: "테스트고객",
    상품목록: "・ 테스트상품A 1개\n・ 테스트상품B 2개",
  };
  switch (templateCode) {
    case "ORD_CONFIRM_NOW": return { ...commonVars };
    case "ORD_CONFIRM_FUTURE": return { ...commonVars, 픽업시작일: "2025년 8월 10일(일)" };
    case "STANDARD_PICKUP_STAR": return { 고객명: commonVars.고객명, 오늘마감상품목록: "🚨 오늘 꼭 찾아가세요!\n・ 긴급마감상품 1개", 일반픽업상품목록: "🛍️ 오늘부터 여유롭게 찾아가세요\n・ 일반픽업상품 2개" };
    case "PREPAYMENT_GUIDE_URG": return { 고객명: commonVars.고객명, 상품목록: "・ 깜빡한상품 1개", 총결제금액: "15000" };
    default: return null;
  }
};

export const testSendAlimtalk = onRequest(
  {
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
    // ✅ [핵심 수정] Cloud Functions v2의 내장 CORS 옵션을 사용합니다.
    // 로컬 환경(localhost)과 배포 환경(sodo-songdo.store)에서의 요청을 모두 허용합니다.
    cors: [/localhost:\d+/, "https://sodo-songdo.store"],
  },
  async (request, response) => {
    // 💡 참고: cors 옵션을 사용하면 아래의 수동 CORS 헤더 설정 및 OPTIONS 메서드 처리가 더 이상 필요 없습니다.
    // response.set("Access-Control-Allow-Origin", "*");
    // ...
    // if (request.method === "OPTIONS") { ... }

    try {
      // ✅ [핵심 수정] request.body.data 대신 request.body에서 직접 데이터를 가져옵니다.
      const { recipientPhone, templateCode } = request.body;
      
      logger.info(`[Test] HTTP 요청 수신: ${recipientPhone}, ${templateCode}`);

      if (!recipientPhone || !templateCode) {
        logger.error("필수 파라미터 누락");
        response.status(400).send({ error: "수신자 전화번호(recipientPhone)와 템플릿 코드(templateCode)는 필수입니다." });
        return;
      }

      const templateVariables = getTestTemplateVariables(templateCode);
      if (!templateVariables) {
        logger.error(`정의되지 않은 템플릿 코드: ${templateCode}`);
        response.status(400).send({ error: `정의되지 않은 템플릿 코드입니다: ${templateCode}`});
        return;
      }

      await sendAlimtalk(recipientPhone, templateCode, templateVariables);
      logger.info(`[Test] 알림톡 발송 요청 성공: ${recipientPhone}, ${templateCode}`);
      response.status(200).send({ success: true, message: "알림톡 발송 요청에 성공했습니다." });

    } catch (error: any) {
      logger.error(`[Test] 알림톡 발송 테스트 중 오류 발생`, error);
      // 서버 측 에러는 더 구체적인 메시지를 전달하는 것이 좋습니다.
      response.status(500).send({ error: `알림톡 발송 중 서버 내부 오류가 발생했습니다: ${error.message}` });
    }
  }
);