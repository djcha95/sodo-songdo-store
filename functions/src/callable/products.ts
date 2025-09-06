// functions/src/callable/products.ts
// Cloud Functions (v2) — Products related callables
// v1.5 - getProductsWithStock에서 전체 예약/판매량과 픽업량을 분리하여 계산

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, DocumentData, DocumentSnapshot, FieldValue } from "firebase-admin/firestore";

import type {
  Product,
  Order,
  OrderItem,
  SalesRound,
  VariantGroup,
  UserDocument 
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
 * 2) 재고/예약 합산 포함 상품 목록 조회: getProductsWithStock (✅ 수정됨)
 * --------------------------------- */
export const getProductsWithStock = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "1GiB", // 전체 상품 조회를 위해 메모리 상향
    timeoutSeconds: 60,
    enforceAppCheck: false,
  },
  async (request) => {
    try {
      const query = db
        .collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc");

      const productsSnapshot = await query.get();
      const products = productsSnapshot.docs.map((doc) => ({
        ...(doc.data() as Product),
        id: doc.id,
      })) as (Product & { id: string })[];

      const ordersSnap = await db
        .collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"])
        .get();

      // ✅ [수정] claimedMap은 픽업 포함 전체 판매량을, pickedUpMap은 픽업 완료된 수량만 계산
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

          // 전체 판매량 계산
          claimedMap.set(key, (claimedMap.get(key) || 0) + quantityToDeduct);

          // 픽업 완료량만 별도 계산
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
            // ✅ [수정] reservedCount와 pickedUpCount를 모두 반환
            return {
              ...vg,
              reservedCount: claimedMap.get(key) || 0,
              pickedUpCount: pickedUpMap.get(key) || 0,
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
      
      return {
        products: productsWithClaimedData,
        lastVisible: null, 
      };
    } catch (error) {
      logger.error("getProductsWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 목록을 불러오는 중 오류가 발생했습니다.");
    }
  }
);



/** --------------------------------
 * 3) ID로 단일 상품 조회 (재고 포함): getProductByIdWithStock (✅ 개선됨)
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

      const ordersSnap = await db
        .collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"])
        .get();

      // ✅ [개선] claimedMap(총 예약/판매량)과 pickedUpMap(픽업 완료량)을 모두 계산
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
            return {
              ...vg,
              reservedCount: claimedMap.get(key) || 0,
              // ✅ [개선] pickedUpCount 추가
              pickedUpCount: pickedUpMap.get(key) || 0,
            };
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

/** --------------------------------
 * 4) 페이지네이션용 단순 목록: getProductsPage
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
 * 5) 앵콜 요청: requestEncore
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

/**
 * ----------------------------------------------------------------
 * 6) 상품 정보 변경 알림: notifyUsersOfProductUpdate (수정됨)
 * ----------------------------------------------------------------
 * 상품 정보가 수정되었을 때, 해당 상품/회차를 주문했던 모든 사용자에게 알림을 보냅니다.
 */
export const notifyUsersOfProductUpdate = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 120, // 사용자 조회 및 알림 생성으로 시간 여유 있게 설정
  },
  async (request) => {
    const userRole = request.auth?.token.role;

    // 1. 관리자 권한 확인
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자만 이 기능을 사용할 수 있습니다.");
    }
    
    // 2. 파라미터 유효성 검사
    const { productId, roundId, productName, changes } = request.data;
    if (!productId || !roundId || !productName || !Array.isArray(changes) || changes.length === 0) {
      throw new HttpsError("invalid-argument", "필수 파라미터가 누락되었습니다.");
    }

    try {
      // 3. 해당 상품/회차를 주문한 모든 사용자 ID 조회 (✅ 수정된 로직)
      const ordersSnapshot = await db.collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"])
        .get();

      const userIds = new Set<string>();
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        // 각 주문에 포함된 상품(items)들을 순회하며 조건 확인
        const isTargetOrder = (order.items || []).some(item => 
            item.productId === productId && item.roundId === roundId
        );

        if(isTargetOrder && order.userId) {
          userIds.add(order.userId);
        }
      });

      if (userIds.size === 0) {
        logger.info(`No orders found for productId: ${productId}, roundId: ${roundId}. No notifications sent.`);
        return { success: true, message: "알림 대상자가 없습니다." };
      }
      
      const uniqueUserIds = Array.from(userIds);
      logger.info(`Found ${uniqueUserIds.length} users to notify for product ${productId} round ${roundId}.`);

      // 4. 각 사용자에게 알림 생성 (Batch 사용으로 원자적 실행)
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
          link: `/my-orders`, // 내 주문내역 페이지로 이동 링크
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
      throw new HttpsError("internal", "알림 전송 중 서버 오류가 발생했습니다.");
    }
  }
);

/**
 * =================================================================
 * 7) 장바구니 유효성 검사: validateCart (🚨 중요: 로직 수정됨)
 * =================================================================
 */
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
      
      // ✅ [추가] 현재 예약된 수량을 트랜잭션 내에서 실시간으로 계산
      const ordersSnap = await transaction.get(
        db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"])
      );
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

        // ✅ [수정] 하위 호환성 로직 추가
        // ID로 옵션을 찾되, 실패하면 옵션이 1개뿐인지 확인하고 그걸로 대체
        const vg = round.variantGroups.find(v => v.id === item.variantGroupId) ||
                   (round.variantGroups.length === 1 ? round.variantGroups[0] : undefined);
        
        if (!vg) {
            validatedItems.push({ ...item, status: "REMOVED", reason: "옵션 정보 없음" });
            continue;
        }
        
        // ✅ [수정] 사용자 등급 검증 로직 활성화
        if (userDoc && Array.isArray(round.allowedTiers) && !round.allowedTiers.includes(userDoc.loyaltyTier)) {
           validatedItems.push({ ...item, status: "INELIGIBLE", reason: "사용자 등급 제한" });
           continue;
        }

        // ✅ [수정] 재고 검증 로직 구현
        if (vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
            // variantGroupId가 없는 옛날 상품의 경우, 식별을 위해 productId와 roundId만 사용
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

/**
 * =================================================================
 * 8) TV 디지털 배너용 상품 목록 조회: getBannerProducts (Callable)
 * =================================================================
 * 참고: 이 함수는 이제 HTTP 버전으로 대체되었지만, 내부 관리용으로 필요할 수 있어 남겨둡니다.
 */
export const getBannerProducts = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "1GiB",
  },
  async (request) => {
    // ... (기존 onCall 버전 getBannerProducts 로직은 그대로 유지)
    // ... HTTP 버전과 로직은 동일하지만, 호출 방식과 반환 방식에 차이가 있습니다.
    // ... 이 함수는 현재 tv-banner.html에서 사용하지 않습니다.
    // ... 로직 생략 ...
  }
);

// functions/src/callable/products.ts 파일의 맨 아래에 이 함수를 추가해 주세요.

/**
 * =================================================================
 * 9) 추첨 이벤트 응모: enterRaffleEvent (✅ 신규 추가)
 * =================================================================
 */
export const enterRaffleEvent = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins, // CORS 오류 방지를 위해 필수
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const userId = request.auth.uid;
    const { productId, roundId } = request.data;

    if (!productId || !roundId) {
      throw new HttpsError("invalid-argument", "상품 정보가 올바르지 않습니다.");
    }

    try {
      await db.runTransaction(async (transaction) => {
        const productRef = db.collection("products").doc(productId);
        const userRef = db.collection("users").doc(userId);
        const entryRef = db.collection("products").doc(productId)
          .collection("salesHistory").doc(roundId)
          .collection("entries").doc(userId);

        const [productDoc, userDoc, entryDoc] = await Promise.all([
          transaction.get(productRef),
          transaction.get(userRef),
          transaction.get(entryRef)
        ]);
        
        if (!productDoc.exists) {
          throw new HttpsError("not-found", "이벤트 상품을 찾을 수 없습니다.");
        }
        if (!userDoc.exists) {
            throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }

        const product = productDoc.data() as Product;
        const round = product.salesHistory?.find(r => r.roundId === roundId);

        if (round?.eventType !== 'RAFFLE') {
          throw new HttpsError("failed-precondition", "추첨 이벤트 상품이 아닙니다.");
        }

        if (entryDoc.exists) {
          throw new HttpsError("already-exists", "이미 응모하셨습니다.");
        }
        
        const now = Timestamp.now();
        if (round.deadlineDate && now > round.deadlineDate) {
            throw new HttpsError("failed-precondition", "응모 기간이 마감되었습니다.");
        }

        // 응모 내역 저장
        transaction.set(entryRef, {
            userId: userId,
            entryAt: now,
            status: 'entered'
        });

        // 사용자 문서에도 응모한 라운드 ID 기록 (프론트엔드에서 응모 여부 확인 시 사용)
        transaction.update(userRef, {
            enteredRaffleIds: FieldValue.arrayUnion(roundId)
        });
      });

      logger.info(`User ${userId} successfully entered raffle for product ${productId}, round ${roundId}`);
      return { success: true, message: "이벤트 응모가 완료되었습니다." };

    } catch (error) {
      logger.error(`Error entering raffle for user ${userId}, product ${productId}:`, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "이벤트 응모 중 오류가 발생했습니다.");
    }
  }
);