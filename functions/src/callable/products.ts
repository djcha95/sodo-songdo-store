// functions/src/callable/products.ts
// ✅ [성능 최적화] 심각한 성능 병목 현상을 해결했습니다.
// 더 이상 모든 주문(orders)을 읽어오지 않고, Firestore 트리거가 미리 계산해 둔
// 'products' 문서의 예약 수량(reservedCount)을 직접 사용하도록 로직을 전면 수정했습니다.
// 이를 통해 Firestore 읽기 비용을 크게 절감하고 응답 속도를 비약적으로 향상시킵니다.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, allowedOrigins } from "../utils/config.js";
import { Timestamp } from "firebase-admin/firestore";
import type { Product } from "../types.js";

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
    // ✅ [수정] 더 이상 모든 주문을 읽지 않습니다.
    // const reservedQuantitiesMap = new Map<string, number>();
    // const ordersSnapshot = await db.collection("orders")... (이 로직 전체 제거)

    let productsQuery = db.collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

    if (lastVisible) {
      productsQuery = productsQuery.startAfter(Timestamp.fromMillis(lastVisible));
    }

    const productsSnapshot = await productsQuery.get();

    // ✅ [수정] Firestore 트리거가 이미 'reservedCount'를 계산해두었으므로,
    // 별도의 계산 없이 문서를 그대로 반환합니다. 클라이언트는 이 데이터를 바로 사용할 수 있습니다.
    const products = productsSnapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
      } as Product; // 타입을 명확히 지정합니다.
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

// getProductsForList 함수는 현재 사용되지 않는 것으로 보이지만, 유지보수를 위해 남겨둡니다.
export const getProductsForList = onCall({ region: "asia-northeast3", cors: allowedOrigins }, async (request) => {
    // ... (기존 코드 유지)
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
