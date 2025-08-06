// functions/src/callable/products.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import type { Product, Category, Order, OrderItem, SalesRound, VariantGroup, UserDocument } from "../types.js";
import { analyzeProductTextWithAI } from "../utils/gemini.js";

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
const categoryConverter = {
  toFirestore(category: Category): DocumentData { return category; },
  fromFirestore(snapshot: QueryDocumentSnapshot): Category {
    return snapshot.data() as Category;
  }
};
const userConverter = {
    toFirestore(user: UserDocument): DocumentData { return user; },
    fromFirestore(snapshot: QueryDocumentSnapshot): UserDocument {
      return snapshot.data() as UserDocument;
    }
};

export const parseProductText = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "The function must be called while authenticated."); }
    const { text } = request.data;
    if (!text || typeof text !== "string" || text.trim() === "") { throw new HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");}
    try {
      logger.info("Starting AI analysis for product text...");
      const categoriesSnapshot = await db.collection("categories").withConverter(categoryConverter).get();
      const categoryNames = categoriesSnapshot.docs.map(doc => doc.data().name);
      if (categoryNames.length === 0) { logger.warn("No categories found in Firestore. AI classification will be skipped."); }
      const analysisResult = await analyzeProductTextWithAI(text, categoryNames);
      logger.info("Successfully parsed product text with AI.", { result: analysisResult });
      return analysisResult;
    } catch (error) {
      logger.error("Error in parseProductText function:", error);
      if (error instanceof HttpsError) { throw error; }
      throw new HttpsError("internal", "An unexpected error occurred during AI analysis.");
    }
  }
);


export const getProductsWithStock = onCall({
  region: "asia-northeast3",
  enforceAppCheck: false,
  cors: allowedOrigins
}, async (request) => {
  if (!request.auth) { throw new HttpsError("unauthenticated", "로그인이 필요합니다."); }
  const { pageSize = 10, lastVisible: lastVisibleTimestamp } = request.data;
  
  try {
    const reservedQuantitiesMap = new Map<string, number>();
    const ordersSnapshot = await db.collection("orders").withConverter(orderConverter).where("status", "in", ["RESERVED", "PREPAID"]).get();

    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      (order.items || []).forEach((item: OrderItem) => {
        const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        reservedQuantitiesMap.set(key, (reservedQuantitiesMap.get(key) || 0) + item.quantity);
      });
    });

    let query = db.collection("products").withConverter(productConverter)
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

    if (lastVisibleTimestamp) {
      query = query.startAfter(Timestamp.fromMillis(lastVisibleTimestamp));
    }

    const productsSnapshot = await query.get();
    const products = productsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

    const productsWithReservedData = products.map((product: Product) => {
      const newSalesHistory = (product.salesHistory || []).map((round: SalesRound) => {
        const newVariantGroups = (round.variantGroups || []).map((vg: VariantGroup) => {
          const key = `${product.id}-${round.roundId}-${vg.id}`;
          return { ...vg, reservedCount: reservedQuantitiesMap.get(key) || 0 };
        });
        return { ...round, variantGroups: newVariantGroups };
      });
      return { ...product, salesHistory: newSalesHistory };
    });
    
    const newLastVisibleDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
    const newLastVisible = newLastVisibleDoc ? (newLastVisibleDoc.data().createdAt as Timestamp)?.toMillis() : null;

    return { products: productsWithReservedData, lastVisible: newLastVisible };
  } catch (error) {
    logger.error("Error in getProductsWithStock:", error);
    throw new HttpsError("internal", "상품 정보를 불러오는 중 오류가 발생했습니다.");
  }
});

// ✅ [복구] 실수로 누락되었던 함수를 다시 추가합니다.
export const getProductsForList = onCall({ region: "asia-northeast3", cors: allowedOrigins }, async (request) => {
    const { pageSize = 10, lastVisibleCreatedAt = null } = request.data;
    logger.info("Fetching products for list", { pageSize, lastVisibleCreatedAt });
    try {
      let productsQuery = db.collection('products').withConverter(productConverter)
          .where('isArchived', '==', false)
          .orderBy('createdAt', 'desc')
          .limit(pageSize);
  
      if (lastVisibleCreatedAt) {
          productsQuery = productsQuery.startAfter(Timestamp.fromDate(new Date(lastVisibleCreatedAt)));
      }
  
      const productsSnapshot = await productsQuery.get();
      const rawProducts = productsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  
      if (rawProducts.length === 0) {
          return { products: [], nextLastVisibleCreatedAt: null };
      }
      const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      let nextCursor = null;
      if (lastDoc) {
        const createdAt = lastDoc.data().createdAt;
        if (createdAt && createdAt instanceof Timestamp) { nextCursor = createdAt.toDate().toISOString(); } 
        else { logger.warn(`Product document ${lastDoc.id} is missing a valid 'createdAt' timestamp for pagination.`); }
      }
      return { products: rawProducts, nextLastVisibleCreatedAt: nextCursor };
    } catch (error) {
      logger.error("Error in getProductsForList:", error);
      throw new HttpsError("internal", "An error occurred while fetching product information.");
    }
});


export const requestEncore = onCall({
    region: "asia-northeast3",
    cors: allowedOrigins
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const userId = request.auth.uid;
    const { productId } = request.data;

    if (!productId) {
        throw new HttpsError("invalid-argument", "상품 ID가 누락되었습니다.");
    }

    const productRef = db.collection("products").doc(productId);
    const userRef = db.collection("users").doc(userId).withConverter(userConverter);

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
            }

            const userData = userDoc.data();
            if (userData?.encoreRequestedProductIds?.includes(productId)) {
                logger.info(`User ${userId} already requested encore for product ${productId}.`);
                return;
            }

            transaction.update(productRef, {
                encoreCount: admin.firestore.FieldValue.increment(1),
                encoreRequesterIds: admin.firestore.FieldValue.arrayUnion(userId)
            });

            transaction.update(userRef, {
                encoreRequestedProductIds: admin.firestore.FieldValue.arrayUnion(productId)
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
});