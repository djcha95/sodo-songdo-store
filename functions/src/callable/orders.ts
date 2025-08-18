// functions/src/callable/orders.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, QueryDocumentSnapshot, DocumentData, FieldValue } from "firebase-admin/firestore";
import type { Order, OrderItem, CartItem, UserDocument, Product, SalesRound, PointLog } from "../types.js";
import { getAuth } from "firebase-admin/auth";
import { POINT_POLICIES, calculateTier } from "../utils/helpers.js";

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
      throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
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

      for (const item of cartItems) {
        const product = productsMap.get(item.productId);
        const round = product?.salesHistory.find(r => r.roundId === item.roundId);
        const group = round?.variantGroups.find(vg => vg.id === item.variantGroupId);
        
        if (!product || !round || !group) {
            removedItemIds.push(item.id);
            isSufficient = false;
            continue;
        }
        
        const totalStock = group.totalPhysicalStock;
        const reservedQuantity = (group as any).reservedCount || 0;
        let availableStock = Infinity;
        if (totalStock !== null && totalStock !== -1) {
          availableStock = totalStock - reservedQuantity;
        }

        if (item.quantity > availableStock) {
          isSufficient = false;
          const stockDeductionAmount = item.stockDeductionAmount || 1;
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


// ✅✅✅ [완전 수정] submitOrder: 모든 상품을 개별 주문으로 생성하는 로직으로 변경 ✅✅✅
export const submitOrder = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "A login is required.");
    }

    const orderData = request.data as Omit<Order, 'id'>;
    const userId = request.auth.uid;
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1. 사용자 정보 확인
        const userRef = db.collection('users').withConverter(userConverter).doc(userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new HttpsError('not-found', 'User information not found.');
        }
        const userDoc = userSnap.data();
        if (!userDoc) {
          throw new HttpsError('internal', 'Failed to read user data.');
        }
        if (userDoc.loyaltyTier === '참여 제한') {
          throw new HttpsError('permission-denied', 'Your participation in group buys is currently restricted due to repeated promise violations.');
        }

        // 2. 재고 확인을 위한 예약 수량 집계
        const reservedQuantitiesMap = new Map<string, number>();
        const ordersQuery = db.collection('orders').withConverter(orderConverter).where('status', 'in', ['RESERVED', 'PREPAID']);
        const ordersSnapshot = await transaction.get(ordersQuery);
        ordersSnapshot.forEach(doc => {
          const order = doc.data();
          (order.items || []).forEach((item: OrderItem) => {
            const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
            reservedQuantitiesMap.set(key, (reservedQuantitiesMap.get(key) || 0) + item.quantity);
          });
        });

        // 3. 상품 정보 가져오기 및 재고 검증
        const productRefs = [...new Set(orderData.items.map(item => item.productId))].map(id => db.collection('products').withConverter(productConverter).doc(id));
        const productSnaps = await transaction.getAll(...productRefs);
        const productDataMap = new Map<string, Product>();
        for (const productSnap of productSnaps) {
          if (!productSnap.exists) throw new HttpsError('not-found', `Product not found (ID: ${productSnap.id}).`);
          productDataMap.set(productSnap.id, { ...productSnap.data(), id: productSnap.id } as Product);
        }
        
        for (const item of orderData.items) {
          const productData = productDataMap.get(item.productId);
          if (!productData) throw new HttpsError('internal', `Could not process product data: ${item.productId}`);
          
          const round = productData.salesHistory.find(r => r.roundId === item.roundId);
          if (!round) throw new HttpsError('not-found', `Sales round information not found.`);

          const variantGroup = round.variantGroups.find(vg => vg.id === item.variantGroupId);
          if (!variantGroup) throw new HttpsError('not-found', `Option group information not found.`);
          
          let availableStock = Infinity;
          if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
            const mapKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
            const reservedCount = reservedQuantitiesMap.get(mapKey) || 0;
            availableStock = variantGroup.totalPhysicalStock - reservedCount;
          }

          if (availableStock < item.quantity) {
            throw new HttpsError('resource-exhausted', `죄송합니다. ${productData.groupName} 상품의 재고가 부족합니다. (남은 수량: ${Math.max(0, availableStock)})`);
          }
        }
        
        // 4. [신규 로직] 그룹화 없이, 모든 아이템을 개별 주문으로 생성
        if (orderData.items.length === 0) {
            return { success: false, message: "주문할 상품이 없습니다." };
        }

        const createdOrderIds: string[] = [];
        const phoneLast4 = orderData.customerInfo.phone.slice(-4);

        for (const singleItem of orderData.items) {
            const newOrderRef = db.collection('orders').doc();
            
            // 이 주문의 픽업 날짜 정보를 해당 아이템에서 직접 가져옴
            const productForRound = productDataMap.get(singleItem.productId);
            const roundForOrder = productForRound?.salesHistory.find(r => r.roundId === singleItem.roundId);
            if (!roundForOrder?.pickupDate) {
              throw new HttpsError('invalid-argument', '상품의 픽업 날짜 정보가 설정되지 않았습니다.');
            }

            const newOrderData: Omit<Order, 'id'> = {
              userId: userId,
              customerInfo: { ...orderData.customerInfo, phoneLast4 },
              items: [singleItem as OrderItem], // ✅ 아이템 배열에 현재 아이템 하나만 넣음
              totalPrice: singleItem.unitPrice * singleItem.quantity, // ✅ 현재 아이템 가격으로만 계산
              orderNumber: `SODOMALL-${Date.now()}-${createdOrderIds.length}`, // 고유성을 위해 인덱스 추가
              status: 'RESERVED',
              createdAt: Timestamp.now(),
              pickupDate: roundForOrder.pickupDate, // ✅ 현재 아이템의 픽업 날짜
              pickupDeadlineDate: roundForOrder.pickupDeadlineDate ?? null,
              notes: orderData.notes ?? '',
              isBookmarked: false,
              wasPrepaymentRequired: orderData.wasPrepaymentRequired ?? false,
            };
          
            transaction.set(newOrderRef, newOrderData);
            createdOrderIds.push(newOrderRef.id);
        }
        
        return { success: true, orderIds: createdOrderIds };
      });
      return result;
    } catch (error) {
      logger.error("Order submission failed", error);
      if (error instanceof HttpsError) {
          throw error;
      }
      throw new HttpsError("internal", "An unknown error occurred while processing the order.");
    }
  }
);


export const cancelOrder = onCall(
    { region: "asia-northeast3", cors: allowedOrigins },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { orderId, treatAsNoShow = false } = request.data;
        if (!orderId || typeof orderId !== 'string') {
            throw new HttpsError("invalid-argument", "주문 ID가 올바르지 않습니다.");
        }
        
        const userId = request.auth.uid;
        
        try {
            await db.runTransaction(async (transaction) => {
                const orderRef = db.collection('orders').withConverter(orderConverter).doc(orderId);
                const orderDoc = await transaction.get(orderRef);
                
                if (!orderDoc.exists) {
                    throw new HttpsError("not-found", "주문 정보를 찾을 수 없습니다.");
                }

                const order = orderDoc.data();
                if (!order) {
                     throw new HttpsError("internal", "주문 데이터를 읽는 데 실패했습니다.");
                }
                
                const userClaims = (await getAuth().getUser(userId)).customClaims;
                const isAdmin = userClaims?.role === 'admin' || userClaims?.role === 'master';
                
                if (order.userId !== userId && !isAdmin) {
                    throw new HttpsError("permission-denied", "자신의 주문만 취소할 수 있습니다.");
                }
                
                if (order.status !== 'RESERVED' && order.status !== 'PREPAID') {
                    throw new HttpsError("failed-precondition", "예약 또는 선입금 완료 상태의 주문만 취소할 수 있습니다.");
                }
                
                transaction.update(orderRef, { 
                    status: 'CANCELED', 
                    canceledAt: Timestamp.now(),
                    notes: treatAsNoShow ? "[페널티] 2차 공구 기간 내 취소" : order.notes,
                });
                
                if (treatAsNoShow) {
                    const noShowPenalty = POINT_POLICIES.NO_SHOW;
                    const targetUserRef = db.collection('users').withConverter(userConverter).doc(order.userId);
                    const targetUserSnap = await transaction.get(targetUserRef);
                    
                    if (!targetUserSnap.exists) throw new HttpsError("not-found", "주문 대상 사용자의 정보를 찾을 수 없습니다.");
                    const targetUserData = targetUserSnap.data();
                    if (!targetUserData) throw new HttpsError("internal", "주문 대상 사용자 데이터를 읽는 데 실패했습니다.");

                    const oldTier = targetUserData.loyaltyTier || '공구새싹';
                    const newNoShowCount = (targetUserData.noShowCount || 0) + 1;
                    const newTier = calculateTier(targetUserData.pickupCount || 0, newNoShowCount);

                    const penaltyLog: Omit<PointLog, "id"> = {
                        amount: noShowPenalty.points,
                        reason: "2차 공구 기간 예약 취소 (노쇼 처리)",
                        createdAt: Timestamp.now(),
                        orderId: orderId,
                        expiresAt: null,
                    };
                    
                    transaction.update(targetUserRef, {
                        points: FieldValue.increment(noShowPenalty.points),
                        noShowCount: FieldValue.increment(1),
                        loyaltyTier: newTier,
                        pointHistory: FieldValue.arrayUnion(penaltyLog),
                    });
                    
                    if (oldTier !== newTier) {
                        logger.info(`User ${order.userId} tier changed from ${oldTier} to ${newTier} due to no-show penalty cancellation.`);
                    }
                }
            });
            
            logger.info(`Order ${orderId} canceled. Actor: ${userId}. Penalty applied: ${treatAsNoShow}`);
            return { success: true, message: "주문이 성공적으로 취소되었습니다." };

        } catch (error) {
            logger.error(`Error canceling order ${orderId} by actor ${userId}:`, error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError("internal", "주문 취소 중 오류가 발생했습니다.");
        }
    }
);


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
          startDate,
        } = request.data as {
          userId: string;
          pageSize?: number;
          lastVisible?: any;
          orderByField: 'createdAt' | 'pickupDate';
          orderDirection?: 'asc' | 'desc';
          startDate?: string;
        };

        const userClaims = (await getAuth().getUser(requesterId)).customClaims;
        const isAdmin = userClaims?.role === 'admin' || userClaims?.role === 'master';

        if (!isAdmin && requesterId !== targetUserId) {
            throw new HttpsError("permission-denied", "자신의 주문 내역만 조회할 수 있습니다.");
        }
    
        try {
          let queryBuilder = db.collection('orders').withConverter(orderConverter).where('userId', '==', targetUserId);
    
          if (orderByField === 'pickupDate') {
            if (startDate) {
              queryBuilder = queryBuilder.where('pickupDate', '>=', new Date(startDate));
            }
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


/**
 * =================================================================
 * ✅ [신규 추가] 기존 묶음 주문 분할 함수: splitBundledOrder
 * =================================================================
 * @description 관리자가 기존에 여러 상품이 묶여있는 주문 ID를 받아,
 * 각 상품을 개별적인 주문으로 분할하고 원본 주문은 보관 처리합니다.
 */
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
        // 1. 원본 주문의 각 아이템을 개별 주문으로 생성
        for (let i = 0; i < originalOrder.items.length; i++) {
          const item = originalOrder.items[i];
          const newOrderRef = db.collection("orders").doc();
          
          const newOrderData: Omit<Order, 'id'> = {
            ...originalOrder,
            items: [item], // ✅ 아이템 하나만 포함
            totalPrice: item.unitPrice * item.quantity, // ✅ 해당 아이템 가격으로 재계산
            orderNumber: `${originalOrder.orderNumber}-S${i + 1}`, // ✅ 분할된 주문 번호
            createdAt: Timestamp.now(), // ✅ 생성 시점을 현재로
            splitFrom: orderId, // ✅ 원본 주문 ID 기록
            notes: `[분할된 주문] 원본: ${originalOrder.orderNumber}`,
          };
          
          // 원본에만 있던 필드들 제거 (새로 생성되는 개별 주문에는 필요 없는 필드)
          delete (newOrderData as any).pickedUpAt;
          delete (newOrderData as any).prepaidAt;
          delete (newOrderData as any).canceledAt;

          transaction.set(newOrderRef, newOrderData);
          newOrderIds.push(newOrderRef.id);
        }

        // 2. 원본 주문은 CANCELED 상태로 변경하여 보관
        transaction.update(originalOrderRef, {
          status: 'CANCELED',
          canceledAt: Timestamp.now(),
          notes: `[주문 분할 완료] ${newOrderIds.length}개의 개별 주문(${newOrderIds.join(', ')})으로 분할되었습니다.`,
        });
      });

      // 트랜잭션 성공 후 로깅
      const originalOrderAfterTransaction = (await originalOrderRef.get()).data() as Order | undefined; // 트랜잭션 후 원본 주문 다시 가져오기
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