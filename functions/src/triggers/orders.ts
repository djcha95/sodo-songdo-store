// functions/src/triggers/orders.ts

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, FirestoreEvent, DocumentSnapshot, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import type { Order, UserDocument, PointLog, LoyaltyTier } from "../types.js";

const POINT_POLICIES = {
  FRIEND_INVITED: { points: 100, reason: '친구 초대 성공' },
};

/**
 * @description ✅ [사용자 요청 반영] 등급 산정 기준을 '노쇼 횟수'에서 '픽업률' 중심으로 변경합니다.
 * - '참여 제한': 총 거래 5회 이상이면서 픽업률 50% 미만
 * - '주의 요망': 총 거래 5회 이상이면서 픽업률 70% 미만
 * - 등급 상승 조건은 '픽업 횟수 + 픽업률' 기준을 사용합니다.
 * - 이 로직은 `helpers.ts`의 `calculateTier`와 완전히 동일해야 합니다.
 * @param pickupCount 총 픽업 완료 건수
 * @param noShowCount 총 노쇼(미픽업) 건수
 * @returns 계산된 LoyaltyTier 등급명
 */
const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  const totalTransactions = pickupCount + noShowCount;

  // 1. 거래 내역이 없는 초기 사용자는 '공구새싹'
  if (totalTransactions === 0) {
    return "공구새싹";
  }

  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 2. 픽업률 기반 페널티 (총 거래 5회 이상부터 적용)
  if (totalTransactions >= 5) {
    if (pickupRate < 50) {
      return "참여 제한";
    }
    if (pickupRate < 70) {
      return "주의 요망";
    }
  }

  // 3. 픽업률과 누적 픽업 건수를 조합한 등급 상승
  //   - 클라이언트 `helpers.ts`와 기준을 일치시키기 위해 기존 `orders.ts`의 단순 픽업 횟수 기준을 수정합니다.
  //   - 상향된 등급 기준(250/100/30회)을 적용합니다.
  if (pickupRate >= 98 && pickupCount >= 250) {
    return "공구의 신";
  }
  if (pickupRate >= 95 && pickupCount >= 100) {
    return "공구왕";
  }
  if (pickupRate >= 90 && pickupCount >= 30) {
    return "공구요정";
  }

  // 4. 위 조건에 모두 해당하지 않는 경우 '공구새싹'
  return "공구새싹";
};

type OrderUpdateType = "PICKUP_CONFIRMED" | "NO_SHOW_CONFIRMED" | "PICKUP_REVERTED" | "NO_SHOW_REVERTED" | "LATE_PICKUP_CONFIRMED";

function calculateUserUpdateFromOrder(
  currentUserData: UserDocument,
  order: Order,
  updateType: OrderUpdateType
): {
    updateData: any;
    tierChange: { from: LoyaltyTier; to: LoyaltyTier } | null;
} | null {
  let pointPolicy: { points: number; reason: string } | null = null;
  let pickupCountIncrement = 0;
  let noShowCountIncrement = 0;

  const oldTier = currentUserData.loyaltyTier || '공구새싹';
  const orderIdSuffix = `(...${order.id.slice(-6)})`;

  switch (updateType) {
    case "PICKUP_CONFIRMED": {
      const purchasePoints = Math.floor((order.totalPrice || 0) * 0.005);
      const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
      const totalPoints = purchasePoints + prepaidBonus;
      let reason = `구매 확정 ${orderIdSuffix}`;
      if (prepaidBonus > 0) reason = `[선결제] ${reason}`;
      pointPolicy = { points: totalPoints, reason };
      pickupCountIncrement = 1;
      break;
    }
    /**
     * ✅ [신규] 지연 픽업 로직
     * - 기존 노쇼를 만회했으므로 noShowCount를 1 감소시킴
     * - 정상 픽업이 아니므로 pickupCount는 0.5만 증가시킴
     */
    case "LATE_PICKUP_CONFIRMED": {
        const purchasePoints = Math.floor((order.totalPrice || 0) * 0.005);
        const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
        const totalPoints = purchasePoints + prepaidBonus;
        let reason = `[지연] 구매 확정 ${orderIdSuffix}`;
        if (prepaidBonus > 0) reason = `[선결제] ${reason}`;
        pointPolicy = { points: totalPoints, reason };
        pickupCountIncrement = 0.5; // 지연 픽업은 0.5회로 기록
        noShowCountIncrement = -1;  // 기존 노쇼 기록 1회 차감
        break;
    }
    case "NO_SHOW_CONFIRMED": {
      pointPolicy = { points: -100, reason: `미수령 페널티 ${orderIdSuffix}` };
      noShowCountIncrement = 1;
      break;
    }
    case "PICKUP_REVERTED": {
      const pointsToRevert = Math.floor((order.totalPrice || 0) * 0.005) + (order.wasPrepaymentRequired ? 5 : 0);
      pointPolicy = { points: -pointsToRevert, reason: `픽업 처리 취소 ${orderIdSuffix}` };
      pickupCountIncrement = -1;
      break;
    }
    case "NO_SHOW_REVERTED": {
      pointPolicy = { points: 100, reason: `미수령 처리 취소 ${orderIdSuffix}` };
      noShowCountIncrement = -1;
      break;
    }
  }

  if (!pointPolicy) return null;

  const currentPickupCount = currentUserData.pickupCount || 0;
  const currentNoShowCount = currentUserData.noShowCount || 0;

  // pickupCount가 정수가 아닐 수 있으므로 Math.round 등을 사용하지 않고 그대로 계산
  const newPickupCount = Math.max(0, currentPickupCount + pickupCountIncrement);
  const newNoShowCount = Math.max(0, currentNoShowCount + noShowCountIncrement);
  const newPoints = (currentUserData.points || 0) + pointPolicy.points;

  const newTier = calculateTier(newPickupCount, newNoShowCount);

  let tierChange: { from: LoyaltyTier, to: LoyaltyTier } | null = null;
  if (oldTier !== newTier) {
      tierChange = { from: oldTier, to: newTier };
  }

  const now = new Date();
  const expirationDate = pointPolicy.points > 0 ? new Date(now.setFullYear(now.getFullYear() + 1)) : null;

  const newPointLog: Omit<PointLog, 'id'> = {
    amount: pointPolicy.points,
    reason: pointPolicy.reason,
    createdAt: Timestamp.now(),
    orderId: order.id,
    expiresAt: expirationDate ? Timestamp.fromDate(expirationDate) : null,
  };

  const updateData = {
    points: newPoints,
    loyaltyTier: newTier,
    pickupCount: newPickupCount,
    noShowCount: newNoShowCount,
    pointHistory: FieldValue.arrayUnion(newPointLog),
  };

  return { updateData, tierChange };
}

interface ProductWithHistory {
  salesHistory: {
    roundId: string;
    variantGroups: {
      id: string;
      reservedCount?: number;
    }[];
  }[];
}

export const onOrderCreated = onDocumentCreated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
    // ✅ [수정] 알림톡을 보내지 않으므로 secrets가 더 이상 필요 없습니다.
    // secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { orderId: string }>) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.info("주문 생성 이벤트에 데이터가 없어 스킵합니다.");
      return;
    }

    const order = snapshot.data() as Order;
    const orderId = event.params.orderId;

    if (order.splitFrom || order.notes?.startsWith('[분할된 주문]')) {
        logger.info(`Skipping onOrderCreated triggers for split order ${orderId}.`);
        return;
    }

    // --- 1. 재고 수량 업데이트 로직 ---
    if (order.status !== "CANCELED") {
      const changesByProduct = new Map<string, { roundId: string, variantGroupId: string, delta: number }[]>();
      for (const item of order.items) {
          const currentChanges = changesByProduct.get(item.productId) || [];
          // ✅ [수정] item.quantity에 stockDeductionAmount를 곱하여 실제 재고 차감량을 계산합니다.
          const actualDeduction = item.quantity * (item.stockDeductionAmount || 1);
          currentChanges.push({
              roundId: item.roundId,
              variantGroupId: item.variantGroupId,
              delta: actualDeduction,
          });
          changesByProduct.set(item.productId, currentChanges);
      }

      try {
          await db.runTransaction(async (transaction: Transaction) => {
              for (const [productId, changes] of changesByProduct.entries()) {
                  const productRef = db.collection("products").doc(productId);
                  const productDoc = await transaction.get(productRef);
                  if (!productDoc.exists) {
                      logger.error(`Product ${productId} not found during order creation.`);
                      continue;
                  }
                  const productData = productDoc.data() as any;
                  const newSalesHistory = productData?.salesHistory?.map((round: any) => {
                      const relevantChanges = changes.filter(c => c.roundId === round.roundId);
                      if (relevantChanges.length > 0) {
                          const newVariantGroups = round.variantGroups.map((vg: any) => {
                              const change = relevantChanges.find(c => c.variantGroupId === vg.id);
                              if (change) {
                                  const currentReserved = vg.reservedCount || 0;
                                  vg.reservedCount = currentReserved + change.delta;
                              }
                              return vg;
                          });
                          return { ...round, variantGroups: newVariantGroups };
                      }
                      return round;
                  }) || [];
                  transaction.update(productRef, { salesHistory: newSalesHistory });
              }
          });
          logger.info(`Successfully updated reservedCount for order ${orderId}`);
      } catch (error) {
          logger.error(`Transaction failed for order ${orderId} creation:`, error);
      }
    }

    // --- 2. 알림톡 발송 로직 (제거) ---
    // ✅ [핵심 수정]
    // 잘못된 시간에 알림이 가는 문제를 해결하기 위해 주문 생성 시점의 알림 로직을 제거합니다.
    // 모든 픽업 안내 알림은 `functions/src/scheduled/notifications.ts`의 
    // `sendPickupReminders` 스케줄러가 매일 아침 9시에 정확한 대상에게 발송하도록 일원화합니다.
    logger.info(`신규 주문(${orderId}) 생성. 재고 업데이트 완료. 주문 생성 시점의 알림톡 발송은 정책상 제거되었습니다.`);
  }
);


export const onOrderDeleted = onDocumentDeleted(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { orderId: string }>) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const order = snapshot.data() as Order;
    if (order.status === "CANCELED") return;

    const changesByProduct = new Map<string, { roundId: string, variantGroupId: string, delta: number }[]>();
    for (const item of order.items) {
        const currentChanges = changesByProduct.get(item.productId) || [];
        // ✅ [수정] 복원되는 재고량도 stockDeductionAmount를 곱하여 정확하게 계산합니다.
        const actualDeduction = item.quantity * (item.stockDeductionAmount || 1);
        currentChanges.push({
            roundId: item.roundId,
            variantGroupId: item.variantGroupId,
            delta: -actualDeduction,
        });
        changesByProduct.set(item.productId, currentChanges);
    }

    try {
        await db.runTransaction(async (transaction: Transaction) => {
            for (const [productId, changes] of changesByProduct.entries()) {
                const productRef = db.collection("products").doc(productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists) {
                    logger.error(`Product ${productId} not found during order deletion.`);
                    continue;
                }

                const productData = productDoc.data() as ProductWithHistory;
                const newSalesHistory = productData?.salesHistory?.map((round: any) => {
                    const relevantChanges = changes.filter(c => c.roundId === round.roundId);
                    if (relevantChanges.length > 0) {
                        const newVariantGroups = round.variantGroups.map((vg: any) => {
                            const change = relevantChanges.find(c => c.variantGroupId === vg.id);
                            if (change) {
                                const currentReserved = vg.reservedCount || 0;
                                vg.reservedCount = Math.max(0, currentReserved + change.delta);
                            }
                            return vg;
                        });
                        return { ...round, variantGroups: newVariantGroups };
                    }
                    return round;
                }) || [];

                transaction.update(productRef, { salesHistory: newSalesHistory });
            }
        });
        logger.info(`Successfully updated reservedCount for deleted order ${event.params.orderId}`);
    } catch (error) {
        logger.error(`Transaction failed for order ${event.params.orderId} deletion:`, error);
    }
  }
);

export const onOrderUpdatedForStock = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { orderId: string }>) => {
    if (!event.data) return;

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;
    const changesByProduct = new Map<string, { roundId: string, variantGroupId: string, delta: number }[]>();

    // ✅ [수정] 주문 수량(quantity) 대신 실제 재고 차감량(totalDeduction)을 Map에 저장합니다.
    const beforeItemsMap = new Map<string, number>();
    if (before.status !== 'CANCELED') {
        (before.items || []).forEach(item => {
            const key = `${item.productId}:${item.roundId}:${item.variantGroupId}`;
            const totalDeduction = item.quantity * (item.stockDeductionAmount || 1);
            beforeItemsMap.set(key, totalDeduction);
        });
    }

    const afterItemsMap = new Map<string, number>();
    if (after.status !== 'CANCELED') {
        (after.items || []).forEach(item => {
            const key = `${item.productId}:${item.roundId}:${item.variantGroupId}`;
            const totalDeduction = item.quantity * (item.stockDeductionAmount || 1);
            afterItemsMap.set(key, totalDeduction);
        });
    }

    const allKeys = new Set([...beforeItemsMap.keys(), ...afterItemsMap.keys()]);

    for (const key of allKeys) {
        const [productId, roundId, variantGroupId] = key.split(':');
        const beforeStock = beforeItemsMap.get(key) || 0;
        const afterStock = afterItemsMap.get(key) || 0;
        const delta = afterStock - beforeStock; // 이제 delta는 실제 재고량의 변화를 의미합니다.

        if (delta !== 0) {
            const currentChanges = changesByProduct.get(productId) || [];
            currentChanges.push({ roundId, variantGroupId, delta });
            changesByProduct.set(productId, currentChanges);
        }
    }

    if (changesByProduct.size === 0) {
        return;
    }

    try {
        await db.runTransaction(async (transaction: Transaction) => {
            for (const [productId, changes] of changesByProduct.entries()) {
                const productRef = db.collection("products").doc(productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists) {
                    logger.error(`Product ${productId} not found during order update.`);
                    continue;
                }

                const productData = productDoc.data() as ProductWithHistory;
                const newSalesHistory = productData?.salesHistory?.map((round: any) => {
                    const relevantChanges = changes.filter(c => c.roundId === round.roundId);
                    if (relevantChanges.length > 0) {
                        const newVariantGroups = round.variantGroups.map((vg: any) => {
                            const change = relevantChanges.find(c => c.variantGroupId === vg.id);
                            if (change) {
                                const currentReserved = vg.reservedCount || 0;
                                vg.reservedCount = Math.max(0, currentReserved + change.delta);
                            }
                            return vg;
                        });
                        return { ...round, variantGroups: newVariantGroups };
                    }
                    return round;
                }) || [];
                transaction.update(productRef, { salesHistory: newSalesHistory });
            }
        });
        logger.info(`Successfully updated reservedCount for updated order ${event.params.orderId}`);
    } catch (error) {
        logger.error(`Transaction failed for order ${event.params.orderId} update:`, error);
    }
  }
);


// updateUserStatsOnOrderStatusChange, rewardReferrerOnFirstPickup 등
// 사용자 포인트 및 등급 관련 로직은 변경 사항이 없으므로 생략합니다.
// ... (기존 코드와 동일) ...
export const updateUserStatsOnOrderStatusChange = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { orderId: string }>) => {
    if (!event.data) return;

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    if (after.splitFrom || after.notes?.includes('[주문 분할 완료]')) {
        logger.info(`Skipping stats update for migrated/split order ${event.params.orderId}.`);
        return;
    }

    let updateType: OrderUpdateType | null = null;

    // ✅ [수정] '지연 픽업' 상태 감지 로직 추가
    if (before.status !== "PICKED_UP" && after.status === "PICKED_UP") {
      if (before.status === "NO_SHOW") {
        updateType = "LATE_PICKUP_CONFIRMED";
      } else {
        updateType = "PICKUP_CONFIRMED";
      }
    } else if (before.status !== "NO_SHOW" && after.status === "NO_SHOW") {
      updateType = "NO_SHOW_CONFIRMED";
    } else if (before.status === "PICKED_UP" && after.status !== "PICKED_UP") {
      updateType = "PICKUP_REVERTED";
    } else if (before.status === "NO_SHOW" && after.status !== "NO_SHOW") {
      // '지연 픽업'이 아닌 다른 상태로 변경될 경우(예: 관리자가 강제 취소)
      // 기존 노쇼를 되돌리는 로직
      updateType = "NO_SHOW_REVERTED";
    }
    
    if (!updateType) {
      logger.info(`No relevant status change for order ${event.params.orderId} from ${before.status} to ${after.status}. Skipping.`);
      return;
    }

    const userRef = db.collection("users").doc(after.userId);

    try {
      await db.runTransaction(async (transaction: Transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          logger.error(`User ${after.userId} not found for order status update.`);
          return;
        }

        const userData = userDoc.data() as UserDocument;
        const orderWithId = { ...after, id: event.params.orderId };
        
        logger.info(`Calculating user update for user [${after.userId}] due to order [${orderWithId.id}] change: ${updateType}`);
        const updateResult = calculateUserUpdateFromOrder(userData, orderWithId, updateType);

        if (updateResult) {
            logger.info(`Applying update to user [${after.userId}]:`, updateResult.updateData);
            transaction.update(userRef, updateResult.updateData);

            if (updateResult.tierChange) {
                const { from, to } = updateResult.tierChange;
                const tierOrder = ['참여 제한', '주의 요망', '공구새싹', '공구요정', '공구왕', '공구의 신'];
                const isPromotion = tierOrder.indexOf(from) < tierOrder.indexOf(to);

                const message = isPromotion
                    ? `🎉 축하합니다! 회원님의 등급이 [${from}]에서 [${to}](으)로 상승했습니다!`
                    : `회원님의 등급이 [${from}]에서 [${to}](으)로 변경되었습니다.`;

                const newNotification = {
                    message, type: isPromotion ? "TIER_UP" : "TIER_DOWN", read: false,
                    timestamp: FieldValue.serverTimestamp(), link: "/mypage",
                };

                const notificationRef = userRef.collection("notifications").doc();
                transaction.set(notificationRef, newNotification);
                logger.info(`Tier change notification sent to user [${after.userId}]. ${from} -> ${to}`);
            }
        } else {
           logger.warn(`Calculation for user update returned null for order [${orderWithId.id}]. No update applied.`);
        }
      });
      logger.info(`Successfully updated user stats for order ${event.params.orderId} to status ${updateType}`);
    } catch (error) {
       logger.error(`Transaction failed for user stats update on order ${event.params.orderId}:`, error);
    }
  }
);

export const rewardReferrerOnFirstPickup = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event) => {
    if (!event.data) {
      logger.error("No event data.");
      return;
    }

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    if (before.status === "PICKED_UP" || after.status !== "PICKED_UP") {
      return;
    }

    const userId = after.userId;
    if (!userId) {
      logger.warn("No userId in order data.");
      return;
    }
    const userRef = db.collection("users").doc(userId);

    try {
        await db.runTransaction(async (transaction: Transaction) => {
            const userDocSnap = await transaction.get(userRef);
            if (!userDocSnap.exists) {
                logger.warn(`User document for orderer (ID: ${userId}) not found.`);
                return;
            }
            const userDoc = userDocSnap.data() as UserDocument;

            const isFirstPickup = userDoc.pickupCount === 1;
            const wasReferred = userDoc.referredBy && userDoc.referredBy !== "__SKIPPED__";

            if (isFirstPickup && wasReferred) {
                logger.info(`First pickup user (ID: ${userId}) confirmed. Starting referrer reward process.`);

                const referrerQuery = db.collection("users")
                    .where("referralCode", "==", userDoc.referredBy)
                    .limit(1);

                const referrerSnapshot = await transaction.get(referrerQuery);
                if (referrerSnapshot.empty) {
                    logger.warn(`User with referral code (${userDoc.referredBy}) not found.`);
                    return;
                }

                const referrerDoc = referrerSnapshot.docs[0];
                const referrerRef = referrerDoc.ref;

                const referrerData = referrerDoc.data() as UserDocument;
                const currentPoints = referrerData.points || 0;
                const rewardPoints = POINT_POLICIES.FRIEND_INVITED.points;
                const newPoints = currentPoints + rewardPoints;

                const now = new Date();
                const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

                const pointLog: Omit<PointLog, "id"> = {
                    amount: rewardPoints,
                    reason: `${POINT_POLICIES.FRIEND_INVITED.reason} (${userDoc.displayName || "신규 회원"}님)`,
                    createdAt: Timestamp.now(),
                    expiresAt: Timestamp.fromDate(expirationDate),
                };

                transaction.update(referrerRef, {
                    points: newPoints,
                    pointHistory: FieldValue.arrayUnion(pointLog),
                });
                logger.info(`Successfully awarded ${rewardPoints}P to referrer (ID: ${referrerRef.id}).`);
            }
        });
    } catch (error) {
      logger.error("An error occurred while processing the referrer reward:", error);
    }
  }
);