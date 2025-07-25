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

// ✨ [수정] WaitlistInfo 타입을 추가로 import 합니다.
import type { PointLog, UserDocument, Order, OrderItem, CartItem, WaitlistInfo } from "./types.js";


// ─────────────────────────────────────────────────────────────────────────────
// 1. 초기 설정
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

const corsHandler = cors({
  origin: [ "http://localhost:5173", "http://sodo-songdo.store", "https://sodomall.vercel.app", ],
});

const calculateTier = (points: number): string => {
  if (points >= 500) return "공구의 신";
  if (points >= 200) return "공구왕";
  if (points >= 50) return "공구요정";
  if (points >= 0) return "공구새싹";
  if (points >= -299) return "주의 요망";
  return "참여 제한";
};

const POINT_POLICIES = {
  FRIEND_INVITED: { points: 30, reason: "친구 초대 성공" },
};


// ─────────────────────────────────────────────────────────────────────────────
// 2. 클라이언트 호출 가능 함수 (onCall)
// ─────────────────────────────────────────────────────────────────────────────

// [수정] checkCartStock: 새로운 reservedCount 방식으로 재고 확인 로직 최적화
export const checkCartStock = onCall(
  { region: "asia-northeast3" },
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
            // 상품, 라운드, 그룹 정보가 없으면 해당 아이템 제거
            removedItemIds.push(item.id);
            isSufficient = false;
            continue;
        }
        
        const totalStock = group.totalPhysicalStock;
        // reservedCount 사용
        const reservedQuantity = group.reservedCount || 0; 
        
        let availableStock = Infinity;
        if (totalStock !== null && totalStock !== -1) {
          availableStock = totalStock - reservedQuantity;
        }

        if (item.quantity > availableStock) {
          isSufficient = false;
          const adjustedQuantity = Math.max(0, Math.floor(availableStock));
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

// [수정] submitOrder: 새로운 reservedCount 방식으로 재고 확인 로직 최적화
export const submitOrder = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const orderData = request.data as Order;
    const userId = request.auth.uid;
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1. 사용자 등급 확인 ('참여 제한' 등급은 주문 차단)
        const userRef = db.collection('users').doc(userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new HttpsError('not-found', '사용자 정보를 찾을 수 없습니다.');
        }
        const userDoc = userSnap.data() as UserDocument;
        if (userDoc.loyaltyTier === '참여 제한') {
          throw new HttpsError('permission-denied', '반복적인 약속 불이행으로 인해 현재 공동구매 참여가 제한되었습니다.');
        }

        // 2. 주문할 상품들의 최신 정보 가져오기
        const productRefs = [...new Set(orderData.items.map(item => item.productId))].map(id => db.collection('products').doc(id));
        const productSnaps = await transaction.getAll(...productRefs);
        const productDataMap = new Map<string, any>();
        for (const productSnap of productSnaps) {
            if (!productSnap.exists) throw new HttpsError('not-found', `상품을 찾을 수 없습니다 (ID: ${productSnap.id}).`);
            productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() });
        }
        
        // 3. 재고 확인 및 주문 아이템 준비
        const itemsToReserve: OrderItem[] = [];
        for (const item of orderData.items) {
          const productData = productDataMap.get(item.productId);
          if (!productData) throw new HttpsError('internal', `상품 데이터를 처리할 수 없습니다: ${item.productId}`);
          
          const round = productData.salesHistory.find((r: any) => r.roundId === item.roundId);
          if (!round) throw new HttpsError('not-found', `판매 회차 정보를 찾을 수 없습니다.`);

          const variantGroup = round.variantGroups.find((vg: any) => vg.id === item.variantGroupId);
          if (!variantGroup) throw new HttpsError('not-found', `옵션 그룹 정보를 찾을 수 없습니다.`);
          
          let availableStock = Infinity;
          if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
              const reservedCount = variantGroup.reservedCount || 0;
              availableStock = variantGroup.totalPhysicalStock - reservedCount;
          }

          if (availableStock < item.quantity) {
              throw new HttpsError('resource-exhausted', `죄송합니다. ${productData.groupName} 상품의 재고가 부족합니다. (남은 수량: ${Math.max(0, availableStock)}개)`);
          }
            
          itemsToReserve.push({ ...item });
        }
        
        // 4. 주문 문서 생성
        if (itemsToReserve.length > 0) {
            const newOrderRef = db.collection('orders').doc();
            const originalTotalPrice = itemsToReserve.reduce((total, i: OrderItem) => total + (i.unitPrice * i.quantity), 0);
            
            const phoneLast4 = orderData.customerInfo.phone.slice(-4);
            const firstItem = orderData.items[0];
            const productForRound = productDataMap.get(firstItem.productId);
            const roundForOrder = productForRound?.salesHistory.find((r: any) => r.roundId === firstItem.roundId);
            
            if (!roundForOrder?.pickupDate) {
              throw new HttpsError('invalid-argument', '주문하려는 상품의 픽업 날짜 정보가 설정되지 않았습니다.');
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
        return { success: false, message: "주문할 상품이 없습니다." };
      });
      return result;
    } catch (error) {
      logger.error("Order submission failed", error);
      if (error instanceof HttpsError) {
          throw error;
      }
      throw new HttpsError("internal", "주문 처리 중 알 수 없는 오류가 발생했습니다.");
    }
  }
);
// ✨ [신규] 로그인한 사용자의 주문 내역을 페이지 단위로 가져오는 함수
export const getUserOrders = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const userId = request.auth.uid;
    const { pageSize, lastVisible: lastVisibleData, orderByField } = request.data as { pageSize: number, lastVisible?: number, orderByField: 'createdAt' | 'pickupDate' };
    
    let queryBuilder = db.collection('orders')
        .where('userId', '==', userId)
        .orderBy(orderByField, 'desc')
        .limit(pageSize);

    // 페이지네이션 커서 처리
    if (lastVisibleData) {
      if (orderByField === 'createdAt' || orderByField === 'pickupDate') {
        // Timestamp 필드 기준
        queryBuilder = queryBuilder.startAfter(Timestamp.fromMillis(lastVisibleData));
      } else {
        // 다른 필드 기준 (필요시 확장)
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
          // Timestamp 필드는 toMillis()로 변환하여 클라이언트에 전달
          newLastVisible = (lastDocData[orderByField] as Timestamp)?.toMillis() || null;
        } else {
          newLastVisible = lastDocData[orderByField] || null;
        }
      }
      
      return { data: orders, lastDoc: newLastVisible };
    } catch (error) {
      logger.error('Error fetching user orders:', error);
      throw new HttpsError('internal', '주문 내역을 가져오는 중 오류가 발생했습니다.');
    }
  }
);


// ✨ [신규] 로그인한 사용자의 대기 목록 전체를 가져오는 함수
export const getUserWaitlist = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const userId = request.auth.uid;
    
    try {
      const allProductsSnapshot = await db.collection('products').where('isArchived', '==', false).get();
      // ✨ [수정] userWaitlist의 타입을 명확하게 지정합니다.
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
                itemName: `${vg?.groupName || ''} - ${item?.name || ''}`.replace(/^ - | - $/g, '') || '옵션 정보 없음',
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
      throw new HttpsError('internal', '대기 목록을 가져오는 중 오류가 발생했습니다.');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP 함수 (단순 요청/응답)
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
          .json({message: "카카오 토큰이 제공되지 않았습니다."});
      }
      try {
        const kakaoUserResponse = await axios.get(
          "https://kapi.kakao.com/v2/user/me",
          {headers: {Authorization: `Bearer ${token}`}}
        );
        const kakaoId = kakaoUserResponse.data.id;
        if (!kakaoId) {
          throw new Error("카카오 사용자 ID를 가져올 수 없습니다.");
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
        let errorMessage = "인증 처리 중 서버에서 오류가 발생했습니다.";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        logger.error("Firebase 커스텀 토큰 생성 중 오류:", error);
        if (axios.isAxiosError(error)) {
          logger.error("Axios error details:", error.response?.data);
        }
        return response.status(500).json({message: errorMessage, error: error});
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Firestore 트리거 함수 (DB 변경 감지)
// ─────────────────────────────────────────────────────────────────────────────

export const createNotificationOnPointChange = onDocumentCreated(
  {
    document: "users/{userId}/pointLogs/{logId}",
    region: "asia-northeast3",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("이벤트에 데이터가 없습니다.", {params: event.params});
      return;
    }

    const {userId} = event.params;
    const pointLog = snapshot.data() as PointLog;
    const {amount, reason} = pointLog;

    if (amount === 0) {
      return;
    }

    if (amount === undefined || !reason) {
      logger.error("포인트 로그에 amount 또는 reason 필드가 없습니다.", {
        data: pointLog,
      });
      return;
    }

    let message = "";
    if (amount > 0) {
      message = `🎉 '${reason}'으로 ${amount.toLocaleString()}P가 적립되었어요!`;
    } else {
      message = `🛍️ '${reason}'으로 ${Math.abs(
        amount
      ).toLocaleString()}P를 사용했어요.`;
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
      logger.info(`사용자 [${userId}]에게 알림을 성공적으로 보냈습니다.`);
    } catch (error) {
      logger.error(
        `사용자 [${userId}]에게 알림을 보내는 중 오류 발생:`,
        error
      );
    }
  }
);


// [삭제] 기존의 updateProductQuantities 헬퍼 함수를 삭제합니다.

// [재작성] onOrderCreated: 새로운 reservedCount 방식으로 재고 관리
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

    // 상품별로 변경사항을 그룹화
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

    // 트랜잭션을 사용하여 각 상품의 reservedCount를 업데이트
    try {
        await db.runTransaction(async (transaction) => {
            for (const [productId, changes] of changesByProduct.entries()) {
                const productRef = db.collection("products").doc(productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists) {
                    logger.error(`Product ${productId} not found during order creation.`);
                    continue; // 다음 상품으로 넘어감
                }
                
                const productData = productDoc.data();
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

// [재작성] onOrderDeleted: 새로운 reservedCount 방식으로 재고 관리
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
            delta: -item.quantity, // 삭제이므로 수량을 뺌
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
                
                const productData = productDoc.data();
                const newSalesHistory = productData?.salesHistory?.map((round: any) => {
                    const relevantChanges = changes.filter(c => c.roundId === round.roundId);
                    if (relevantChanges.length > 0) {
                        const newVariantGroups = round.variantGroups.map((vg: any) => {
                            const change = relevantChanges.find(c => c.variantGroupId === vg.id);
                            if (change) {
                                const currentReserved = vg.reservedCount || 0;
                                vg.reservedCount = Math.max(0, currentReserved + change.delta); // 0 미만으로 내려가지 않도록 방지
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


// [재작성] onOrderUpdated: 새로운 reservedCount 방식으로 재고 관리
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
    if(before.status !== 'cancelled') {
        before.items.forEach(item => {
            const key = `${item.productId}:${item.roundId}:${item.variantGroupId}`;
            beforeItemsMap.set(key, item.quantity);
        });
    }

    const afterItemsMap = new Map<string, number>();
    if(after.status !== 'cancelled') {
        after.items.forEach(item => {
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
                
                const productData = productDoc.data();
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


/**
 * @description 신규 유저가 첫 픽업을 완료했을 때, 추천인에게 보상 포인트를 지급합니다.
 */
export const rewardReferrerOnFirstPickup = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "asia-northeast3",
  },
  async (event) => {
    if (!event.data) {
      logger.error("이벤트 데이터가 없습니다.");
      return;
    }

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    // 1. 주문 상태가 'PICKED_UP'으로 변경되었는지 확인
    if (before.status === "PICKED_UP" || after.status !== "PICKED_UP") {
      return;
    }

    const newUserId = after.userId;
    if (!newUserId) {
      logger.warn("주문 데이터에 userId가 없습니다.");
      return;
    }
    const newUserRef = db.collection("users").doc(newUserId);

    try {
      const newUserDoc = await newUserRef.get();
      if (!newUserDoc.exists) {
        logger.warn(`주문자(ID: ${newUserId})의 사용자 문서를 찾을 수 없습니다.`);
        return;
      }

      const newUser = newUserDoc.data() as UserDocument;

      // 2. 이 픽업이 '첫 번째' 픽업이고, 추천인을 통해 가입했는지 확인
      // pickupCount는 픽업 완료 시점에 1이 되므로, 이전 상태(0)를 기준으로 판단
      const isFirstPickup = (newUser.pickupCount || 0) === 1;
      const wasReferred = newUser.referredBy && newUser.referredBy !== "__SKIPPED__";

      if (isFirstPickup && wasReferred) {
        logger.info(`첫 픽업 사용자(ID: ${newUserId}) 확인. 추천인 검색을 시작합니다.`);

        // 3. 추천인 찾기
        const referrerQuery = db.collection("users")
          .where("referralCode", "==", newUser.referredBy)
          .limit(1);

        const referrerSnapshot = await referrerQuery.get();
        if (referrerSnapshot.empty) {
          logger.warn(`추천인 코드(${newUser.referredBy})에 해당하는 사용자를 찾을 수 없습니다.`);
          return;
        }

        const referrerDoc = referrerSnapshot.docs[0];
        const referrerRef = referrerDoc.ref;
        const rewardPoints = POINT_POLICIES.FRIEND_INVITED.points;
        
        // 4. 추천인에게 포인트 지급 (트랜잭션)
        await db.runTransaction(async (transaction) => {
          const freshReferrerDoc = await transaction.get(referrerRef);
          if (!freshReferrerDoc.exists) return;
          
          const referrerData = freshReferrerDoc.data() as UserDocument;
          const currentPoints = referrerData.points || 0;
          const newPoints = currentPoints + rewardPoints;
          const newTier = calculateTier(newPoints);
          
          const now = new Date();
          const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

          const pointLog: Omit<PointLog, "id"> = {
            amount: rewardPoints,
            reason: `${POINT_POLICIES.FRIEND_INVITED.reason} (${newUser.displayName || "신규회원"}님)`,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(expirationDate),
          };

          transaction.update(referrerRef, {
            points: newPoints,
            loyaltyTier: newTier,
            pointHistory: FieldValue.arrayUnion(pointLog),
          });
        });
        
        logger.info(`추천인(ID: ${referrerRef.id})에게 ${rewardPoints}P 지급 완료.`);
      }
    } catch (error) {
      logger.error("추천인 보상 처리 중 오류 발생:", error);
    }
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// 5. 스케줄링 함수 (주기적 실행)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @description 매일 자정에 실행되어 만료된 포인트를 자동으로 소멸시키는 스케줄링 함수
 */
export const expirePointsScheduled = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (event) => {
    logger.log("포인트 유효기간 만료 처리를 시작합니다.");
    const now = new Date();
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      logger.log("처리할 사용자가 없습니다.");
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
        const newTier = calculateTier(newPoints);

        const expirationLog: Omit<PointLog, "orderId" | "isExpired"> = {
          amount: -totalExpiredAmount,
          reason: "포인트 기간 만료 소멸",
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

        logger.log(`사용자 ${doc.id}: ${totalExpiredAmount}포인트 소멸 처리.`);
      }
    });

    if (updatedUserCount > 0) {
      await batch.commit();
      logger.log(
        `총 ${updatedUserCount}명의 사용자에 대한 포인트 소멸 처리가 완료되었습니다.`
      );
    } else {
      logger.log("금일 소멸될 포인트가 없습니다.");
    }
  }
);