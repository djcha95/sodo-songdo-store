// functions/src/callable/orders.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
// ✅ [수정] 사용하지 않는 타입을 제거하고 필요한 타입을 추가했습니다.
import { Timestamp, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import type { Order, OrderItem, CartItem, UserDocument, WaitlistInfo, Product, SalesRound, WaitlistEntry } from "../types.js";

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
            // ✅ [수정] as Product 타입을 명시하여 타입 불일치 오류를 해결합니다.
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
            // ✅ [수정] userDoc이 undefined일 가능성에 대비한 방어 코드를 추가합니다.
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
                // ✅ [수정] as Product 타입을 명시하여 타입 불일치 오류를 해결합니다.
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
          const userWaitlist: WaitlistInfo[] = [];
    
          allProductsSnapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            (product.salesHistory || []).forEach((round: SalesRound) => {
              (round.waitlist || []).forEach((entry: WaitlistEntry) => {
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