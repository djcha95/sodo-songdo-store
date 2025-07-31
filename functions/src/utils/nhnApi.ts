// functions/src/utils/nhnApi.ts
import * as functions from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import axios from "axios";

/**
 * @description NHN Cloud 알림톡 발송 API를 호출하는 헬퍼 함수
 */
export async function sendAlimtalk(recipientPhone: string, templateCode: string, templateVariables: object) {
  const APP_KEY = functions.config().nhn.appkey;
  const SECRET_KEY = functions.config().nhn.secretkey;
  
  if (!APP_KEY || !SECRET_KEY) {
    logger.error("NHN Cloud API 키가 환경 변수에 설정되지 않았습니다.");
    return;
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
    await axios.post(API_URL, payload, {
      headers: {
        "X-Secret-Key": SECRET_KEY,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });
    logger.info(`알림톡 발송 성공: ${recipientPhone}, 템플릿: ${templateCode}`);
  } catch (error: any) {
    logger.error(`알림톡 발송 실패: ${recipientPhone}, 사유:`, error.response?.data || error.message);
  }
}