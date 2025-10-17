// functions/src/callable/products.ts

// 🚨 중요: CORS 오류 해결 안내 🚨
// 'Access-Control-Allow-Origin' 헤더 관련 CORS 오류가 발생할 경우,
// firebase/admin.js 파일의 'allowedOrigins' 배열에 웹 애플리케이션의 도메인을 추가해야 합니다.
// 예: const allowedOrigins = ["http://localhost:5173", "https://sodo-songdo.web.app", "https://www.sodo-songdo.store"];
// 위와 같이 "https://www.sodo-songdo.store"를 배열에 포함시켜주세요.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, DocumentData, DocumentSnapshot, FieldValue } from "firebase-admin/firestore";
import { auth as adminAuth } from "firebase-admin";

import type {
  Product,
  Order,
  OrderItem,
  SalesRound,
  VariantGroup,
  UserDocument,
  CustomerInfo,
  SalesRoundStatus,
} from "@/shared/types";

// =================================================================
// 1. 신규 상품 + 첫 회차 등록
// =================================================================
export const addProductWithFirstRound = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자만 상품을 등록할 수 있습니다.");
    }
    const { productData, salesRoundData, creationDate } = request.data;
    if (!productData || !salesRoundData || !creationDate) {
      throw new HttpsError("invalid-argument", "상품 생성에 필요한 정보가 누락되었습니다.");
    }
    try {
      const newProductRef = db.collection("products").doc();
      const newProductId = newProductRef.id;
      const firstRound: SalesRound = { ...salesRoundData, roundId: newProductId, createdAt: Timestamp.fromDate(new Date(creationDate)), waitlist: [], waitlistCount: 0 };
      const newProductData: Omit<Product, 'id'> = { ...productData, salesHistory: [firstRound], imageUrls: [], isArchived: false, createdAt: Timestamp.fromDate(new Date(creationDate)), encoreCount: 0, encoreRequesterIds: [] };
      await newProductRef.set(newProductData);
      logger.info(`New product created by ${request.auth?.uid} with ID: ${newProductId}`);
      return { success: true, productId: newProductId, message: "상품이 성공적으로 등록되었습니다." };
    } catch (error) {
      logger.error("Error in addProductWithFirstRound:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 등록 중 서버 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 2. 상품명으로 검색
// =================================================================
export const searchProductsByName = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const name = request.data.name as string;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new HttpsError('invalid-argument', '검색할 상품명을 입력해주세요.');
    }
    try {
      const trimmedName = name.trim();
      const productsRef = db.collection('products');
      const snapshot = await productsRef.where('groupName', '>=', trimmedName).where('groupName', '<=', trimmedName + '\uf8ff').where('isArchived', '==', false).limit(5).get();
      if (snapshot.empty) return [];
      const products = snapshot.docs.map(doc => ({ ...(doc.data() as Product), id: doc.id }));
      return products;
    } catch (error) {
      logger.error('Error in searchProductsByName:', error);
      throw new HttpsError('internal', '상품 검색 중 오류가 발생했습니다.');
    }
  }
);

// =================================================================
// 3. 상품 핵심 정보 수정
// =================================================================
export const updateProductCoreInfo = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    const { productId, productData, finalImageUrls } = request.data;
    if (!productId || !productData) {
      throw new HttpsError("invalid-argument", "상품 ID와 업데이트할 데이터가 필요합니다.");
    }
    try {
      const productRef = db.collection("products").doc(productId);
      const dataToUpdate = { ...productData, imageUrls: finalImageUrls };
      await productRef.update(dataToUpdate);
      logger.info(`Product core info updated successfully for product ID: ${productId}`);
      return { success: true, message: "상품 정보가 성공적으로 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateProductCoreInfo:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 정보 업데이트 중 서버 오류가 발생했습니다.");
    }
  }
);


// =================================================================
// 재고 수량 일괄 수정
// =================================================================
export const updateMultipleVariantGroupStocks = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    // 디버깅을 위해 수신된 데이터 로깅
    logger.info("updateMultipleVariantGroupStocks called with data:", JSON.stringify(request.data, null, 2));

    const updates = request.data as { productId: string; roundId: string; variantGroupId: string; newStock: number }[];
    if (!Array.isArray(updates) || updates.length === 0) {
      logger.error("Invalid argument: updates is not a non-empty array.", { data: request.data });
      throw new HttpsError("invalid-argument", "업데이트할 재고 정보가 없습니다.");
    }
    try {
      await db.runTransaction(async (transaction) => {
        for (const update of updates) {
          const { productId, roundId, variantGroupId, newStock } = update;
          if (typeof newStock !== 'number') continue;
          const productRef = db.collection("products").doc(productId);
          const productDoc = await transaction.get(productRef);
          if (!productDoc.exists) {
            logger.warn(`Product not found for stock update: ${productId}`);
            continue;
          }
          const productData = productDoc.data() as Product;
          const salesHistory = productData.salesHistory || [];
          const roundIndex = salesHistory.findIndex(r => r.roundId === roundId);
          if (roundIndex === -1) continue;
          const round = salesHistory[roundIndex];
          const vgIndex = (round.variantGroups || []).findIndex(vg => vg.id === variantGroupId);
          if (vgIndex === -1) continue;
          const fieldPath = `salesHistory.${roundIndex}.variantGroups.${vgIndex}.totalPhysicalStock`;
          transaction.update(productRef, { [fieldPath]: newStock });
        }
      });
      return { success: true, message: "재고 정보가 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateMultipleVariantGroupStocks:", error);
      throw new HttpsError("internal", "재고 업데이트 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 단일 판매 회차 정보 수정 (상태 변경 등)
// =================================================================
export const updateSalesRound = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    const { productId, roundId, newStatus } = request.data;
    if (!productId || !roundId || !newStatus) {
      throw new HttpsError("invalid-argument", "업데이트에 필요한 정보가 누락되었습니다.");
    }

    try {
      const productRef = db.collection("products").doc(productId);
      await db.runTransaction(async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
        }
        const productData = productDoc.data() as Product;
        const salesHistory = productData.salesHistory || [];
        const roundIndex = salesHistory.findIndex(r => r.roundId === roundId);
        if (roundIndex === -1) {
          throw new HttpsError("not-found", "해당 판매 회차를 찾을 수 없습니다.");
        }
        
        const updatedRound = { ...salesHistory[roundIndex], ...newStatus };
        salesHistory[roundIndex] = updatedRound;
        
        transaction.update(productRef, { salesHistory: salesHistory });
      });
      return { success: true, message: "판매 상태가 업데이트되었습니다." };
    } catch (error) {
      logger.error(`Error in updateSalesRound for product ${productId}, round ${roundId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "판매 상태 업데이트 중 오류가 발생했습니다.");
    }
  }
);


// =================================================================
// 판매 상태 일괄 수정
// =================================================================
export const updateMultipleSalesRoundStatuses = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    const updates = request.data as { productId: string; roundId: string; newStatus: SalesRoundStatus }[];
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new HttpsError("invalid-argument", "업데이트할 상태 정보가 없습니다.");
    }
    try {
      const batch = db.batch();
      for (const update of updates) {
        const productRef = db.collection("products").doc(update.productId);
        const productDoc = await productRef.get();
        if (productDoc.exists) {
          const productData = productDoc.data() as Product;
          const newSalesHistory = productData.salesHistory.map(round => {
            if (round.roundId === update.roundId) {
              return { ...round, status: update.newStatus };
            }
            return round;
          });
          batch.update(productRef, { salesHistory: newSalesHistory });
        }
      }
      await batch.commit();
      return { success: true, message: "판매 상태가 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateMultipleSalesRoundStatuses:", error);
      throw new HttpsError("internal", "판매 상태 업데이트 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 판매 회차 일괄 삭제
// =================================================================
export const deleteSalesRounds = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    const deletions = request.data as { productId: string; roundId: string }[];
    if (!Array.isArray(deletions) || deletions.length === 0) {
      throw new HttpsError("invalid-argument", "삭제할 항목 정보가 없습니다.");
    }

    try {
      const batch = db.batch();
      const deletionsByProduct = deletions.reduce((acc, { productId, roundId }) => {
        if (!acc[productId]) {
          acc[productId] = [];
        }
        acc[productId].push(roundId);
        return acc;
      }, {} as Record<string, string[]>);
      
      for (const productId in deletionsByProduct) {
        const roundIdsToDelete = deletionsByProduct[productId];
        const productRef = db.collection("products").doc(productId);
        const productDoc = await productRef.get();
        
        if (productDoc.exists) {
          const productData = productDoc.data() as Product;
          const originalHistoryLength = productData.salesHistory.length;
          const newSalesHistory = productData.salesHistory.filter(
            round => !roundIdsToDelete.includes(round.roundId)
          );
          
          if (newSalesHistory.length < originalHistoryLength) {
             batch.update(productRef, { salesHistory: newSalesHistory });
             logger.info(`Scheduled deletion of ${originalHistoryLength - newSalesHistory.length} rounds from product ${productId}`);
          }
        } else {
            logger.warn(`Product not found for deletion, skipping: ${productId}`);
        }
      }
      
      await batch.commit();
      return { success: true, message: "선택된 판매 회차가 삭제되었습니다." };
    } catch (error) {
      logger.error("Error in deleteSalesRounds:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "판매 회차 삭제 중 오류가 발생했습니다.");
    }
  }
);


// =================================================================
// 상품 목록 조회 (재고 포함)
// =================================================================
export const getProductsWithStock = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "1GiB",
    timeoutSeconds: 60,
    enforceAppCheck: false,
  },
  async (request) => {
    try {
      const query = db.collection("products").where("isArchived", "==", false).orderBy("createdAt", "desc");
      const productsSnapshot = await query.get();
      const products = productsSnapshot.docs.map((doc) => ({ ...(doc.data() as Product), id: doc.id })) as (Product & { id: string })[];
      const ordersSnap = await db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]).get();
      const claimedMap = new Map<string, number>();
      const pickedUpMap = new Map<string, number>();
      ordersSnap.docs.forEach((od) => {
        const order = od.data() as Order;
        const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
        items.forEach((it) => {
          if (!it.productId || !it.roundId || !it.variantGroupId) return;
          const key = `${it.productId}-${it.roundId}-${it.variantGroupId}`;
          const quantityToDeduct = (it.quantity || 0) * (it.stockDeductionAmount || 1);
          if (!quantityToDeduct) return;
          claimedMap.set(key, (claimedMap.get(key) || 0) + quantityToDeduct);
          if (order.status === "PICKED_UP") {
            pickedUpMap.set(key, (pickedUpMap.get(key) || 0) + quantityToDeduct);
          }
        });
      });
      const productsWithClaimedData = products.map((product) => {
        if (!Array.isArray(product.salesHistory)) {
          return product;
        }
        const newSalesHistory: SalesRound[] = product.salesHistory.map((round) => {
          if (!Array.isArray(round.variantGroups)) {
            return round;
          }
          const newVariantGroups: VariantGroup[] = round.variantGroups.map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            return { ...vg, reservedCount: claimedMap.get(key) || 0, pickedUpCount: pickedUpMap.get(key) || 0 };
          });
          return { ...round, variantGroups: newVariantGroups };
        });
        return { ...product, salesHistory: newSalesHistory };
      });
      return { products: productsWithClaimedData, lastVisible: null };
    } catch (error) {
      logger.error("getProductsWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 목록을 불러오는 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 단일 상품 조회 (재고 포함)
// =================================================================
export const getProductByIdWithStock = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 30,
    enforceAppCheck: false,
  },
  async (request) => {
    try {
      const productId = request.data?.productId as string | undefined;
      if (!productId) {
        throw new HttpsError("invalid-argument", "상품 ID가 제공되지 않았습니다.");
      }
      const productRef = db.collection("products").doc(productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) {
        throw new HttpsError("not-found", "해당 ID의 상품을 찾을 수 없습니다.");
      }
      const product = { ...(productSnap.data() as Product), id: productSnap.id };
      const ordersSnap = await db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]).get();
      const claimedMap = new Map<string, number>();
      const pickedUpMap = new Map<string, number>();
      ordersSnap.docs.forEach((doc) => {
        const order = doc.data() as Order;
        (order.items || []).forEach((item) => {
          if (item.productId === productId) {
            const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
            const quantityToDeduct = (item.quantity || 0) * (item.stockDeductionAmount || 1);
            if (!quantityToDeduct) return;
            claimedMap.set(key, (claimedMap.get(key) || 0) + quantityToDeduct);
            if (order.status === "PICKED_UP") {
              pickedUpMap.set(key, (pickedUpMap.get(key) || 0) + quantityToDeduct);
            }
          }
        });
      });
      if (Array.isArray(product.salesHistory)) {
        product.salesHistory = product.salesHistory.map((round) => {
          if (!Array.isArray(round.variantGroups)) return round;
          round.variantGroups = round.variantGroups.map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            return { ...vg, reservedCount: claimedMap.get(key) || 0, pickedUpCount: pickedUpMap.get(key) || 0 };
          });
          return round;
        });
      }
      return { product };
    } catch (error) {
      logger.error("getProductByIdWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 상품 목록 페이징
// =================================================================
export const getProductsPage = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "256MiB",
    timeoutSeconds: 30,
    enforceAppCheck: false,
  },
  async (request) => {
    try {
      const pageSizeRaw = request.data?.pageSize;
      const lastVisibleTimestamp = request.data?.lastVisibleTimestamp;
      const pageSize = typeof pageSizeRaw === "number" && pageSizeRaw > 0 && pageSizeRaw <= 50 ? pageSizeRaw : 20;
      let query = db.collection("products").where("isArchived", "==", false).orderBy("createdAt", "desc").limit(pageSize);
      if (lastVisibleTimestamp) {
        query = query.startAfter(Timestamp.fromMillis(lastVisibleTimestamp));
      }
      const snap = await query.get();
      const items = snap.docs.map((d) => ({ ...(d.data() as Product), id: d.id }));
      const lastVisible = snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1].get("createdAt") as Timestamp | null) : null;
      return {
        products: items,
        lastVisible: lastVisible ? lastVisible.toMillis() : null,
      };
    } catch (error) {
      logger.error("getProductsPage error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 페이지를 불러오는 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 앵콜 요청
// =================================================================
export const requestEncore = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "256MiB",
    timeoutSeconds: 20,
    enforceAppCheck: true,
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
      }
      const userId = request.auth.uid;
      const productId = String(request.data?.productId || "").trim();
      if (!productId) {
        throw new HttpsError("invalid-argument", "상품 ID가 필요합니다.");
      }
      const productRef = db.collection("products").doc(productId);
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async (tx) => {
        const productSnap: DocumentSnapshot<DocumentData> = await tx.get(productRef);
        const userSnap: DocumentSnapshot<DocumentData> = await tx.get(userRef);
        if (!productSnap.exists) {
          throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
        }
        if (!userSnap.exists) {
          throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }
        const product = productSnap.data() as Product;
        const requestedAlready = Array.isArray(product.encoreRequesterIds) && product.encoreRequesterIds.includes(userId);
        if (requestedAlready) {
          throw new HttpsError("already-exists", "이미 앵콜을 요청하셨습니다.");
        }
        tx.update(productRef, {
          encoreCount: admin.firestore.FieldValue.increment(1),
          encoreRequesterIds: admin.firestore.FieldValue.arrayUnion(userId),
        });
        tx.update(userRef, {
          encoreRequestedProductIds: admin.firestore.FieldValue.arrayUnion(productId),
        });
      });
      logger.info(`Encore requested successfully by user ${userId} for product ${productId}`);
      return { success: true };
    } catch (error) {
      logger.error("Error processing encore request:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "앵콜 요청 처리 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 상품 정보 변경 알림
// =================================================================
export const notifyUsersOfProductUpdate = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자만 이 기능을 사용할 수 있습니다.");
    }
    const { productId, roundId, productName, changes } = request.data;
    if (!productId || !roundId || !productName || !Array.isArray(changes) || changes.length === 0) {
      throw new HttpsError("invalid-argument", "필수 파라미터가 누락되었습니다.");
    }
    try {
      const ordersSnapshot = await db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]).get();
      const userIds = new Set<string>();
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        const isTargetOrder = (order.items || []).some(item => item.productId === productId && item.roundId === roundId);
        if (isTargetOrder && order.userId) {
          userIds.add(order.userId);
        }
      });
      if (userIds.size === 0) {
        logger.info(`No orders found for productId: ${productId}, roundId: ${roundId}. No notifications sent.`);
        return { success: true, message: "알림 대상자가 없습니다." };
      }
      const uniqueUserIds = Array.from(userIds);
      logger.info(`Found ${uniqueUserIds.length} users to notify for product ${productId} round ${roundId}.`);
      const batch = db.batch();
      const changeText = changes.join(", ");
      const message = `[상품 정보 변경] '${productName}' 상품의 정보가 변경되었습니다. (변경: ${changeText})`;
      uniqueUserIds.forEach(userId => {
        const notificationRef = db.collection("users").doc(userId).collection("notifications").doc();
        batch.set(notificationRef, {
          message,
          read: false,
          timestamp: FieldValue.serverTimestamp(),
          type: 'PRODUCT_UPDATE',
          link: `/my-orders`,
        });
      });
      await batch.commit();
      logger.info(`Successfully sent notifications to ${uniqueUserIds.length} users.`);
      return { success: true, message: `${uniqueUserIds.length}명에게 알림을 보냈습니다.` };
    } catch (error) {
      logger.error("Error in notifyUsersOfProductUpdate:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "알림 전송 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 장바구니 유효성 검사
// =================================================================
export const validateCart = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
  const itemsToValidate = request.data.items as any[];
  const userId = request.auth?.uid;
  if (!itemsToValidate || !Array.isArray(itemsToValidate) || itemsToValidate.length === 0) {
    throw new HttpsError("invalid-argument", "검증할 상품 정보가 없습니다.");
  }
  if (!userId) {
    return {
      validatedItems: itemsToValidate.map(item => ({ ...item, status: "OK" })),
      summary: { sufficient: true, reason: "OK" },
    };
  }
  try {
    const userDocRef = db.collection("users").doc(userId);
    const productIds = [...new Set(itemsToValidate.map(item => item.productId))];
    const validationResult = await db.runTransaction(async (transaction) => {
      const userDocSnap = await transaction.get(userDocRef);
      const userDoc = userDocSnap.data() as UserDocument | undefined;
      const productDocs = await Promise.all(productIds.map(id => transaction.get(db.collection("products").doc(id))));
      const productsMap = new Map(productDocs.map(doc => [doc.id, doc.data() as Product]));
      const ordersSnap = await transaction.get(db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]));
      const claimedMap = new Map<string, number>();
      ordersSnap.forEach(doc => {
        const order = doc.data() as Order;
        (order.items || []).forEach(item => {
          const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          const quantityToDeduct = (item.quantity || 0) * (item.stockDeductionAmount || 1);
          claimedMap.set(key, (claimedMap.get(key) || 0) + quantityToDeduct);
        });
      });
      const validatedItems: any[] = [];
      let isSufficient = true;
      for (const item of itemsToValidate) {
        const product = productsMap.get(item.productId);
        if (!product) {
          validatedItems.push({ ...item, status: "REMOVED", reason: "상품 정보 없음" });
          continue;
        }
        const round = product.salesHistory.find(r => r.roundId === item.roundId);
        if (!round) {
          validatedItems.push({ ...item, status: "REMOVED", reason: "판매 회차 정보 없음" });
          continue;
        }
        const vg = round.variantGroups.find(v => v.id === item.variantGroupId) || (round.variantGroups.length === 1 ? round.variantGroups[0] : undefined);
        if (!vg) {
          validatedItems.push({ ...item, status: "REMOVED", reason: "옵션 정보 없음" });
          continue;
        }
        if (userDoc && Array.isArray(round.allowedTiers) && !round.allowedTiers.includes(userDoc.loyaltyTier)) {
          validatedItems.push({ ...item, status: "INELIGIBLE", reason: "사용자 등급 제한" });
          continue;
        }
        if (vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
          const key = `${item.productId}-${item.roundId}-${vg.id || 'default'}`;
          const reservedCount = claimedMap.get(key) || 0;
          const remainingStock = vg.totalPhysicalStock - reservedCount;
          const requestedStock = (item.quantity || 0) * (item.stockDeductionAmount || 1);
          if (requestedStock > remainingStock) {
            validatedItems.push({ ...item, status: "REMOVED", reason: `재고 부족 (잔여: ${Math.floor(remainingStock / (item.stockDeductionAmount || 1))}개)` });
            continue;
          }
        }
        validatedItems.push({ ...item, status: "OK" });
      }
      isSufficient = validatedItems.every(item => item.status === "OK");
      return {
        validatedItems,
        summary: {
          sufficient: isSufficient,
          reason: validatedItems.find(item => item.status === "REMOVED")?.reason || "OK",
        },
      };
    });
    return validationResult;
  } catch (error) {
    logger.error("`validateCart` 함수 실행 중 오류 발생:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "장바구니 검증 중 서버 오류가 발생했습니다.");
  }
});

// =================================================================
// 개발용: 에뮬레이터에서 관리자 권한 부여
// =================================================================
export const setAdminClaimForEmulator = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
  },
  async (request) => {
    if (!process.env.FUNCTIONS_EMULATOR) {
      throw new HttpsError("permission-denied", "이 기능은 에뮬레이터에서만 사용할 수 있습니다.");
    }
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "인증된 사용자가 아닙니다.");
    }
    const userId = request.auth.uid;
    try {
      await adminAuth().setCustomUserClaims(userId, { role: 'admin', tier: 'master' });
      logger.info(`[개발용] 사용자 ${userId}에게 관리자(admin) 권한을 부여했습니다.`);
      return { success: true, message: `사용자 ${userId}가 관리자가 되었습니다.` };
    } catch (error) {
      logger.error("관리자 권한 부여 중 오류 발생:", error);
      throw new HttpsError("internal", "관리자 권한을 부여하는 중 오류가 발생했습니다.");
    }
  }
);
