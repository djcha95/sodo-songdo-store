// functions/src/callable/orders.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp as AdminTimestamp, QueryDocumentSnapshot, DocumentData, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Order, OrderStatus, OrderItem, CartItem, UserDocument, Product, SalesRound, PointLog, CustomerInfo, LoyaltyTier } from "@/shared/types";

// ===============================
// StockStats v1 helpers (재고 칠판 도구)
// ===============================
const STOCK_STATS_COL = "stockStats_v1";

function statDocId(productId: string, roundId: string) {
  return `${productId}__${roundId}`;
}

function itemDeduct(it: OrderItem): number {
  const q = typeof it.quantity === "number" ? it.quantity : 0;
  const d = typeof it.stockDeductionAmount === "number" && it.stockDeductionAmount > 0 ? it.stockDeductionAmount : 1;
  return q * d;
}

function claimedField(vgId: string) {
  return `claimed.${vgId}`;
}

function pickedUpField(vgId: string) {
  return `pickedUp.${vgId}`;
}

// 칠판에서 현재 판매된 수량 읽기
async function getClaimedNow(
  tx: FirebaseFirestore.Transaction,
  productId: string,
  roundId: string,
  variantGroupId: string
): Promise<number> {
  const ref = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
  const snap = await tx.get(ref);
  const data = snap.exists ? (snap.data() as any) : {};
  const n = data?.claimed?.[variantGroupId];
  return typeof n === "number" ? n : 0;
}

// ===============================
// StockStats v1 helpers (재고 칠판 도구)
// ===============================
// ✅ 1-write(= tx.set merge)로 최적화된 버전

function applyClaimedDelta(
  tx: FirebaseFirestore.Transaction,
  productId: string,
  roundId: string,
  variantGroupId: string,
  delta: number
) {
  if (!delta) return;

  const ref = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
  tx.set(
    ref,
    {
      productId,
      roundId,
      updatedAt: AdminTimestamp.now(),
      [claimedField(variantGroupId)]: FieldValue.increment(delta),
    } as any,
    { merge: true }
  );
}

function applyPickedUpDelta(
  tx: FirebaseFirestore.Transaction,
  productId: string,
  roundId: string,
  variantGroupId: string,
  delta: number
) {
  if (!delta) return;

  const ref = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
  tx.set(
    ref,
    {
      productId,
      roundId,
      updatedAt: AdminTimestamp.now(),
      [pickedUpField(variantGroupId)]: FieldValue.increment(delta),
    } as any,
    { merge: true }
  );
}

// ===============================
// Logic & Constants
// ===============================

const POINT_POLICIES = {
  LATE_CANCEL_PENALTY: { points: -50, reason: '마감 임박 취소 (0.5 노쇼)' },
  PARTIAL_PICKUP_PENALTY: { points: -50, reason: '부분 픽업 (0.5 노쇼)' },
} as const;

const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  // 1. 픽업/노쇼 0회 -> 공구초보
  if (pickupCount === 0 && noShowCount === 0) {
    return '공구초보';
  }

  const totalTransactions = pickupCount + noShowCount;
  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 2. 긍정적 등급
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

/**
 * 모든 종류의 날짜 타입을 안전하게 Epoch Milliseconds(숫자)로 변환합니다.
 */
function toEpochMillis(v: any): number | null {
  if (!v) return null;
  // Firestore Timestamp (admin/client 모두 커버)
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  // JS Date
  if (v instanceof Date) return v.getTime();
  // Dayjs 등 valueOf 있는 객체
  if (typeof v.valueOf === 'function') {
    const n = v.valueOf();
    if (typeof n === 'number') return n;
  }
  // 숫자/문자열로 이미 들어온 경우
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  // Firestore Timestamp를 plain object로 받은 경우 (seconds/nanoseconds)
  if (typeof v === 'object' && typeof v.seconds === 'number') {
      return v.seconds * 1000 + ((v.nanoseconds || 0) / 1000000);
  }
  return null;
}

const productConverter = {
  toFirestore(product: Product): DocumentData { return product; },
  fromFirestore(snapshot: QueryDocumentSnapshot): Product {
    return snapshot.data() as Product;
  }
};
const orderConverter = {
  toFirestore(order: Order): DocumentData { return order; },
  fromFirestore(snapshot: QueryDocumentSnapshot): Order {
    return snapshot.data() as Order;
  }
};
const userConverter = {
  toFirestore(user: UserDocument): DocumentData { return user; },
  fromFirestore(snapshot: QueryDocumentSnapshot): UserDocument {
    return snapshot.data() as UserDocument;
  }
};

// ===============================
// Callable Functions
// ===============================

export const checkCartStock = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("internal", "Error while checking stock.");
    }
    
    const cartItems = request.data.items as CartItem[];
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return { updatedItems: [], removedItemIds: [], isSufficient: true };
    }

    try {
      // 1. 상품 정보 가져오기
      const productIds = [...new Set(cartItems.map(item => item.productId))];
      const productSnapshots = await Promise.all(
        productIds.map(id => db.collection("products").withConverter(productConverter).doc(id).get())
      );
      const productsMap = new Map<string, Product>();
      productSnapshots.forEach(snap => {
        if (snap.exists) productsMap.set(snap.id, { ...snap.data(), id: snap.id } as Product);
      });

      // 2. 칠판(StockStats) 정보 한꺼번에 가져오기
      const statsKeys = [...new Set(cartItems.map(item => statDocId(item.productId, item.roundId)))];
      const statsSnapshots = await Promise.all(
        statsKeys.map(key => db.collection(STOCK_STATS_COL).doc(key).get())
      );
      const statsMap = new Map<string, any>();
      statsSnapshots.forEach(snap => {
        if (snap.exists) statsMap.set(snap.id, snap.data());
      });
      
      const updatedItems: { id: string; newQuantity: number }[] = [];
      const removedItemIds: string[] = [];
      let isSufficient = true;

      for (const item of cartItems) {
        const product = productsMap.get(item.productId);
        if (!product) { removedItemIds.push(item.id); isSufficient = false; continue; }

        const round = product.salesHistory.find(r => r.roundId === item.roundId);
        if (!round) { removedItemIds.push(item.id); isSufficient = false; continue; }

        const group = round.variantGroups.find(vg => vg.id === item.variantGroupId);
        if (!group) { removedItemIds.push(item.id); isSufficient = false; continue; }

        // ✅ [변경] 칠판 확인 로직
        const statData = statsMap.get(statDocId(item.productId, item.roundId));
        const currentReserved = statData?.claimed?.[item.variantGroupId] || 0;
        
        const totalStock = group.totalPhysicalStock;
        let availableStock = Infinity;

        if (totalStock !== null && totalStock !== -1) {
          availableStock = totalStock - currentReserved;
        }

        const stockDeductionAmount = item.stockDeductionAmount || 1;
        const requiredStock = item.quantity * stockDeductionAmount;

        if (requiredStock > availableStock) {
          isSufficient = false;
          const adjustedQuantity = Math.max(0, Math.floor(availableStock / stockDeductionAmount));
          if (adjustedQuantity > 0) {
            updatedItems.push({ id: item.id, newQuantity: adjustedQuantity });
          } else {
            removedItemIds.push(item.id);
          }
        }
      }
      return { updatedItems, removedItemIds, isSufficient };
    } catch (error) {
      logger.error("Error checking stock:", error);
      throw new HttpsError("internal", "Error while checking stock.");
    }
  }
);

export const submitOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "A login is required.");

    const userId = request.auth.uid;
    const client = request.data as {
      items: OrderItem[];
      totalPrice: number;
      customerInfo: CustomerInfo;
      pickupDate?: AdminTimestamp | null;
      wasPrepaymentRequired?: boolean;
      notes?: string;
    };

    if (!Array.isArray(client.items) || client.items.length === 0) {
      throw new HttpsError("invalid-argument", "주문할 상품이 없습니다.");
    }

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1. 유저 정보
        const userRef = db.collection("users").withConverter(userConverter).doc(userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new HttpsError('not-found', 'User info not found.');
        const userData = userSnap.data() as UserDocument;
        if ((userData.manualTier || userData.loyaltyTier) === '공구제한') {
            throw new HttpsError("permission-denied", "공구제한 등급입니다.");
        }

        // 2. 상품 정보
        const productIds = [...new Set(client.items.map(i => i.productId))];
        const productSnaps = await Promise.all(
          productIds.map(id => db.collection("products").withConverter(productConverter).doc(id).get())
        );
        const productDataMap = new Map<string, Product>();
        for (const s of productSnaps) {
          if (!s.exists) throw new HttpsError("not-found", "Product not found.");
          productDataMap.set(s.id, { ...s.data(), id: s.id } as Product);
        }

        // 3. 기존 주문 찾기 (병합용)
        const userOrdersQuery = db.collection("orders")
            .withConverter(orderConverter)
            .where("userId", "==", userId)
            .where("status", "in", ["RESERVED", "PREPAID"]);
        const userOrdersSnap = await transaction.get(userOrdersQuery);
        
        const existingOrderMap = new Map<string, QueryDocumentSnapshot<Order>>();
        userOrdersSnap.docs.forEach(doc => {
            const orderData = doc.data();
            const item = orderData.items[0];
            if (item) {
                const pickupMillis = toEpochMillis(orderData.pickupDate) || 0;
                const key = `${item.productId}-${item.roundId}-${item.variantGroupId}-${pickupMillis}`;
                existingOrderMap.set(key, doc);
            }
        });

        const createdOrderIds: string[] = [];
        const updatedOrderIds: string[] = [];
        const phoneLast4 = (client.customerInfo?.phone || "").slice(-4);

        // 4. 주문 처리 루프
        for (const singleItem of client.items) {
          const product = productDataMap.get(singleItem.productId);
          if (!product) throw new HttpsError("not-found", "상품 정보를 찾을 수 없습니다.");
          
          const round = product.salesHistory.find(r => r.roundId === singleItem.roundId);
          const vg = round?.variantGroups.find(v => v.id === singleItem.variantGroupId) || (round?.variantGroups.length === 1 ? round?.variantGroups[0] : undefined);
          if (!round || !vg) throw new HttpsError("not-found", "옵션 정보를 찾을 수 없습니다.");

          // ✅ [변경] 칠판(StockStats) 확인
          const vgId = vg.id || 'default';
          const addDeduct = singleItem.quantity * (singleItem.stockDeductionAmount || 1);

          if (vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
             const claimedNow = await getClaimedNow(transaction, singleItem.productId, singleItem.roundId, vgId);
             const remaining = vg.totalPhysicalStock - claimedNow;
             
             if (addDeduct > remaining) {
                throw new HttpsError("failed-precondition", `재고 부족: ${vg.groupName} (남은수량: ${Math.floor(remaining / (singleItem.stockDeductionAmount || 1))}개)`);
             }
          }

          // 병합 또는 생성 로직
          const targetPickupDate = singleItem.pickupDate ? singleItem.pickupDate : round.pickupDate;
          const targetPickupMillis = toEpochMillis(targetPickupDate) || 0;
          const mergeKey = `${singleItem.productId}-${singleItem.roundId}-${singleItem.variantGroupId}-${targetPickupMillis}`;
          const existingDoc = existingOrderMap.get(mergeKey);

          if (existingDoc) {
              const existingOrder = existingDoc.data();
              const existingItem = existingOrder.items[0];
              const newQuantity = existingItem.quantity + singleItem.quantity;
              const newTotalPrice = existingItem.unitPrice * newQuantity;

              const updatedItem = { ...existingItem, quantity: newQuantity };
              transaction.update(existingDoc.ref, {
                  items: [updatedItem],
                  totalPrice: newTotalPrice,
                  notes: (existingOrder.notes || "") + `\n[추가주문] +${singleItem.quantity}개`
              });
              updatedOrderIds.push(existingDoc.id);
          } else {
              const newOrderRef = db.collection("orders").doc();
              const newOrder: Omit<Order, "id"> = {
                userId,
                customerInfo: { ...client.customerInfo, phoneLast4 },
                items: [singleItem], 
                totalPrice: singleItem.unitPrice * singleItem.quantity,
                orderNumber: `SODOMALL-${Date.now()}-${createdOrderIds.length}`,
                status: "RESERVED",
                createdAt: AdminTimestamp.now(),
                pickupDate: targetPickupDate,
                pickupDeadlineDate: round.pickupDeadlineDate ?? null,
                notes: client.notes ?? "",
                isBookmarked: false,
                wasPrepaymentRequired: !!client.wasPrepaymentRequired,
              };
              transaction.set(newOrderRef, newOrder);
              createdOrderIds.push(newOrderRef.id);
          }

          // ✅ [핵심] 칠판 업데이트 (수량 증가)
          applyClaimedDelta(transaction, singleItem.productId, singleItem.roundId, vgId, addDeduct);
        }

        return { success: true, orderIds: createdOrderIds, updatedOrderIds };
      });
      return result;
    } catch (err) {
      logger.error("Order submission failed", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "주문 처리 실패");
    }
  }
);

export const updateOrderQuantity = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const requesterId = request.auth.uid;
    const { orderId, newQuantity } = request.data as { orderId: string; newQuantity: number };

    if (!orderId || typeof newQuantity !== "number" || newQuantity <= 0) {
      throw new HttpsError("invalid-argument", "필수 정보(주문 ID, 새 수량)가 올바르지 않습니다.");
    }

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 주문 조회
        const orderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");

        const order = orderDoc.data();
        if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

        if (order.userId !== requesterId) {
          throw new HttpsError("permission-denied", "자신의 주문만 수정할 수 있습니다.");
        }
        if (order.status !== "RESERVED" && order.status !== "PREPAID") {
          throw new HttpsError("failed-precondition", "예약/선입금 상태의 주문만 수정 가능합니다.");
        }
        if (order.items.length !== 1) {
          throw new HttpsError("failed-precondition", "단일 품목 주문만 수량 변경이 가능합니다.");
        }

        const originalItem = order.items[0];
        const originalQuantity = originalItem.quantity;
        if (newQuantity === originalQuantity) return;

        // 2) 상품/옵션 조회
        const productRef = db.collection("products").withConverter(productConverter).doc(originalItem.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) throw new HttpsError("not-found", "관련 상품 정보를 찾을 수 없습니다.");

        const product = productSnap.data();
        if (!product) throw new HttpsError("internal", "상품 데이터를 읽는 데 실패했습니다.");

        const round = product.salesHistory.find((r) => r.roundId === originalItem.roundId);
        const vg = round?.variantGroups.find((v) => v.id === originalItem.variantGroupId);
        if (!round || !vg) throw new HttpsError("not-found", "상품 옵션 정보를 찾을 수 없습니다.");

        // 3) ✅ 칠판 기준 재고 체크 (추가분만 검사)
        const unit = typeof originalItem.stockDeductionAmount === "number" && originalItem.stockDeductionAmount > 0
          ? originalItem.stockDeductionAmount
          : 1;

        const oldDeduct = originalQuantity * unit;
        const newDeduct = newQuantity * unit;
        const delta = newDeduct - oldDeduct; // +면 추가예약, -면 예약 감소
        const vgId = vg.id || "default";

        if (delta > 0 && vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
          const claimedNow = await getClaimedNow(transaction, originalItem.productId, originalItem.roundId, vgId);
          const remaining = vg.totalPhysicalStock - claimedNow; // claimedNow에는 내 기존 oldDeduct도 이미 포함됨
          if (delta > remaining) {
            const maxAdd = Math.max(0, Math.floor(remaining / unit));
            throw new HttpsError("resource-exhausted", `재고가 부족합니다. 추가 가능 수량: 최대 ${maxAdd}개`);
          }
        }

        // 4) 주문 업데이트
        const updatedItem = { ...originalItem, quantity: newQuantity };
        const note = `[수량 변경] ${originalQuantity} -> ${newQuantity}`;

        transaction.update(orderRef, {
          items: [updatedItem],
          totalPrice: originalItem.unitPrice * newQuantity,
          notes: order.notes ? `${order.notes}\n${note}` : note,
        });

        // 5) ✅ 칠판(Claimed) 증감 반영
        if (delta !== 0) {
          applyClaimedDelta(transaction, originalItem.productId, originalItem.roundId, vgId, delta);
        }
      });

      return { success: true, message: "주문 수량이 성공적으로 변경되었습니다." };
    } catch (error) {
      logger.error(`Error updating quantity for order ${orderId} by user ${requesterId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "주문 수량 변경 중 오류가 발생했습니다.");
    }
  }
);

export const cancelOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

    const { orderId, penaltyType = "none" } = request.data as {
      orderId: string;
      penaltyType: "none" | "late";
    };

    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "주문 ID가 올바르지 않습니다.");
    }

    const requesterId = request.auth.uid;

    try {
      const { message } = await db.runTransaction(async (transaction) => {
        const orderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문 정보를 찾을 수 없습니다.");

        const order = orderDoc.data();
        if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

        // ✅ 권한 체크 (본인 or 관리자)
        const userClaims = (await getAuth().getUser(requesterId)).customClaims;
        const isAdmin = userClaims?.role === "admin" || userClaims?.role === "master";
        if (order.userId !== requesterId && !isAdmin) {
          throw new HttpsError("permission-denied", "자신의 주문만 취소할 수 있습니다.");
        }

        // ✅ 정책: 취소는 RESERVED/PREPAID만 허용
        if (order.status !== "RESERVED" && order.status !== "PREPAID") {
          throw new HttpsError(
            "failed-precondition",
            "예약 또는 선입금 완료 상태의 주문만 취소할 수 있습니다."
          );
        }

        // 사용자 조회(페널티용)
        const userRef = db.collection("users").doc(order.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new HttpsError("not-found", "주문 대상 사용자의 정보를 찾을 수 없습니다.");

        const userData = userSnap.data() as UserDocument | undefined;
        if (!userData) throw new HttpsError("internal", "사용자 데이터를 읽는 데 실패했습니다.");

        let finalMessage = "주문이 성공적으로 취소되었습니다.";

        // ✅ 페널티(선택)
        if (penaltyType === "late") {
          const penalty = POINT_POLICIES.LATE_CANCEL_PENALTY;
          const oldTier = userData.loyaltyTier || "공구새싹";
          const newNoShowCount = (userData.noShowCount || 0) + 0.5;
          const newTier = calculateTier(userData.pickupCount || 0, newNoShowCount);

          const penaltyLog: Omit<PointLog, "id"> = {
            amount: penalty.points,
            reason: penalty.reason,
            createdAt: AdminTimestamp.now(),
            orderId,
            expiresAt: null,
          };

          transaction.update(userRef, {
            points: FieldValue.increment(penalty.points),
            noShowCount: newNoShowCount,
            loyaltyTier: newTier,
            pointHistory: FieldValue.arrayUnion(penaltyLog),
          });

          finalMessage = "주문이 취소되고 0.5 노쇼 페널티가 적용되었습니다.";

          if (oldTier !== newTier) {
            logger.info(
              `User ${order.userId} tier changed from ${oldTier} to ${newTier} due to late cancellation.`
            );
          }
        }

        // ✅ [핵심] claimed 해제(=재고 점유 해제) 중복 방지
        const alreadyReleased = !!order.stockStats?.claimedReleasedAt;
        if (!alreadyReleased) {
          for (const it of order.items || []) {
            const vgId = it.variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct > 0) {
              applyClaimedDelta(transaction, it.productId, it.roundId, vgId, -deduct);
            }
          }
        }

        // ✅ 주문 업데이트 (취소 + 메타 기록)
        transaction.update(orderRef, {
          status: penaltyType === "late" ? "LATE_CANCELED" : "CANCELED",
          canceledAt: AdminTimestamp.now(),
          notes: order.notes ? `${order.notes}\n[취소] ${finalMessage}` : `[취소] ${finalMessage}`,
          stockStats: {
            ...(order.stockStats || {}),
            v: 1,
            // claimed가 해제되지 않았을 때만 기록
            ...(alreadyReleased ? {} : { claimedReleasedAt: AdminTimestamp.now() }),
          },
        });

        return { message: finalMessage };
      });

      logger.info(`Order ${orderId} canceled. Actor: ${requesterId}. Penalty type: ${penaltyType}`);
      return { success: true, message };
    } catch (error) {
      logger.error(`Error canceling order ${orderId} by actor ${requesterId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "주문 취소 중 오류가 발생했습니다.");
    }
  }
);

export const getUserOrders = onCall(
    { region: "asia-northeast3", cors: allowedOrigins },
    async (request) => {
    const { targetUserId, pageSize, lastVisible } = request.data as {
        targetUserId: string;
        pageSize: number;
        lastVisible?: { pickupDate: number | null; createdAt: number | null };
    };

        if (!request.auth) {
            throw new HttpsError("unauthenticated", "A login is required.");
        }
        if (request.auth.uid !== targetUserId) {
            const user = await getAuth().getUser(request.auth.uid);
            if (user.customClaims?.role !== 'admin' && user.customClaims?.role !== 'master') {
                throw new HttpsError("permission-denied", "You can only fetch your own orders.");
            }
        }

        try {
            let queryBuilder = db.collection('orders')
                .withConverter(orderConverter)
                .where('userId', '==', targetUserId)
                .orderBy('pickupDate', 'desc')
                .orderBy('createdAt', 'desc')
                .limit(pageSize);

            if (lastVisible && typeof lastVisible.pickupDate === 'number' && typeof lastVisible.createdAt === 'number') {
                const cursorPickupDate = AdminTimestamp.fromDate(new Date(lastVisible.pickupDate));
                const cursorCreatedAt = AdminTimestamp.fromDate(new Date(lastVisible.createdAt));
                queryBuilder = queryBuilder.startAfter(cursorPickupDate, cursorCreatedAt);
            } else if (lastVisible) {
                 logger.warn("lastVisible was incomplete:", { lastVisible });
            }

            const snapshot = await queryBuilder.get();

            const orders = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    userId: data.userId,
                    orderNumber: data.orderNumber,
                    items: data.items,
                    totalPrice: data.totalPrice,
                    status: data.status,
                    customerInfo: data.customerInfo,
                    wasPrepaymentRequired: data.wasPrepaymentRequired,
                    notes: data.notes,
                    isBookmarked: data.isBookmarked,
                    createdAt: toEpochMillis(data.createdAt),
                    pickupDate: toEpochMillis(data.pickupDate),
                    pickupDeadlineDate: toEpochMillis(data.pickupDeadlineDate),
                    canceledAt: toEpochMillis(data.canceledAt),
                    pickedUpAt: toEpochMillis(data.pickedUpAt),
                    prepaidAt: toEpochMillis(data.prepaidAt),
                };
            });

            const lastDocSnapshot = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

            let lastDocPayload: { pickupDate: number | null; createdAt: number | null } | null = null;
            if (lastDocSnapshot) {
                const lastDocData = lastDocSnapshot.data();
                lastDocPayload = {
                    pickupDate: toEpochMillis(lastDocData.pickupDate),
                    createdAt: toEpochMillis(lastDocData.createdAt)
                };
            }

            return { 
                data: orders, 
                lastDoc: lastDocPayload,
                buildId: '2025-10-21-EPOCH-FIX' 
            };

        } catch (error: any) {
            logger.error('Error fetching user orders:', error);
            throw new HttpsError('internal', error.message || '주문 내역을 불러오는 중 오류가 발생했습니다.');
        }
    }
);

export const getUserWaitlist = onCall(
    { region: "asia-northeast3", cors: allowedOrigins },
    async (request) => {
        if (!request.auth) {
          throw new HttpsError("unauthenticated", "A login is required.");
        }
        const userId = request.auth.uid;
        
        try {
          const allProductsSnapshot = await db.collection('products').withConverter(productConverter).where('isArchived', '==', false).get();
          const userWaitlist: any[] = [];
    
          allProductsSnapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            (product.salesHistory || []).forEach((round: SalesRound) => {
              (round.waitlist || []).forEach((entry: any) => {
                if (entry.userId === userId) {
                  const vg = (round.variantGroups || []).find(v => v.id === entry.variantGroupId);
                  const item = (vg?.items || []).find(i => i.id === entry.itemId);
    
                  userWaitlist.push({
                    productId: product.id,
                    productName: product.groupName,
                    roundId: round.roundId,
                    roundName: round.roundName,
                    variantGroupId: entry.variantGroupId,
                    itemId: entry.itemId,
                    itemName: `${vg?.groupName || ''} - ${item?.name || ''}`.replace(/^ - | - $/g, '') || 'Option information not available',
                    imageUrl: product.imageUrls?.[0] || '',
                    quantity: entry.quantity,
                    timestamp: entry.timestamp,
                  });
                }
              });
            });
          });
          
          const sortedWaitlist = userWaitlist.sort((a, b) => {
            if (a.isPrioritized && !b.isPrioritized) return -1;
            if (!a.isPrioritized && b.isPrioritized) return 1;
            return b.timestamp.toMillis() - a.timestamp.toMillis();
          });
          
          return { data: sortedWaitlist, lastDoc: null };
        } catch (error) {
          logger.error('Error fetching user waitlist:', error);
          throw new HttpsError('internal', 'An error occurred while fetching the waitlist.');
        }
    }
);

export const searchOrdersByCustomer = onCall(
    { region: "asia-northeast3", cors: allowedOrigins, enforceAppCheck: false },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "인증된 사용자만 접근할 수 있습니다.");
        }

        const user = await getAuth().getUser(request.auth.uid);
        if (user.customClaims?.role !== 'admin' && user.customClaims?.role !== 'master') {
            throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
        }

        const { query: searchQuery } = request.data;
        if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length < 2) {
            throw new HttpsError("invalid-argument", "검색어는 2자 이상 입력해주세요.");
        }

        const trimmedQuery = searchQuery.trim();

        try {
            const nameSearchPromise = db.collection('orders')
                .where('customerInfo.name', '==', trimmedQuery)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .withConverter(orderConverter)
                .get();

            const phoneSearchPromise = db.collection('orders')
                .where('customerInfo.phoneLast4', '==', trimmedQuery)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .withConverter(orderConverter)
                .get();

            const [nameResults, phoneResults] = await Promise.all([nameSearchPromise, phoneSearchPromise]);

            const combinedResults = new Map<string, Order & { id: string }>();

            nameResults.forEach(doc => {
                combinedResults.set(doc.id, { ...doc.data(), id: doc.id });
            });
            phoneResults.forEach(doc => {
                combinedResults.set(doc.id, { ...doc.data(), id: doc.id });
            });
            
            const orders = Array.from(combinedResults.values())
              .sort((a, b) => {
                  const timeA = a.createdAt as AdminTimestamp;
                  const timeB = b.createdAt as AdminTimestamp;
                  return timeB.toMillis() - timeA.toMillis();
              });

            return { success: true, orders };

        } catch (error) {
            logger.error(`Error searching orders with query "${trimmedQuery}":`, error);
            throw new HttpsError("internal", "주문 검색 중 오류가 발생했습니다.");
        }
    }
);

export const splitBundledOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const user = await getAuth().getUser(uid);
    const userRole = user.customClaims?.role;
    if (userRole !== "admin" && userRole !== "master") {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { orderId } = request.data as { orderId: string };
    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "분할할 주문의 ID가 필요합니다.");
    }

    const originalOrderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const originalOrderSnap = await transaction.get(originalOrderRef);

        if (!originalOrderSnap.exists) {
          throw new HttpsError("not-found", "분할할 원본 주문을 찾을 수 없습니다.");
        }

        const originalOrder = originalOrderSnap.data();
        if (!originalOrder) {
          throw new HttpsError("internal", "원본 주문 데이터를 읽는 데 실패했습니다.");
        }

        if (!Array.isArray(originalOrder.items) || originalOrder.items.length <= 1) {
          throw new HttpsError("failed-precondition", "분할할 상품이 2개 이상인 주문만 처리할 수 있습니다.");
        }

        // ✅ 안전을 위해: 분할은 RESERVED/PREPAID 상태에서만 허용
        if (originalOrder.status !== "RESERVED" && originalOrder.status !== "PREPAID") {
          throw new HttpsError(
            "failed-precondition",
            `현재 상태(${originalOrder.status})에서는 분할할 수 없습니다. (RESERVED/PREPAID만 가능)`
          );
        }

        // 1) ✅ 원본 주문이 점유하고 있던 claimed를 먼저 해제
        for (const it of originalOrder.items) {
          const vgId = it.variantGroupId || "default";
          const deduct = itemDeduct(it);
          if (deduct > 0) {
            applyClaimedDelta(transaction, it.productId, it.roundId, vgId, -deduct);
          }
        }

        // 2) 아이템별로 새 주문 생성 + 각 주문이 claimed를 다시 점유
        const newOrderIds: string[] = [];

        for (let i = 0; i < originalOrder.items.length; i++) {
          const item = originalOrder.items[i];
          const newOrderRef = db.collection("orders").withConverter(orderConverter).doc();

          const newOrderData: Omit<Order, "id"> = {
            ...originalOrder,
            items: [item],
            totalPrice: item.unitPrice * item.quantity,
            orderNumber: `${originalOrder.orderNumber}-S${i + 1}`,
            createdAt: AdminTimestamp.now(),
            splitFrom: orderId,
            status: "RESERVED", // ✅ 분할된 개별 주문은 예약 상태로
            notes: `[분할된 주문] 원본: ${originalOrder.orderNumber}`,
          };

          // 원본의 완료/취소 관련 필드는 제거 (새 주문이므로)
          delete (newOrderData as any).pickedUpAt;
          delete (newOrderData as any).prepaidAt;
          delete (newOrderData as any).canceledAt;

          transaction.set(newOrderRef, newOrderData);
          newOrderIds.push(newOrderRef.id);

          // ✅ 새 주문의 claimed 점유
          const vgId = item.variantGroupId || "default";
          const deduct = itemDeduct(item);
          if (deduct > 0) {
            applyClaimedDelta(transaction, item.productId, item.roundId, vgId, deduct);
          }
        }

        // 3) 원본 주문은 취소 처리 (이미 claimed는 해제했음)
        transaction.update(originalOrderRef, {
          status: "CANCELED",
          canceledAt: AdminTimestamp.now(),
          notes: originalOrder.notes
            ? `${originalOrder.notes}\n[주문 분할 완료] ${newOrderIds.length}개의 개별 주문(${newOrderIds.join(", ")})으로 분할되었습니다.`
            : `[주문 분할 완료] ${newOrderIds.length}개의 개별 주문(${newOrderIds.join(", ")})으로 분할되었습니다.`,
        });

        return {
          success: true,
          message: "주문이 성공적으로 분할되었습니다.",
          newOrderIds,
        };
      });

      logger.info(`Order ${orderId} was split by admin ${uid}.`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to split order ${orderId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "주문 분할 중 오류가 발생했습니다.");
    }
  }
);

export const createOrderAsAdmin = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
    }
    const adminUid = request.auth.uid;
    const adminUser = await getAuth().getUser(adminUid);
    const adminRole = adminUser.customClaims?.role;
    if (adminRole !== 'admin' && adminRole !== 'master') {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { targetUserId, item } = request.data as { targetUserId: string; item: OrderItem };
    if (!targetUserId || !item || !item.productId || !item.quantity) {
      throw new HttpsError("invalid-argument", "필수 정보(대상 사용자 ID, 주문 항목)가 누락되었습니다.");
    }
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        const targetUserRef = db.collection('users').withConverter(userConverter).doc(targetUserId);
        const targetUserSnap = await transaction.get(targetUserRef);
        if (!targetUserSnap.exists) {
          throw new HttpsError('not-found', '주문을 생성할 대상 사용자를 찾을 수 없습니다.');
        }
        const targetUserData = targetUserSnap.data();
        if (!targetUserData) {
          throw new HttpsError('internal', '대상 사용자의 정보를 읽는 데 실패했습니다.');
        }

        const productRef = db.collection("products").withConverter(productConverter).doc(item.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) throw new HttpsError('not-found', `상품(ID: ${item.productId})을 찾을 수 없습니다.`);
        
        const productData = productSnap.data();
        if (!productData) {
          throw new HttpsError('internal', `상품 데이터를 읽는 데 실패했습니다 (ID: ${item.productId}).`);
        }
        
        const round = (productData.salesHistory || []).find(r => r.roundId === item.roundId);
        const variantGroup = round?.variantGroups.find(vg => vg.id === item.variantGroupId);
        if (!round || !variantGroup) throw new HttpsError('not-found', '상품 옵션 정보를 찾을 수 없습니다.');
        
        const vgId = variantGroup.id || 'default';

        // ✅ [변경] 관리자 주문 생성도 칠판(StockStats) 기준 재고 확인
        if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
            const claimedNow = await getClaimedNow(transaction, item.productId, item.roundId, vgId);
            const remaining = variantGroup.totalPhysicalStock - claimedNow;
            const requiredStock = item.quantity * (item.stockDeductionAmount || 1);
            
            if (requiredStock > remaining) {
                throw new HttpsError('resource-exhausted', `상품 재고가 부족합니다. (남은 수량: ${Math.max(0, Math.floor(remaining / (item.stockDeductionAmount || 1)))})`);
            }
        }
        
        const newOrderRef = db.collection('orders').doc();
        const phoneLast4 = targetUserData.phone?.slice(-4) || '';

        const customerInfo: CustomerInfo = {
            name: targetUserData.displayName || '',
            phone: targetUserData.phone || '',
            phoneLast4
        };

        const newOrderData: Omit<Order, 'id'> = {
            userId: targetUserId,
            customerInfo: customerInfo,
            items: [item],
            totalPrice: item.unitPrice * item.quantity,
            orderNumber: `SODOMALL-ADMIN-${Date.now()}`,
            status: 'RESERVED',
            createdAt: AdminTimestamp.now(),
            pickupDate: round.pickupDate,
            pickupDeadlineDate: round.pickupDeadlineDate ?? null,
            notes: `관리자가 생성한 주문입니다.`,
            isBookmarked: false,
            wasPrepaymentRequired: round.isPrepaymentRequired ?? false,
        };

        transaction.set(newOrderRef, newOrderData);
        
        // ✅ [추가] 칠판 업데이트 (관리자 주문도 재고 점유)
        applyClaimedDelta(transaction, item.productId, item.roundId, vgId, item.quantity * (item.stockDeductionAmount || 1));

        return { success: true, orderId: newOrderRef.id };
      });

      return result;

    } catch (error) {
      logger.error(`Admin order creation failed for target user ${targetUserId} by admin ${adminUid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "관리자 주문 생성 중 오류가 발생했습니다.");
    }
  }
);

// ✅ [변경] 부분 픽업 처리 함수 (StockStats 연동)
export const processPartialPickup = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    if (!request.auth?.token.role || !['admin', 'master'].includes(request.auth.token.role)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { orderId, pickedUpQuantity } = request.data as { orderId: string; pickedUpQuantity: number };
    if (!orderId || typeof pickedUpQuantity !== 'number' || pickedUpQuantity <= 0) {
      throw new HttpsError("invalid-argument", "필수 정보(주문 ID, 픽업 수량)가 올바르지 않습니다.");
    }

    try {
      await db.runTransaction(async (transaction) => {
        const orderRef = db.collection('orders').withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");
        
        const order = orderDoc.data();
        if(!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");
        if (order.items.length !== 1) throw new HttpsError("failed-precondition", "여러 품목이 묶인 주문은 부분 픽업할 수 없습니다.");
        if (order.status !== 'RESERVED' && order.status !== 'PREPAID') throw new HttpsError("failed-precondition", "처리 대기 중인 주문만 가능합니다.");

        const originalItem = order.items[0];
        if (pickedUpQuantity >= originalItem.quantity) throw new HttpsError("failed-precondition", "픽업 수량은 원래 수량보다 적어야 합니다.");

        const userRef = db.collection('users').withConverter(userConverter).doc(order.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        
        const userData = userSnap.data();
        if(!userData) throw new HttpsError("internal", "사용자 데이터를 읽는 데 실패했습니다.");

        const penalty = POINT_POLICIES.PARTIAL_PICKUP_PENALTY;
        const newTotalPrice = originalItem.unitPrice * pickedUpQuantity;
        const pointGain = Math.round(newTotalPrice * 0.01);
        const pointChange = pointGain + penalty.points;

        const newNoShowCount = (userData.noShowCount || 0) + 0.5;
        const oldTier = userData.loyaltyTier;
        const newTier = calculateTier(userData.pickupCount || 0, newNoShowCount);

        const updatedItem = { ...originalItem, quantity: pickedUpQuantity };
        const note = `[부분 픽업] ${originalItem.quantity}개 중 ${pickedUpQuantity}개 픽업. 0.5 노쇼 처리.`;

        const penaltyLog: Omit<PointLog, "id"> = {
          amount: penalty.points,
          reason: penalty.reason,
          createdAt: AdminTimestamp.now(),
          orderId: orderId,
          expiresAt: null,
        };

        const userUpdateData: any = {
          noShowCount: newNoShowCount,
          points: FieldValue.increment(pointChange),
          pointHistory: FieldValue.arrayUnion(penaltyLog),
        };
        if (oldTier !== newTier) userUpdateData.loyaltyTier = newTier;

        // 1. 유저 업데이트
        transaction.update(userRef, userUpdateData);

        // 2. 주문 업데이트
        transaction.update(orderRef, {
          status: 'PICKED_UP',
          items: [updatedItem],
          totalPrice: newTotalPrice,
          pickedUpAt: AdminTimestamp.now(),
          notes: order.notes ? `${order.notes}\n${note}` : note,
        });

        // 3. ✅ [핵심] 재고 칠판(StockStats) 업데이트
        const vgId = originalItem.variantGroupId || 'default';
        const unit = originalItem.stockDeductionAmount || 1;
        const releasedQty = originalItem.quantity - pickedUpQuantity;

        const releasedDeduct = releasedQty * unit;
        const pickedDeduct = pickedUpQuantity * unit;

        // (3-1) 미수령분은 'claimed'에서 차감 (재고 해제)
        if (releasedDeduct > 0) {
          applyClaimedDelta(transaction, originalItem.productId, originalItem.roundId, vgId, -releasedDeduct);
        }
        // (3-2) 픽업분은 'pickedUp' 통계 증가
        if (pickedDeduct > 0) {
          applyPickedUpDelta(transaction, originalItem.productId, originalItem.roundId, vgId, pickedDeduct);
        }
      });
      
      return { success: true, message: "부분 픽업 및 페널티가 적용되었습니다." };

    } catch (error) {
      logger.error(`Error processing partial pickup for order ${orderId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "부분 픽업 처리 중 오류가 발생했습니다.");
    }
  }
);

export const revertFinalizedOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    if (!request.auth?.token.role || !["admin", "master"].includes(request.auth.token.role)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { orderId, originalStatus } = request.data as { orderId: string; originalStatus: OrderStatus };
    if (!orderId || !originalStatus) {
      throw new HttpsError("invalid-argument", "필수 정보(주문 ID, 원래 상태)가 누락되었습니다.");
    }

    // ✅ 추천 타입(엄격 정책): 취소 계열만 복구 허용
    if (originalStatus !== "CANCELED" && originalStatus !== "LATE_CANCELED") {
      throw new HttpsError(
        "failed-precondition",
        `revertFinalizedOrder는 CANCELED/LATE_CANCELED만 복구 가능합니다. (요청: ${originalStatus})`
      );
    }

    try {
      await db.runTransaction(async (transaction) => {
        const orderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");

        const order = orderDoc.data();
        if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

        // ✅ 현재 상태도 반드시 취소 계열이어야 함 (콘솔 수동 수정으로 꼬인 것 방지)
        if (order.status !== "CANCELED" && order.status !== "LATE_CANCELED") {
          throw new HttpsError(
            "failed-precondition",
            `현재 상태(${order.status})에서는 복구할 수 없습니다. (CANCELED/LATE_CANCELED만 가능)`
          );
        }

        // 1) LATE_CANCELED라면 페널티 복구(노쇼 -0.5, 포인트 +50)
        if (order.status === "LATE_CANCELED") {
          const userRef = db.collection("users").withConverter(userConverter).doc(order.userId);
          const userSnap = await transaction.get(userRef);
          if (!userSnap.exists) throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");

          const userData = userSnap.data();
          if (!userData) throw new HttpsError("internal", "사용자 데이터를 읽는 데 실패했습니다.");

          const newNoShowCount = Math.max(0, (userData.noShowCount || 0) - 0.5);
          const oldTier = userData.loyaltyTier;
          const newTier = calculateTier(userData.pickupCount || 0, newNoShowCount);

          const userUpdateData: any = {
            noShowCount: newNoShowCount,
            points: FieldValue.increment(POINT_POLICIES.LATE_CANCEL_PENALTY.points * -1), // -50의 반대 => +50
          };
          if (oldTier !== newTier) userUpdateData.loyaltyTier = newTier;

          transaction.update(userRef, userUpdateData);
        }

        // 2) ✅ 재고 칠판: 취소 상태에서 RESERVED로 돌아가니 claimed를 다시 점유
        for (const it of order.items || []) {
          const vgId = it.variantGroupId || "default";
          const deduct = itemDeduct(it);
          if (deduct > 0) {
            applyClaimedDelta(transaction, it.productId, it.roundId, vgId, deduct);
          }
        }

        // 3) 주문 상태 복구
        transaction.update(orderRef, {
          status: "RESERVED",
          canceledAt: FieldValue.delete(),
          notes: order.notes
            ? `${order.notes}\n[상태 복구] 관리자에 의해 예약 상태(RESERVED)로 복구되었습니다.`
            : "[상태 복구] 관리자에 의해 예약 상태(RESERVED)로 복구되었습니다.",
        });
      });

      return { success: true, message: "주문이 예약 상태로 복구되었습니다. (CANCELED/LATE_CANCELED 전용)" };
    } catch (error) {
      logger.error(`Error reverting order ${orderId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "주문 복구 중 오류가 발생했습니다.");
    }
  }
);

export const markOrderAsNoShow = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !["admin", "master"].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { orderId } = request.data as { orderId: string };
    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "주문 ID가 필요합니다.");
    }

    const orderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) throw new HttpsError("not-found", "해당 주문을 찾을 수 없습니다.");

        const order = orderSnap.data();
        if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

        // ✅ 추천 타입(엄격 정책): RESERVED/PREPAID에서만 노쇼 가능
        if (order.status !== "RESERVED" && order.status !== "PREPAID") {
          throw new HttpsError(
            "failed-precondition",
            `현재 상태(${order.status})에서는 NO_SHOW 처리할 수 없습니다. (RESERVED/PREPAID만 가능)`
          );
        }

        // 1) claimed 해제
        for (const it of order.items || []) {
          const vgId = it.variantGroupId || "default";
          const deduct = itemDeduct(it);
          if (deduct > 0) {
            applyClaimedDelta(transaction, it.productId, it.roundId, vgId, -deduct);
          }
        }

        // 2) 상태 변경 (✅ noShowAt 같은 새 필드 추가하지 않음)
        transaction.update(orderRef, {
          status: "NO_SHOW",
          notes: order.notes
            ? `${order.notes}\n[노쇼] 관리자에 의해 NO_SHOW 처리되었습니다. (claimed 해제됨)`
            : `[노쇼] 관리자에 의해 NO_SHOW 처리되었습니다. (claimed 해제됨)`,
        });

        return { success: true, message: "주문이 '노쇼' 처리되었고, 재고 점유(claimed)가 해제되었습니다." };
      });

      logger.info(`Admin ${request.auth?.uid} marked order ${orderId} as NO_SHOW (strict policy).`);
      return result;
    } catch (error) {
      logger.error(`Error marking order ${orderId} as NO_SHOW:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "노쇼 처리 중 오류가 발생했습니다.");
    }
  }
);

export const rebuildStockStats_v1 = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "1GiB", timeoutSeconds: 540 },
  async (request) => {
    const role = request.auth?.token?.role;
    if (!role || !["admin", "master"].includes(role)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    // ✅ 어떤 상태를 claimed/pickedUp 집계에 포함할지 “정책”을 고정
    const CLAIMED_STATUSES: Array<OrderStatus> = ["RESERVED", "PREPAID", "PICKED_UP"];
    const PICKEDUP_STATUS: OrderStatus = "PICKED_UP";

    type Acc = {
      productId: string;
      roundId: string;
      claimed: Record<string, number>;
      pickedUp: Record<string, number>;
    };

    const accMap = new Map<string, Acc>();

    function ensureAcc(productId: string, roundId: string): Acc {
      const key = statDocId(productId, roundId);
      const ex = accMap.get(key);
      if (ex) return ex;
      const fresh: Acc = { productId, roundId, claimed: {}, pickedUp: {} };
      accMap.set(key, fresh);
      return fresh;
    }

    function inc(obj: Record<string, number>, vgId: string, delta: number) {
      if (!delta) return;
      obj[vgId] = (obj[vgId] || 0) + delta;
    }

    try {
      // ⚠️ orders가 많으면 한 번에 다 못 읽을 수 있음.
      // 안전하게 페이지네이션으로 전부 스캔
      const pageSize = 500;
      let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      let scanned = 0;

      while (true) {
        let q = db.collection("orders")
          .orderBy("createdAt", "asc")
          .limit(pageSize);

        if (last) q = q.startAfter(last);

        const snap = await q.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
          scanned++;
          const o = doc.data() as Order;

          if (!o || !o.status) continue;
          if (!CLAIMED_STATUSES.includes(o.status as OrderStatus)) continue;

          const isPickedUp = (o.status as OrderStatus) === PICKEDUP_STATUS;

          for (const it of (o.items || [])) {
            const productId = it.productId;
            const roundId = it.roundId;
            if (!productId || !roundId) continue;

            const vgId = it.variantGroupId || "default";

            // ✅ “차감 단위” 반영
            const deduct = itemDeduct(it); // quantity * stockDeductionAmount(기본 1)
            if (deduct <= 0) continue;

            const acc = ensureAcc(productId, roundId);

            // claimed: RESERVED/PREPAID/PICKED_UP 모두 포함
            inc(acc.claimed, vgId, deduct);

            // pickedUp: PICKED_UP만
            if (isPickedUp) {
              inc(acc.pickedUp, vgId, deduct);
            }
          }
        }

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < pageSize) break;
      }

      // ✅ 이제 stats 문서를 “통째로” 덮어쓰기
      // 많은 문서를 쓰므로 BulkWriter 추천
      const writer = db.bulkWriter();
      let written = 0;

      for (const [docId, acc] of accMap.entries()) {
        const ref = db.collection(STOCK_STATS_COL).doc(docId);

        writer.set(ref, {
          productId: acc.productId,
          roundId: acc.roundId,
          claimed: acc.claimed,
          pickedUp: acc.pickedUp,
          updatedAt: AdminTimestamp.now(),
        }, { merge: false });

        written++;
      }

      await writer.close();

      return {
        success: true,
        scannedOrders: scanned,
        statDocsWritten: written,
      };
    } catch (e) {
      logger.error("rebuildStockStats_v1 failed", e);
      throw new HttpsError("internal", "백필(rebuildStockStats_v1) 실행 중 오류가 발생했습니다.");
    }
  }
);
