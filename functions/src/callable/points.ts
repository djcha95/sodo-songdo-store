// functions/src/callable/points.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { Product, UserDocument, PointLog } from "../types.js";
import * as logger from "firebase-functions/logger";

const TICKET_COST = 50;

export const useWaitlistTicket = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
  // ✅ [최종 디버깅] 서버에 도착한 데이터 원본을 확인하기 위해 로그를 추가합니다.
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const { productId, roundId, itemId } = request.data;
  const userId = request.auth.uid;

  // 기존 유효성 검사는 그대로 둡니다.
  if (!productId || !roundId || !itemId) {
    throw new HttpsError("invalid-argument", "필수 정보(상품, 회차, 아이템 ID)가 누락되었습니다.");
  }

  const userRef = db.collection("users").doc(userId);
  const productRef = db.collection("products").doc(productId);

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
      
      const userData = userDoc.data() as UserDocument;
      if (userData.points < TICKET_COST) throw new HttpsError("failed-precondition", `포인트가 부족합니다. (${TICKET_COST}P 필요)`);
      
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
      
      const productData = productDoc.data() as Product;
      
      const salesHistory = [...productData.salesHistory];
      const roundIndex = salesHistory.findIndex(r => r.roundId === roundId);
      if (roundIndex === -1) throw new HttpsError("not-found", "판매 회차를 찾을 수 없습니다.");
      
      const round = salesHistory[roundIndex];
      if (!round.waitlist) throw new HttpsError("not-found", "대기열 정보를 찾을 수 없습니다.");
      
      const entryIndex = round.waitlist.findIndex(e => e.userId === userId && e.itemId === itemId);
      if (entryIndex === -1) throw new HttpsError("not-found", "내 대기 정보를 찾을 수 없습니다. 이미 취소되었을 수 있습니다.");
      if (round.waitlist[entryIndex].isPrioritized) throw new HttpsError("already-exists", "이미 순번 상승권을 사용한 대기입니다.");

      // --- 사용자 포인트 차감 로직 ---
      const newPoints = userData.points - TICKET_COST;
      const pointHistoryEntry: Omit<PointLog, 'id'> = {
        amount: -TICKET_COST,
        reason: "대기 순번 상승권 사용",
        createdAt: Timestamp.now(), 
        expiresAt: null,
      };
      transaction.update(userRef, {
        points: newPoints,
        pointHistory: FieldValue.arrayUnion(pointHistoryEntry),
      });

      // --- 대기열 업데이트 로직 ---
      round.waitlist[entryIndex].isPrioritized = true;
      round.waitlist[entryIndex].prioritizedAt = Timestamp.now();
      
      salesHistory[roundIndex] = round;
      transaction.update(productRef, { salesHistory });
    });

    return { success: true, message: "순번 상승권이 적용되었습니다." };

  } catch (error) {
    logger.error("useWaitlistTicket 함수 오류:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "순번 상승권 처리 중 오류가 발생했습니다.");
  }
});