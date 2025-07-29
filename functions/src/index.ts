// functions/src/index.ts

import {onRequest} from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Response} from "express";
import * as logger from "firebase-functions/logger";

import {initializeApp, applicationDefault, AppOptions} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {
  FirestoreEvent,
  DocumentSnapshot,
  Change,
} from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import axios from "axios";
import cors from "cors";

import type { PointLog, UserDocument, Order, OrderItem, CartItem, WaitlistInfo } from "./types.js";

interface ProductWithHistory {
  salesHistory: {
    roundId: string;
    variantGroups: {
      id: string;
      reservedCount?: number;
    }[];
  }[];
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. Initialization
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}
const appOptions: AppOptions = { projectId: "sso-do" };
if (!process.env.FUNCTIONS_EMULATOR) {
  appOptions.credential = applicationDefault();
}
initializeApp(appOptions);

const auth = getAuth();
const db = getFirestore();

const allowedOrigins = [ "http://localhost:5173", "http://sodo-songdo.store", "https://sodomall.vercel.app" ];

const corsHandler = cors({
  origin: allowedOrigins,
});

const calculateTier = (pickupCount: number, noShowCount: number): string => {
  const totalTransactions = pickupCount + noShowCount;

  if (totalTransactions === 0) {
    return "공구새싹";
  }

  if (noShowCount >= 3) {
    return "참여 제한";
  }

  const pickupRate = (pickupCount / totalTransactions) * 100;

  if (pickupRate >= 98 && pickupCount >= 50) return "공구의 신";
  if (pickupRate >= 95 && pickupCount >= 20) return "공구왕";
  if (pickupRate >= 90 && pickupCount >= 5) return "공구요정";
  if (pickupRate >= 80) return "공구새싹";
  return "주의 요망";
};

const POINT_POLICIES = {
  FRIEND_INVITED: { points: 30, reason: "친구 초대 성공" },
};


// ─────────────────────────────────────────────────────────────────────────────
// 2. Callable Functions (onCall)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @description [NEW] Fetches a paginated list of products and calculates real-time stock levels securely on the server.
 */
export const getProductsWithStock = onCall({
  region: "asia-northeast3",
  enforceAppCheck: false,
  cors: allowedOrigins // ✅ [추가] 이 줄을 추가하여 CORS 오류를 해결합니다.
}, async (request) => {
  // ... (함수 내부 로직은 이전과 동일) ...
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const { pageSize = 10, lastVisible } = request.data;
  
  try {
    // ... (이하 생략) ...
    const reservedQuantitiesMap = new Map<string, number>();
    const ordersSnapshot = await db.collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID"])
        .get();

    ordersSnapshot.forEach((doc) => {
      const order = doc.data();
      (order.items || []).forEach((item: any) => {
        const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const currentQty = reservedQuantitiesMap.get(key) || 0;
        reservedQuantitiesMap.set(key, currentQty + item.quantity);
      });
    });

    let productsQuery = db.collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

    if (lastVisible) {
      productsQuery = productsQuery.startAfter(Timestamp.fromMillis(lastVisible));
    }

    const productsSnapshot = await productsQuery.get();

    const products = productsSnapshot.docs.map((doc) => {
      const productData = doc.data();
      const productId = doc.id;

      const reservedQuantities: Record<string, number> = {};
      (productData.salesHistory || []).forEach((round: any) => {
        (round.variantGroups || []).forEach((vg: any) => {
          const key = `${productId}-${round.roundId}-${vg.id}`;
          if (reservedQuantitiesMap.has(key)) {
            reservedQuantities[key] = reservedQuantitiesMap.get(key)!;
          }
        });
      });

      return {
        id: productId,
        ...productData,
        reservedQuantities,
      };
    });
    
    const newLastVisibleDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
    const newLastVisible = newLastVisibleDoc ? (newLastVisibleDoc.data().createdAt as Timestamp)?.toMillis() : null;

    return {
      products,
      lastVisible: newLastVisible,
    };
  } catch (error) {
    logger.error("Error in getProductsWithStock:", error);
    throw new HttpsError("internal", "상품 정보를 불러오는 중 오류가 발생했습니다.");
  }
});

export const checkCartStock = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    
    const cartItems = request.data.items as CartItem[];
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return {
        updatedItems: [],
        removedItemIds: [],
        isSufficient: true,
      };
    }

    try {
      const reservedQuantitiesMap = new Map<string, number>();
      const ordersQuery = db.collection('orders').where('status', 'in', ['RESERVED', 'PREPAID']);
      const ordersSnapshot = await ordersQuery.get();
      ordersSnapshot.forEach((doc) => {
        const order = doc.data() as Order;
        (order.items || []).forEach((item: OrderItem) => {
          const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          reservedQuantitiesMap.set(key, (reservedQuantitiesMap.get(key) || 0) + item.quantity);
        });
      });

      const productIds = [...new Set(cartItems.map(item => item.productId))];
      const productSnapshots = await Promise.all(
        productIds.map(id => db.collection("products").doc(id).get())
      );
      const productsMap = new Map<string, any>();
      productSnapshots.forEach(snap => {
        if (snap.exists) {
            productsMap.set(snap.id, { id: snap.id, ...snap.data() });
        }
      });
      
      const updatedItems: { id: string; newQuantity: number }[] = [];
      const removedItemIds: string[] = [];
      let isSufficient = true;

      for (const item of cartItems) {
        const product = productsMap.get(item.productId);
        const round = product?.salesHistory.find((r: any) => r.roundId === item.roundId);
        const group = round?.variantGroups.find((vg: any) => vg.id === item.variantGroupId);
        
        if (!product || !round || !group) {
            removedItemIds.push(item.id);
            isSufficient = false;
            continue;
        }
        
        const totalStock = group.totalPhysicalStock;
        
        const mapKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const reservedQuantity = reservedQuantitiesMap.get(mapKey) || 0;
        
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

    const orderData = request.data as Order;
    const userId = request.auth.uid;
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new HttpsError('not-found', 'User information not found.');
        }
        const userDoc = userSnap.data() as UserDocument;
        if (userDoc.loyaltyTier === '참여 제한') {
          throw new HttpsError('permission-denied', 'Your participation in group buys is currently restricted due to repeated promise violations.');
        }

        const reservedQuantitiesMap = new Map<string, number>();
        const ordersQuery = db.collection('orders').where('status', 'in', ['RESERVED', 'PREPAID']);
        const ordersSnapshot = await transaction.get(ordersQuery);
        ordersSnapshot.forEach((doc) => {
            const order = doc.data() as Order;
            (order.items || []).forEach((item: OrderItem) => {
                const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
                reservedQuantitiesMap.set(key, (reservedQuantitiesMap.get(key) || 0) + item.quantity);
            });
        });

        const productRefs = [...new Set(orderData.items.map(item => item.productId))].map(id => db.collection('products').doc(id));
        const productSnaps = await transaction.getAll(...productRefs);
        const productDataMap = new Map<string, any>();
        for (const productSnap of productSnaps) {
            if (!productSnap.exists) throw new HttpsError('not-found', `Product not found (ID: ${productSnap.id}).`);
            productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() });
        }
        
        const itemsToReserve: OrderItem[] = [];
        for (const item of orderData.items) {
          const productData = productDataMap.get(item.productId);
          if (!productData) throw new HttpsError('internal', `Could not process product data: ${item.productId}`);
          
          const round = productData.salesHistory.find((r: any) => r.roundId === item.roundId);
          if (!round) throw new HttpsError('not-found', `Sales round information not found.`);

          const variantGroup = round.variantGroups.find((vg: any) => vg.id === item.variantGroupId);
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
            const originalTotalPrice = itemsToReserve.reduce((total: number, i: OrderItem) => total + (i.unitPrice * i.quantity), 0);
            
            const phoneLast4 = orderData.customerInfo.phone.slice(-4);
            const firstItem = orderData.items[0];
            const productForRound = productDataMap.get(firstItem.productId);
            const roundForOrder = productForRound?.salesHistory.find((r: any) => r.roundId === firstItem.roundId);
            
            if (!roundForOrder?.pickupDate) {
              throw new HttpsError('invalid-argument', 'Pickup date information for the ordered product is not set.');
            }

            const newOrderData: Order = {
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
      throw new HttpsError("unauthenticated", "A login is required.");
    }
    const userId = request.auth.uid;
    const { pageSize, lastVisible: lastVisibleData, orderByField } = request.data as { pageSize: number, lastVisible?: number, orderByField: 'createdAt' | 'pickupDate' };
    
    let queryBuilder = db.collection('orders')
        .where('userId', '==', userId)
        .orderBy(orderByField, 'desc')
        .limit(pageSize);

    if (lastVisibleData) {
      if (orderByField === 'createdAt' || orderByField === 'pickupDate') {
        queryBuilder = queryBuilder.startAfter(Timestamp.fromMillis(lastVisibleData));
      } else {
        queryBuilder = queryBuilder.startAfter(lastVisibleData);
      }
    }
    
    try {
      const snapshot = await queryBuilder.get();
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      let newLastVisible = null;
      if (lastDoc) {
        const lastDocData = lastDoc.data();
        if (orderByField === 'createdAt' || orderByField === 'pickupDate') {
          newLastVisible = (lastDocData[orderByField] as Timestamp)?.toMillis() || null;
        } else {
          newLastVisible = lastDocData[orderByField] || null;
        }
      }
      
      return { data: orders, lastDoc: newLastVisible };
    } catch (error) {
      logger.error('Error fetching user orders:', error);
      throw new HttpsError('internal', 'An error occurred while fetching order history.');
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
      const allProductsSnapshot = await db.collection('products').where('isArchived', '==', false).get();
      const userWaitlist: WaitlistInfo[] = [];

      allProductsSnapshot.forEach(doc => {
        const product = { id: doc.id, ...doc.data() } as any;
        (product.salesHistory || []).forEach((round: any) => {
          (round.waitlist || []).forEach((entry: any) => {
            if (entry.userId === userId) {
              const vg = (round.variantGroups || []).find((v: any) => v.id === entry.variantGroupId);
              const item = (vg?.items || []).find((i: any) => i.id === entry.itemId);

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
                isPrioritized: entry.isPrioritized || false,
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


export const getProductsForList = onCall({ region: "asia-northeast3", cors: allowedOrigins }, async (request) => {
  const { pageSize = 10, lastVisibleCreatedAt = null } = request.data;
  logger.info("Fetching products for list", { pageSize, lastVisibleCreatedAt });

  try {
    let productsQuery: FirebaseFirestore.Query = db.collection('products')
        .where('isArchived', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(pageSize);

    if (lastVisibleCreatedAt) {
        productsQuery = productsQuery.startAfter(Timestamp.fromDate(new Date(lastVisibleCreatedAt)));
    }

    const productsSnapshot = await productsQuery.get();
    const rawProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductWithHistory & { id: string }));

    if (rawProducts.length === 0) {
        return { products: [], nextLastVisibleCreatedAt: null };
    }
    
    const productsWithMap = rawProducts.map(product => {
        return { ...product };
    });

    const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
    
    let nextCursor = null;
    if (lastDoc) {
      const createdAt = lastDoc.data().createdAt;
      if (createdAt && createdAt instanceof Timestamp) {
        nextCursor = createdAt.toDate().toISOString();
      } else {
        logger.warn(`Product document ${lastDoc.id} is missing a valid 'createdAt' timestamp for pagination.`);
      }
    }

    return {
        products: productsWithMap,
        nextLastVisibleCreatedAt: nextCursor,
    };
  } catch (error) {
      logger.error("Error in getProductsForList:", error);
      throw new HttpsError("internal", "An error occurred while fetching product information.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP Functions (Simple Request/Response)
// ─────────────────────────────────────────────────────────────────────────────

export const kakaoLogin = onRequest(
  {region: "asia-northeast3"},
  (request, response: Response) => {
    corsHandler(request, response, async () => {
      if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
      }
      const token: string | undefined = request.body.token;
      if (!token) {
        return response
          .status(400)
          .json({message: "Kakao token not provided."});
      }
      try {
        const kakaoUserResponse = await axios.get(
          "https://kapi.kakao.com/v2/user/me",
          {headers: {Authorization: `Bearer ${token}`}}
        );
        const kakaoId = kakaoUserResponse.data.id;
        if (!kakaoId) {
          throw new Error("Could not retrieve Kakao user ID.");
        }
        const uid = `kakao:${kakaoId}`;
        try {
          await auth.getUser(uid);
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            (error as { code?: string }).code === "auth/user-not-found"
          ) {
            await auth.createUser({
              uid,
              email: kakaoUserResponse.data.kakao_account?.email,
              displayName: kakaoUserResponse.data.properties?.nickname,
            });
          } else {
            throw error;
          }
        }
        const firebaseToken = await auth.createCustomToken(uid);
        return response.status(200).json({firebaseToken});
      } catch (error: unknown) {
        let errorMessage = "An error occurred on the server during authentication processing.";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        logger.error("Error creating Firebase custom token:", error);
        if (axios.isAxiosError(error)) {
          logger.error("Axios error details:", error.response?.data);
        }
        return response.status(500).json({message: errorMessage, error: error});
      }
    });
  }
);

export const setUserRole = onRequest(
  { region: "asia-northeast3" },
  (request, response: Response) => {
    corsHandler(request, response, async () => {
      const { uid, role } = request.query;

      if (typeof uid !== 'string' || typeof role !== 'string') {
        response.status(400).send("Please provide uid and role parameters accurately.");
        return;
      }

      try {
        await getAuth().setCustomUserClaims(uid, { role: role });
        response.send(`Success! The '${role}' role has been assigned to user (${uid}).`);
      } catch (error) {
        logger.error("Error setting custom claim:", error);
        response.status(500).send(`An error occurred while setting the custom claim: ${error}`);
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Firestore Trigger Functions (DB Change Detection)
// ─────────────────────────────────────────────────────────────────────────────

export const createNotificationOnPointChange = onDocumentCreated(
  {
    document: "users/{userId}/pointLogs/{logId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data in the event.", {params: event.params});
      return;
    }

    const {userId} = event.params;
    const pointLog = snapshot.data() as PointLog;
    const {amount, reason} = pointLog;

    if (amount === 0) {
      return;
    }

    if (amount === undefined || !reason) {
      logger.error("The point log is missing the amount or reason field.", {
        data: pointLog,
      });
      return;
    }

    let message = "";
    if (amount > 0) {
      message = `🎉 You've earned ${amount.toLocaleString()}P for '${reason}'!`;
    } else {
      message = `🛍️ You've used ${Math.abs(
        amount
      ).toLocaleString()}P for '${reason}'.`;
    }

    const newNotification = {
      message,
      type: amount > 0 ? "POINTS_EARNED" : "POINTS_USED",
      read: false,
      timestamp: FieldValue.serverTimestamp(),
      link: "/mypage/points",
    };

    try {
      await db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .add(newNotification);
      logger.info(`Successfully sent a notification to user [${userId}].`);
    } catch (error) {
      logger.error(
        `An error occurred while sending a notification to user [${userId}]:`,
        error
      );
    }
  }
);


export const onOrderCreated = onDocumentCreated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { orderId: string }>) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const order = snapshot.data() as Order;
    if (order.status === "cancelled") return;

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
    if (order.status === "cancelled") return;

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

export const onOrderUpdated = onDocumentUpdated(
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
    if (before.status !== 'CANCELED' && before.status !== 'cancelled') {
        (before.items || []).forEach(item => {
            const key = `${item.productId}:${item.roundId}:${item.variantGroupId}`;
            beforeItemsMap.set(key, item.quantity);
        });
    }

    const afterItemsMap = new Map<string, number>();
    if (after.status !== 'CANCELED' && after.status !== 'cancelled') {
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
        logger.info(`No stock changes needed for order update ${event.params.orderId}`);
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
        logger.info(`First pickup user (ID: ${newUserId}) confirmed. Starting referrer search.`);

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
          
          const newTier = calculateTier(referrerData.pickupCount || 0, referrerData.noShowCount || 0);
          
          const now = new Date();
          const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

          const pointLog: Omit<PointLog, "id"> = {
            amount: rewardPoints,
            reason: `${POINT_POLICIES.FRIEND_INVITED.reason} (${newUser.displayName || "New Member"}님)`,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(expirationDate),
          };

          transaction.update(referrerRef, {
            points: newPoints,
            loyaltyTier: newTier,
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

// ─────────────────────────────────────────────────────────────────────────────
// 5. Scheduled Functions (Periodic Execution)
// ─────────────────────────────────────────────────────────────────────────────

export const expirePointsScheduled = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (event) => {
    logger.log("Starting point expiration process.");
    const now = new Date();
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      logger.log("No users to process.");
      return;
    }

    const batch = db.batch();
    let updatedUserCount = 0;

    snapshot.forEach((doc) => {
      const user = doc.data() as UserDocument;
      const pointHistory = user.pointHistory || [];
      let totalExpiredAmount = 0;

      const newPointHistory = pointHistory.map((log: PointLog) => {
        if (
          log.amount > 0 &&
          log.expiresAt &&
          !log.isExpired &&
          log.expiresAt.toDate() <= now
        ) {
          totalExpiredAmount += log.amount;
          return {...log, isExpired: true};
        }
        return log;
      });

      if (totalExpiredAmount > 0) {
        updatedUserCount++;
        const currentPoints = user.points || 0;
        const newPoints = currentPoints - totalExpiredAmount;

        const newTier = calculateTier(user.pickupCount || 0, user.noShowCount || 0);

        const expirationLog: Omit<PointLog, "orderId" | "isExpired"> = {
          amount: -totalExpiredAmount,
          reason: "Points expired",
          createdAt: Timestamp.now(),
          expiresAt: null,
        };
        newPointHistory.push(expirationLog as PointLog);

        const userRef = usersRef.doc(doc.id);
        batch.update(userRef, {
          points: newPoints,
          loyaltyTier: newTier,
          pointHistory: newPointHistory,
        });

        logger.log(`User ${doc.id}: Expired ${totalExpiredAmount} points.`);
      }
    });

    if (updatedUserCount > 0) {
      await batch.commit();
      logger.log(
        `Point expiration process completed for a total of ${updatedUserCount} users.`
      );
    } else {
      logger.log("No points to expire today.");
    }
  }
);