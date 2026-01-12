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
import { applyClaimedDelta, applyPickedUpDelta, statDocId } from "../utils/stockStats.js";
import { CLAIMED_STATUSES, PICKEDUP_STATUS, isClaimedStatus as policyIsClaimedStatus, isCancelledLike as policyIsCancelledLike } from "../utils/stockPolicy.js";

const STOCK_STATS_COL = "stockStats_v1";

function itemDeduct(it: OrderItem): number {
  const q = typeof it.quantity === "number" ? it.quantity : 0;
  const d = typeof it.stockDeductionAmount === "number" && it.stockDeductionAmount > 0 ? it.stockDeductionAmount : 1;
  return q * d;
}

// ✅ stock 조회 헬퍼: 신규 스키마(stock map) + 기존 스키마(totalPhysicalStock) 모두 지원
function getTotalStockForVariantGroup(product: any, roundId: string, variantGroupId: string): number | null {
  // 1) product.stock[vgId] (요구사항 가정)
  const stockMap = product?.stock;
  const fromProductMap = stockMap && typeof stockMap === "object" ? stockMap?.[variantGroupId] : undefined;
  if (typeof fromProductMap === "number") return fromProductMap;

  // 2) round.stock[vgId] (확장 옵션)
  const round = Array.isArray(product?.salesHistory) ? product.salesHistory.find((r: any) => r?.roundId === roundId) : null;
  const roundStockMap = round?.stock;
  const fromRoundMap = roundStockMap && typeof roundStockMap === "object" ? roundStockMap?.[variantGroupId] : undefined;
  if (typeof fromRoundMap === "number") return fromRoundMap;

  // 3) 기존: variantGroup.totalPhysicalStock
  const vg = round?.variantGroups?.find((v: any) => v?.id === variantGroupId);
  const total = vg?.totalPhysicalStock;
  if (typeof total === "number") return total;

  return null;
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

async function getPickedUpNow(
  tx: FirebaseFirestore.Transaction,
  productId: string,
  roundId: string,
  variantGroupId: string
): Promise<number> {
  const ref = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
  const snap = await tx.get(ref);
  const data = snap.exists ? (snap.data() as any) : {};
  const n = data?.pickedUp?.[variantGroupId];
  return typeof n === "number" ? n : 0;
}


function assertPositiveInt(name: string, v: any) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
    throw new HttpsError("invalid-argument", `${name} 값이 올바르지 않습니다.`);
  }
}

function assertNonNegativeFinite(name: string, v: any) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new HttpsError("invalid-argument", `${name} 값이 올바르지 않습니다.`);
  }
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
        const claimed = statData?.claimed?.[item.variantGroupId] || 0;
        const pickedUp = statData?.pickedUp?.[item.variantGroupId] || 0;
        // ✅ [수정] pickedUp도 이미 소진된 재고이므로 빼야 함
        const currentOccupied = claimed + pickedUp;
        
        const totalStock = group.totalPhysicalStock;
        let availableStock = Infinity;

        if (totalStock !== null && totalStock !== -1) {
          availableStock = totalStock - currentOccupied;
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
          // ✅ 기본 검증 (음수/이상값 차단)
          assertPositiveInt("quantity", singleItem.quantity);
          const unit = typeof singleItem.stockDeductionAmount === "number" && singleItem.stockDeductionAmount > 0
            ? singleItem.stockDeductionAmount
            : 1;
          assertNonNegativeFinite("unitPrice", singleItem.unitPrice);

          const product = productDataMap.get(singleItem.productId);
          if (!product) throw new HttpsError("not-found", "상품 정보를 찾을 수 없습니다.");
          
          const round = product.salesHistory.find(r => r.roundId === singleItem.roundId);
          const vg = round?.variantGroups.find(v => v.id === singleItem.variantGroupId) || (round?.variantGroups.length === 1 ? round?.variantGroups[0] : undefined);
          if (!round || !vg) throw new HttpsError("not-found", "옵션 정보를 찾을 수 없습니다.");

          // ✅ [변경] 칠판(StockStats) 확인
          const vgId = vg.id || 'default';
          const addDeduct = singleItem.quantity * unit;

          // 병합 또는 생성 로직
          const targetPickupDate = singleItem.pickupDate ? singleItem.pickupDate : round.pickupDate;
          const targetPickupMillis = toEpochMillis(targetPickupDate) || 0;
          const mergeKey = `${singleItem.productId}-${singleItem.roundId}-${singleItem.variantGroupId}-${targetPickupMillis}`;
          const existingDoc = existingOrderMap.get(mergeKey);

          // ✅ [핵심 수정] 재고 체크와 업데이트를 같은 트랜잭션 내에서 원자적으로 처리
          // - stockStats_v1 문서를 먼저 읽고
          // - 재고 체크를 하고
          // - 통과하면 업데이트
          const totalStock = getTotalStockForVariantGroup(product as any, singleItem.roundId, vgId);
          
          // 기존 주문이 있으면 그 주문의 점유량을 계산
          let existingOrderDeduct = 0;
          if (existingDoc) {
            const existingOrder = existingDoc.data();
            const existingItem = existingOrder.items[0];
            existingOrderDeduct = itemDeduct(existingItem);
          }
          
          if (typeof totalStock === "number" && totalStock !== -1) {
            // ✅ stockStats_v1 문서를 트랜잭션 내에서 읽기
            const statRef = db.collection(STOCK_STATS_COL).doc(statDocId(singleItem.productId, singleItem.roundId));
            const statSnap = await transaction.get(statRef);
            const statData = statSnap.exists ? (statSnap.data() as any) : {};
            
            const claimedNow = typeof statData?.claimed?.[vgId] === "number" ? statData.claimed[vgId] : 0;
            const pickedUpNow = typeof statData?.pickedUp?.[vgId] === "number" ? statData.pickedUp[vgId] : 0;
            
            // ✅ 기존 주문의 점유량을 제외한 실제 남은 재고 계산 (병합 케이스 대응)
            const actualClaimed = claimedNow - existingOrderDeduct;
            const remaining = totalStock - actualClaimed - pickedUpNow;

            if (remaining < 0) {
              logger.error("[submitOrder] stockStats inconsistency (remaining < 0)", {
                productId: singleItem.productId,
                roundId: singleItem.roundId,
                vgId,
                totalPhysicalStock: totalStock,
                claimedNow,
                actualClaimed,
                existingOrderDeduct,
                pickedUpNow,
              });
              throw new HttpsError("failed-precondition", "재고 데이터가 손상되어 주문할 수 없습니다. 관리자에게 문의해주세요.");
            }

            if (addDeduct > remaining) {
              const maxAllowedQuantity = Math.max(0, Math.floor(remaining / unit));
              throw new HttpsError(
                "failed-precondition",
                `재고 부족: ${vg.groupName} (추가 요청: ${singleItem.quantity}개, 추가 가능: 최대 ${maxAllowedQuantity}개)`
              );
            }
            
            // ✅ 재고 체크 통과 후, 같은 트랜잭션 내에서 stockStats_v1 업데이트
            // FieldValue.increment 대신 직접 값을 계산해서 업데이트 (트랜잭션 일관성 보장)
            const newClaimed = claimedNow + addDeduct;
            
            logger.info(`[submitOrder] stockStats_v1 업데이트: productId=${singleItem.productId}, roundId=${singleItem.roundId}, vgId=${vgId}, claimedNow=${claimedNow}, addDeduct=${addDeduct}, newClaimed=${newClaimed}`);
            
            transaction.set(
              statRef,
              {
                productId: singleItem.productId,
                roundId: singleItem.roundId,
                updatedAt: AdminTimestamp.now(),
                claimed: {
                  ...(statData.claimed || {}),
                  [vgId]: newClaimed,
                },
                pickedUp: statData.pickedUp || {},
              } as any,
              { merge: true }
            );
          } else {
            // 무제한 재고인 경우에도 stockStats_v1은 업데이트 (통계 목적)
            logger.info(`[submitOrder] 무제한 재고 stockStats_v1 업데이트: productId=${singleItem.productId}, roundId=${singleItem.roundId}, vgId=${vgId}, addDeduct=${addDeduct}`);
            applyClaimedDelta(transaction, singleItem.productId, singleItem.roundId, vgId, addDeduct);
          }

          if (existingDoc) {
              const existingOrder = existingDoc.data();
              const existingItem = existingOrder.items[0];
              const newQuantity = existingItem.quantity + singleItem.quantity;
              const newTotalPrice = existingItem.unitPrice * newQuantity;

              const updatedItem = { ...existingItem, quantity: newQuantity };
              transaction.update(existingDoc.ref, {
                  items: [updatedItem],
                  totalPrice: newTotalPrice,
                  notes: (existingOrder.notes || "") + `\n[추가주문] +${singleItem.quantity}개`,
                  // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
                  stockStatsV1Managed: true as any,
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
                // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
                stockStatsV1Managed: true as any,
              };
              transaction.set(newOrderRef, newOrder);
              createdOrderIds.push(newOrderRef.id);
          }
        }

        logger.info(`[submitOrder] 트랜잭션 성공: createdOrderIds=${createdOrderIds.length}, updatedOrderIds=${updatedOrderIds.length}`);
        
        // ✅ 트랜잭션 커밋 후 stockStats_v1 업데이트 확인 (디버깅용)
        for (const singleItem of client.items) {
          const statRef = db.collection(STOCK_STATS_COL).doc(statDocId(singleItem.productId, singleItem.roundId));
          const statSnap = await statRef.get();
          if (statSnap.exists) {
            const statData = statSnap.data() as any;
            const vgId = singleItem.variantGroupId || "default";
            const claimed = statData?.claimed?.[vgId] || 0;
            logger.info(`[submitOrder] stockStats_v1 확인: productId=${singleItem.productId}, roundId=${singleItem.roundId}, vgId=${vgId}, claimed=${claimed}`);
          } else {
            logger.warn(`[submitOrder] ⚠️ stockStats_v1 문서가 없음: productId=${singleItem.productId}, roundId=${singleItem.roundId}`);
          }
        }
        
        return { success: true, orderIds: createdOrderIds, updatedOrderIds };
      });
      
      logger.info(`[submitOrder] 주문 처리 완료: userId=${userId}, orderIds=${result.orderIds?.length || 0}, updatedOrderIds=${result.updatedOrderIds?.length || 0}`);
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

    if (!orderId || typeof newQuantity !== "number" || !Number.isFinite(newQuantity) || newQuantity <= 0) {
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

          const totalStock = getTotalStockForVariantGroup(product as any, originalItem.roundId, vgId);
          if (typeof totalStock === "number" && totalStock !== -1) {
          const claimedNow = await getClaimedNow(transaction, originalItem.productId, originalItem.roundId, vgId);
          const pickedUpNow = await getPickedUpNow(transaction, originalItem.productId, originalItem.roundId, vgId);
          const remaining = totalStock - claimedNow - pickedUpNow; // 추가 가능 재고

          if (remaining < 0) {
            logger.error("[updateOrderQuantity] stockStats inconsistency (remaining < 0)", {
              productId: originalItem.productId,
              roundId: originalItem.roundId,
              vgId,
              totalPhysicalStock: totalStock,
              claimedNow,
              pickedUpNow,
            });
            throw new HttpsError("failed-precondition", "재고 데이터가 손상되어 수량 변경이 불가합니다. 관리자에게 문의해주세요.");
          }

          if (delta > 0 && delta > remaining) {
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
          // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
          stockStatsV1Managed: true as any,
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

// ========================================================
// ✅ Admin/Owner order management (client write 차단 대응)
// ========================================================

function requireAuth(request: any): { uid: string; role?: string } {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const role = (request.auth?.token as any)?.role;
  return { uid, role };
}

function requireAdminRole(request: any): string {
  const { uid, role } = requireAuth(request);
  if (role !== "admin" && role !== "master") {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }
  return uid;
}

function isAdminRole(role?: string): boolean {
  return role === "admin" || role === "master";
}

function isClaimedStatus(status: OrderStatus): boolean {
  return policyIsClaimedStatus(status);
}

function isCanceledLike(status: OrderStatus): boolean {
  return policyIsCancelledLike(status);
}

/**
 * ✅ 주문 상태 일괄 변경 (서버에서만 orders write)
 * - 필요한 경우 stockStats_v1도 같이 갱신
 * - 트리거 중복 반영 방지: stockStatsV1Managed=true 설정
 */
export const updateMultipleOrderStatuses = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    const adminUid = requireAdminRole(request);

    const { orderIds, status } = request.data as { orderIds: string[]; status: OrderStatus };
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new HttpsError("invalid-argument", "orderIds가 필요합니다.");
    }
    if (!status) throw new HttpsError("invalid-argument", "status가 필요합니다.");

    // ✅ 입력 검증: 빈 값/비문자 방지 (invalid doc path로 500 나는 케이스 방어)
    const normalizedOrderIds = Array.from(
      new Set(orderIds.filter((id) => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))
    );
    if (normalizedOrderIds.length === 0) {
      throw new HttpsError("invalid-argument", "유효한 orderIds가 없습니다.");
    }

    try {
      await db.runTransaction(async (tx) => {
        // =========================================================
        // ✅ Firestore 트랜잭션 규칙 준수:
        //    1) 필요한 모든 reads를 먼저 수행
        //    2) 그 다음 writes 수행
        // =========================================================

        // 1) 모든 주문 문서 읽기
        const orderRefs = normalizedOrderIds.map((orderId) =>
          db.collection("orders").withConverter(orderConverter).doc(orderId)
        );
        const orderSnaps = await Promise.all(orderRefs.map((ref) => tx.get(ref)));

        const ordersById = new Map<string, { ref: FirebaseFirestore.DocumentReference<Order>; order: Order }>();
        for (let i = 0; i < orderSnaps.length; i++) {
          const snap = orderSnaps[i];
          const orderId = normalizedOrderIds[i];
          const ref = orderRefs[i];
          if (!snap.exists) throw new HttpsError("not-found", `주문을 찾을 수 없습니다: ${orderId}`);
          const order = snap.data();
          if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");
          ordersById.set(orderId, { ref, order });
        }

        // 2) “취소/노쇼 -> 예약/선입금” 복구 케이스만 oversell 체크 필요
        type RestoreNeed = { productId: string; roundId: string; vgId: string; deduct: number; unit: number };
        const restoreNeeds: RestoreNeed[] = [];

        const productIdsToRead = new Set<string>();
        const statKeysToRead = new Set<string>(); // statDocId(productId, roundId)

        for (const [orderId, { order }] of ordersById.entries()) {
          const beforeStatus = order.status;
          const afterStatus = status;
          if (!(isCanceledLike(beforeStatus) && isClaimedStatus(afterStatus))) continue;

          for (const it of order.items || []) {
            if (!it || typeof (it as any).productId !== "string" || !(it as any).productId) {
              logger.error("[updateMultipleOrderStatuses] invalid order item (missing productId)", { orderId, item: it });
              throw new HttpsError("failed-precondition", `주문 데이터가 손상되어 처리할 수 없습니다. (orderId=${orderId})`);
            }
            if (typeof (it as any).roundId !== "string" || !(it as any).roundId) {
              logger.error("[updateMultipleOrderStatuses] invalid order item (missing roundId)", { orderId, item: it });
              throw new HttpsError("failed-precondition", `주문 데이터가 손상되어 처리할 수 없습니다. (orderId=${orderId})`);
            }
            const vgId = it.variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct <= 0) continue;
            const unit = typeof it.stockDeductionAmount === "number" && it.stockDeductionAmount > 0 ? it.stockDeductionAmount : 1;

            restoreNeeds.push({ productId: it.productId, roundId: it.roundId, vgId, deduct, unit });
            productIdsToRead.add(it.productId);
            statKeysToRead.add(statDocId(it.productId, it.roundId));
          }
        }

        // 3) 필요한 product / stockStats 문서 읽기 (모두 read phase)
        const productRefs = Array.from(productIdsToRead).map((pid) =>
          db.collection("products").withConverter(productConverter).doc(pid)
        );
        const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
        const productsById = new Map<string, any>();
        for (let i = 0; i < productRefs.length; i++) {
          const pid = productRefs[i].id;
          const snap = productSnaps[i];
          if (!snap.exists) throw new HttpsError("not-found", `상품을 찾을 수 없습니다: ${pid}`);
          productsById.set(pid, snap.data());
        }

        const statRefs = Array.from(statKeysToRead).map((key) => db.collection(STOCK_STATS_COL).doc(key));
        const statSnaps = await Promise.all(statRefs.map((ref) => tx.get(ref)));
        const statsByKey = new Map<string, any>();
        for (let i = 0; i < statRefs.length; i++) {
          statsByKey.set(statRefs[i].id, statSnaps[i].exists ? statSnaps[i].data() : {});
        }

        // 4) oversell 검증 (복구되는 claimed 총합이 remaining을 넘지 않아야 함)
        const plannedRestoreByKey = new Map<string, number>(); // `${statKey}::${vgId}` -> total deduct
        for (const n of restoreNeeds) {
          const k = `${statDocId(n.productId, n.roundId)}::${n.vgId}`;
          plannedRestoreByKey.set(k, (plannedRestoreByKey.get(k) || 0) + n.deduct);
        }

        for (const [k, plannedDeduct] of plannedRestoreByKey.entries()) {
          const [statKey, vgId] = k.split("::");
          const stat = statsByKey.get(statKey) || {};
          const claimedNow = typeof stat?.claimed?.[vgId] === "number" ? stat.claimed[vgId] : 0;
          const pickedUpNow = typeof stat?.pickedUp?.[vgId] === "number" ? stat.pickedUp[vgId] : 0;

          const [productId, roundId] = statKey.split("__");
          const product = productsById.get(productId);
          const total = getTotalStockForVariantGroup(product as any, roundId, vgId);

          if (typeof total === "number" && total !== -1) {
            const remaining = total - claimedNow - pickedUpNow;
            if (remaining < 0) {
              logger.error("[updateMultipleOrderStatuses] stockStats inconsistency (remaining < 0)", {
                productId,
                roundId,
                vgId,
                totalPhysicalStock: total,
                claimedNow,
                pickedUpNow,
                actor: adminUid,
              });
              throw new HttpsError("failed-precondition", "재고 데이터가 손상되어 복구할 수 없습니다.");
            }
            if (plannedDeduct > remaining) {
              // unit은 복구 아이템별로 다를 수 있으나, 메시지용으로만 사용 → 우선 1로 처리
              const maxAdd = Math.max(0, Math.floor(remaining / 1));
              throw new HttpsError("resource-exhausted", `재고 부족: 복구 가능 수량 최대 ${maxAdd}개`);
            }
          }
        }

        // 5) 이제 write phase: stockStats delta + order 업데이트
        for (const [orderId, { ref, order }] of ordersById.entries()) {
          const beforeStatus = order.status;
          const afterStatus = status;

          for (const it of order.items || []) {
            if (!it || typeof (it as any).productId !== "string" || !(it as any).productId) {
              logger.error("[updateMultipleOrderStatuses] invalid order item (missing productId)", { orderId, item: it });
              throw new HttpsError("failed-precondition", `주문 데이터가 손상되어 처리할 수 없습니다. (orderId=${orderId})`);
            }
            if (typeof (it as any).roundId !== "string" || !(it as any).roundId) {
              logger.error("[updateMultipleOrderStatuses] invalid order item (missing roundId)", { orderId, item: it });
              throw new HttpsError("failed-precondition", `주문 데이터가 손상되어 처리할 수 없습니다. (orderId=${orderId})`);
            }

            const vgId = it.variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct <= 0) continue;

            if (isClaimedStatus(beforeStatus) && afterStatus === PICKEDUP_STATUS) {
              applyClaimedDelta(tx, it.productId, it.roundId, vgId, -deduct);
              applyPickedUpDelta(tx, it.productId, it.roundId, vgId, deduct);
              continue;
            }

            if (isClaimedStatus(beforeStatus) && isCanceledLike(afterStatus)) {
              applyClaimedDelta(tx, it.productId, it.roundId, vgId, -deduct);
              continue;
            }

            if (isCanceledLike(beforeStatus) && isClaimedStatus(afterStatus)) {
              applyClaimedDelta(tx, it.productId, it.roundId, vgId, deduct);
              continue;
            }

            if (beforeStatus === PICKEDUP_STATUS && isClaimedStatus(afterStatus)) {
              applyPickedUpDelta(tx, it.productId, it.roundId, vgId, -deduct);
              applyClaimedDelta(tx, it.productId, it.roundId, vgId, deduct);
              continue;
            }
          }

          const updateData: any = {
            status: afterStatus,
            stockStatsV1Managed: true as any,
          };
          if (afterStatus === "PICKED_UP") updateData.pickedUpAt = AdminTimestamp.now();
          if (afterStatus === "PREPAID") updateData.prepaidAt = AdminTimestamp.now();
          if (afterStatus === "CANCELED" || afterStatus === "LATE_CANCELED") updateData.canceledAt = AdminTimestamp.now();
          if (afterStatus === "NO_SHOW") updateData.noShowAt = AdminTimestamp.now();

          tx.update(ref, updateData);
        }
      });

      logger.info("[updateMultipleOrderStatuses] done", { count: orderIds.length, status, actor: adminUid });
      return { success: true };
    } catch (e: any) {
      logger.error("[updateMultipleOrderStatuses] failed", e);
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("internal", "주문 상태 변경 중 오류가 발생했습니다.");
    }
  }
);

export const updateOrderNotes = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    requireAdminRole(request);
    const { orderId, notes } = request.data as { orderId: string; notes: string };
    if (!orderId || typeof orderId !== "string") throw new HttpsError("invalid-argument", "orderId가 필요합니다.");
    if (typeof notes !== "string") throw new HttpsError("invalid-argument", "notes가 올바르지 않습니다.");

    const ref = db.collection("orders").withConverter(orderConverter).doc(orderId);
    await ref.update({ notes, stockStatsV1Managed: true as any });
    return { success: true };
  }
);

export const toggleOrderBookmark = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const { uid, role } = requireAuth(request);
    const { orderId, isBookmarked } = request.data as { orderId: string; isBookmarked: boolean };
    if (!orderId || typeof orderId !== "string") throw new HttpsError("invalid-argument", "orderId가 필요합니다.");
    if (typeof isBookmarked !== "boolean") throw new HttpsError("invalid-argument", "isBookmarked가 올바르지 않습니다.");

    const ref = db.collection("orders").withConverter(orderConverter).doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");
    const order = snap.data();
    if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

    if (order.userId !== uid && !isAdminRole(role)) {
      throw new HttpsError("permission-denied", "권한이 없습니다.");
    }

    await ref.update({ isBookmarked, stockStatsV1Managed: true as any });
    return { success: true };
  }
);

export const deleteOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    requireAdminRole(request);
    const { orderId } = request.data as { orderId: string };
    if (!orderId || typeof orderId !== "string") throw new HttpsError("invalid-argument", "orderId가 필요합니다.");

    const ref = db.collection("orders").withConverter(orderConverter).doc(orderId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");
      const order = snap.data();
      if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

      // ✅ 삭제 시 stockStats도 정리 (상태별로 claimed/pickedUp 차감)
      for (const it of order.items || []) {
        const vgId = it.variantGroupId || "default";
        const deduct = itemDeduct(it);
        if (deduct <= 0) continue;
        if (isClaimedStatus(order.status)) {
          applyClaimedDelta(tx, it.productId, it.roundId, vgId, -deduct);
        } else if (order.status === PICKEDUP_STATUS) {
          applyPickedUpDelta(tx, it.productId, it.roundId, vgId, -deduct);
        }
      }

      tx.delete(ref);
    });

    return { success: true };
  }
);

export const deleteMultipleOrders = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "1GiB" },
  async (request) => {
    requireAdminRole(request);
    const { orderIds } = request.data as { orderIds: string[] };
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new HttpsError("invalid-argument", "orderIds가 필요합니다.");

    // ⚠️ 너무 큰 요청 방지
    if (orderIds.length > 200) throw new HttpsError("invalid-argument", "한 번에 최대 200개까지 삭제할 수 있습니다.");

    for (const orderId of orderIds) {
      const ref = db.collection("orders").withConverter(orderConverter).doc(orderId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const order = snap.data();
        if (!order) return;

        for (const it of order.items || []) {
          const vgId = it.variantGroupId || "default";
          const deduct = itemDeduct(it);
          if (deduct <= 0) continue;
          if (isClaimedStatus(order.status)) {
            applyClaimedDelta(tx, it.productId, it.roundId, vgId, -deduct);
          } else if (order.status === PICKEDUP_STATUS) {
            applyPickedUpDelta(tx, it.productId, it.roundId, vgId, -deduct);
          }
        }
        tx.delete(ref);
      });
    }

    return { success: true };
  }
);

export const revertOrderStatus = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    requireAdminRole(request);
    const { orderIds, currentStatus } = request.data as { orderIds: string[]; currentStatus: OrderStatus };
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new HttpsError("invalid-argument", "orderIds가 필요합니다.");
    if (!currentStatus) throw new HttpsError("invalid-argument", "currentStatus가 필요합니다.");

    await db.runTransaction(async (tx) => {
      for (const orderId of orderIds) {
        const ref = db.collection("orders").withConverter(orderConverter).doc(orderId);
        const snap = await tx.get(ref);
        if (!snap.exists) continue;
        const order = snap.data();
        if (!order) continue;

        // ✅ 상태 복구: RESERVED로
        const updateData: any = {
          status: "RESERVED",
          stockStatsV1Managed: true as any,
        };

        // 타임스탬프 정리(정확한 delete는 FieldValue.delete 사용)
        if (currentStatus === "PICKED_UP") updateData.pickedUpAt = FieldValue.delete();
        if (currentStatus === "PREPAID") updateData.prepaidAt = FieldValue.delete();

        tx.update(ref, updateData);
      }
    });

    return { success: true };
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
          // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
          stockStatsV1Managed: true as any,
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
            // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
            stockStatsV1Managed: true as any,
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
          // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
          stockStatsV1Managed: true as any,
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
    
    // ✅ [감사 로깅] 관리자 작업 감사 로그 기록
    const { withAuditLog } = await import("../utils/auditLogger.js");
    
    try {
      return await withAuditLog(
      adminUid,
      "createOrderAsAdmin",
      "order",
      async () => {
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
            const pickedUpNow = await getPickedUpNow(transaction, item.productId, item.roundId, vgId);
            // ✅ [수정] pickedUp도 이미 소진된 재고이므로 빼야 함
            const remaining = variantGroup.totalPhysicalStock - claimedNow - pickedUpNow;
            const requiredStock = item.quantity * (item.stockDeductionAmount || 1);
            
            if (remaining < 0) {
              logger.error("[createOrderAsAdmin] stockStats inconsistency (remaining < 0)", {
                productId: item.productId,
                roundId: item.roundId,
                vgId,
                totalPhysicalStock: variantGroup.totalPhysicalStock,
                claimedNow,
                pickedUpNow,
              });
              throw new HttpsError("failed-precondition", "재고 데이터가 손상되어 주문할 수 없습니다. 관리자에게 문의해주세요.");
            }
            
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
            // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
            stockStatsV1Managed: true as any,
          };

          transaction.set(newOrderRef, newOrderData);
          
          // ✅ [추가] 칠판 업데이트 (관리자 주문도 재고 점유)
          applyClaimedDelta(transaction, item.productId, item.roundId, vgId, item.quantity * (item.stockDeductionAmount || 1));

          return { success: true, orderId: newOrderRef.id };
        });

      return result;
      },
      {
        resourceId: targetUserId,
        details: {
          productId: item.productId,
          roundId: item.roundId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        },
        adminEmail: adminUser.email,
      }
    );
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
          // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
          stockStatsV1Managed: true as any,
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

    // ✅ 허용된 상태: CANCELED, LATE_CANCELED, PICKED_UP, NO_SHOW
    const allowedStatuses = ["CANCELED", "LATE_CANCELED", "PICKED_UP", "NO_SHOW"];
    if (!allowedStatuses.includes(originalStatus)) {
      throw new HttpsError(
        "failed-precondition",
        `revertFinalizedOrder는 ${allowedStatuses.join(", ")}만 복구 가능합니다. (요청: ${originalStatus})`
      );
    }

    try {
      await db.runTransaction(async (transaction) => {
        const orderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");

        const order = orderDoc.data();
        if (!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

        // ✅ 현재 상태가 원래 상태와 일치하는지 확인
        if (order.status !== originalStatus) {
          throw new HttpsError(
            "failed-precondition",
            `주문 상태가 일치하지 않습니다. (현재: ${order.status}, 요청: ${originalStatus})`
          );
        }

        // 사용자 정보 가져오기 (통계 업데이트용)
        const userRef = db.collection("users").withConverter(userConverter).doc(order.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");

        const userData = userSnap.data();
        if (!userData) throw new HttpsError("internal", "사용자 데이터를 읽는 데 실패했습니다.");

        // 상태별 복구 로직
        const userUpdateData: any = {};
        let pointDelta = 0;
        let pickupCountDelta = 0;
        let noShowCountDelta = 0;

        if (originalStatus === "LATE_CANCELED") {
          // LATE_CANCELED: 페널티 복구(노쇼 -0.5, 포인트 +50)
          noShowCountDelta = -0.5;
          pointDelta = 50; // LATE_CANCEL_PENALTY의 반대
        } else if (originalStatus === "PICKED_UP") {
          // PICKED_UP: 픽업 통계 및 포인트 복구
          pickupCountDelta = -1;
          // 포인트 복구: 구매 금액의 1% (또는 0.5% + 선입금 보너스 5점)
          const purchasePoints = Math.floor((order.totalPrice || 0) * 0.01);
          pointDelta = -purchasePoints;
          
          // 재고 칠판: pickedUp에서 차감, claimed로 복구
          for (const it of order.items || []) {
            const vgId = it.variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct > 0) {
              applyPickedUpDelta(transaction, it.productId, it.roundId, vgId, -deduct);
              applyClaimedDelta(transaction, it.productId, it.roundId, vgId, deduct);
            }
          }
        } else if (originalStatus === "NO_SHOW") {
          // NO_SHOW: 노쇼 통계 및 포인트 복구
          noShowCountDelta = -1;
          pointDelta = 100; // NO_SHOW 페널티의 반대
          
          // 재고 칠판: NO_SHOW는 재고가 이미 해제되어 있을 수 있으므로 claimed로 복구
          for (const it of order.items || []) {
            const vgId = it.variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct > 0) {
              applyClaimedDelta(transaction, it.productId, it.roundId, vgId, deduct);
            }
          }
        } else if (originalStatus === "CANCELED") {
          // CANCELED: 재고만 복구 (통계 변경 없음)
          for (const it of order.items || []) {
            const vgId = it.variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct > 0) {
              applyClaimedDelta(transaction, it.productId, it.roundId, vgId, deduct);
            }
          }
        }

        // 사용자 통계 업데이트
        if (pickupCountDelta !== 0 || noShowCountDelta !== 0 || pointDelta !== 0) {
          const newPickupCount = Math.max(0, (userData.pickupCount || 0) + pickupCountDelta);
          const newNoShowCount = Math.max(0, (userData.noShowCount || 0) + noShowCountDelta);
          const oldTier = userData.loyaltyTier;
          const newTier = calculateTier(newPickupCount, newNoShowCount);

          if (pickupCountDelta !== 0) userUpdateData.pickupCount = newPickupCount;
          if (noShowCountDelta !== 0) userUpdateData.noShowCount = newNoShowCount;
          if (pointDelta !== 0) userUpdateData.points = FieldValue.increment(pointDelta);
          if (oldTier !== newTier) userUpdateData.loyaltyTier = newTier;

          if (Object.keys(userUpdateData).length > 0) {
            transaction.update(userRef, userUpdateData);
          }
        }

        // 주문 상태 복구
        const orderUpdateData: any = {
          status: "RESERVED",
          // ✅ stockStats_v1은 서버(Callable)가 직접 관리 (트리거 중복 반영 방지)
          stockStatsV1Managed: true,
        };

        // 상태별 타임스탬프 필드 삭제
        if (originalStatus === "PICKED_UP") {
          orderUpdateData.pickedUpAt = FieldValue.delete();
        } else if (originalStatus === "CANCELED" || originalStatus === "LATE_CANCELED") {
          orderUpdateData.canceledAt = FieldValue.delete();
        } else if (originalStatus === "NO_SHOW") {
          orderUpdateData.noShowAt = FieldValue.delete();
        }

        // 노트 추가
        const statusLabels: Record<OrderStatus, string> = {
          PICKED_UP: "픽업 완료",
          NO_SHOW: "노쇼",
          CANCELED: "취소",
          LATE_CANCELED: "마감임박 취소",
          RESERVED: "예약",
          PREPAID: "선입금",
          COMPLETED: "처리완료",
        };
        const statusLabel = statusLabels[originalStatus] || originalStatus;
        orderUpdateData.notes = order.notes
          ? `${order.notes}\n[상태 복구] 관리자에 의해 '${statusLabel}' 상태에서 예약 상태(RESERVED)로 복구되었습니다.`
          : `[상태 복구] 관리자에 의해 '${statusLabel}' 상태에서 예약 상태(RESERVED)로 복구되었습니다.`;

        transaction.update(orderRef, orderUpdateData);
      });

      const statusLabels: Record<string, string> = {
        PICKED_UP: "픽업 완료",
        NO_SHOW: "노쇼",
        CANCELED: "취소",
        LATE_CANCELED: "마감임박 취소",
      };
      const statusLabel = statusLabels[originalStatus] || originalStatus;
      return { success: true, message: `'${statusLabel}' 상태가 예약 상태로 복구되었습니다.` };
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

// =================================================================
// ✅ [신규] 초과 예약된 주문 찾기 및 취소
// =================================================================
export const findAndCancelOversoldOrders = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "1GiB", timeoutSeconds: 540 },
  async (request) => {
    const role = request.auth?.token?.role;
    if (!role || !["admin", "master"].includes(role)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { productId, roundId, variantGroupId, autoCancel = false } = (request.data || {}) as {
      productId?: string;
      roundId?: string;
      variantGroupId?: string;
      autoCancel?: boolean;
    };

    try {
      // 1. 모든 RESERVED/PREPAID 주문 조회
      const ordersQuery = db.collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID"])
        .orderBy("createdAt", "asc");
      
      const ordersSnapshot = await ordersQuery.get();
      
      // 2. 상품별/회차별/옵션별로 주문 그룹화
      type OrderGroup = {
        productId: string;
        roundId: string;
        variantGroupId: string;
        orders: Array<{ orderId: string; order: Order; deduct: number }>;
      };
      
      const orderGroups = new Map<string, OrderGroup>();
      
      for (const doc of ordersSnapshot.docs) {
        const order = doc.data() as Order;
        if (!order.items || order.items.length === 0) continue;
        
        for (const item of order.items) {
          // 필터링: 특정 상품/회차/옵션만 조회하는 경우
          if (productId && item.productId !== productId) continue;
          if (roundId && item.roundId !== roundId) continue;
          if (variantGroupId && item.variantGroupId !== variantGroupId) continue;
          
          const key = `${item.productId}__${item.roundId}__${item.variantGroupId}`;
          const deduct = itemDeduct(item);
          if (deduct <= 0) continue;
          
          if (!orderGroups.has(key)) {
            orderGroups.set(key, {
              productId: item.productId,
              roundId: item.roundId,
              variantGroupId: item.variantGroupId,
              orders: [],
            });
          }
          
          orderGroups.get(key)!.orders.push({
            orderId: doc.id,
            order,
            deduct,
          });
        }
      }
      
      // 3. 각 그룹별로 재고 확인 및 초과 예약 찾기
      const oversoldOrders: Array<{
        orderId: string;
        productId: string;
        roundId: string;
        variantGroupId: string;
        deduct: number;
        reason: string;
      }> = [];
      
      for (const [key, group] of orderGroups.entries()) {
        // 상품 정보 조회
        const productRef = db.collection("products").doc(group.productId);
        const productSnap = await productRef.get();
        if (!productSnap.exists) continue;
        
        const product = productSnap.data() as Product;
        const round = product.salesHistory?.find(r => r.roundId === group.roundId);
        if (!round) continue;
        
        const vg = round.variantGroups?.find(v => v.id === group.variantGroupId);
        if (!vg) continue;
        
        const totalStock = getTotalStockForVariantGroup(product as any, group.roundId, group.variantGroupId);
        if (typeof totalStock !== "number" || totalStock === -1) continue; // 무제한 재고는 스킵
        
        // StockStats 조회
        const statKey = statDocId(group.productId, group.roundId);
        const statRef = db.collection(STOCK_STATS_COL).doc(statKey);
        const statSnap = await statRef.get();
        const stat = statSnap.exists ? statSnap.data() : {};
        
        const vgId = group.variantGroupId || "default";
        const claimed = typeof stat?.claimed?.[vgId] === "number" ? stat.claimed[vgId] : 0;
        const pickedUp = typeof stat?.pickedUp?.[vgId] === "number" ? stat.pickedUp[vgId] : 0;
        const totalOccupied = claimed + pickedUp;
        
        // 초과 예약 확인
        if (totalOccupied > totalStock) {
          const oversoldAmount = totalOccupied - totalStock;
          
          // 주문을 생성 시간순으로 정렬 (나중에 생성된 주문이 초과분)
          const sortedOrders = [...group.orders].sort((a, b) => {
            const timeA = (a.order.createdAt as any)?.toMillis?.() || 0;
            const timeB = (b.order.createdAt as any)?.toMillis?.() || 0;
            return timeB - timeA; // 최신순
          });
          
          // 초과분만큼 주문 취소 대상으로 표시
          let remainingOversold = oversoldAmount;
          for (const { orderId, deduct } of sortedOrders) {
            if (remainingOversold <= 0) break;
            
            oversoldOrders.push({
              orderId,
              productId: group.productId,
              roundId: group.roundId,
              variantGroupId: group.variantGroupId,
              deduct: Math.min(deduct, remainingOversold),
              reason: `재고 초과: 총 재고 ${totalStock}, 예약 ${totalOccupied} (초과 ${oversoldAmount})`,
            });
            
            remainingOversold -= deduct;
          }
        }
      }
      
      // 4. 자동 취소 옵션이 켜져 있으면 취소 실행
      let canceledCount = 0;
      if (autoCancel && oversoldOrders.length > 0) {
        const orderIdsToCancel = [...new Set(oversoldOrders.map(o => o.orderId))];
        
        for (const orderId of orderIdsToCancel) {
          try {
            const orderRef = db.collection("orders").withConverter(orderConverter).doc(orderId);
            await db.runTransaction(async (tx) => {
              const orderSnap = await tx.get(orderRef);
              if (!orderSnap.exists) return;
              
              const order = orderSnap.data();
              if (!order) return;
              
              // RESERVED/PREPAID 상태만 취소
              if (order.status !== "RESERVED" && order.status !== "PREPAID") return;
              
              // claimed 해제
              for (const it of order.items || []) {
                const vgId = it.variantGroupId || "default";
                const deduct = itemDeduct(it);
                if (deduct > 0) {
                  applyClaimedDelta(tx, it.productId, it.roundId, vgId, -deduct);
                }
              }
              
              // 주문 취소 처리
              tx.update(orderRef, {
                status: "CANCELED",
                canceledAt: AdminTimestamp.now(),
                notes: order.notes
                  ? `${order.notes}\n[자동 취소] 재고 초과로 인한 자동 취소 처리되었습니다.`
                  : "[자동 취소] 재고 초과로 인한 자동 취소 처리되었습니다.",
                stockStatsV1Managed: true as any,
              });
            });
            
            canceledCount++;
          } catch (error: any) {
            logger.error(`[findAndCancelOversoldOrders] 취소 실패: orderId=${orderId}`, error);
          }
        }
      }
      
      return {
        success: true,
        oversoldCount: oversoldOrders.length,
        uniqueOrderCount: new Set(oversoldOrders.map(o => o.orderId)).size,
        canceledCount,
        oversoldOrders: oversoldOrders.slice(0, 100), // 최대 100개만 반환
        message: autoCancel
          ? `${oversoldOrders.length}개의 초과 예약 항목 중 ${canceledCount}개 주문이 자동 취소되었습니다.`
          : `${oversoldOrders.length}개의 초과 예약 항목이 발견되었습니다.`,
      };
    } catch (e: any) {
      logger.error("findAndCancelOversoldOrders failed", e);
      throw new HttpsError("internal", `초과 예약 확인 중 오류가 발생했습니다: ${e.message}`);
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
    const CLAIMED_STATUSES: Array<OrderStatus> = ["RESERVED", "PREPAID"];
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
          const isClaimed = CLAIMED_STATUSES.includes(o.status as OrderStatus);
          const isPickedUp = (o.status as OrderStatus) === PICKEDUP_STATUS;
          if (!isClaimed && !isPickedUp) continue;

          for (const it of (o.items || [])) {
            const productId = it.productId;
            const roundId = it.roundId;
            if (!productId || !roundId) continue;

            const vgId = it.variantGroupId || "default";

            // ✅ “차감 단위” 반영
            const deduct = itemDeduct(it); // quantity * stockDeductionAmount(기본 1)
            if (deduct <= 0) continue;

            const acc = ensureAcc(productId, roundId);

            // claimed: RESERVED/PREPAID만
            if (isClaimed) inc(acc.claimed, vgId, deduct);
            // pickedUp: PICKED_UP만
            if (isPickedUp) inc(acc.pickedUp, vgId, deduct);
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
