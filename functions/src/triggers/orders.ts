// functions/src/triggers/orders.ts

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, FirestoreEvent, DocumentSnapshot, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { calculateTier, POINT_POLICIES } from "../utils/helpers.js";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, UserDocument, PointLog, LoyaltyTier } from "../types.js";


// ✅ [핵심 수정] 주문 상태 변경의 '방향'을 명시하기 위한 타입 정의
type OrderUpdateType = "PICKUP_CONFIRMED" | "NO_SHOW_CONFIRMED" | "PICKUP_REVERTED" | "NO_SHOW_REVERTED";

/**
 * @description ✅ [핵심 수정] 주문 상태 변경 유형(확정/취소)에 따라 사용자 정보를 계산하는 헬퍼 함수
 */
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
  const orderIdSuffix = `(...${order.id.slice(-6)})`; // 주문 ID 접미사 한 번만 정의

  switch (updateType) {
    case "PICKUP_CONFIRMED": {
      const purchasePoints = Math.floor(order.totalPrice * 0.005);
      const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
      const totalPoints = purchasePoints + prepaidBonus;
      let reason = `구매 확정 ${orderIdSuffix}`;
      if (prepaidBonus > 0) reason = `선결제 ${reason}`;
      pointPolicy = { points: totalPoints, reason };
      pickupCountIncrement = 1;
      break;
    }
    case "NO_SHOW_CONFIRMED": { // ✅ '노쇼' 시 주문 금액 비례 페널티 적용
      const basePenalty = 50;
      const proportionalPenalty = Math.floor(order.totalPrice * 0.05);
      const totalPenalty = basePenalty + proportionalPenalty;
      pointPolicy = { points: -totalPenalty, reason: `미수령/예약 취소 페널티 ${orderIdSuffix}` };
      noShowCountIncrement = 1;
      break;
    }
    case "PICKUP_REVERTED": {
      const pointsToRevert = Math.floor(order.totalPrice * 0.005) + (order.wasPrepaymentRequired ? 5 : 0);
      pointPolicy = { points: -pointsToRevert, reason: `픽업 처리 취소 ${orderIdSuffix}` };
      pickupCountIncrement = -1;
      break;
    }
    case "NO_SHOW_REVERTED": { // ✅ '노쇼 취소' 시 주문 금액 비례 페널티 복구
      const basePoints = 50;
      const proportionalPoints = Math.floor(order.totalPrice * 0.05);
      const totalPointsToRestore = basePoints + proportionalPoints;
      pointPolicy = { points: totalPointsToRestore, reason: `미수령 처리 취소 ${orderIdSuffix}` };
      noShowCountIncrement = -1;
      break;
    }
  }

  if (!pointPolicy) return null;

  const newPoints = (currentUserData.points || 0) + pointPolicy.points;
  const newPickupCount = Math.max(0, (currentUserData.pickupCount || 0) + pickupCountIncrement);
  const newNoShowCount = Math.max(0, (currentUserData.noShowCount || 0) + noShowCountIncrement);

  const newTier = calculateTier(newPickupCount, newNoShowCount);

  let tierChange: { from: LoyaltyTier, to: LoyaltyTier } | null = null;
  if (oldTier !== newTier) {
      tierChange = { from: oldTier, to: newTier };
  }

  const now = new Date();
  // 포인트가 지급될 때만 만료일을 1년 뒤로 설정, 차감/회수 시에는 null
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
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { orderId: string }>) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.info("주문 생성 이벤트에 데이터가 없어 스킵합니다.");
      return;
    }

    const order = snapshot.data() as Order;
    const orderId = event.params.orderId;

    // ✅ [신규 추가] 스크립트로 생성된 주문은 알림 및 재고 계산 로직을 건너킵니다.
    if (order.splitFrom || order.notes?.startsWith('[분할된 주문]')) {
        logger.info(`Skipping onOrderCreated triggers for split order ${orderId}.`);
        return;
    }

    // --- 1. 재고 수량 업데이트 로직 ---
    if (order.status !== "CANCELED") {
      const changesByProduct = new Map<string, { roundId: string, variantGroupId: string, delta: number }[]>();
      for (const item of order.items) {
          const currentChanges = changesByProduct.get(item.productId) || [];
          currentChanges.push({
              roundId: item.roundId,
              variantGroupId: item.variantGroupId,
              delta: item.quantity,
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

    // --- 2. 알림톡 발송 로직 ---
    logger.info(`신규 주문(${orderId}) 생성. 알림톡 발송 로직을 시작합니다.`);
    try {
        const normalizeToDate = (value: unknown): Date | null => {
            if (!value) return null;
            if ((value as Timestamp).toDate) return (value as Timestamp).toDate();
            if (value instanceof Date) return value;
            return null;
        };

        const pickupStartDate = normalizeToDate(order.pickupDate);
        if (!pickupStartDate) {
            logger.error(`주문(${orderId})의 픽업 시작일이 유효하지 않아 알림톡을 건너뜁니다.`);
            return;
        }

        const now = new Date();
        const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const todayStart = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        const pickupStartDateOnly = new Date(pickupStartDate.getFullYear(), pickupStartDate.getMonth(), pickupStartDate.getDate());
        
        const userDoc = await db.collection("users").doc(order.userId).get();
        if (!userDoc.exists) {
            logger.error(`주문(${orderId})에 대한 사용자(${order.userId})를 찾을 수 없습니다.`);
            return;
        }
        const userData = userDoc.data() as UserDocument;
        if (!userData?.phone || !userData.displayName) {
            logger.warn(`사용자(${order.userId})의 전화번호 또는 이름 정보가 없어 알림을 보내지 못했습니다.`);
            return;
        }

        const productList = order.items
          .map(item => `・${item.productName || '주문 상품'} ${item.quantity}개`)
          .join('\n');
        
        let recipientPhone = (userData.phone || '').replace(/\D/g, '');
        if (pickupStartDateOnly.getTime() === todayStart.getTime()) {
            const templateCode = "ORD_CONFIRM_NOW";
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                상품목록: productList,
            };
            logger.info(`Sending ${templateCode} to ${recipientPhone} for order ${orderId}.`);
            await sendAlimtalk(recipientPhone, templateCode, templateVariables);
            logger.info(`주문(${orderId})에 대한 ${templateCode} 알림톡을 성공적으로 발송했습니다.`);
        } else if (pickupStartDateOnly > todayStart) {
            logger.info(`주문(${orderId})은 미래 픽업 건이므로, 다음 날 오후 1시 스케줄링된 알림으로 처리됩니다.`);
        } else {
            // pickupStartDateOnly < todayStart (과거 픽업일)
            logger.info(`주문(${orderId})은 과거 픽업 건이므로, 생성 시점 알림을 건너킵니다.`);
        }

    } catch (alimtalkError) {
        logger.error(`Failed to process Alimtalk for order ${orderId}:`, alimtalkError);
    }
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
        currentChanges.push({
            roundId: item.roundId,
            variantGroupId: item.variantGroupId,
            delta: -item.quantity,
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

    const beforeItemsMap = new Map<string, number>();
    if (before.status !== 'CANCELED') {
        (before.items || []).forEach(item => {
            const key = `${item.productId}:${item.roundId}:${item.variantGroupId}`;
            beforeItemsMap.set(key, item.quantity);
        });
    }

    const afterItemsMap = new Map<string, number>();
    if (after.status !== 'CANCELED') {
        (after.items || []).forEach(item => {
            const key = `${item.productId}:${item.roundId}:${item.variantGroupId}`;
            afterItemsMap.set(key, item.quantity);
        });
    }

    const allKeys = new Set([...beforeItemsMap.keys(), ...afterItemsMap.keys()]);

    for (const key of allKeys) {
        const [productId, roundId, variantGroupId] = key.split(':');
        const beforeQty = beforeItemsMap.get(key) || 0;
        const afterQty = afterItemsMap.get(key) || 0;
        const delta = afterQty - beforeQty;

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


// functions/src/triggers/orders.ts

// ✅ [핵심 개선] updateUserStatsOnOrderStatusChange 함수
export const updateUserStatsOnOrderStatusChange = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { orderId: string }>) => {
    if (!event.data) return;

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    // ✅ [신규 추가] 스크립트에 의한 변경(분할된 주문, 원본 주문 보관 처리)은 포인트/등급 변경을 건너킵니다.
    if (after.splitFrom || after.notes?.includes('[주문 분할 완료]')) {
        logger.info(`Skipping stats update for migrated/split order ${event.params.orderId}.`);
        return;
    }

    let updateType: OrderUpdateType | null = null;
    const now = new Date();

    // 상태 변경 유형을 명확하게 감지
    if (before.status !== "PICKED_UP" && after.status === "PICKED_UP") {
      updateType = "PICKUP_CONFIRMED";
    } else if (before.status !== "NO_SHOW" && after.status === "NO_SHOW") {
      updateType = "NO_SHOW_CONFIRMED";
    } else if (before.status === "PICKED_UP" && after.status !== "PICKED_UP") {
      updateType = "PICKUP_REVERTED";
    } else if (before.status === "NO_SHOW" && after.status !== "NO_SHOW") {
      updateType = "NO_SHOW_REVERTED";
    }
    // ✅ [비즈니스 로직 추가] CANCELED 상태 변경 감지
    else if (before.status !== "CANCELED" && after.status === "CANCELED") {
      const pickupDeadline = (after.pickupDeadlineDate as Timestamp)?.toDate() || (after.pickupDate as Timestamp)?.toDate();
      // 마감일이 지났다면 '노쇼'와 동일하게 처리
      if (pickupDeadline && now > pickupDeadline) {
        logger.info(`Order ${event.params.orderId} canceled after deadline. Processing as NO_SHOW.`);
        updateType = "NO_SHOW_CONFIRMED";
      }

    }

    if (!updateType) {
      // 우리가 관심 있는 상태 변경이 아니면 함수 종료
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
        const updateResult = calculateUserUpdateFromOrder(userData, orderWithId, updateType);

        if (updateResult) {
            transaction.update(userRef, updateResult.updateData);

            if (updateResult.tierChange) {
                const { from, to } = updateResult.tierChange;
                const tierOrder = ['참여 제한', '주의 요망', '공구새싹', '공구요정', '공구왕', '공구의 신'];
                const isPromotion = tierOrder.indexOf(from) < tierOrder.indexOf(to);

                const message = isPromotion
                    ? `🎉 축하합니다! 회원님의 등급이 [${from}]에서 [${to}](으)로 상승했습니다!`
                    : `회원님의 등급이 [${from}]에서 [${to}](으)로 변경되었습니다.`;

                const newNotification = {
                    message,
                    type: isPromotion ? "TIER_UP" : "TIER_DOWN",
                    read: false,
                    timestamp: FieldValue.serverTimestamp(),
                    link: "/mypage",
                };

                const notificationRef = userRef.collection("notifications").doc();
                transaction.set(notificationRef, newNotification);
            }
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

    // ✅ [수정] 이 로직은 오직 '첫 픽업' 시에만 동작해야 하므로, 상태가 'PICKED_UP'으로 '변경'되는 시점만 감지
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
        await db.runTransaction(async (transaction: Transaction) => { // 트랜잭션으로 감싸기
            const userDocSnap = await transaction.get(userRef); // 트랜잭션 내에서 문서 읽기
            if (!userDocSnap.exists) {
                logger.warn(`User document for orderer (ID: ${userId}) not found.`);
                return; // 함수 종료 대신 트랜잭션 중단
            }
            const userDoc = userDocSnap.data() as UserDocument;

            // pickupCount는 updateUserStatsOnOrderStatusChange에서 이미 업데이트된 최신 값이어야 함
            const isFirstPickup = userDoc.pickupCount === 1;
            const wasReferred = userDoc.referredBy && userDoc.referredBy !== "__SKIPPED__";

            if (isFirstPickup && wasReferred) {
                logger.info(`First pickup user (ID: ${userId}) confirmed. Starting referrer reward process.`);

                const referrerQuery = db.collection("users")
                    .where("referralCode", "==", userDoc.referredBy)
                    .limit(1);

                const referrerSnapshot = await transaction.get(referrerQuery); // 트랜잭션 내에서 쿼리 실행
                if (referrerSnapshot.empty) {
                    logger.warn(`User with referral code (${userDoc.referredBy}) not found.`);
                    return; // 함수 종료 대신 트랜잭션 중단
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
        }); // 트랜잭션 닫기
    } catch (error) {
      logger.error("An error occurred while processing the referrer reward:", error);
    }
  }
);