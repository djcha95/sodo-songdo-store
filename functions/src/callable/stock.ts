// functions/src/callable/stock.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Transaction } from "firebase-admin/firestore";
import { createNotification } from "../utils/notificationService.js";
import { submitOrderFromWaitlist } from "../utils/orderService.js";
import type { Product, WaitlistEntry, UserDocument } from "../types.js";
import * as logger from "firebase-functions/logger";

export const addStockAndProcessWaitlist = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
  if (!request.auth || !request.auth.token.role || !['admin', 'master'].includes(request.auth.token.role)) {
    throw new HttpsError("permission-denied", "이 작업을 수행할 권한이 없습니다.");
  }

  const { productId, roundId, variantGroupId, additionalStock } = request.data;
  if (!productId || !roundId || !variantGroupId || additionalStock <= 0) {
    throw new HttpsError("invalid-argument", "필수 정보가 누락되었거나 재고 수량이 올바르지 않습니다.");
  }

  let convertedCount = 0;
  let failedCount = 0;
  const notificationsToSend: { userId: string; productName: string; quantity: number }[] = [];
  const productRef = db.collection("products").doc(productId);

  try {
    await db.runTransaction(async (transaction: Transaction) => {
      // --- 1. 읽기 단계: 필요한 모든 문서를 미리 읽어옵니다. ---
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
      const product = { ...productDoc.data(), id: productDoc.id } as Product;
      const round = product.salesHistory.find(r => r.roundId === roundId);
      if (!round) throw new HttpsError("not-found", "판매 회차를 찾을 수 없습니다.");
      const userIdsToFetch = new Set<string>();
      (round.waitlist || []).forEach(entry => { userIdsToFetch.add(entry.userId); });
      const userDocsMap = new Map<string, UserDocument>();
      if (userIdsToFetch.size > 0) {
          const userRefs = Array.from(userIdsToFetch).map(uid => db.collection("users").doc(uid));
          const userSnaps = await Promise.all(userRefs.map(ref => transaction.get(ref)));
          userSnaps.forEach(userSnap => {
              if (userSnap.exists) {
                  userDocsMap.set(userSnap.id, userSnap.data() as UserDocument);
              }
          });
      }

      // --- 2. 쓰기 단계: 읽어온 데이터를 바탕으로 모든 변경 작업을 수행합니다. ---
      const salesHistory = [...product.salesHistory];
      const roundIndex = salesHistory.findIndex(r => r.roundId === roundId);
      if (roundIndex === -1) return;
      
      const currentRound = salesHistory[roundIndex];
      const groupIndex = currentRound.variantGroups.findIndex(vg => vg.id === variantGroupId);
      if (groupIndex === -1) {
        throw new HttpsError("not-found", "재고를 추가할 상품 옵션을 찾을 수 없습니다.");
      }
      
      const originalStock = currentRound.variantGroups[groupIndex].totalPhysicalStock;
      if (originalStock !== null && originalStock !== -1) {
        currentRound.variantGroups[groupIndex].totalPhysicalStock = (originalStock || 0) + additionalStock;
      }

      if (!currentRound.waitlist || currentRound.waitlist.length === 0) {
        transaction.update(productRef, { salesHistory });
        return;
      }

      let availableStock = additionalStock;
      
      // ✅ [수정] isPrioritized 관련 복잡한 정렬 로직을 단순한 선착순(FIFO)으로 변경합니다.
      const sortedWaitlist = [...currentRound.waitlist].sort((a, b) => 
        a.timestamp.toMillis() - b.timestamp.toMillis()
      );
      
      const remainingWaitlist: WaitlistEntry[] = [];

      for (const entry of sortedWaitlist) {
        if (entry.variantGroupId !== variantGroupId) {
          remainingWaitlist.push(entry);
          continue;
        }

        const fulfillableQuantity = Math.min(entry.quantity, availableStock);

        if (fulfillableQuantity > 0) {
          try {
            const partialWaitlistEntry = { ...entry, quantity: fulfillableQuantity };
            const userDoc = userDocsMap.get(entry.userId) || null;
            await submitOrderFromWaitlist(transaction, partialWaitlistEntry, product, currentRound, userDoc);
            availableStock -= fulfillableQuantity;
            convertedCount++;
            notificationsToSend.push({ userId: entry.userId, productName: product.groupName, quantity: fulfillableQuantity });
            if (entry.quantity > fulfillableQuantity) {
              remainingWaitlist.push({ ...entry, quantity: entry.quantity - fulfillableQuantity });
            }
          } catch (e) {
              logger.error(`주문 전환 실패 (사용자: ${entry.userId}):`, e);
              failedCount++;
              remainingWaitlist.push(entry);
          }
        } else {
          remainingWaitlist.push(entry);
        }
      }
      
      currentRound.waitlist = remainingWaitlist;
      currentRound.waitlistCount = remainingWaitlist.reduce((sum, entry) => sum + entry.quantity, 0);
      salesHistory[roundIndex] = currentRound;
      
      transaction.update(productRef, { salesHistory });

      // ✅ [수정] isPrioritized 관련 포인트 환불 로직을 모두 제거합니다.
    });

    // --- 3. 트랜잭션 완료 후 알림 전송 ---
    for (const notif of notificationsToSend) {
      await createNotification(notif.userId, `대기하시던 '${notif.productName}' ${notif.quantity}개 상품의 예약이 확정되었습니다!`, { type: 'WAITLIST_CONFIRMED', link: '/mypage/history' });
    }

    return { convertedCount, failedCount };
  } catch(error) {
    if (error instanceof HttpsError) {
        throw error;
    }
    logger.error("Error in addStockAndProcessWaitlist:", error);
    throw new HttpsError("internal", "An unexpected error occurred while processing the waitlist.");
  }
});