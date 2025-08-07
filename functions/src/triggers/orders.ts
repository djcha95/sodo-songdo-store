// functions/src/triggers/orders.ts
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, FirestoreEvent, DocumentSnapshot, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { calculateTier, POINT_POLICIES } from "../utils/helpers.js";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, UserDocument, PointLog, LoyaltyTier } from "../types.js";


// =================================================================
// 주문 상태 변경에 따른 사용자 데이터 업데이트 헬퍼 함수
// (이하 기존 코드와 동일)
// =================================================================
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
    orderId: order.id,
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

    // ✅ [공통 로직] 주문 생성 시 재고 수량(reservedCount) 업데이트는 항상 실행
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
            logger.info(`Successfully updated reservedCount for order ${orderId}`);
        } catch (error) {
            logger.error(`Transaction failed for order ${orderId} creation:`, error);
            return;
        }
    }

    // ✅ [수정] 즉시 픽업 건에 대한 알림톡 발송 로직만 남깁니다.
    logger.info(`신규 주문(${orderId}) 생성. 즉시 픽업 알림이 필요한지 확인합니다.`);
    try {
        const normalizeToDate = (value: unknown): Date | null => {
            if (!value) return null;
            if ((value as Timestamp).toDate) return (value as Timestamp).toDate();
            if (value instanceof Date) return value;
            return null;
        };

        const pickupStartDate = normalizeToDate(order.pickupDate);
        if (!pickupStartDate) {
            logger.error(`주문(${orderId})의 픽업 시작일이 유효하지 않아 즉시 픽업 알림을 건너뜁니다.`);
            return;
        }

        const now = new Date();
        const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const todayStart = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        const pickupStartDateOnly = new Date(pickupStartDate.getFullYear(), pickupStartDate.getMonth(), pickupStartDate.getDate());

        // 픽업 시작일이 오늘이거나 이미 지난 경우에만 '즉시 픽업' 알림을 보냅니다.
        if (pickupStartDateOnly <= todayStart) {
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

            const templateCode = "ORD_CONFIRM_NOW";
            const productList = order.items
              .map(item => `${item.productName || '주문 상품'} ${item.quantity}개`)
              .join('\n');
            
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                상품목록: productList,
            };
            
            let recipientPhone = (userData.phone || '').replace(/\D/g, '');
            if (recipientPhone.startsWith('8210')) {
              recipientPhone = '0' + recipientPhone.slice(2);
            }

            logger.info(`Sending ${templateCode} to ${recipientPhone} for order ${orderId}.`);
            await sendAlimtalk(recipientPhone, templateCode, templateVariables);
            logger.info(`주문(${orderId})에 대한 ${templateCode} 알림톡을 성공적으로 발송했습니다.`);
        } else {
            // 미래 픽업 건은 스케줄링 함수가 처리하므로 여기서는 아무 작업도 하지 않고 로그만 남깁니다.
            logger.info(`주문(${orderId})은 미래 픽업 건이므로, 스케줄링된 일괄 알림으로 처리됩니다.`);
        }

    } catch (alimtalkError) {
        logger.error(`Failed to process Alimtalk for order ${orderId}:`, alimtalkError);
    }
  }
);


// 이하 onOrderDeleted, onOrderUpdatedForStock 등 기존 함수들은 그대로 유지합니다.
// ... (기존 코드 생략) ...
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
    
    if (!isPickup && !isNoShow) {
      return;
    }
    
    const newStatus = isPickup ? "PICKED_UP" : "NO_SHOW";
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
        const updateResult = calculateUserUpdateFromOrder(userData, orderWithId, newStatus);

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
        
        await db.runTransaction(async (transaction: Transaction) => {
          const freshReferrerDoc = await transaction.get(referrerRef);
          if (!freshReferrerDoc.exists) return;
          
          const referrerData = freshReferrerDoc.data() as UserDocument;
          const currentPoints = referrerData.points || 0;
          const newPoints = currentPoints + rewardPoints;
          
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