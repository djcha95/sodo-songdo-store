// functions/src/callable/products.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import type { Product, Category, Order, OrderItem, SalesRound, VariantGroup } from "../types.js";
import { analyzeProductTextWithAI } from "../utils/gemini.js";

// ✅ [수정] Firestore 데이터 변환기(Converter)를 정의합니다.
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

export const parseProductText = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    // ... (이 함수 내용은 변경 없음)
    if (!request.auth) { throw new HttpsError("unauthenticated", "The function must be called while authenticated."); }
    const { text } = request.data;
    if (!text || typeof text !== "string" || text.trim() === "") { throw new HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");}
    try {
      logger.info("Starting AI analysis for product text...");
      // ✅ [수정] 타입 변환기를 사용하여 쿼리합니다.
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
    // ✅ [수정] 타입 변환기를 사용하여 쿼리합니다.
    const ordersSnapshot = await db.collection("orders").withConverter(orderConverter).where("status", "in", ["RESERVED", "PREPAID"]).get();

    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      (order.items || []).forEach((item: OrderItem) => {
        const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        reservedQuantitiesMap.set(key, (reservedQuantitiesMap.get(key) || 0) + item.quantity);
      });
    });

    // ✅ [수정] 타입 변환기를 사용하여 쿼리합니다.
    let query = db.collection("products").withConverter(productConverter)
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

    if (lastVisibleTimestamp) {
      query = query.startAfter(Timestamp.fromMillis(lastVisibleTimestamp));
    }

    const productsSnapshot = await query.get();
    // ✅ [수정] 이제 타입을 명시하지 않아도 되며, id 중복 문제를 해결합니다.
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


export const getProductsForList = onCall({ region: "asia-northeast3", cors: allowedOrigins }, async (request) => {
    // ... (이 함수 내용은 변경 없음, 단 rawProducts 부분 수정)
    const { pageSize = 10, lastVisibleCreatedAt = null } = request.data;
    logger.info("Fetching products for list", { pageSize, lastVisibleCreatedAt });
    try {
      // ✅ [수정] 타입 변환기를 사용하여 쿼리합니다.
      let productsQuery = db.collection('products').withConverter(productConverter)
          .where('isArchived', '==', false)
          .orderBy('createdAt', 'desc')
          .limit(pageSize);
  
      if (lastVisibleCreatedAt) {
          productsQuery = productsQuery.startAfter(Timestamp.fromDate(new Date(lastVisibleCreatedAt)));
      }
  
      const productsSnapshot = await productsQuery.get();
      // ✅ [수정] id 중복 문제를 해결합니다.
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