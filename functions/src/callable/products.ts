// functions/src/callable/products.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, allowedOrigins } from "../utils/config.js";
import { Timestamp } from "firebase-admin/firestore";
import type { Product, Category } from "../types.js";
import { analyzeProductTextWithAI } from "../utils/gemini.js";

export const parseProductText = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    
    const { text } = request.data;
    if (!text || typeof text !== "string" || text.trim() === "") {
      throw new HttpsError(
        "invalid-argument",
        "The function must be called with a non-empty 'text' argument."
      );
    }

    try {
      logger.info("Starting AI analysis for product text...");

      // ✅ [개선] Firestore에서 카테고리 목록을 가져옵니다.
      const categoriesSnapshot = await db.collection("categories").get();
      const categoryNames = categoriesSnapshot.docs.map(doc => (doc.data() as Category).name);
      
      if (categoryNames.length === 0) {
        logger.warn("No categories found in Firestore. AI classification will be skipped.");
      }

      // ✅ [개선] AI 분석 함수에 카테고리 목록을 전달합니다.
      const analysisResult = await analyzeProductTextWithAI(text, categoryNames);

      logger.info("Successfully parsed product text with AI.", { result: analysisResult });
      return analysisResult;
    } catch (error) {
      logger.error("Error in parseProductText function:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "An unexpected error occurred during AI analysis.");
    }
  }
);


// ... (getProductsWithStock, getProductsForList 함수는 변경 없음)
export const getProductsWithStock = onCall({
  region: "asia-northeast3",
  enforceAppCheck: false,
  cors: allowedOrigins
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const { pageSize = 10, lastVisible } = request.data;
  
  try {
    let productsQuery = db.collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

    if (lastVisible) {
      productsQuery = productsQuery.startAfter(Timestamp.fromMillis(lastVisible));
    }

    const productsSnapshot = await productsQuery.get();

    const products = productsSnapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
      } as Product;
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
      const rawProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
      if (rawProducts.length === 0) {
          return { products: [], nextLastVisibleCreatedAt: null };
      }
      
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
          products: rawProducts,
          nextLastVisibleCreatedAt: nextCursor,
      };
    } catch (error) {
        logger.error("Error in getProductsForList:", error);
        throw new HttpsError("internal", "An error occurred while fetching product information.");
    }
});