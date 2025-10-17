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
  UserDocument,
  CustomerInfo
} from "@/shared/types";


// =================================================================
// 1. 신규 상품 + 첫 회차 등록: addProductWithFirstRound
// =================================================================
export const addProductWithFirstRound = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자만 상품을 등록할 수 있습니다.");
    }

    const { productData, salesRoundData, creationDate } = request.data;
    if (!productData || !salesRoundData || !creationDate) {
      throw new HttpsError("invalid-argument", "상품 생성에 필요한 정보가 누락되었습니다.");
    }
    if (!productData.groupName || !salesRoundData.roundName) {
        throw new HttpsError("invalid-argument", "상품명과 회차명은 필수입니다.");
    }

    try {
      const newProductRef = db.collection("products").doc();
      const newProductId = newProductRef.id;

      const firstRound: SalesRound = {
        ...salesRoundData,
        roundId: newProductId,
        createdAt: Timestamp.fromDate(new Date(creationDate)),
        waitlist: [],
        waitlistCount: 0,
      };

      const newProductData: Omit<Product, 'id'> = {
        ...productData,
        salesHistory: [firstRound],
        imageUrls: [],
        isArchived: false,
        createdAt: Timestamp.fromDate(new Date(creationDate)),
        encoreCount: 0,
        encoreRequesterIds: [],
      };

      await newProductRef.set(newProductData);
      
      logger.info(`New product created by ${request.auth?.uid} with ID: ${newProductId}`);
      
      return {
        success: true,
        productId: newProductId,
        message: "상품이 성공적으로 등록되었습니다."
      };

    } catch (error) {
      logger.error("Error in addProductWithFirstRound:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "상품 등록 중 서버 오류가 발생했습니다.");
    }
  }
);


// =================================================================
// 2. 상품명으로 검색: searchProductsByName
// =================================================================
export const searchProductsByName = onCall(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
  },
  async (request) => {
    const name = request.data.name as string;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new HttpsError('invalid-argument', '검색할 상품명을 입력해주세요.');
    }

    try {
      const trimmedName = name.trim();
      const productsRef = db.collection('products');
      
      const snapshot = await productsRef
        .where('groupName', '>=', trimmedName)
        .where('groupName', '<=', trimmedName + '\uf8ff')
        .where('isArchived', '==', false)
        .limit(5)
        .get();

      if (snapshot.empty) {
        return [];
      }
      
      const products = snapshot.docs.map(doc => ({
        ...(doc.data() as Product),
        id: doc.id,
      }));

      return products;

    } catch (error) {
      logger.error('Error in searchProductsByName:', error);
      throw new HttpsError('internal', '상품 검색 중 오류가 발생했습니다.');
    }
  }
);

// =================================================================
// ✅ [신규 추가] 3. 상품 핵심 정보 수정: updateProductCoreInfo
// =================================================================
export const updateProductCoreInfo = onCall(
  {
    region: "asia-northeast3",
    // onCall 함수는 CORS를 자동으로 처리하므로 cors: allowedOrigins 옵션이 없어도 괜찮습니다.
    // 하지만 명시적으로 추가해도 문제는 없습니다.
  },
  async (request) => {
    // 1. 관리자 권한 확인
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    // 2. 파라미터 유효성 검사
    const { productId, productData, finalImageUrls } = request.data;
    if (!productId || !productData) {
      throw new HttpsError("invalid-argument", "상품 ID와 업데이트할 데이터가 필요합니다.");
    }

    try {
      const productRef = db.collection("products").doc(productId);

      // 3. 업데이트할 데이터 객체 생성
      // 클라이언트에서 보낸 productData와 최종 이미지 URL 목록을 합칩니다.
      const dataToUpdate = {
        ...productData,
        imageUrls: finalImageUrls, // finalImageUrls가 undefined가 아니면 이 값으로 덮어씁니다.
      };

      // 4. Firestore 문서 업데이트
      await productRef.update(dataToUpdate);

      logger.info(`Product core info updated successfully for product ID: ${productId}`);
      
      // 5. 성공 응답 반환
      return {
        success: true,
        message: "상품 정보가 성공적으로 업데이트되었습니다."
      };

    } catch (error) {
      logger.error("Error in updateProductCoreInfo:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "상품 정보 업데이트 중 서버 오류가 발생했습니다.");
    }
  }
);


const convertToClientProduct = (product: Product & { id: string }): Product => {
  return {
    id: product.id,
    groupName: product.groupName,
    description: product.description,
    imageUrls: product.imageUrls,
    storageType: product.storageType,
    salesHistory: (product.salesHistory || []).map(round => ({
      roundId: round.roundId,
      roundName: round.roundName,
      status: round.status,
      variantGroups: (round.variantGroups || []).map(vg => ({
        id: vg.id,
        groupName: vg.groupName,
        items: vg.items,
        totalPhysicalStock: vg.totalPhysicalStock,
        stockUnitType: vg.stockUnitType,
        reservedCount: vg.reservedCount,
        pickedUpCount: vg.pickedUpCount,
      })),
      publishAt: round.publishAt,
      deadlineDate: round.deadlineDate,
      pickupDate: round.pickupDate,
      pickupDeadlineDate: round.pickupDeadlineDate,
      arrivalDate: round.arrivalDate,
      createdAt: round.createdAt,
      isPrepaymentRequired: round.isPrepaymentRequired,
      manualStatus: round.manualStatus,
      isManuallyOnsite: round.isManuallyOnsite,
    })),
    isArchived: product.isArchived,
    createdAt: product.createdAt,
  };
};

/** --------------------------------
 * 4) 재고/예약 합산 포함 상품 목록 조회: getProductsWithStock
 * --------------------------------- */
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
      const { pageSize = 10, lastVisible: lastVisibleDocData } = request.data || {};

      let query = db
        .collection("products")
        .where("isArchived", "==", false)
        .orderBy("createdAt", "desc")
        .limit(pageSize);

      if (lastVisibleDocData?.id) {
        const lastVisibleDoc = await db.collection("products").doc(lastVisibleDocData.id).get();
        if(lastVisibleDoc.exists) {
            query = query.startAfter(lastVisibleDoc);
        }
      }

      const productsSnapshot = await query.get();
      const products = productsSnapshot.docs.map((doc) => ({
        ...(doc.data() as Product),
        id: doc.id,
      })) as (Product & { id: string })[];

      const ordersSnap = await db
        .collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"])
        .get();
      const claimedMap = new Map<string, number>();
      const pickedUpMap = new Map<string, number>();
      ordersSnap.docs.forEach((od) => {
        const order = od.data() as Order;
        (order.items || []).forEach((it) => {
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
        if (!Array.isArray(product.salesHistory)) return product;
        const newSalesHistory: SalesRound[] = product.salesHistory.map((round) => {
          if (!Array.isArray(round.variantGroups)) return round;
          const newVariantGroups: VariantGroup[] = round.variantGroups.map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            return {
              ...vg,
              reservedCount: claimedMap.get(key) || 0,
              pickedUpCount: pickedUpMap.get(key) || 0,
            };
          });
          return { ...round, variantGroups: newVariantGroups };
        });
        return { ...product, salesHistory: newSalesHistory };
      });
      
      const clientFriendlyProducts = productsWithClaimedData.map(p => convertToClientProduct(p));

      const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      const nextLastVisible = lastDoc ? { id: lastDoc.id, createdAt: lastDoc.data().createdAt } : null;

      return {
        products: clientFriendlyProducts,
        lastVisible: nextLastVisible,
      };
    } catch (error) {
      logger.error("getProductsWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 목록을 불러오는 중 오류가 발생했습니다.");
    }
  }
);


/** --------------------------------
 * 5) ID로 단일 상품 조회 (재고 포함): getProductByIdWithStock
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
              pickedUpCount: pickedUpMap.get(key) || 0,
            };
          });
          return round;
        });
      }

      const clientFriendlyProduct = convertToClientProduct(product);

      return { product: clientFriendlyProduct };

    } catch (error) {
      logger.error("getProductByIdWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }
);

// ... (이하 나머지 함수들은 기존과 동일)
/** --------------------------------
 * 6) 페이지네이션용 단순 목록: getProductsPage
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
 * 7) 앵콜 요청: requestEncore
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
 * 8) 상품 정보 변경 알림: notifyUsersOfProductUpdate (수정됨)
 * ----------------------------------------------------------------
 */
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
      const ordersSnapshot = await db.collection("orders")
        .where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"])
        .get();

      const userIds = new Set<string>();
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
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
      throw new HttpsError("internal", "알림 전송 중 서버 오류가 발생했습니다.");
    }
  }
);

/**
 * =================================================================
 * 9) 장바구니 유효성 검사: validateCart
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

        const vg = round.variantGroups.find(v => v.id === item.variantGroupId) ||
                   (round.variantGroups.length === 1 ? round.variantGroups[0] : undefined);
        
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