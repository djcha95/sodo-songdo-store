// functions/src/callable/waitlist.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, Transaction } from "firebase-admin/firestore";
import type { Product, SalesRound, WaitlistEntry } from "@/shared/types";

// TODO: [비활성화] 대기자 명단 기능이 완전히 비활성화되었습니다.
// Firestore 데이터는 건드리지 않으며, UI 진입점과 API 호출이 차단되었습니다.
// 
// 클라이언트에서 대기 신청을 처리하기 위한 함수
export const addWaitlistEntry = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
  // TODO: [비활성화] 대기자 명단 기능 비활성화 - 호출 불가 처리
  throw new HttpsError("permission-denied", "대기자 명단 기능은 현재 사용할 수 없습니다.");
  
  // 아래 코드는 비활성화되었지만 참고용으로 유지합니다.
  /*
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const { productId, roundId, quantity, variantGroupId, itemId } = request.data;
  const userId = request.auth.uid;

  if (!productId || !roundId || !quantity || !variantGroupId || !itemId) {
    throw new HttpsError("invalid-argument", "필수 정보가 누락되었습니다.");
  }

  const productRef = db.collection("products").doc(productId);

  try {
    await db.runTransaction(async (transaction: Transaction) => {
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) {
        throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
      }

      const productData = productDoc.data() as Product;
      const newSalesHistory = [...productData.salesHistory];
      const roundIndex = newSalesHistory.findIndex((r: SalesRound) => r.roundId === roundId);

      if (roundIndex === -1) {
        throw new HttpsError("not-found", "판매 회차 정보를 찾을 수 없습니다.");
      }

      const round = newSalesHistory[roundIndex];

      const newWaitlistEntry: WaitlistEntry = {
        userId,
        quantity,
        timestamp: Timestamp.now(),
        variantGroupId,
        itemId,
      };

      round.waitlist = [...(round.waitlist || []), newWaitlistEntry];
      
      newSalesHistory[roundIndex] = round;
      transaction.update(productRef, { salesHistory: newSalesHistory });
    });

    return { success: true, message: "대기 신청이 완료되었습니다." };
  } catch (error) {
    console.error("Error in addWaitlistEntry function:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "대기 신청 처리 중 오류가 발생했습니다.");
  }
  */
});