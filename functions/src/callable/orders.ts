// functions/src/callable/orders.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
// ✅ [수정] FieldValue 추가 및 타입 import 경로 확인
import { Timestamp, QueryDocumentSnapshot, DocumentData, FieldValue } from "firebase-admin/firestore";
import type { Order, OrderItem, CartItem, UserDocument, Product, SalesRound, PointLog } from "../types.js";
import { getAuth } from "firebase-admin/auth";
// ✅ [수정] helpers.ts에서 포인트 정책과 등급 계산 함수를 가져옵니다.
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


export const submitOrder = onCall(
    { region: "asia-northeast3", cors: allowedOrigins },
    async (request) => {
        if (!request.auth) {
          throw new HttpsError("unauthenticated", "A login is required.");
        }
    
        const orderData = request.data as Omit<Order, 'id'>;
        const userId = request.auth.uid;
        
        try {
          const result = await db.runTransaction(async (transaction) => {
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
    
            const productRefs = [...new Set(orderData.items.map(item => item.productId))].map(id => db.collection('products').withConverter(productConverter).doc(id));
            const productSnaps = await transaction.getAll(...productRefs);
            const productDataMap = new Map<string, Product>();
            for (const productSnap of productSnaps) {
                if (!productSnap.exists) throw new HttpsError('not-found', `Product not found (ID: ${productSnap.id}).`);
                productDataMap.set(productSnap.id, { ...productSnap.data(), id: productSnap.id } as Product);
            }
            
            const itemsToReserve: OrderItem[] = [];
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
                  throw new HttpsError('resource-exhausted', `Sorry, the product ${productData.groupName} is out of stock. (Remaining quantity: ${Math.max(0, availableStock)})`);
              }
                
              itemsToReserve.push({ ...item });
            }
            
            if (itemsToReserve.length > 0) {
                const newOrderRef = db.collection('orders').doc();
                const originalTotalPrice = itemsToReserve.reduce((total, i) => total + (i.unitPrice * i.quantity), 0);
                
                const phoneLast4 = orderData.customerInfo.phone.slice(-4);
                const firstItem = orderData.items[0];
                const productForRound = productDataMap.get(firstItem.productId);
                const roundForOrder = productForRound?.salesHistory.find(r => r.roundId === firstItem.roundId);
                
                if (!roundForOrder?.pickupDate) {
                  throw new HttpsError('invalid-argument', 'Pickup date information for the ordered product is not set.');
                }
    
                const newOrderData: Omit<Order, 'id'> = {
                  userId: userId,
                  customerInfo: { ...orderData.customerInfo, phoneLast4 },
                  items: itemsToReserve,
                  totalPrice: originalTotalPrice,
                  orderNumber: `SODOMALL-${Date.now()}`,
                  status: 'RESERVED',
                  createdAt: Timestamp.fromDate(new Date()),
                  pickupDate: roundForOrder.pickupDate,
                  pickupDeadlineDate: roundForOrder.pickupDeadlineDate ?? null,
                  notes: orderData.notes ?? '',
                  isBookmarked: false,
                  wasPrepaymentRequired: orderData.wasPrepaymentRequired ?? false,
                };
              
                transaction.set(newOrderRef, newOrderData);
                return { success: true, orderId: newOrderRef.id };
            }
            return { success: false, message: "There are no items to order." };
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

// ✅✅✅ [수정됨] cancelOrder 함수 로직 전체 수정 ✅✅✅
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
        const orderRef = db.collection('orders').withConverter(orderConverter).doc(orderId);
        const userRef = db.collection('users').withConverter(userConverter).doc(userId);

        try {
            await db.runTransaction(async (transaction) => {
                const orderDoc = await transaction.get(orderRef);
                const userDoc = await transaction.get(userRef);

                if (!orderDoc.exists) {
                    throw new HttpsError("not-found", "주문 정보를 찾을 수 없습니다.");
                }
                if (!userDoc.exists) {
                    throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
                }

                const order = orderDoc.data();
                const userData = userDoc.data();
                if (!order || !userData) {
                     throw new HttpsError("internal", "주문 또는 사용자 데이터를 읽는 데 실패했습니다.");
                }

                if (order.userId !== userId) {
                    throw new HttpsError("permission-denied", "자신의 주문만 취소할 수 있습니다.");
                }
                
                if (order.status !== 'RESERVED' && order.status !== 'PREPAID') {
                    throw new HttpsError("failed-precondition", "예약 또는 선입금 완료 상태의 주문만 취소할 수 있습니다.");
                }
                
                // 1. 주문 상태 업데이트
                transaction.update(orderRef, { 
                    status: 'CANCELED', 
                    canceledAt: Timestamp.now(),
                    // ✅ 노쇼 처리 시 사유를 명확히 기록
                    notes: treatAsNoShow ? "[페널티] 2차 공구 기간 내 취소" : order.notes,
                });
                
                // 2. '노쇼로 처리' 옵션이 true일 경우 페널티 적용
                if (treatAsNoShow) {
                    const noShowPenalty = POINT_POLICIES.NO_SHOW;
                    
                    const oldTier = userData.loyaltyTier || '공구새싹';
                    const currentPoints = userData.points || 0;
                    const currentNoShowCount = userData.noShowCount || 0;
                    const currentPickupCount = userData.pickupCount || 0;

                    const newPoints = currentPoints + noShowPenalty.points;
                    const newNoShowCount = currentNoShowCount + 1;

                    // 노쇼 카운트가 변경되었으므로 신뢰 등급을 다시 계산
                    const newTier = calculateTier(currentPickupCount, newNoShowCount);

                    const penaltyLog: Omit<PointLog, "id"> = {
                        amount: noShowPenalty.points,
                        reason: "2차 공구 기간 예약 취소 (노쇼 처리)", // 사유를 더 명확하게
                        createdAt: Timestamp.now(),
                        orderId: orderId,
                        expiresAt: null, // 페널티는 소멸되지 않음
                    };
                    
                    const userUpdateData = {
                        points: newPoints,
                        noShowCount: newNoShowCount,
                        loyaltyTier: newTier,
                        pointHistory: FieldValue.arrayUnion(penaltyLog),
                    };
                    
                    transaction.update(userRef, userUpdateData);
                    
                    if (oldTier !== newTier) {
                        logger.info(`User ${userId} tier changed from ${oldTier} to ${newTier} due to no-show penalty cancellation.`);
                        // TODO: 등급 변동 알림 생성 로직 추가
                    }
                }
            });
            
            logger.info(`User ${userId} canceled order ${orderId}. Penalty applied: ${treatAsNoShow}`);
            return { success: true, message: "주문이 성공적으로 취소되었습니다." };

        } catch (error) {
            logger.error(`Error canceling order ${orderId} for user ${userId}:`, error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError("internal", "주문 취소 중 오류가 발생했습니다.");
        }
    }
);


export const getUserOrders = onCall(
    { region: "asia-northeast3", cors: allowedOrigins },
    async (request) => {
        if (!request.auth) {
          throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        const userId = request.auth.uid;
        const {
          pageSize = 10,
          lastVisible: lastVisibleDocData,
          orderByField,
          orderDirection = 'desc',
          startDate,
        } = request.data as {
          pageSize?: number;
          lastVisible?: any;
          orderByField: 'createdAt' | 'pickupDate';
          orderDirection?: 'asc' | 'desc';
          startDate?: string;
        };
    
        try {
          let queryBuilder = db.collection('orders').withConverter(orderConverter).where('userId', '==', userId);
    
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
    { region: "asia-northeast3", cors: allowedOrigins, enforceAppCheck: true },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "인증된 사용자만 접근할 수 있습니다.");
        }

        const user = await getAuth().getUser(request.auth.uid);
        if (user.customClaims?.role !== 'admin') {
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

            // ✅ [수정] .sort() 내부 로직 수정
            const orders = Array.from(combinedResults.values())
              .sort((a, b) => {
                  const timeA = a.createdAt;
                  const timeB = b.createdAt;
                  // Timestamp 타입인지 확인 후 toMillis() 호출
                  if (timeA instanceof Timestamp && timeB instanceof Timestamp) {
                      return timeB.toMillis() - timeA.toMillis();
                  }
                  return 0; // 예외 상황 처리
              });

            return { success: true, orders };

        } catch (error) {
            logger.error(`Error searching orders with query "${trimmedQuery}":`, error);
            throw new HttpsError("internal", "주문 검색 중 오류가 발생했습니다.");
        }
    }
);