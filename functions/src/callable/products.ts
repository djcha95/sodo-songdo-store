// functions/src/callable/products.ts
// Cloud Functions (v2) — Products related callables
// v1.2 - 단일 상품 재고 조회 함수 추가

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, DocumentData, DocumentSnapshot } from "firebase-admin/firestore";

import type {
  Product,
  Order,
  OrderItem,
  SalesRound,
  VariantGroup,
} from "../types.js";

import { analyzeProductTextWithAI } from "../utils/gemini.js";

/** --------------------------------
 * (유틸) 카테고리 이름 리스트 로드
 * --------------------------------- */
async function getCategoryNames(): Promise<string[]> {
  const snap = await db.collection("categories").orderBy("order", "asc").get();
  return snap.docs
    .map((d) => String(d.get("name") ?? "").trim())
    .filter(Boolean);
}

/** --------------------------------
 * 1) AI 파싱: parseProductText
 * --------------------------------- */
export const parseProductText = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    try {
      const text = String(request.data?.text ?? "").trim();
      const categoriesHint: string[] = Array.isArray(request.data?.categories)
        ? request.data.categories
        : [];

      if (!text) {
        throw new HttpsError("invalid-argument", "분석할 텍스트가 비었습니다.");
      }

      const categories =
        categoriesHint.length > 0 ? categoriesHint : await getCategoryNames();

      const result = await analyzeProductTextWithAI(text, categories);
      
      return {
        groupName: result?.groupName ?? "",
        cleanedDescription: result?.cleanedDescription ?? text,
        categoryName: result?.categoryName ?? (categories[0] ?? "기타"),
        storageType: result?.storageType ?? "ROOM",
        productType: result?.productType ?? "GENERAL",
        variantGroups: Array.isArray(result?.variantGroups) ? result!.variantGroups : [],
        hashtags: Array.isArray(result?.hashtags) ? result.hashtags : [],
      };
    } catch (error: any) {
      logger.error("parseProductText error:", error?.message || error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 텍스트 분석 중 오류가 발생했습니다.");
    }
  }
);

/** --------------------------------
 * 2) 재고/예약 합산 포함 상품 목록 조회: getProductsWithStock
 * --------------------------------- */
export const getProductsWithStock = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    enforceAppCheck: false,
  },
  async (request) => {
    try {
      const pageSizeRaw = request.data?.pageSize;
      const lastVisibleTimestamp = request.data?.lastVisibleTimestamp;
      const pageSize =
        typeof pageSizeRaw === "number" && pageSizeRaw > 0 && pageSizeRaw <= 50
          ? pageSizeRaw
          : 20;

      let query = db
        .collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

      if (lastVisibleTimestamp) {
        query = query.startAfter(Timestamp.fromMillis(lastVisibleTimestamp));
      }

      const productsSnapshot = await query.get();
      const products = productsSnapshot.docs.map((doc) => ({
        ...(doc.data() as Product),
        id: doc.id,
      })) as (Product & { id: string })[];

      const ordersSnap = await db
        .collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID"])
        .get();

      const reservedMap = new Map<string, number>();
      ordersSnap.docs.forEach((od) => {
        const order = od.data() as Order;
        const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
        items.forEach((it) => {
          if (!it.productId || !it.roundId || !it.variantGroupId) return;
          const key = `${it.productId}-${it.roundId}-${it.variantGroupId}`;
          const qty = Number(it.quantity || 0);
          if (!qty) return;
          reservedMap.set(key, (reservedMap.get(key) || 0) + qty);
        });
      });

      const productsWithReservedData = products.map((product) => {
        if (!Array.isArray(product.salesHistory)) {
          return product;
        }
        const newSalesHistory: SalesRound[] = product.salesHistory.map((round) => {
          if (!Array.isArray(round.variantGroups)) {
            return round;
          }
          const newVariantGroups: VariantGroup[] = round.variantGroups.map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            return {
              ...vg,
              reservedCount: reservedMap.get(key) || 0,
            };
          });

          return {
            ...round,
            variantGroups: newVariantGroups,
          };
        });

        return {
          ...product,
          salesHistory: newSalesHistory,
        };
      });

      const lastVisible =
        productsSnapshot.docs.length > 0
          ? (productsSnapshot.docs[productsSnapshot.docs.length - 1].get("createdAt") as Timestamp | null)
          : null;

      return {
        products: productsWithReservedData,
        lastVisible: lastVisible ? lastVisible.toMillis() : null,
      };
    } catch (error) {
      logger.error("getProductsWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 목록을 불러오는 중 오류가 발생했습니다.");
    }
  }
);

/** --------------------------------
 * ✅ [신규 추가] ID로 단일 상품 조회 (재고 포함): getProductByIdWithStock
 * - productId를 받아 단일 상품의 상세 정보와
 * - 실시간 예약 수량이 합산된 데이터를 반환합니다.
 * --------------------------------- */
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

      // RESERVED / PREPAID 상태의 모든 주문을 가져와 예약 수량을 계산합니다.
      const ordersSnap = await db
        .collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID"])
        .get();

      const reservedMap = new Map<string, number>();
      ordersSnap.docs.forEach((doc) => {
        const order = doc.data() as Order;
        (order.items || []).forEach((item) => {
          // 현재 조회 중인 상품과 관련된 항목만 계산에 포함합니다.
          if (item.productId === productId) {
            const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
            reservedMap.set(key, (reservedMap.get(key) || 0) + item.quantity);
          }
        });
      });

      // 조회된 상품 데이터에 계산된 예약 수량을 추가(enrich)합니다.
      if (Array.isArray(product.salesHistory)) {
        product.salesHistory = product.salesHistory.map((round) => {
          if (!Array.isArray(round.variantGroups)) return round;
          
          round.variantGroups = round.variantGroups.map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            return {
              ...vg,
              reservedCount: reservedMap.get(key) || 0,
            };
          });
          return round;
        });
      }

      // 재고 정보가 포함된 최종 상품 데이터를 반환합니다.
      return { product };

    } catch (error) {
      logger.error("getProductByIdWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }
);


/** --------------------------------
 * 3) 페이지네이션용 단순 목록: getProductsPage
 * --------------------------------- */
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
      const pageSize =
        typeof pageSizeRaw === "number" && pageSizeRaw > 0 && pageSizeRaw <= 50
          ? pageSizeRaw
          : 20;

      let query = db
        .collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

      if (lastVisibleTimestamp) {
        query = query.startAfter(Timestamp.fromMillis(lastVisibleTimestamp));
      }

      const snap = await query.get();
      const items = snap.docs.map((d) => ({ ...(d.data() as Product), id: d.id }));
      const lastVisible =
        snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1].get("createdAt") as Timestamp | null) : null;

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

/** --------------------------------
 * 4) 앵콜 요청: requestEncore
 * --------------------------------- */
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

        const requestedAlready =
          Array.isArray(product.encoreRequesterIds) && product.encoreRequesterIds.includes(userId);
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