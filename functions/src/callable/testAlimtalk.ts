// functions/src/callable/testAlimtalk.ts

import { onRequest } from "firebase-functions/v2/https"; // onCall 대신 onRequest를 import
import * as logger from "firebase-functions/logger";
import { sendAlimtalk } from "../utils/nhnApi.js";

// 테스트 데이터 생성 로직 (이전과 동일)
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


// ✅ [핵심 수정] onCall을 onRequest로 변경
export const testSendAlimtalk = onRequest(
  {
    // ✅ 에러로그에 나온 us-central1 리전으로 설정합니다.
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (request, response) => {
    // ✅ CORS 헤더를 수동으로 설정하여 모든 요청을 허용 (테스트용)
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // ✅ 브라우저가 보내는 사전 요청(preflight)인 OPTIONS 메서드에 204(No Content)로 응답
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    
    // 이제 실제 함수 로직을 실행합니다.
    try {
      // request.data 대신 request.body에서 데이터를 가져옵니다.
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
      response.status(500).send({ error: `알림톡 발송 실패: ${error.message}` });
    }
  }
);