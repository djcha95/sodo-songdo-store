// functions/src/callable/products.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin, allowedOrigins } from "../firebase/admin.js";
import { Timestamp, DocumentData, DocumentSnapshot, FieldValue, Transaction } from "firebase-admin/firestore";
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

// ✅ [적용 5] 배포 버전 확인용 로그 태그
const BUILD_VERSION = "2025-11-05-safe-array-v2";

// =================================================================
// 1. 신규 상품 + 첫 회차 등록 (변경 없음)
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
// 2. 상품명으로 검색 (변경 없음)
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
// 3. 상품 핵심 정보 수정 (변경 없음)
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
// ✅ [수정됨 V2] 4. 재고 수량 일괄 수정 (중복 병합 + 배열 통교체)
// =================================================================
export const updateMultipleVariantGroupStocks = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    // ✅ [적용 5] 배포 버전 확인용 로그
    logger.info(`[updateMultipleVariantGroupStocks] called. v=${BUILD_VERSION}`, JSON.stringify(request.data, null, 2));

    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { updates } = request.data as {
      updates: { productId: string; roundId: string; variantGroupId: string; newStock: number }[]
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new HttpsError("invalid-argument", "업데이트할 재고 정보가 없습니다.");
    }

    // ✅ [적용 1] 중복 업데이트 병합
    // Map<string (productId), Map<string (roundId::vgId), number (newStock)>>
    const updatesByProduct = new Map<string, Map<string, number>>();
    for (const u of updates) {
      if (typeof u.newStock !== "number" || (u.newStock < 0 && u.newStock !== -1)) {
        logger.warn(`Skipping invalid newStock for product ${u.productId}: ${u.newStock}`);
        continue;
      }
      const productMap = updatesByProduct.get(u.productId) || new Map<string, number>();
      const key = `${u.roundId}::${u.variantGroupId}`;
      productMap.set(key, u.newStock); // 마지막 값으로 덮어쓰기 (중복 병합)
      updatesByProduct.set(u.productId, productMap);
    }

    try {
      await db.runTransaction(async (tx) => {
        // 각 상품 문서를 한 번씩만 읽고, salesHistory 배열을 교체
        for (const [productId, productUpdatesMap] of updatesByProduct.entries()) {
          const productRef = db.collection("products").doc(productId);
          const snap = await tx.get(productRef);
          if (!snap.exists) {
            logger.error(`Product ${productId} not found.`);
            continue;
          }

          const product = snap.data() as Product;

          // ✅ [적용 3] 강화된 유효성 가드
          const safeSalesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
          if (safeSalesHistory.length === 0 && product.salesHistory) {
             logger.error(`Product ${productId} salesHistory is not an array. Data might be corrupt.`);
             continue;
          }

          // ✅ [적용 2] 일관된 깊은 복사
          const newSalesHistory = safeSalesHistory.map(r => ({
            ...r,
            variantGroups: Array.isArray(r.variantGroups) ? r.variantGroups.map(v => ({ ...v })) : [],
          }));

          for (const [key, newStock] of productUpdatesMap.entries()) {
            const [roundId, variantGroupId] = key.split('::');
            
            const rIdx = newSalesHistory.findIndex(r => r.roundId === roundId);
            if (rIdx === -1) {
              logger.warn(`Round ${roundId} not found in product ${productId}.`);
              continue;
            }

            const round = newSalesHistory[rIdx]; // 이미 복사본임
            if (!Array.isArray(round.variantGroups)) {
              logger.error(`Product ${productId} round ${roundId} variantGroups is not an array.`);
              continue;
            }

            const vgIdx = round.variantGroups.findIndex(v => v.id === variantGroupId);
            if (vgIdx === -1) {
              logger.warn(`VariantGroup ${variantGroupId} not found in round ${roundId} (product ${productId}).`);
              continue;
            }

            // 재고 변경 (깊은 복사된 객체 수정)
            round.variantGroups[vgIdx].totalPhysicalStock = newStock;

            // 재고가 다시 채워진 경우 수동 상태 리셋
            if (newStock > 0 || newStock === -1) {
              round.manualStatus = null;
              round.isManuallyOnsite = false;
            }
          }

          // ★ 핵심: 점 표기 없이 배열 통 교체
          tx.update(productRef, {
            salesHistory: newSalesHistory,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      logger.info(`Successfully updated ${updates.length} stock items (array-replace safe path).`);
      return { success: true, message: "재고가 성공적으로 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateMultipleVariantGroupStocks (array-replace):", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "재고 업데이트 중 오류가 발생했습니다.", (error as Error).message);
    }
  }
);

// =================================================================
// ✅ [수정됨 V2] 5. 단일 판매 회차 정보 수정 (깊은 복사 + 배열 통교체)
// =================================================================
export const updateSalesRound = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    // ✅ [적용 5] 배포 버전 확인용 로그
    logger.info(`[updateSalesRound] called. v=${BUILD_VERSION}`, JSON.stringify(request.data, null, 2));

    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { productId, roundId, salesRoundData } = request.data as {
      productId: string;
      roundId: string;
      salesRoundData: Partial<SalesRound>;
    };

    if (!productId || !roundId || !salesRoundData) {
      throw new HttpsError("invalid-argument", "업데이트에 필요한 정보가 누락되었습니다 (ID, 회차 ID, 업데이트 데이터).");
    }

    try {
      // 날짜 변환
      const dateFieldsToConvert: (keyof SalesRound)[] = [
        "publishAt", "deadlineDate", "pickupDate", "pickupDeadlineDate", "arrivalDate", "createdAt"
      ];
      const converted: Partial<SalesRound> = { ...salesRoundData };
      for (const field of dateFieldsToConvert) {
        const value = converted[field];
        if (value && !(value instanceof Timestamp)) {
          const d = new Date(value as any);
          if (!isNaN(d.getTime())) {
            (converted as any)[field] = Timestamp.fromDate(d);
          } else {
            logger.warn(`Field '${String(field)}' was not a valid date:`, value);
          }
        }
      }

      await db.runTransaction(async (tx) => {
        const ref = db.collection("products").doc(productId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");

        const product = snap.data() as Product;
        
        // ✅ [적용 3] 강화된 유효성 가드
        const safeSalesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
         if (safeSalesHistory.length === 0 && product.salesHistory) {
            logger.error(`Product ${productId} salesHistory is not an array. Data might be corrupt.`);
            throw new HttpsError("internal", "상품 데이터가 손상되었습니다 (salesHistory is not an array).");
         }

        // ✅ [적용 2] 일관된 깊은 복사
        const newSalesHistory = safeSalesHistory.map(r => ({
            ...r,
            variantGroups: Array.isArray(r.variantGroups) ? r.variantGroups.map(v => ({ ...v })) : [],
        }));

        const idx = newSalesHistory.findIndex(r => r.roundId === roundId);
        if (idx === -1) throw new HttpsError("not-found", "해당 판매 회차를 찾을 수 없습니다.");

        const currentRound = newSalesHistory[idx]; // 이미 복사본임
        
        // 부분 병합 (variantGroups 등 배열은 요청에 없으면 유지됨)
        const updatedRound: SalesRound = { ...currentRound, ...converted };
        
        newSalesHistory[idx] = updatedRound; // 새 라운드 객체로 교체

        // ★ 핵심: 점 표기 없이 배열 통 교체
        tx.update(ref, {
          salesHistory: newSalesHistory,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return { success: true, message: "판매 회차 정보가 업데이트되었습니다." };
    } catch (error) {
      logger.error(`Error in updateSalesRound for product ${productId}, round ${roundId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "판매 회차 정보 업데이트 중 오류가 발생했습니다.", (error as Error).message);
    }
  }
);


// =================================================================
// ✅ [수정됨 V2] 6. 판매 상태 일괄 수정 (깊은 복사 + 배열 통교체)
// =================================================================
export const updateMultipleSalesRoundStatuses = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    // ✅ [적용 5] 배포 버전 확인용 로그
    logger.info(`[updateMultipleSalesRoundStatuses] called. v=${BUILD_VERSION}`, JSON.stringify(request.data, null, 2));

    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const updates = request.data as { productId: string; roundId: string; newStatus: SalesRoundStatus }[];
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new HttpsError("invalid-argument", "업데이트할 상태 정보가 없습니다.");
    }

    // productId별로 묶기
    const updatesByProduct = new Map<string, { roundId: string; newStatus: SalesRoundStatus }[]>();
    for (const u of updates) {
      const arr = updatesByProduct.get(u.productId) || [];
      arr.push({ roundId: u.roundId, newStatus: u.newStatus });
      updatesByProduct.set(u.productId, arr);
    }

    try {
      await db.runTransaction(async (tx) => {
        for (const [productId, list] of updatesByProduct.entries()) {
          const ref = db.collection("products").doc(productId);
          const snap = await tx.get(ref);
          if (!snap.exists) {
            logger.warn(`Product not found during status update: ${productId}`);
            continue;
          }

          const product = snap.data() as Product;
          
          // ✅ [적용 3] 강화된 유효성 가드
          const safeSalesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
          if (safeSalesHistory.length === 0 && product.salesHistory) {
             logger.error(`Skipping status update for corrupt product ${productId} (salesHistory not array)`);
             continue;
          }

          // ✅ [적용 2] 일관된 깊은 복사
          const newSalesHistory = safeSalesHistory.map(r => ({
            ...r,
            variantGroups: Array.isArray(r.variantGroups) ? r.variantGroups.map(v => ({ ...v })) : [],
          }));

          for (const { roundId, newStatus } of list) {
            const idx = newSalesHistory.findIndex(r => r.roundId === roundId);
            if (idx === -1) {
              logger.warn(`Round ${roundId} not found in ${productId}`);
              continue;
            }
            newSalesHistory[idx].status = newStatus; // 복사본의 상태만 변경
          }

          // ★ 핵심: 점 표기 없이 배열 통 교체
          tx.update(ref, {
            salesHistory: newSalesHistory,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      return { success: true, message: "판매 상태가 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateMultipleSalesRoundStatuses:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "판매 상태 업데이트 중 오류가 발생했습니다.", (error as Error).message);
    }
  }
);

// =================================================================
// ✅ [수정됨 V2] 7. 판매 회차 일괄 삭제 (arrayRemove 대신 filter 사용)
// =================================================================
export const deleteSalesRounds = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    // ✅ [적용 5] 배포 버전 확인용 로그
    logger.info(`[deleteSalesRounds] called. v=${BUILD_VERSION}`, JSON.stringify(request.data, null, 2));
    
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    const deletions = request.data as { productId: string; roundId: string }[];
    if (!Array.isArray(deletions) || deletions.length === 0) {
      throw new HttpsError("invalid-argument", "삭제할 항목 정보가 없습니다.");
    }

    try {
      await db.runTransaction(async (transaction: Transaction) => {
        const productRefs = new Map<string, FirebaseFirestore.DocumentReference>();
        const productDatas = new Map<string, Product>();
        const deletionsByProduct = new Map<string, Set<string>>(); // Set으로 중복 roundId 제거

        // 1. 삭제할 라운드 ID를 상품별로 그룹화하고, 관련 상품 문서를 미리 읽습니다.
        for (const { productId, roundId } of deletions) {
          const roundIds = deletionsByProduct.get(productId) || new Set<string>();
          roundIds.add(roundId);
          deletionsByProduct.set(productId, roundIds);
          
          if (!productRefs.has(productId)) {
            const ref = db.collection("products").doc(productId);
            productRefs.set(productId, ref);
          }
        }
        
        const docs = await Promise.all(
          Array.from(productRefs.values()).map(ref => transaction.get(ref))
        );
        
        docs.forEach(doc => {
          if (doc.exists) {
            productDatas.set(doc.id, doc.data() as Product);
          } else {
            logger.warn(`Product not found during deletion: ${doc.id}`);
          }
        });

        // 2. 읽어온 데이터를 기반으로 .filter()를 사용한 배열 교체 수행
        for (const [productId, roundIdsToDeleteSet] of deletionsByProduct.entries()) {
          const productData = productDatas.get(productId);
          const productRef = productRefs.get(productId);

          if (!productData || !productRef) continue; // 상품 없으면 건너뛰기
          
          // ✅ [적용 3] 강화된 유효성 가드
          const safeSalesHistory = Array.isArray(productData.salesHistory) ? productData.salesHistory : [];
           if (safeSalesHistory.length === 0 && productData.salesHistory) {
             logger.error(`Skipping deletion for corrupt product ${productId} (salesHistory not array)`);
             continue;
          }

          // ✅ [적용 4] arrayRemove 대신 filter 사용
          const newSalesHistory = safeSalesHistory.filter(
            round => !roundIdsToDeleteSet.has(round.roundId)
          );

          // 변경 사항이 있을 때만 업데이트
          if (newSalesHistory.length < safeSalesHistory.length) {
            transaction.update(productRef, {
              salesHistory: newSalesHistory,
              'updatedAt': FieldValue.serverTimestamp()
            });
            logger.info(`Scheduled deletion of ${safeSalesHistory.length - newSalesHistory.length} rounds from product ${productId}`);
          }
        }
      });
      
      return { success: true, message: "선택된 판매 회차가 삭제되었습니다." };
    } catch (error) {
      logger.error("Error in deleteSalesRounds:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "판매 회차 삭제 중 오류가 발생했습니다.", (error as Error).message);
    }
  }
);


// =================================================================
// 8. 상품 목록 조회 (재고 포함) (변경 없음)
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
      const DEBUG_PRODUCT_ID = "VuVa6vMBIKktUsYbc5uS"; // 하리보 상품 ID
      try {
        const debugProductSnap = await db.collection("products").doc(DEBUG_PRODUCT_ID).get();
        if (debugProductSnap.exists) {
          const debugData = debugProductSnap.data();
          logger.info(`[디버깅 1] 상품(${DEBUG_PRODUCT_ID}) 조회 성공. isArchived: ${debugData?.isArchived}`);
        } else {
          logger.info(`[디버깅 1] 상품(${DEBUG_PRODUCT_ID})을 찾을 수 없음 (Not Found).`);
        }
      } catch (e: any) {
        logger.error(`[디버깅 1] 상품(${DEBUG_PRODUCT_ID}) 조회 중 오류 발생:`, e.message);
      }

      const query = db.collection("products").where("isArchived", "==", false).orderBy("createdAt", "desc");
      const productsSnapshot = await query.get();
      const products = productsSnapshot.docs.map((doc) => ({ ...(doc.data() as Product), id: doc.id })) as (Product & { id: string })[];

      const isHariboInResult = products.some(p => p.id === DEBUG_PRODUCT_ID);
      logger.info(`[디버깅 2] "isArchived == false" 쿼리 결과(${products.length}개)에 상품(${DEBUG_PRODUCT_ID}) 포함 여부: ${isHariboInResult}`);

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
        
        const salesHistoryArray = Array.isArray(product.salesHistory) ? product.salesHistory : [];
        
        if (salesHistoryArray.length === 0) {
             if (product.salesHistory && !Array.isArray(product.salesHistory)) { 
                logger.warn(`Product ${product.id} has invalid salesHistory (type: ${typeof product.salesHistory}), returning empty salesHistory.`);
             }
             return { ...product, salesHistory: [] }; 
        }

        const newSalesHistory: SalesRound[] = salesHistoryArray.map((round) => {
          
          const variantGroupsArray = Array.isArray(round.variantGroups) ? round.variantGroups : [];

          if (variantGroupsArray.length === 0) {
              if (round.variantGroups && !Array.isArray(round.variantGroups)) {
                  logger.warn(`Round ${round.roundId} in product ${product.id} has invalid variantGroups (type: ${typeof round.variantGroups}), returning empty variantGroups.`);
              }
              return { ...round, variantGroups: [] }; 
          }

          const newVariantGroups = variantGroupsArray.map((vg) => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            const enrichedVg = { 
                ...vg, 
                reservedCount: claimedMap.get(key) || 0, 
                pickedUpCount: pickedUpMap.get(key) || 0 
            };
            return enrichedVg as VariantGroup & { reservedCount: number; pickedUpCount: number };
          });
          return { ...round, variantGroups: newVariantGroups };
        });
        return { ...product, salesHistory: newSalesHistory };
      });
      
      return { products: productsWithClaimedData, lastVisible: null }; // 최종 반환
    } catch (error) {
      logger.error("getProductsWithStock error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 목록을 불러오는 중 오류가 발생했습니다.");
    }
  }
);
// =================================================================
// 9. 단일 상품 조회 (재고 포함) (변경 없음)
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
// 10. 상품 목록 페이징 (변경 없음)
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
// 11. 앵콜 요청 (변경 없음)
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
// 12. 상품 정보 변경 알림 (변경 없음)
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
// 13. 장바구니 유효성 검사 (변경 없음)
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
// 14. 개발용: 에뮬레이터에서 관리자 권한 부여 (변경 없음)
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