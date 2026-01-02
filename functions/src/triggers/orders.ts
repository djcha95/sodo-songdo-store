// functions/src/triggers/orders.ts

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, FirestoreEvent, DocumentSnapshot, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import type { Order, UserDocument, PointLog, LoyaltyTier } from "@/shared/types";
import { applyClaimedDelta, applyPickedUpDelta } from "../utils/stockStats.js";

const POINT_POLICIES = {
  FRIEND_INVITED: { points: 100, reason: '친구 초대 성공' },
};

/**
 * ✅ [수정] 등급 산정 기준 완화
 * - 노쇼 5회 이상: '참여 제한'
 * - 노쇼 3회 이상: '주의 요망'
 * - 픽업률 기반 강등 조건은 삭제하여 노쇼 횟수에 집중
 */
const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  // 1. 픽업/노쇼 0회 -> 공구초보
  if (pickupCount === 0 && noShowCount === 0) {
    return '공구초보';
  }

  const totalTransactions = pickupCount + noShowCount;
  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 2. 긍정적 등급 (상향된 기준 적용: 250/100/30)
  if (pickupRate >= 98 && pickupCount >= 250) {
    return '공구의 신';
  }
  if (pickupRate >= 95 && pickupCount >= 100) {
    return '공구왕';
  }
  if (pickupRate >= 90 && pickupCount >= 30) {
    return '공구요정';
  }

  // 3. 픽업 1회 이상, '요정' 미만 -> 공구새싹
  if (pickupCount > 0) {
    return '공구새싹';
  }

  // 4. 그 외 (예: 픽업 0, 노쇼 1회) -> 공구초보
  return '공구초보';
};

// TODO: [비활성화] 포인트 관련 기능 비활성화 - calculateUserUpdateFromOrder 함수 비활성화
// 이 함수는 포인트 계산 로직을 포함하고 있지만, 호출하는 트리거가 비활성화되어 있어 실행되지 않습니다.
type OrderUpdateType = "PICKUP_CONFIRMED" | "NO_SHOW_CONFIRMED" | "PICKUP_REVERTED" | "NO_SHOW_REVERTED" | "LATE_PICKUP_CONFIRMED";

/* 비활성화된 함수 시작
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
    // ✅ [신규] 지연 픽업 로직
    // - 기존 노쇼를 만회했으므로 noShowCount를 1 감소시킴
    // - 정상 픽업이 아니므로 pickupCount는 0.5만 증가시킴
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
/* 비활성화된 함수 끝 */

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

    // ✅ Callable이 stockStats_v1을 직접 관리하는 주문이면 트리거는 스킵 (중복 반영 방지)
    if ((order as any).stockStatsV1Managed) {
      logger.info(`Skipping onOrderCreated trigger for stockStats-managed order ${orderId}.`);
      return;
    }

    // --- 1. ✅ [수정] stockStats_v1 컬렉션 업데이트 로직 (기존 products 컬렉션 직접 업데이트 제거) ---
    if (order.status !== "CANCELED") {
      try {
          await db.runTransaction(async (transaction: Transaction) => {
              for (const item of order.items) {
                  // ✅ [수정] item.quantity에 stockDeductionAmount를 곱하여 실제 재고 차감량을 계산합니다.
                  const actualDeduction = item.quantity * (item.stockDeductionAmount || 1);
                  const vgId = item.variantGroupId || "default";
                  
                  // ✅ stockStats_v1 컬렉션 업데이트
                  applyClaimedDelta(transaction, item.productId, item.roundId, vgId, actualDeduction);
              }
          });
          logger.info(`Successfully updated stockStats_v1 for order ${orderId}`);
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

    // ✅ Callable이 stockStats_v1을 직접 관리하는 주문이면 트리거는 스킵 (중복 반영 방지)
    if ((order as any).stockStatsV1Managed) return;

    // ✅ [수정] stockStats_v1 컬렉션 업데이트 (기존 products 컬렉션 직접 업데이트 제거)
    try {
        await db.runTransaction(async (transaction: Transaction) => {
            for (const item of order.items) {
                // ✅ [수정] 복원되는 재고량도 stockDeductionAmount를 곱하여 정확하게 계산합니다.
                const actualDeduction = item.quantity * (item.stockDeductionAmount || 1);
                const vgId = item.variantGroupId || "default";
                
                // ✅ stockStats_v1 컬렉션에서 claimed 차감 (재고 복원)
                applyClaimedDelta(transaction, item.productId, item.roundId, vgId, -actualDeduction);
            }
        });
        logger.info(`Successfully updated stockStats_v1 for deleted order ${event.params.orderId}`);
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

    // ✅ Callable이 stockStats_v1을 직접 관리하는 주문이면 트리거는 스킵 (중복 반영 방지)
    if ((before as any).stockStatsV1Managed || (after as any).stockStatsV1Managed) return;
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

    // ✅ [수정] stockStats_v1 컬렉션 업데이트 (기존 products 컬렉션 직접 업데이트 제거)
    try {
        await db.runTransaction(async (transaction: Transaction) => {
            for (const [productId, changes] of changesByProduct.entries()) {
                for (const change of changes) {
                    const vgId = change.variantGroupId || "default";
                    
                    // ✅ stockStats_v1 컬렉션 업데이트
                    applyClaimedDelta(transaction, productId, change.roundId, vgId, change.delta);
                }
            }
        });
        logger.info(`Successfully updated stockStats_v1 for updated order ${event.params.orderId}`);
    } catch (error) {
        logger.error(`Transaction failed for order ${event.params.orderId} update:`, error);
    }
  }
);


// updateUserStatsOnOrderStatusChange, rewardReferrerOnFirstPickup 등
// 사용자 포인트 및 등급 관련 로직은 변경 사항이 없으므로 생략합니다.
// ... (기존 코드와 동일) ...
// TODO: [비활성화] 포인트 관련 기능 비활성화 - 주문 상태 변경 시 사용자 포인트/등급 업데이트 트리거 비활성화
export const updateUserStatsOnOrderStatusChange = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { orderId: string }>) => {
    // TODO: [비활성화] 포인트 관련 기능이 비활성화되어 이 트리거는 더 이상 실행되지 않습니다.
    logger.warn(`[비활성화] updateUserStatsOnOrderStatusChange 트리거가 호출되었지만 포인트 기능이 비활성화되어 스킵합니다. Order ID: ${event.params.orderId}`);
    return;
    
    /* 비활성화된 코드 시작
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
            // ✅ [수정] 새로운 등급 순서로 변경
            const tierOrder = ['공구제한', '공구초보', '공구새싹', '공구요정', '공구왕', '공구의 신'];
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
    비활성화된 코드 끝 */
  }
);

// TODO: [비활성화] 포인트 관련 기능 비활성화 - 친구 초대 보상 트리거 비활성화
export const rewardReferrerOnFirstPickup = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event) => {
    // TODO: [비활성화] 포인트 관련 기능이 비활성화되어 이 트리거는 더 이상 실행되지 않습니다.
    logger.warn(`[비활성화] rewardReferrerOnFirstPickup 트리거가 호출되었지만 포인트 기능이 비활성화되어 스킵합니다. Order ID: ${event.params.orderId}`);
    return;
    
    /* 비활성화된 코드 시작
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
    비활성화된 코드 끝 */
  }
);