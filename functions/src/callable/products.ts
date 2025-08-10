// functions/src/callable/products.ts
// Cloud Functions (v2) — Products related callables

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
 * 1) AI 파싱: parseProductText
 *  - v2 HttpsError 사용
 *  - secrets: GEMINI_API_KEY
 * --------------------------------- */
export const parseProductText = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: ["GEMINI_API_KEY"],
    // 필요한 경우 App Check 강제
    // enforceAppCheck: true,
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

      const result = await analyzeProductTextWithAI(text, categoriesHint);
      return result;
    } catch (error) {
      logger.error("parseProductText error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 텍스트 분석 중 오류가 발생했습니다.");
    }
  }
);

/** --------------------------------
 * 2) 재고/예약 합산 포함 상품 조회: getProductsWithStock
 *   - 페이지네이션: pageSize, lastVisibleTimestamp(ms)
 *   - isArchived=false 정렬 createdAt desc
 *   - reserved 수량 합산(간단 로직)
 * --------------------------------- */
export const getProductsWithStock = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
    // 프론트 접근 특성상 App Check를 열어둔 상태라면 false, 보호가 필요하면 true로
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

      const productsSnapshot = await query.get(); // QuerySnapshot<DocumentData>
      const products = productsSnapshot.docs.map((doc) => ({
        ...(doc.data() as Product),
        id: doc.id,
      })) as (Product & { id: string })[];

      // 예약/결제(또는 필요한 상태) 합산 — 여기서는 간단 합산 예시
      const ordersSnap = await db
        .collection("orders")
        .where("status", "in", ["PAID", "CONFIRMED"])
        .where("isCanceled", "==", false)
        .limit(2000) // 페이지 기준으로 적절히 제한
        .get();

      // key: `${productId}-${roundId}-${variantGroupId}` => quantity sum
      const reservedMap = new Map<string, number>();

      ordersSnap.docs.forEach((od) => {
        const order = od.data() as Order;
        const items: OrderItem[] = (order.items || []) as any;
        items.forEach((it) => {
          const key = `${it.productId || ""}-${it.roundId || ""}-${it.variantGroupId || ""}`;
          const qty = Number(it.quantity || 0);
          if (!qty) return;
          reservedMap.set(key, (reservedMap.get(key) || 0) + qty);
        });
      });

      const productsWithReservedData = products.map((product) => {
        const newSalesHistory: SalesRound[] = (product.salesHistory || []).map((round) => {
          const newVariantGroups: VariantGroup[] = (round.variantGroups || []).map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            return {
              ...vg,
              // 필요 시 각 item별 reservedCount 확장 가능
              reservedCount: reservedMap.get(key) || 0,
            } as VariantGroup;
          });

          return {
            ...round,
            variantGroups: newVariantGroups,
          } as SalesRound;
        });

        return {
          ...product,
          salesHistory: newSalesHistory,
        } as Product;
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
 * 3) 페이지네이션용 단순 목록: getProductsPage
 *  - 프론트에서 간단 목록만 필요할 때
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
 *  - 사용자가 특정 상품에 앵콜을 요청하면
 *  - product.encoreCount 증가
 *  - product.encoreRequesterIds 에 userId 추가(중복 방지)
 *  - user.encoreRequestedProductIds 에 productId 추가(중복 방지)
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

        // product 업데이트
        tx.update(productRef, {
          encoreCount: admin.firestore.FieldValue.increment(1),
          encoreRequesterIds: admin.firestore.FieldValue.arrayUnion(userId),
        });

        // user 업데이트
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
