// functions/src/triggers/orders.ts
// ✅ [기능 추가] 주문 상태 변경(픽업/노쇼) 시 사용자 등급 및 포인트, 알림을 처리하는 트리거 추가

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, FirestoreEvent, DocumentSnapshot, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/config.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { calculateTier, POINT_POLICIES } from "../utils/helpers.js";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, UserDocument, PointLog, LoyaltyTier } from "../types.js";


// =================================================================
// ✅ [신규] 주문 상태 변경에 따른 사용자 데이터 업데이트 헬퍼 함수
// =================================================================
/**
 * @description 주문 상태 변경에 따라 변경될 사용자 데이터를 계산합니다. (서버 버전)
 * @param currentUserData 현재 사용자 데이터
 * @param order 변경이 발생한 주문 데이터
 * @param newStatus 새로운 주문 상태 ('PICKED_UP' 또는 'NO_SHOW')
 * @returns { updateData, tierChange } 업데이트할 데이터와 등급 변경 정보
 */
function calculateUserUpdateFromOrder(
  currentUserData: UserDocument,
  order: Order,
  newStatus: "PICKED_UP" | "NO_SHOW"
): { 
    updateData: any;
    tierChange: { from: LoyaltyTier; to: LoyaltyTier } | null;
} | null {
  let pointPolicy: { points: number; reason: string } | null = null;
  let pickupCountIncrement = 0;
  let noShowCountIncrement = 0;

  const oldTier = currentUserData.loyaltyTier || '공구새싹';

  if (newStatus === "PICKED_UP") {
    // 클라이언트 로직과 동일하게 포인트 계산
    const purchasePoints = Math.floor(order.totalPrice * 0.005);
    const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
    const totalPoints = purchasePoints + prepaidBonus;
    
    let reason = `구매 확정 (결제액: ₩${order.totalPrice.toLocaleString()})`;
    if (prepaidBonus > 0) {
      reason = `선결제 ${reason}`;
    }
    pointPolicy = { points: totalPoints, reason };
    pickupCountIncrement = 1;

  } else if (newStatus === "NO_SHOW") {
    pointPolicy = POINT_POLICIES.NO_SHOW;
    noShowCountIncrement = 1;
  }

  if (!pointPolicy) return null;

  const newPoints = (currentUserData.points || 0) + pointPolicy.points;
  const newPickupCount = (currentUserData.pickupCount || 0) + pickupCountIncrement;
  const newNoShowCount = (currentUserData.noShowCount || 0) + noShowCountIncrement;
  
  // helpers.js에 있는 상향된 기준의 calculateTier 함수 사용
  const newTier = calculateTier(newPickupCount, newNoShowCount);

  let tierChange: { from: LoyaltyTier, to: LoyaltyTier } | null = null;
  if (oldTier !== newTier) {
      tierChange = { from: oldTier, to: newTier };
  }

  const now = new Date();
  const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

  const newPointLog: Omit<PointLog, 'id'> = {
    amount: pointPolicy.points,
    reason: pointPolicy.reason,
    createdAt: Timestamp.now(),
    orderId: order.id, // 주문 ID를 pointLog에 기록
    expiresAt: pointPolicy.points > 0 ? Timestamp.fromDate(expirationDate) : null,
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
            delta: item.quantity,
        });
        changesByProduct.set(item.productId, currentChanges);
    }

    try {
        await db.runTransaction(async (transaction) => {
            for (const [productId, changes] of changesByProduct.entries()) {
                const productRef = db.collection("products").doc(productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists) {
                    logger.error(`Product ${productId} not found during order creation.`);
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
        logger.info(`Successfully updated reservedCount for order ${event.params.orderId}`);

        try {
            const userDoc = await db.collection("users").doc(order.userId).get();
            if (!userDoc.exists) return;
            const userData = userDoc.data() as UserDocument;
            if (!userData?.phone || !userData.displayName) return;

            const orderPickupDate = (order.pickupDate as Timestamp).toDate();
            
            const now = new Date();
            const kstDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const todayStartKST = new Date(`${kstDateString}T00:00:00.000+09:00`);

            let templateCode = "";
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                대표상품명: order.items[0]?.productName || '주문하신 상품',
            };

            if (orderPickupDate <= todayStartKST || orderPickupDate.toDateString() === new Date().toDateString()) {
                templateCode = "ORDER_CONFIRMED_IMMEDIATE";
            } else {
                templateCode = "ORDER_CONFIRMED_FUTURE";
                const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                templateVariables.픽업시작일 = `${orderPickupDate.getMonth() + 1}월 ${orderPickupDate.getDate()}일(${weekdays[orderPickupDate.getDay()]})`;
            }

            if (templateCode) {
                await sendAlimtalk(userData.phone, templateCode, templateVariables);
                logger.info(`Successfully sent order confirmation Alimtalk to ${userData.phone} for order ${event.params.orderId}`);
            }
        } catch (alimtalkError) {
            logger.error(`Failed to send Alimtalk for order ${event.params.orderId}:`, alimtalkError);
        }

    } catch (error) {
        logger.error(`Transaction failed for order ${event.params.orderId} creation:`, error);
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
        await db.runTransaction(async (transaction) => {
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

// 재고 수량(reservedCount) 변경을 위한 onOrderUpdated
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
    
    // 재고 변경이 없으면 함수 종료
    if (changesByProduct.size === 0) {
        return;
    }

    try {
        await db.runTransaction(async (transaction) => {
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


// =================================================================
// ✅ [신규] 주문 상태 변경에 따른 사용자 포인트/등급/알림 처리 트리거
// =================================================================
export const updateUserStatsOnOrderStatusChange = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { orderId: string }>) => {
    if (!event.data) return;

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    const isPickup = before.status !== "PICKED_UP" && after.status === "PICKED_UP";
    const isNoShow = before.status !== "NO_SHOW" && after.status === "NO_SHOW";
    
    // 픽업 또는 노쇼 상태로의 변경이 아니면 함수를 종료합니다.
    if (!isPickup && !isNoShow) {
      return;
    }
    
    const newStatus = isPickup ? "PICKED_UP" : "NO_SHOW";
    const userRef = db.collection("users").doc(after.userId);
    
    try {
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          logger.error(`User ${after.userId} not found for order status update.`);
          return;
        }
        
        const userData = userDoc.data() as UserDocument;
        
        // 위에서 정의한 헬퍼 함수를 사용하여 업데이트될 내용을 계산합니다.
        // 주문 문서의 id를 order 데이터에 추가해줍니다.
        const orderWithId = { ...after, id: event.params.orderId };
        const updateResult = calculateUserUpdateFromOrder(userData, orderWithId, newStatus);

        if (updateResult) {
            // 사용자 문서에 포인트, 등급, 픽업/노쇼 카운트, 포인트 내역을 업데이트합니다.
            transaction.update(userRef, updateResult.updateData);
            
            // 등급에 변동이 있다면 알림을 생성합니다.
            if (updateResult.tierChange) {
                const { from, to } = updateResult.tierChange;
                
                // 등급 상승/하강 여부 판단 (하위 등급 -> 상위 등급으로의 변경)
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
                
                // 트랜잭션 내에서 알림 문서를 생성합니다.
                const notificationRef = userRef.collection("notifications").doc();
                transaction.set(notificationRef, newNotification);
            }
        }
      });
      logger.info(`Successfully updated user stats for order ${event.params.orderId} to status ${newStatus}`);
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

    // ✅ [수정] 이 트리거는 '픽업 완료' 상태로 '최초' 변경될 때만 실행되어야 합니다.
    if (before.status === "PICKED_UP" || after.status !== "PICKED_UP") {
      return;
    }

    const newUserId = after.userId;
    if (!newUserId) {
      logger.warn("No userId in order data.");
      return;
    }
    const newUserRef = db.collection("users").doc(newUserId);

    try {
      const newUserDoc = await newUserRef.get();
      if (!newUserDoc.exists) {
        logger.warn(`User document for orderer (ID: ${newUserId}) not found.`);
        return;
      }

      const newUser = newUserDoc.data() as UserDocument;
      
      // ✅ [수정] `updateUserStatsOnOrderStatusChange`가 먼저 실행되어 pickupCount가 이미 증가했을 것을 가정합니다.
      // 따라서 첫 픽업인지 여부는 pickupCount가 1일 때로 판단합니다.
      const isFirstPickup = (newUser.pickupCount || 0) === 1;
      const wasReferred = newUser.referredBy && newUser.referredBy !== "__SKIPPED__";

      if (isFirstPickup && wasReferred) {
        logger.info(`First pickup user (ID: ${newUserId}) confirmed. Starting referrer reward process.`);

        const referrerQuery = db.collection("users")
          .where("referralCode", "==", newUser.referredBy)
          .limit(1);

        const referrerSnapshot = await referrerQuery.get();
        if (referrerSnapshot.empty) {
          logger.warn(`User with referral code (${newUser.referredBy}) not found.`);
          return;
        }

        const referrerDoc = referrerSnapshot.docs[0];
        const referrerRef = referrerDoc.ref;
        const rewardPoints = POINT_POLICIES.FRIEND_INVITED.points;
        
        await db.runTransaction(async (transaction) => {
          const freshReferrerDoc = await transaction.get(referrerRef);
          if (!freshReferrerDoc.exists) return;
          
          const referrerData = freshReferrerDoc.data() as UserDocument;
          const currentPoints = referrerData.points || 0;
          const newPoints = currentPoints + rewardPoints;
          
          // 추천인 보너스 지급 시에는 등급을 재계산하지 않는 것이 정책 일관성에 맞습니다.
          // 등급은 픽업/노쇼 횟수에만 영향을 받기 때문입니다.
          // const newTier = calculateTier(referrerData.pickupCount || 0, referrerData.noShowCount || 0);
          
          const now = new Date();
          const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

          const pointLog: Omit<PointLog, "id"> = {
            amount: rewardPoints,
            reason: `${POINT_POLICIES.FRIEND_INVITED.reason} (${newUser.displayName || "신규 회원"}님)`,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(expirationDate),
          };

          transaction.update(referrerRef, {
            points: newPoints,
            // loyaltyTier: newTier, // 포인트 지급으로 등급이 변경되지 않으므로 이 라인 제거
            pointHistory: FieldValue.arrayUnion(pointLog),
          });
        });
        
        logger.info(`Successfully awarded ${rewardPoints}P to referrer (ID: ${referrerRef.id}).`);
      }
    } catch (error) {
      logger.error("An error occurred while processing the referrer reward:", error);
    }
  }
);