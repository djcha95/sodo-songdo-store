// functions/src/utils/nhnApi.ts
import * as logger from "firebase-functions/logger";
import axios from "axios";
import { NhnAlimtalkResponse } from "../types.js";

/**
 * @description NHN Cloud 알림톡 발송 API를 호출하는 헬퍼 함수
 */
export async function sendAlimtalk(recipientPhone: string, templateCode: string, templateVariables: object) {
  // ✅ [오류 수정] 모든 NHN 키를 process.env에서 가져옵니다.
  const APP_KEY = process.env.NHN_APP_KEY;
  const SECRET_KEY = process.env.NHN_SECRET_KEY;
  const SENDER_KEY = process.env.NHN_SENDER_KEY;
  
  // ✅ [오류 수정] 3개의 키가 모두 설정되었는지 확인합니다.
  if (!APP_KEY || !SECRET_KEY || !SENDER_KEY) {
    logger.error("NHN 관련 키(APP_KEY, SECRET_KEY, SENDER_KEY)가 Secret Manager에 설정되지 않았습니다.");
    throw new Error("NHN Cloud API keys are not set in environment variables.");
  }
  
  const API_URL = `https://api-alimtalk.cloud.toast.com/alimtalk/v2.3/appkeys/${APP_KEY}/messages`;

  const payload = {
    // ✅ [오류 수정] API 요청 본문에 senderKey를 추가합니다.
    senderKey: SENDER_KEY,
    templateCode: templateCode,
    recipientList: [{
      recipientNo: recipientPhone,
      templateParameter: templateVariables,
    }],
  };

  // =================================================================
  // ✅ [디버깅 로그 추가]
  // NHN API로 전송하기 직전의 실제 요청 데이터 전체를 로그로 출력합니다.
  // 이 로그를 통해 변수 내용이 어떻게 구성되었는지 정확히 확인할 수 있습니다.
  logger.info(`[NHN ALIMTALK PAYLOAD] 템플릿(${templateCode}) 요청 데이터:`, {
    payload: JSON.stringify(payload, null, 2),
  });
  // =================================================================

  try {
    const response = await axios.post<NhnAlimtalkResponse>(API_URL, payload, {
      headers: {
        "X-Secret-Key": SECRET_KEY,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

    const responseData = response.data;

    if (responseData.header.isSuccessful) {
      logger.info(`알림톡 발송 요청 성공: ${recipientPhone}, 템플릿: ${templateCode}`, { result: responseData });
    } else {
      const errorMessage = `[${responseData.header.resultCode}] ${responseData.header.resultMessage}`;
      logger.error(`알림톡 발송 등록 실패: ${errorMessage}`, {
          requestPayload: payload,
          responseData: responseData,
      });
      throw new Error(`NHN Alimtalk API returned a failure: ${errorMessage}`);
    }

  } catch (error: any) {
    logger.error(`알림톡 발송 함수에서 에러 발생: ${recipientPhone}, 템플릿: ${templateCode}`, {
        errorMessage: error.message,
        responseData: error.response?.data,
        requestPayload: payload,
    });
    throw error;
  }
}