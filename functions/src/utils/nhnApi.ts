// functions/src/utils/nhnApi.ts
import * as logger from "firebase-functions/logger";
import axios from "axios";
import { NhnAlimtalkResponse } from "@/shared/types";

/**
 * @description NHN Cloud 알림톡 발송 API를 호출하는 헬퍼 함수
 */
export async function sendAlimtalk(recipientPhone: string, templateCode: string, templateVariables: object) {
  const APP_KEY = process.env.NHN_APP_KEY;
  const SECRET_KEY = process.env.NHN_SECRET_KEY;
  const SENDER_KEY = process.env.NHN_SENDER_KEY;
  
  if (!APP_KEY || !SECRET_KEY || !SENDER_KEY) {
    logger.error("NHN 관련 키(APP_KEY, SECRET_KEY, SENDER_KEY)가 Secret Manager에 설정되지 않았습니다.");
    throw new Error("NHN Cloud API keys are not set in environment variables.");
  }
  
  const API_URL = `https://api-alimtalk.cloud.toast.com/alimtalk/v2.3/appkeys/${APP_KEY}/messages`;

  const payload = {
    senderKey: SENDER_KEY,
    templateCode: templateCode,
    recipientList: [{
      recipientNo: recipientPhone,
      templateParameter: templateVariables,
    }],
  };

  logger.info(`[NHN ALIMTALK PAYLOAD] 템플릿(${templateCode}) 요청 데이터:`, {
    payload: JSON.stringify(payload, null, 2),
  });

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