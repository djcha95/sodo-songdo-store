// functions/src/callable/products.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, allowedOrigins } from "../utils/config.js";
import { Timestamp } from "firebase-admin/firestore";

interface ProductWithHistory {
    id: string;
    salesHistory: {
      roundId: string;
      variantGroups: {
        id: string;
        reservedCount?: number;
      }[];
    }[];
}

export const getProductsWithStock = onCall({
  region: "asia-northeast3", // <- 공백을 제거했습니다.
  enforceAppCheck: false,
  cors: allowedOrigins
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const { pageSize = 10, lastVisible } = request.data;
  
  try {
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