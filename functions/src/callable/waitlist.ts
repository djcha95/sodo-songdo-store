// functions/src/callable/waitlist.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, Transaction } from "firebase-admin/firestore";
import type { Product, SalesRound, WaitlistEntry } from "../types.js";

// 클라이언트에서 대기 신청을 처리하기 위한 함수
export const addWaitlistEntry = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
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

      // ✅ [로직 수정] 모든 대기 신청을 항상 새로운 항목으로 추가합니다.
      // 기존 대기를 찾아 수량을 합치는 로직을 제거하여, 엄격한 선착순(FIFO)을 보장합니다.
      const newWaitlistEntry: WaitlistEntry = {
        userId,
        quantity,
        timestamp: Timestamp.now(),
        variantGroupId,
        itemId,
      };

      round.waitlist = [...(round.waitlist || []), newWaitlistEntry];
      round.waitlistCount = (round.waitlistCount || 0) + quantity;
      
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
});