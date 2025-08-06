// functions/src/callable/stock.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, FieldValue, Transaction } from "firebase-admin/firestore";
import { createNotification } from "../utils/notificationService.js";
import { submitOrderFromWaitlist } from "../utils/orderService.js";
import type { Product, WaitlistEntry, UserDocument, PointLog } from "../types.js";
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
      // --- 1. 읽기 단계: 필요한 모든 문서를 미리 읽어옵니다. (이전과 동일) ---
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
      
      // ✅ [로직 수정] 새로운 3단계 정렬 규칙을 적용합니다.
      const sortedWaitlist = [...currentRound.waitlist].sort((a, b) => {
        // 1순위: isPrioritized가 true인 항목이 무조건 앞으로 온다.
        if (a.isPrioritized && !b.isPrioritized) return -1;
        if (!a.isPrioritized && b.isPrioritized) return 1;

        // 2순위: isPrioritized가 둘 다 true이면, prioritizedAt이 오래된 순서(선착순)
        if (a.isPrioritized && b.isPrioritized) {
          const timeA = a.prioritizedAt?.toMillis() || 0;
          const timeB = b.prioritizedAt?.toMillis() || 0;
          return timeA - timeB;
        }

        // 3순위: isPrioritized가 둘 다 false이면, 기존처럼 timestamp(대기 시작)가 오래된 순서
        return a.timestamp.toMillis() - b.timestamp.toMillis();
      });
      
      const remainingWaitlist: WaitlistEntry[] = [];
      const usersToRefund = new Set<string>();

      // 부분 전환 로직은 이전 수정과 동일하게 유지됩니다.
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
          if (entry.isPrioritized) {
            usersToRefund.add(entry.userId);
          }
        }
      }
      
      currentRound.waitlist = remainingWaitlist;
      currentRound.waitlistCount = remainingWaitlist.reduce((sum, entry) => sum + entry.quantity, 0);
      salesHistory[roundIndex] = currentRound;
      
      transaction.update(productRef, { salesHistory });

      // 포인트 환불 로직 (이전과 동일)
      for (const userId of usersToRefund) {
          const userData = userDocsMap.get(userId);
          if (userData) {
              const userRef = db.collection("users").doc(userId);
              const refundAmount = 50;
              const newPoints = (userData.points || 0) + refundAmount;
              const pointHistoryEntry: Omit<PointLog, 'id'> = {
                amount: refundAmount, reason: '대기 순번 상승권 환불 (재고 미확보)',
                createdAt: Timestamp.now(), expiresAt: null,
              };
              transaction.update(userRef, {
                points: newPoints,
                pointHistory: FieldValue.arrayUnion(pointHistoryEntry),
              });
          }
      }
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