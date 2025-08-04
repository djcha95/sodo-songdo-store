// functions/src/utils/nhnApi.ts
import * as logger from "firebase-functions/logger";
import axios from "axios";

/**
 * @description NHN Cloud 알림톡 발송 API를 호출하는 헬퍼 함수
 */
export async function sendAlimtalk(recipientPhone: string, templateCode: string, templateVariables: object) {
  // ✅ [수정] v1 방식인 functions.config() 대신, v2 방식인 process.env를 사용하여 환경 변수를 불러옵니다.
  const APP_KEY = process.env.NHN_APP_KEY;
  const SECRET_KEY = process.env.NHN_SECRET_KEY;
  
  // ✅ [개선] API 키가 없을 경우, 오류를 발생시켜 함수 실행을 즉시 중단하고 로그에 명확히 남깁니다.
  if (!APP_KEY || !SECRET_KEY) {
    logger.error("NHN_APP_KEY 또는 NHN_SECRET_KEY가 .env 파일에 설정되지 않았습니다.");
    throw new Error("NHN Cloud API keys are not set in environment variables.");
  }
  
  const API_URL = `https://api-alimtalk.cloud.toast.com/alimtalk/v2.2/appkeys/${APP_KEY}/messages`;

  const payload = {
    templateCode: templateCode,
    recipientList: [{
      recipientNo: recipientPhone,
      templateParameter: templateVariables,
    }],
  };

  try {
    const response = await axios.post(API_URL, payload, {
      headers: {
        "X-Secret-Key": SECRET_KEY,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });
    // ✅ [개선] 성공 시 API 응답 내용을 로그에 기록하여 확인이 쉽도록 합니다.
    logger.info(`알림톡 발송 성공: ${recipientPhone}, 템플릿: ${templateCode}`, { result: response.data });
  } catch (error: any) {
    // ✅ [개선] 오류 로깅을 더 상세하게 변경하여 문제 파악을 쉽게 합니다.
    logger.error(`알림톡 발송 실패: ${recipientPhone}, 템플릿: ${templateCode}`, {
        errorMessage: error.message,
        responseData: error.response?.data,
        requestPayload: payload,
    });
    // ✅ [개선] 오류를 다시 throw하여 호출한 함수(onOrderCreated)가 실패를 인지하고, Firebase 로그에 '오류'로 표시되도록 합니다.
    throw error;
  }
}