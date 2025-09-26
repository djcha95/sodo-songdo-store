// functions/src/callable/orders.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, QueryDocumentSnapshot, DocumentData, FieldValue } from "firebase-admin/firestore";
// ✅ [수정] OrderStatus 타입을 import 목록에 추가합니다.
import type { Order, OrderStatus, OrderItem, CartItem, UserDocument, Product, SalesRound, PointLog, CustomerInfo } from "../types.js";
import { getAuth } from "firebase-admin/auth";
import type { LoyaltyTier } from "../types.js";

const POINT_POLICIES = {
  LATE_CANCEL_PENALTY: { points: -50, reason: '마감 임박 취소 (0.5 노쇼)' },
  // ✅ [추가] 부분 픽업 페널티 정책 추가
  PARTIAL_PICKUP_PENALTY: { points: -50, reason: '부분 픽업 (0.5 노쇼)' },
} as const;


const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
    // [수정] 등급 계산 로직을 프론트엔드(loyaltyUtils.ts)와 일치시킴
    const totalTransactions = pickupCount + noShowCount;

    if (noShowCount >= 3) {
        return '참여 제한';
    }

    if (totalTransactions === 0) {
        return '공구새싹';
    }

    const pickupRate = (pickupCount / totalTransactions) * 100;

    if (pickupRate >= 98 && pickupCount >= 250) {
        return '공구의 신';
    }
    if (pickupRate >= 95 && pickupCount >= 100) {
        return '공구왕';
    }
    if (pickupRate >= 90 && pickupCount >= 30) {
        return '공구요정';
    }
    
    if (pickupRate < 70) {
        return '주의 요망';
    }

    return '공구새싹';
};


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
      const productIds = [...new Set(cartItems.map(item => item.productId))];
      const productSnapshots = await Promise.all(
        productIds.map(id => db.collection("products").withConverter(productConverter).doc(id).get())
      );
      const productsMap = new Map<string, Product>();
      
      productSnapshots.forEach(snap => {
        if (snap.exists) {
            productsMap.set(snap.id, { ...snap.data(), id: snap.id } as Product);
        }
      });
      
      const updatedItems: { id: string; newQuantity: number }[] = [];
      const removedItemIds: string[] = [];
      let isSufficient = true;

      const reservedQuantitiesMap = new Map<string, number>();
      const ordersQuery = db.collection('orders').withConverter(orderConverter).where('status', 'in', ['RESERVED', 'PREPAID']);
      const ordersSnapshot = await ordersQuery.get();
      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        (order.items || []).forEach((item: OrderItem) => {
          const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          const actualDeduction = item.quantity * (item.stockDeductionAmount || 1);
          reservedQuantitiesMap.set(key, (reservedQuantitiesMap.get(key) || 0) + actualDeduction);
        });
      });

for (const item of cartItems) {
  const product = productsMap.get(item.productId);
  if (!product) {
    removedItemIds.push(item.id);
    isSufficient = false;
    continue;
  }

  const round = product.salesHistory.find(r => r.roundId === item.roundId);
  if (!round) {
    removedItemIds.push(item.id);
    isSufficient = false;
    continue;
  }

  const group = round.variantGroups.find(vg => vg.id === item.variantGroupId);
  if (!group) {
    removedItemIds.push(item.id);
    isSufficient = false;
    continue;
  }

  const totalStock = group.totalPhysicalStock;
  const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
  const reservedQuantity = reservedQuantitiesMap.get(key) || 0;

  let availableStock = Infinity;
  if (totalStock !== null && totalStock !== -1) {
    availableStock = totalStock - reservedQuantity;
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
    if (!request.auth) {
      // ✅ [수정] HpsError -> HttpsError 오타 수정
      throw new HttpsError("unauthenticated", "A login is required.");
    }

    const userId = request.auth.uid;
    const client = request.data as {
      items: OrderItem[];
      totalPrice: number;
      customerInfo: CustomerInfo;
      pickupDate?: FirebaseFirestore.Timestamp | null;
      wasPrepaymentRequired?: boolean;
      notes?: string;
    };

    if (!Array.isArray(client.items) || client.items.length === 0) {
      throw new HttpsError("invalid-argument", "주문할 상품이 없습니다.");
    }

    try {
      const result = await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").withConverter(userConverter).doc(userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new HttpsError('not-found', 'User information not found.');
        }

        const productIds = [...new Set(client.items.map(i => i.productId))];
        const productSnaps = await Promise.all(
          productIds.map(id => db.collection("products").withConverter(productConverter).doc(id).get())
        );
        const productDataMap = new Map<string, Product>();
        for (const s of productSnaps) {
          if (!s.exists) throw new HttpsError("not-found", `Product not found (ID: ${s.id}).`);
          productDataMap.set(s.id, { ...s.data(), id: s.id } as Product);
        }

        const reservedMap = new Map<string, number>();
        const ordersQuery = db.collection("orders")
          .withConverter(orderConverter)
          .where("status", "in", ["RESERVED", "PREPAID"]);
        const ordersSnap = await transaction.get(ordersQuery);
        ordersSnap.forEach(doc => {
          const order = doc.data();
          for (const it of (order.items || [])) {
            const key = `${it.productId}-${it.roundId}-${it.variantGroupId}`;
            const deduct = it.quantity * (it.stockDeductionAmount || 1);
            reservedMap.set(key, (reservedMap.get(key) || 0) + deduct);
          }
        });

        const txRequestMap = new Map<string, number>();
        for (const item of client.items) {
          const product = productDataMap.get(item.productId);
          if (!product) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
          const round = product.salesHistory.find(r => r.roundId === item.roundId);
          if (!round) throw new HttpsError("not-found", "판매 회차 정보를 찾을 수 없습니다.");

          // ✅ [수정] 하위 호환성 로직 추가
          // ID로 옵션을 찾되, 실패하면 옵션이 1개뿐인지 확인하고 그걸로 대체
          const vg = round.variantGroups.find(v => v.id === item.variantGroupId) ||
                     (round.variantGroups.length === 1 ? round.variantGroups[0] : undefined);
          
          if (!vg) throw new HttpsError("not-found", "옵션 그룹 정보를 찾을 수 없습니다.");
          
          const required = item.quantity * (item.stockDeductionAmount || 1);
          // variantGroupId가 없는 옛날 상품의 경우, 식별을 위해 productId와 roundId만 사용
          const key = `${item.productId}-${item.roundId}-${vg.id || 'default'}`;

          txRequestMap.set(key, (txRequestMap.get(key) || 0) + required);

          if (vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
            const alreadyReserved = reservedMap.get(key) || 0;
            const after = alreadyReserved + (txRequestMap.get(key) || 0);
            if (after > vg.totalPhysicalStock) {
              const remain = Math.max(0, vg.totalPhysicalStock - alreadyReserved);
              throw new HttpsError("failed-precondition", `재고 부족: ${product.groupName} - ${vg.groupName} (가능 수량: ${remain})`);
            }
          }
        }

        const createdOrderIds: string[] = [];
        const phoneLast4 = (client.customerInfo?.phone || "").slice(-4);

        for (const single of client.items) {
          // ✅ [수정] product가 undefined일 가능성에 대한 타입스크립트 오류를 해결합니다.
          const product = productDataMap.get(single.productId);
          
          // 이전 반복문에서 이미 검증되었지만, 타입 안전성을 위해 한번 더 확인합니다.
          if (!product) {
            // 이 오류는 이론적으로 발생해서는 안 되지만, 안정성을 위해 추가합니다.
            throw new HttpsError("internal", `주문 처리 중 오류 발생: 상품 정보를 찾을 수 없습니다 (ID: ${single.productId})`);
          }

          const round = product.salesHistory.find(r => r.roundId === single.roundId)!;
          if (!round?.pickupDate) {
            throw new HttpsError("invalid-argument", "상품의 픽업 날짜가 설정되지 않았습니다.");
          }

          const newOrderRef = db.collection("orders").doc();
          const newOrder: Omit<Order, "id"> = {
            userId,
            customerInfo: { ...client.customerInfo, phoneLast4 },
            items: [single],
            totalPrice: single.unitPrice * single.quantity,
            orderNumber: `SODOMALL-${Date.now()}-${createdOrderIds.length}`,
            status: "RESERVED",
            createdAt: Timestamp.now(),
            pickupDate: round.pickupDate,
            pickupDeadlineDate: round.pickupDeadlineDate ?? null,
            notes: client.notes ?? "",
            isBookmarked: false,
            wasPrepaymentRequired: !!client.wasPrepaymentRequired,
          };

          transaction.set(newOrderRef, newOrder);
          createdOrderIds.push(newOrderRef.id);
        }

        return { success: true, orderIds: createdOrderIds };
      });

      return result;
    } catch (err) {
      logger.error("Order submission failed", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "주문 처리 중 알 수 없는 오류가 발생했습니다.");
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

    if (!orderId || typeof newQuantity !== 'number' || newQuantity <= 0) {
      throw new HttpsError("invalid-argument", "필수 정보(주문 ID, 새 수량)가 올바르지 않습니다.");
    }

    try {
      await db.runTransaction(async (transaction) => {
        // 1. 주문 정보 조회 및 유효성 검사
        const orderRef = db.collection('orders').withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");
        
        const order = orderDoc.data();
        if(!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");
        if (order.userId !== requesterId) throw new HttpsError("permission-denied", "자신의 주문만 수정할 수 있습니다.");
        if (order.status !== 'RESERVED' && order.status !== 'PREPAID') throw new HttpsError("failed-precondition", "예약 또는 선입금 완료 상태의 주문만 수정 가능합니다.");
        if (order.items.length !== 1) throw new HttpsError("failed-precondition", "단일 품목 주문만 수량 변경이 가능합니다.");

        const originalItem = order.items[0];
        const originalQuantity = originalItem.quantity;
        if (newQuantity === originalQuantity) return; // 변경사항 없음

        // 2. 상품 및 재고 정보 조회
        const productRef = db.collection("products").withConverter(productConverter).doc(originalItem.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) throw new HttpsError("not-found", "관련 상품 정보를 찾을 수 없습니다.");

        // ✅ [수정] product가 undefined일 가능성을 명시적으로 확인하여 오류를 해결합니다.
        const product = productSnap.data();
        if (!product) {
          throw new HttpsError("internal", `상품 데이터를 읽는 데 실패했습니다 (ID: ${originalItem.productId}).`);
        }

        const round = product.salesHistory.find(r => r.roundId === originalItem.roundId);
        const vg = round?.variantGroups.find(v => v.id === originalItem.variantGroupId);
        if (!round || !vg) throw new HttpsError("not-found", "상품 옵션 정보를 찾을 수 없습니다.");

        // 3. 재고 확인 (가장 중요)
        if (vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
            // 현재 예약된 총 재고량을 계산
            const ordersQuery = db.collection('orders').where('status', 'in', ['RESERVED', 'PREPAID']);
            const ordersSnapshot = await transaction.get(ordersQuery);
            let currentReservedStock = 0;
            ordersSnapshot.forEach(doc => {
                const o = doc.data() as Order;
                o.items.forEach(i => {
                    if (i.productId === originalItem.productId && i.roundId === originalItem.roundId && i.variantGroupId === originalItem.variantGroupId) {
                        currentReservedStock += i.quantity * (i.stockDeductionAmount || 1);
                    }
                });
            });
            
            // 이 주문을 제외한 예약량 계산 (현재 주문은 변경될 것이므로)
            const reservedStockExcludingThisOrder = currentReservedStock - (originalQuantity * (originalItem.stockDeductionAmount || 1));
            const requiredStockForNewQuantity = newQuantity * (originalItem.stockDeductionAmount || 1);

            if (vg.totalPhysicalStock < reservedStockExcludingThisOrder + requiredStockForNewQuantity) {
                const availableForThisOrder = vg.totalPhysicalStock - reservedStockExcludingThisOrder;
                const maxPurchasable = Math.floor(availableForThisOrder / (originalItem.stockDeductionAmount || 1));
                throw new HttpsError('resource-exhausted', `재고가 부족합니다. 최대 ${maxPurchasable}개까지 변경 가능합니다.`);
            }
        }
        
        // 4. 주문 정보 업데이트
        const updatedItem = { ...originalItem, quantity: newQuantity };
        const newTotalPrice = originalItem.unitPrice * newQuantity;
        const note = `[수량 변경] 사용자가 직접 수량을 ${originalQuantity}개에서 ${newQuantity}개로 변경.`;
        
        transaction.update(orderRef, {
            items: [updatedItem],
            totalPrice: newTotalPrice,
            notes: order.notes ? `${order.notes}\n${note}` : note,
        });
      });
      
      logger.info(`Order ${orderId} quantity updated to ${newQuantity} by user ${requesterId}.`);
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
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { orderId, penaltyType = 'none' } = request.data as { orderId: string; penaltyType: 'none' | 'late' };
        if (!orderId || typeof orderId !== 'string') {
            throw new HttpsError("invalid-argument", "주문 ID가 올바르지 않습니다.");
        }
        
        const requesterId = request.auth.uid;
        
        try {
            // ✅ [수정] 사용하지 않는 updatedUser 변수 제거
            const { message } = await db.runTransaction(async (transaction) => {
                const orderRef = db.collection('orders').withConverter(orderConverter).doc(orderId);
                const orderDoc = await transaction.get(orderRef);
                
                if (!orderDoc.exists) {
                    throw new HttpsError("not-found", "주문 정보를 찾을 수 없습니다.");
                }
                const order = orderDoc.data();
                if (!order) {
                     throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");
                }

                const userRef = db.collection('users').withConverter(userConverter).doc(order.userId);
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists) {
                    throw new HttpsError("not-found", "주문 대상 사용자의 정보를 찾을 수 없습니다.");
                }

                const userClaims = (await getAuth().getUser(requesterId)).customClaims;
                const isAdmin = userClaims?.role === 'admin' || userClaims?.role === 'master';
                
                if (order.userId !== requesterId && !isAdmin) {
                    throw new HttpsError("permission-denied", "자신의 주문만 취소할 수 있습니다.");
                }
                
                if (order.status !== 'RESERVED' && order.status !== 'PREPAID') {
                    throw new HttpsError("failed-precondition", "예약 또는 선입금 완료 상태의 주문만 취소할 수 있습니다.");
                }

                const userData = userSnap.data();
                if(!userData) {
                    throw new HttpsError("internal", "사용자 데이터를 읽는 데 실패했습니다.");
                }

                let userUpdateData: any = {};
                let finalMessage = "주문이 성공적으로 취소되었습니다.";

                if (penaltyType === 'late') {
                    const penalty = POINT_POLICIES.LATE_CANCEL_PENALTY;
                    const oldTier = userData.loyaltyTier || '공구새싹';
                    const newNoShowCount = (userData.noShowCount || 0) + 0.5;
                    const newTier = calculateTier(userData.pickupCount || 0, newNoShowCount);

                    const penaltyLog: Omit<PointLog, "id"> = {
                        amount: penalty.points,
                        reason: penalty.reason,
                        createdAt: Timestamp.now(),
                        orderId: orderId,
                        expiresAt: null,
                    };
                    
                    userUpdateData = {
                        points: FieldValue.increment(penalty.points),
                        noShowCount: newNoShowCount,
                        loyaltyTier: newTier,
                        pointHistory: FieldValue.arrayUnion(penaltyLog),
                    };
                    transaction.update(userRef, userUpdateData);
                    finalMessage = "주문이 취소되고 0.5 노쇼 페널티가 적용되었습니다.";
                    
                    if (oldTier !== newTier) {
                        logger.info(`User ${order.userId} tier changed from ${oldTier} to ${newTier} due to late cancellation penalty.`);
                    }
                }

                transaction.update(orderRef, { 
                    status: penaltyType === 'late' ? 'LATE_CANCELED' : 'CANCELED', 
                    canceledAt: Timestamp.now(),
                    notes: order.notes ? `${order.notes}\n[취소] ${finalMessage}` : `[취소] ${finalMessage}`
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


// ... (파일의 나머지 부분은 변경 없음)
export const getUserOrders = onCall(
    { region: "asia-northeast3", cors: allowedOrigins },
    async (request) => {
        const requesterId = request.auth?.uid;
        if (!requesterId) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const {
          userId: targetUserId,
          pageSize = 10,
          lastVisible: lastVisibleDocData,
          orderByField,
          orderDirection = 'desc',
          filterStatuses,
        } = request.data as {
          userId: string;
          pageSize?: number;
          lastVisible?: any;
          orderByField: 'createdAt' | 'pickupDate';
          orderDirection?: 'asc' | 'desc';
          filterStatuses?: OrderStatus[];
        };

        const userClaims = (await getAuth().getUser(requesterId)).customClaims;
        const isAdmin = userClaims?.role === 'admin' || userClaims?.role === 'master';

        if (!isAdmin && requesterId !== targetUserId) {
            throw new HttpsError("permission-denied", "자신의 주문 내역만 조회할 수 있습니다.");
        }
    
        try {
          // ✅ [수정] 문제를 일으켰던 isArchived 필터를 제거합니다.
          let queryBuilder = db.collection('orders')
            .withConverter(orderConverter)
            .where('userId', '==', targetUserId);
            // .where('isArchived', '!=', true); // 👈 이 줄을 삭제했습니다!
          
          if (Array.isArray(filterStatuses) && filterStatuses.length > 0) {
            queryBuilder = queryBuilder.where('status', 'in', filterStatuses);
          }
    
          if (orderByField === 'pickupDate') {
            queryBuilder = queryBuilder.orderBy('pickupDate', orderDirection);
          } else {
            queryBuilder = queryBuilder.orderBy('createdAt', orderDirection);
          }
          
          queryBuilder = queryBuilder.limit(pageSize);
    
          if (lastVisibleDocData) {
            const cursorFieldData = lastVisibleDocData[orderByField];
            
            if (cursorFieldData) {
                let cursorValue;
                if (typeof cursorFieldData === 'object' && cursorFieldData !== null && cursorFieldData.hasOwnProperty('_seconds')) {
                     cursorValue = new Timestamp(cursorFieldData._seconds, cursorFieldData._nanoseconds);
                } else {
                     cursorValue = cursorFieldData;
                }
                queryBuilder = queryBuilder.startAfter(cursorValue);
            }
          }
    
          const snapshot = await queryBuilder.get();
          const orders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          
          const lastDocSnapshot = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
          const lastDocPayload = lastDocSnapshot ? { ...lastDocSnapshot.data(), id: lastDocSnapshot.id } : null;
    
          return { data: orders, lastDoc: lastDocPayload };
    
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
                  const timeA = a.createdAt as Timestamp;
                  const timeB = b.createdAt as Timestamp;
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
    if (userRole !== 'admin' && userRole !== 'master') {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    
    const { orderId } = request.data;
    if (!orderId || typeof orderId !== 'string') {
      throw new HttpsError("invalid-argument", "분할할 주문의 ID가 필요합니다.");
    }

    const originalOrderRef = db.collection("orders").doc(orderId);

    try {
      await db.runTransaction(async (transaction) => {
        const originalOrderSnap = await transaction.get(originalOrderRef);

        if (!originalOrderSnap.exists) {
          throw new HttpsError("not-found", "분할할 원본 주문을 찾을 수 없습니다.");
        }

        const originalOrder = originalOrderSnap.data() as Order;

        if (!Array.isArray(originalOrder.items) || originalOrder.items.length <= 1) {
          throw new HttpsError("failed-precondition", "분할할 상품이 2개 이상인 주문만 처리할 수 있습니다.");
        }

        const newOrderIds: string[] = [];
        for (let i = 0; i < originalOrder.items.length; i++) {
          const item = originalOrder.items[i];
          const newOrderRef = db.collection("orders").doc();
          
          const newOrderData: Omit<Order, 'id'> = {
            ...originalOrder,
            items: [item],
            totalPrice: item.unitPrice * item.quantity,
            orderNumber: `${originalOrder.orderNumber}-S${i + 1}`,
            createdAt: Timestamp.now(),
            splitFrom: orderId,
            notes: `[분할된 주문] 원본: ${originalOrder.orderNumber}`,
          };
          
          delete (newOrderData as any).pickedUpAt;
          delete (newOrderData as any).prepaidAt;
          delete (newOrderData as any).canceledAt;

          transaction.set(newOrderRef, newOrderData);
          newOrderIds.push(newOrderRef.id);
        }

        transaction.update(originalOrderRef, {
          status: 'CANCELED',
          canceledAt: Timestamp.now(),
          notes: `[주문 분할 완료] ${newOrderIds.length}개의 개별 주문(${newOrderIds.join(', ')})으로 분할되었습니다.`,
        });
      });

      const originalOrderAfterTransaction = (await originalOrderRef.get()).data() as Order | undefined;
      logger.info(`Order ${orderId} was split into ${originalOrderAfterTransaction?.items.length || 'N/A'} new orders by admin ${uid}.`);
      return { success: true, message: "주문이 성공적으로 분할되었습니다." };
      
    } catch (error) {
      logger.error(`Failed to split order ${orderId}:`, error);
      if (error instanceof HttpsError) {
        throw error;
      }
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
        
        // ✅ [재수정] .data()의 결과가 undefined일 가능성을 명시적으로 확인하여 오류를 해결합니다.
        const productData = productSnap.data();
        if (!productData) {
          throw new HttpsError('internal', `상품 데이터를 읽는 데 실패했습니다 (ID: ${item.productId}).`);
        }
        
        const round = (productData.salesHistory || []).find(r => r.roundId === item.roundId);
        const variantGroup = round?.variantGroups.find(vg => vg.id === item.variantGroupId);
        if (!round || !variantGroup) throw new HttpsError('not-found', '상품 옵션 정보를 찾을 수 없습니다.');
        
        if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
            const ordersQuery = db.collection('orders').where('status', 'in', ['RESERVED', 'PREPAID']);
            const ordersSnapshot = await transaction.get(ordersQuery);

            let currentReservedStock = 0;
            ordersSnapshot.forEach(doc => {
                const order = doc.data() as Order;
                order.items.forEach(orderItem => {
                    if (orderItem.variantGroupId === item.variantGroupId) {
                        currentReservedStock += orderItem.quantity * (orderItem.stockDeductionAmount || 1);
                    }
                });
            });

            const requiredStock = item.quantity * (item.stockDeductionAmount || 1);
            if (variantGroup.totalPhysicalStock < currentReservedStock + requiredStock) {
                const availableStock = variantGroup.totalPhysicalStock - currentReservedStock;
                throw new HttpsError('resource-exhausted', `상품 재고가 부족합니다. (남은 수량: ${Math.max(0, availableStock)})`);
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
            createdAt: Timestamp.now(),
            pickupDate: round.pickupDate,
            pickupDeadlineDate: round.pickupDeadlineDate ?? null,
            notes: `관리자가 생성한 주문입니다.`,
            isBookmarked: false,
            wasPrepaymentRequired: round.isPrepaymentRequired ?? false,
        };

        transaction.set(newOrderRef, newOrderData);
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

// ✅ [신규 추가] 부분 픽업 처리 함수 (관리자용)
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
          createdAt: Timestamp.now(),
          orderId: orderId,
          expiresAt: null,
        };

        const userUpdateData: any = {
          noShowCount: newNoShowCount,
          points: FieldValue.increment(pointChange),
          pointHistory: FieldValue.arrayUnion(penaltyLog),
        };
        if (oldTier !== newTier) userUpdateData.loyaltyTier = newTier;

        transaction.update(userRef, userUpdateData);
        transaction.update(orderRef, {
          status: 'PICKED_UP',
          items: [updatedItem],
          totalPrice: newTotalPrice,
          pickedUpAt: Timestamp.now(),
          notes: order.notes ? `${order.notes}\n${note}` : note,
        });
      });
      
      return { success: true, message: "부분 픽업 및 페널티가 적용되었습니다." };

    } catch (error) {
      logger.error(`Error processing partial pickup for order ${orderId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "부분 픽업 처리 중 오류가 발생했습니다.");
    }
  }
);


// ✅ [신규 추가] 취소된 주문을 포함하여 확정된 주문을 되돌리는 함수
export const revertFinalizedOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    if (!request.auth?.token.role || !['admin', 'master'].includes(request.auth.token.role)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { orderId, originalStatus } = request.data as { orderId: string; originalStatus: OrderStatus };
    if (!orderId || !originalStatus) {
      throw new HttpsError("invalid-argument", "필수 정보(주문 ID, 원래 상태)가 누락되었습니다.");
    }

    try {
      await db.runTransaction(async (transaction) => {
        const orderRef = db.collection('orders').withConverter(orderConverter).doc(orderId);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) throw new HttpsError("not-found", "주문을 찾을 수 없습니다.");
        
        const order = orderDoc.data();
        if(!order) throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");

        const userRef = db.collection('users').withConverter(userConverter).doc(order.userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        
        const userData = userSnap.data();
        if(!userData) throw new HttpsError("internal", "사용자 데이터를 읽는 데 실패했습니다.");

        const userUpdateData: any = {};
        
        // 페널티가 있었던 취소('LATE_CANCELED')를 되돌릴 경우, 노쇼와 포인트를 복구
        if (originalStatus === 'LATE_CANCELED') {
          const newNoShowCount = Math.max(0, (userData.noShowCount || 0) - 0.5);
          const oldTier = userData.loyaltyTier;
          const newTier = calculateTier(userData.pickupCount || 0, newNoShowCount);

          userUpdateData.noShowCount = newNoShowCount;
          userUpdateData.points = FieldValue.increment(POINT_POLICIES.LATE_CANCEL_PENALTY.points * -1); // 50점 복구
          if (oldTier !== newTier) {
            userUpdateData.loyaltyTier = newTier;
          }
        }
        
        // PICKED_UP, NO_SHOW 되돌리기는 onUpdate 트리거에서 처리하므로 여기서는 상태만 변경
        // 일반 CANCELED 되돌리기는 사용자 통계 변경이 없으므로 상태만 변경
        
        // 사용자 정보 업데이트가 필요한 경우에만 트랜잭션에 추가
        if (Object.keys(userUpdateData).length > 0) {
          transaction.update(userRef, userUpdateData);
        }

        // 주문 상태를 'RESERVED'로 되돌리고 관련 타임스탬프 필드 제거
        transaction.update(orderRef, {
          status: 'RESERVED',
          canceledAt: FieldValue.delete(),
          pickedUpAt: FieldValue.delete(), // [추가] 픽업 시간도 삭제
          notes: order.notes ? `${order.notes}\n[상태 복구] 관리자에 의해 예약 상태로 되돌려졌습니다.` : '[상태 복구] 관리자에 의해 예약 상태로 되돌려졌습니다.',
        });
      });

      return { success: true, message: "주문이 예약 상태로 복구되었습니다." };

    } catch (error) {
      logger.error(`Error reverting order ${orderId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "주문 복구 중 오류가 발생했습니다.");
    }
  }
);

/**
 * =================================================================
 * 관리자 수동 노쇼 처리: markOrderAsNoShow (✅ 신규 추가)
 * =================================================================
 */
export const markOrderAsNoShow = onCall(
  {
    region: "asia-northeast3",
  },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { orderId } = request.data;
    if (!orderId) {
      throw new HttpsError("invalid-argument", "주문 ID가 필요합니다.");
    }

    const orderRef = db.collection("orders").doc(orderId);

    try {
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        throw new HttpsError("not-found", "해당 주문을 찾을 수 없습니다.");
      }

      const order = orderSnap.data() as Order;
      const unchangeableStatuses: Array<typeof order.status> = ["PICKED_UP", "CANCELED", "LATE_CANCELED", "NO_SHOW"];

      if (unchangeableStatuses.includes(order.status)) {
        throw new HttpsError("failed-precondition", `이미 '${order.status}' 상태인 주문은 변경할 수 없습니다.`);
      }

      await orderRef.update({ status: "NO_SHOW" });
      
      logger.info(`Admin ${request.auth?.uid} marked order ${orderId} as NO_SHOW.`);
      return { success: true, message: "주문이 '노쇼' 처리되었습니다." };

    } catch (error) {
      logger.error(`Error marking order ${orderId} as NO_SHOW:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "노쇼 처리 중 오류가 발생했습니다.");
    }
  }
);