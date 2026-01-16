// functions/src/callable/products.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin, allowedOrigins } from "../firebase/admin.js";
import { 
  Timestamp, 
  DocumentData, 
  DocumentSnapshot, 
  FieldValue, 
  Transaction,
  QueryDocumentSnapshot,
  DocumentReference
} from "firebase-admin/firestore";
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
  OrderStatus,
} from "@/shared/types";

// ===============================
// ✅ StockStats v1 helpers (읽기용 - 최적화 적용)
// ===============================
const STOCK_STATS_COL = "stockStats_v1";

function statDocId(productId: string, roundId: string) {
  return `${productId}__${roundId}`;
}

// [수정] Chunking 적용 버전
// [수정] Chunking 적용 버전 (타입 오류 해결)
async function fetchStockStatsMap(keys: string[]) {
  const unique = Array.from(new Set(keys)).filter(Boolean);
  if (unique.length === 0) return new Map<string, any>();

  const refs = unique.map((k) => db.collection(STOCK_STATS_COL).doc(k)) as DocumentReference[];

  const chunkSize = 50;
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += chunkSize) {
    chunks.push(refs.slice(i, i + chunkSize));
  }

  const snaps: DocumentSnapshot<any>[] = [];
  const results = await Promise.all(chunks.map((chunk) => db.getAll(...chunk)));
  results.forEach((arr) => snaps.push(...arr));

  const map = new Map<string, any>();
  snaps.forEach((s) => {
    if (s.exists) map.set(s.id, s.data());
  });
  return map;
}

function getClaimed(stat: any, vgId: string) {
  const n = stat?.claimed?.[vgId];
  return typeof n === "number" ? n : 0;
}

function getPickedUp(stat: any, vgId: string) {
  const n = stat?.pickedUp?.[vgId];
  return typeof n === "number" ? n : 0;
}

// ✅ 배포 버전 확인용 로그 태그
const BUILD_VERSION = "2025-12-22-stockstats-cursor-fix";

// =================================================================
// 1. 신규 상품 + 첫 회차 등록
// =================================================================
export const addProductWithFirstRound = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자만 상품을 등록할 수 있습니다.");
    }
    const adminUid = request.auth?.uid;
    if (!adminUid) {
      throw new HttpsError("unauthenticated", "인증 정보가 없습니다.");
    }
    
    const { productData, salesRoundData, creationDate } = request.data;
    if (!productData || !salesRoundData || !creationDate) {
      throw new HttpsError("invalid-argument", "상품 생성에 필요한 정보가 누락되었습니다.");
    }
    
    // ✅ [감사 로깅] 관리자 작업 감사 로그 기록
    const { withAuditLog } = await import("../utils/auditLogger.js");
    const adminUser = await adminAuth().getUser(adminUid);
    
    return await withAuditLog(
      adminUid,
      "addProductWithFirstRound",
      "product",
      async () => {
        const newProductRef = db.collection("products").doc();
        const newProductId = newProductRef.id;
        const firstRound: SalesRound = { ...salesRoundData, roundId: newProductId, createdAt: admin.firestore.Timestamp.fromDate(new Date(creationDate)), waitlist: [], waitlistCount: 0 };
        const newProductData: Omit<Product, 'id'> = { ...productData, salesHistory: [firstRound], imageUrls: [], isArchived: false, createdAt: admin.firestore.Timestamp.fromDate(new Date(creationDate)), encoreCount: 0, encoreRequesterIds: [] };
        await newProductRef.set(newProductData);
        logger.info(`New product created by ${adminUid} with ID: ${newProductId}`);
        return { success: true, productId: newProductId, message: "상품이 성공적으로 등록되었습니다." };
      },
      {
        resourceId: productData.groupName,
        details: {
          groupName: productData.groupName,
          creationDate,
        },
        adminEmail: adminUser.email,
      }
    ).catch((error) => {
      logger.error("Error in addProductWithFirstRound:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "상품 등록 중 서버 오류가 발생했습니다.");
    });
  }
);

// =================================================================
// 2. 상품명으로 검색
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
// 3. 상품 핵심 정보 수정
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
      
      // ✅ finalImageUrls가 제공되지 않으면 기존 이미지를 유지
      let dataToUpdate = { ...productData };
      if (finalImageUrls !== undefined && finalImageUrls !== null) {
        dataToUpdate.imageUrls = finalImageUrls;
      }
      // finalImageUrls가 undefined/null이면 imageUrls 필드를 업데이트하지 않음 (기존 값 유지)
      
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
// 4. 기존 상품에 새 회차 추가
// =================================================================
export const addNewSalesRound = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { productId, salesRoundData } = request.data;
    if (!productId || !salesRoundData) {
      throw new HttpsError("invalid-argument", "상품 ID와 새 회차 정보가 필요합니다.");
    }

    try {
      const dateFieldsToConvert: (keyof SalesRound)[] = [
        "publishAt", "deadlineDate", "pickupDate", "pickupDeadlineDate", "arrivalDate"
      ];
      
      const convertedSalesRoundData: Partial<SalesRound> = { ...salesRoundData };
      
      for (const field of dateFieldsToConvert) {
        const value = convertedSalesRoundData[field];
        if (value) {
  let d: Date | undefined;
  // 1. Firebase Timestamp 객체 형태({seconds, nanoseconds})인지 확인
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as any).seconds === 'number') {
     d = new Date((value as any).seconds * 1000);
  } 
  // 2. 그 외 일반 날짜 문자열이나 Date 객체인 경우
  else {
     d = new Date(value as any);
  }

  // 유효한 날짜인 경우에만 Firestore Timestamp로 변환하여 저장
  if (d && !isNaN(d.getTime())) {
    (convertedSalesRoundData as any)[field] = admin.firestore.Timestamp.fromDate(d); 
  } else {
    logger.warn(`Field '${String(field)}' was not a valid date:`, value);
    (convertedSalesRoundData as any)[field] = null; 
  }
}
      }

      const productRef = db.collection("products").doc(productId);
      const newRound: SalesRound = {
        ...(convertedSalesRoundData as SalesRound),
        roundId: productRef.collection("temp").doc().id,
        createdAt: admin.firestore.Timestamp.now(), // ✅
        waitlist: [],
        waitlistCount: 0,
      };

      await db.runTransaction(async (transaction) => {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) {
          throw new HttpsError("not-found", "새 회차를 추가할 상품을 찾을 수 없습니다.");
        }
        transaction.update(productRef, {
          salesHistory: FieldValue.arrayUnion(newRound),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      logger.info(`New sales round added to product ${productId} by ${request.auth?.uid}`);
      return { success: true, message: "새 판매 회차가 성공적으로 추가되었습니다." };
    } catch (error) {
      logger.error(`Error in addNewSalesRound for product ${productId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "새 회차 추가 중 서버 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 5. 재고 수량 일괄 수정 (배열 통교체)
// =================================================================
export const updateMultipleVariantGroupStocks = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
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

    const updatesByProduct = new Map<string, Map<string, number>>();
    for (const u of updates) {
      if (typeof u.newStock !== "number" || (u.newStock < 0 && u.newStock !== -1)) continue;
      const productMap = updatesByProduct.get(u.productId) || new Map<string, number>();
      const key = `${u.roundId}::${u.variantGroupId}`;
      productMap.set(key, u.newStock);
      updatesByProduct.set(u.productId, productMap);
    }

    try {
      await db.runTransaction(async (tx) => {
        for (const [productId, productUpdatesMap] of updatesByProduct.entries()) {
          const productRef = db.collection("products").doc(productId);
          const snap = await tx.get(productRef);
          if (!snap.exists) continue;

          const product = snap.data() as Product;
          const safeSalesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
          const newSalesHistory = safeSalesHistory.map(r => ({
            ...r,
            variantGroups: Array.isArray(r.variantGroups) ? r.variantGroups.map(v => ({ ...v })) : [],
          }));

          for (const [key, newStock] of productUpdatesMap.entries()) {
            const [roundId, variantGroupId] = key.split('::');
            const rIdx = newSalesHistory.findIndex(r => r.roundId === roundId);
            if (rIdx === -1) continue;

            const round = newSalesHistory[rIdx];
            const vgIdx = round.variantGroups.findIndex(v => v.id === variantGroupId);
            if (vgIdx === -1) continue;

            round.variantGroups[vgIdx].totalPhysicalStock = newStock;
            if (newStock > 0 || newStock === -1) {
              round.manualStatus = null;
              round.isManuallyOnsite = false;
            }
          }

          tx.update(productRef, {
            salesHistory: newSalesHistory,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      return { success: true, message: "재고가 성공적으로 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateMultipleVariantGroupStocks:", error);
      throw new HttpsError("internal", "재고 업데이트 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 6. 단일 판매 회차 정보 수정 (주문 픽업일 동기화 포함)
// =================================================================
export const updateSalesRound = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
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

    try {
      const dateFieldsToConvert: (keyof SalesRound)[] = [
        "publishAt", "deadlineDate", "pickupDate", "pickupDeadlineDate", "arrivalDate", "createdAt"
      ];
      const converted: Partial<SalesRound> = { ...salesRoundData };
      
      for (const field of dateFieldsToConvert) {
        const value = converted[field];
        if (value) {
  let d: Date | undefined;
  // 1. Firebase Timestamp 객체 형태({seconds, nanoseconds})인지 확인
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as any).seconds === 'number') {
     d = new Date((value as any).seconds * 1000);
  } 
  // 2. 그 외 일반 날짜 문자열이나 Date 객체인 경우
  else {
     d = new Date(value as any);
  }

  // 유효한 날짜인 경우에만 Firestore Timestamp로 변환하여 저장
  if (d && !isNaN(d.getTime())) {
    (converted as any)[field] = admin.firestore.Timestamp.fromDate(d); 
  } else {
    logger.warn(`Field '${String(field)}' was not a valid date:`, value);
    (converted as any)[field] = null; 
  }
}
      }

      // ✅ variantGroups가 포함된 경우, items 배열 내부의 expirationDate Timestamp 변환
      if (converted.variantGroups && Array.isArray(converted.variantGroups)) {
        const convertedVariantGroups = converted.variantGroups.map((vg: any) => {
          if (!vg || !Array.isArray(vg.items)) return vg;
          const convertedItems = vg.items.map((item: any) => {
            if (!item || !item.expirationDate) return item;
            const expDate = item.expirationDate;
            let d: Date | undefined;
            // 1. Firebase Timestamp 객체 형태({seconds, nanoseconds})인지 확인
            if (typeof expDate === 'object' && expDate !== null && 'seconds' in expDate && typeof expDate.seconds === 'number') {
              d = new Date(expDate.seconds * 1000);
            }
            // 2. 그 외 일반 날짜 문자열이나 Date 객체인 경우
            else {
              d = new Date(expDate as any);
            }
            // 유효한 날짜인 경우에만 Firestore Timestamp로 변환
            if (d && !isNaN(d.getTime())) {
              return { ...item, expirationDate: admin.firestore.Timestamp.fromDate(d) };
            }
            return item;
          });
          return { ...vg, items: convertedItems };
        });
        converted.variantGroups = convertedVariantGroups;
      }

      await db.runTransaction(async (tx) => {
        const ref = db.collection("products").doc(productId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");

        const product = snap.data() as Product;
        const safeSalesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
        const newSalesHistory = safeSalesHistory.map(r => ({
            ...r,
            variantGroups: Array.isArray(r.variantGroups) ? r.variantGroups.map(v => ({ ...v })) : [],
        }));

        const idx = newSalesHistory.findIndex(r => r.roundId === roundId);
        if (idx === -1) throw new HttpsError("not-found", "해당 판매 회차를 찾을 수 없습니다.");

        // ✅ variantGroups가 포함된 경우, 기존 variantGroups와 병합하여 데이터 손실 방지
        if (converted.variantGroups && Array.isArray(converted.variantGroups)) {
          const existingVgs = newSalesHistory[idx].variantGroups || [];
          const updatedVgs = converted.variantGroups;
          
          // variantGroups를 ID로 매칭하여 병합
          const mergedVgs = existingVgs.map((existingVg: any) => {
            const updatedVg = updatedVgs.find((v: any) => v.id === existingVg.id);
            if (updatedVg) {
              // 기존 variantGroup과 업데이트된 variantGroup 병합
              const existingItems = existingVg.items || [];
              const updatedItems = updatedVg.items || [];
              
              // items를 ID로 매칭하여 병합
              const mergedItems = existingItems.map((existingItem: any) => {
                const updatedItem = updatedItems.find((i: any) => i.id === existingItem.id);
                return updatedItem ? { ...existingItem, ...updatedItem } : existingItem;
              });
              
              // 새로운 items 추가 (기존에 없던 것들)
              updatedItems.forEach((updatedItem: any) => {
                if (!existingItems.find((i: any) => i.id === updatedItem.id)) {
                  mergedItems.push(updatedItem);
                }
              });
              
              return { ...existingVg, ...updatedVg, items: mergedItems };
            }
            return existingVg;
          });
          
          // 새로운 variantGroups 추가 (기존에 없던 것들)
          updatedVgs.forEach((updatedVg: any) => {
            if (!existingVgs.find((v: any) => v.id === updatedVg.id)) {
              mergedVgs.push(updatedVg);
            }
          });
          
          newSalesHistory[idx] = { ...newSalesHistory[idx], ...converted, variantGroups: mergedVgs };
        } else {
          newSalesHistory[idx] = { ...newSalesHistory[idx], ...converted };
        }

        tx.update(ref, {
          salesHistory: newSalesHistory,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await syncOrderPickupDates(productId, roundId);
      return { success: true, message: "판매 회차 정보가 업데이트되었습니다." };
    } catch (error) {
      logger.error(`Error in updateSalesRound:`, error);
      throw new HttpsError("internal", "정보 업데이트 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 7. 판매 상태 일괄 수정
// =================================================================
export const updateMultipleSalesRoundStatuses = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const updates = request.data as { productId: string; roundId: string; newStatus: SalesRoundStatus }[];
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
          if (!snap.exists) continue;

          const product = snap.data() as Product;
          const safeSalesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
          const newSalesHistory = safeSalesHistory.map(r => ({
            ...r,
            variantGroups: Array.isArray(r.variantGroups) ? r.variantGroups.map(v => ({ ...v })) : [],
          }));

          for (const { roundId, newStatus } of list) {
            const idx = newSalesHistory.findIndex(r => r.roundId === roundId);
            if (idx !== -1) newSalesHistory[idx].status = newStatus;
          }

          tx.update(ref, {
            salesHistory: newSalesHistory,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      return { success: true, message: "판매 상태가 업데이트되었습니다." };
    } catch (error) {
      logger.error("Error in updateMultipleSalesRoundStatuses:", error);
      throw new HttpsError("internal", "상태 업데이트 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 8. 판매 회차 일괄 삭제
// =================================================================
export const deleteSalesRounds = onCall(
  { region: "asia-northeast3", cors: allowedOrigins },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    const deletions = request.data as { productId: string; roundId: string }[];

    try {
      await db.runTransaction(async (transaction: Transaction) => {
        const productRefs = new Map<string, DocumentReference>();
        const deletionsByProduct = new Map<string, Set<string>>();

        for (const { productId, roundId } of deletions) {
          const roundIds = deletionsByProduct.get(productId) || new Set<string>();
          roundIds.add(roundId);
          deletionsByProduct.set(productId, roundIds);
          if (!productRefs.has(productId)) productRefs.set(productId, db.collection("products").doc(productId));
        }
        
        const docs = await Promise.all(Array.from(productRefs.values()).map(ref => transaction.get(ref)));
        
        for (const doc of docs) {
          if (!doc.exists) continue;
          const productId = doc.id;
          const productData = doc.data() as Product;
          const roundIdsToDeleteSet = deletionsByProduct.get(productId)!;
          
          const safeSalesHistory = Array.isArray(productData.salesHistory) ? productData.salesHistory : [];
          const newSalesHistory = safeSalesHistory.filter(round => !roundIdsToDeleteSet.has(round.roundId));

          if (newSalesHistory.length < safeSalesHistory.length) {
            transaction.update(productRefs.get(productId)!, {
              salesHistory: newSalesHistory,
              updatedAt: FieldValue.serverTimestamp()
            });
          }
        }
      });
      return { success: true, message: "선택된 판매 회차가 삭제되었습니다." };
    } catch (error) {
      logger.error("Error in deleteSalesRounds:", error);
      throw new HttpsError("internal", "삭제 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// ✅ [수정] 9. 상품 목록 조회 (Cursor 방식 변경: lastDocId 스냅샷 활용)
// =================================================================
export const getProductsWithStock = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    // ✅ lastVisible(Timestamp) 대신 lastDocId(string)를 받음
    const { pageSize = 10, lastDocId = null, tab = "all", withReservedOverlay = true, includeArchived = false } = request.data as {
      pageSize?: number;
      lastDocId?: string | null;
      tab?: "all" | "today" | "additional" | "onsite";
      withReservedOverlay?: boolean;
      // ✅ 관리자용: 아카이브된 상품도 포함해서 조회
      includeArchived?: boolean;
    };

    try {
      // ✅ 기본(고객/일반): 아카이브 제외
      // ✅ 관리자(includeArchived=true): 아카이브 포함
      let q = includeArchived
        ? db.collection("products").orderBy("createdAt", "desc").limit(pageSize)
        : db.collection("products").where("isArchived", "==", false).orderBy("createdAt", "desc").limit(pageSize);

      if (tab === "onsite") {
        q = includeArchived
          ? db.collection("products")
              .where("isOnsite", "==", true)
              .orderBy("createdAt", "desc")
              .limit(pageSize)
          : db.collection("products")
          .where("isArchived", "==", false)
          .where("isOnsite", "==", true)
          .orderBy("createdAt", "desc")
          .limit(pageSize);
      }

      // ✅ [개선] 문서 ID로 스냅샷을 가져와 startAfter에 전달 (가장 안전한 커서 방식)
      if (lastDocId && typeof lastDocId === "string") {
        const docRef = db.collection("products").doc(lastDocId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          q = q.startAfter(docSnap);
        }
      }

      const snap = await q.get();
      const productsRaw = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }));

      const statKeys: string[] = [];
      for (const p of productsRaw) {
        const salesHistory = Array.isArray(p.salesHistory) ? p.salesHistory : [];
        for (const r of salesHistory) {
          if (r?.roundId) {
            const key = statDocId(p.id, r.roundId);
            statKeys.push(key);
            // ✅ [디버깅] roundId가 productId와 동일한 경우 경고
            if (r.roundId === p.id) {
              logger.warn(`[getProductsWithStock] ⚠️ roundId가 productId와 동일합니다: productId=${p.id}, roundId=${r.roundId}, statKey=${key}`);
            }
          }
        }
      }

      const statsMap = withReservedOverlay ? await fetchStockStatsMap(statKeys) : new Map<string, any>();

      // ✅ 디버깅(옵션): 에뮬레이터 또는 DEBUG_STOCK_STATS=true 일 때만 로그
      const DEBUG_STOCK_STATS = !!process.env.FUNCTIONS_EMULATOR || process.env.DEBUG_STOCK_STATS === "true";
      if (DEBUG_STOCK_STATS && withReservedOverlay && statKeys.length > 0) {
        logger.info(`[getProductsWithStock] statKeys=${statKeys.length}개, statsMap=${statsMap.size}개 문서 발견`);
        if (statsMap.size === 0) {
          logger.warn(`[getProductsWithStock] ⚠️ stockStats_v1 문서가 없습니다! 기존 주문들이 기록되지 않았을 수 있습니다.`);
        } else {
          const sampleKeys = Array.from(statsMap.keys()).slice(0, 3);
          sampleKeys.forEach((key) => {
            const stat = statsMap.get(key);
            logger.info(`[getProductsWithStock] 샘플 ${key}:`, JSON.stringify(stat, null, 2));
          });
        }
      }
      
      // ✅ [추가] 누락된 statKeys 경고 (항상 로그)
      if (withReservedOverlay && statKeys.length > 0) {
        const missingKeys = statKeys.filter(key => !statsMap.has(key));
        if (missingKeys.length > 0) {
          logger.warn(`[getProductsWithStock] ⚠️ ${missingKeys.length}개의 stockStats_v1 문서가 없습니다. 누락된 키: ${missingKeys.slice(0, 5).join(', ')}${missingKeys.length > 5 ? '...' : ''}`);
        }
      }

      const products = productsRaw.map((p) => {
        if (!withReservedOverlay) return p;
        const salesHistory = Array.isArray(p.salesHistory) ? p.salesHistory : [];
        const newSalesHistory = salesHistory.map((r: any) => {
          const key = statDocId(p.id, r.roundId);
          const stat = statsMap.get(key);
          const vgs = Array.isArray(r.variantGroups) ? r.variantGroups : [];
          const newVgs = vgs.map((vg: any) => {
            const vgId = vg?.id || "default";
            const reserved = getClaimed(stat, vgId);
            const pickedUp = getPickedUp(stat, vgId);
            if (DEBUG_STOCK_STATS && reserved === 0 && stat && vg.totalPhysicalStock && vg.totalPhysicalStock > 0) {
              logger.warn(`[getProductsWithStock] reservedCount=0 감지: productId=${p.id}, roundId=${r.roundId}, vgId=${vgId}, stat=${JSON.stringify(stat)}`);
            }
            return {
              ...vg,
              // ✅ UI에서 "남은 수량" 계산은 reservedCount만 바라보는 로직이 많아서,
              // claimed(예약/선입금) + pickedUp(소진)을 합산한 값을 reservedCount로 제공합니다.
              reservedCount: reserved + pickedUp,
              pickedUpCount: pickedUp,
            };
          });
          return { ...r, variantGroups: newVgs };
        });
        return { ...p, salesHistory: newSalesHistory };
      });

      // ✅ 다음 페이지 요청을 위해 lastDocId 반환
      const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      
      return { products, lastDocId: lastDoc?.id || null };
    } catch (e: any) {
      logger.error("getProductsWithStock failed:", e);
      throw new HttpsError("internal", "상품 조회 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 10. 단일 상품 상세 조회
// =================================================================
export const getProductByIdWithStock = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB" },
  async (request) => {
    const { productId } = request.data as { productId: string };
    if (!productId) throw new HttpsError("invalid-argument", "productId가 필요합니다.");

    try {
      const productSnap = await db.collection("products").doc(productId).get();
      if (!productSnap.exists) return { product: null };

      const product = { ...(productSnap.data() as any), id: productSnap.id };
      const salesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
      const keys = salesHistory.filter((r: any) => r?.roundId).map((r: any) => statDocId(product.id, r.roundId));

      const statsMap = await fetchStockStatsMap(keys);

      const newSalesHistory = salesHistory.map((r: any) => {
        const key = statDocId(product.id, r.roundId);
        const stat = statsMap.get(key);
        const vgs = Array.isArray(r.variantGroups) ? r.variantGroups : [];
        const newVgs = vgs.map((vg: any) => {
          const vgId = vg?.id || "default";
          return {
            ...vg,
            // ✅ 동일 정책: reservedCount = claimed + pickedUp
            reservedCount: getClaimed(stat, vgId) + getPickedUp(stat, vgId),
            pickedUpCount: getPickedUp(stat, vgId),
          };
        });
        return { ...r, variantGroups: newVgs };
      });

      return { product: { ...product, salesHistory: newSalesHistory } };
    } catch (e: any) {
      logger.error("getProductByIdWithStock failed:", e);
      throw new HttpsError("internal", "상세 조회 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 11. variantGroups Timestamp 복구 (데이터 복구용)
// =================================================================
export const fixVariantGroupsTimestamps = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB", timeoutSeconds: 540 },
  async (request) => {
    logger.info(`[fixVariantGroupsTimestamps] called. v=${BUILD_VERSION}`);

    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    try {
      /**
       * Timestamp 객체를 Firestore Timestamp로 변환
       */
      const convertToFirestoreTimestamp = (value: any): Timestamp | null => {
        if (!value) return null;
        
        // 이미 Firestore Timestamp인 경우
        if (value instanceof Timestamp) return value;
        
        // 클라이언트 Timestamp 객체 형태 ({seconds, nanoseconds})
        if (typeof value === 'object' && value !== null && 'seconds' in value && typeof value.seconds === 'number') {
          return Timestamp.fromMillis(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
        }
        
        // 레거시 형식 ({_seconds, _nanoseconds})
        if (typeof value === 'object' && value !== null && '_seconds' in value && typeof value._seconds === 'number') {
          return Timestamp.fromMillis(value._seconds * 1000 + (value._nanoseconds || 0) / 1000000);
        }
        
        // Date 객체
        if (value instanceof Date) {
          return Timestamp.fromDate(value);
        }
        
        // 숫자 (milliseconds)
        if (typeof value === 'number' && !isNaN(value)) {
          return Timestamp.fromMillis(value);
        }
        
        // 문자열
        if (typeof value === 'string') {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return Timestamp.fromDate(date);
          }
        }
        
        return null;
      };

      /**
       * variantGroups의 items 배열 내부 expirationDate 복구
       */
      const fixVariantGroupsItems = (variantGroups: any[]): any[] => {
        return variantGroups.map((vg: any) => {
          if (!vg || !Array.isArray(vg.items)) return vg;
          
          const fixedItems = vg.items.map((item: any) => {
            if (!item || !item.expirationDate) return item;
            
            const fixedTimestamp = convertToFirestoreTimestamp(item.expirationDate);
            if (fixedTimestamp) {
              return { ...item, expirationDate: fixedTimestamp };
            }
            
            return item;
          });
          
          return { ...vg, items: fixedItems };
        });
      };

      let scanned = 0;
      let fixed = 0;
      let errors = 0;
      
      const productsRef = db.collection("products");
      const snapshot = await productsRef.get();
      
      logger.info(`[fixVariantGroupsTimestamps] 총 ${snapshot.size}개 상품 스캔 시작...`);
      
      let currentBatch = db.batch();
      let batchCount = 0;
      const BATCH_LIMIT = 450;
      
      for (const doc of snapshot.docs) {
        scanned++;
        const productId = doc.id;
        const productData = doc.data() as Product;
        
        try {
          const salesHistory = Array.isArray(productData.salesHistory) ? productData.salesHistory : [];
          let hasChanges = false;
          
          const fixedSalesHistory = salesHistory.map((round: any) => {
            if (!round || !Array.isArray(round.variantGroups)) return round;
            
            const fixedVariantGroups = fixVariantGroupsItems(round.variantGroups);
            
            // 변경사항이 있는지 확인
            const hasRoundChanges = fixedVariantGroups.some((fixedVg, idx) => {
              const originalVg = round.variantGroups[idx];
              if (!originalVg || !Array.isArray(originalVg.items)) return false;
              
              return fixedVariantGroups[idx].items.some((fixedItem, itemIdx) => {
                const originalItem = originalVg.items[itemIdx];
                if (!originalItem) return false;
                
                const originalExp = originalItem.expirationDate;
                const fixedExp = fixedItem.expirationDate;
                
                // Timestamp 객체 비교
                if (originalExp instanceof Timestamp && fixedExp instanceof Timestamp) {
                  return originalExp.seconds !== fixedExp.seconds || originalExp.nanoseconds !== fixedExp.nanoseconds;
                }
                
                // 다른 형식이면 변경된 것으로 간주
                return originalExp !== fixedExp;
              });
            });
            
            if (hasRoundChanges) {
              hasChanges = true;
              return { ...round, variantGroups: fixedVariantGroups };
            }
            
            return round;
          });
          
          if (hasChanges) {
            fixed++;
            const productRef = productsRef.doc(productId);
            
            currentBatch.update(productRef, {
              salesHistory: fixedSalesHistory,
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;
            
            if (batchCount >= BATCH_LIMIT) {
              await currentBatch.commit();
              logger.info(`[fixVariantGroupsTimestamps] 배치 커밋 완료 (${batchCount}개)`);
              currentBatch = db.batch();
              batchCount = 0;
            }
          }
        } catch (error: any) {
          errors++;
          logger.error(`[fixVariantGroupsTimestamps] ${productId} 처리 실패:`, error.message);
        }
        
        if (scanned % 100 === 0) {
          logger.info(`[fixVariantGroupsTimestamps] 진행: ${scanned}/${snapshot.size} (복구: ${fixed}, 에러: ${errors})`);
        }
      }
      
      // 남은 배치 커밋
      if (batchCount > 0) {
        await currentBatch.commit();
        logger.info(`[fixVariantGroupsTimestamps] 최종 배치 커밋 완료 (${batchCount}개)`);
      }
      
      const result = {
        success: true,
        scanned,
        fixed,
        errors,
        message: `총 ${scanned}개 상품 중 ${fixed}개 복구 완료 (에러: ${errors}개)`
      };
      
      logger.info(`[fixVariantGroupsTimestamps] 완료:`, result);
      return result;
      
    } catch (error: any) {
      logger.error(`[fixVariantGroupsTimestamps] 전체 프로세스 실패:`, error);
      throw new HttpsError("internal", `복구 중 오류가 발생했습니다: ${error.message}`);
    }
  }
);

// =================================================================
// 12. salesHistory/variantGroups 구조 백필(배열 복구) v1
//  - 특정 상품만(productId) 또는 전체 스캔
//  - ProductListPageAdmin에서 "상품이 아예 안 뜨는" 케이스(배열→객체 손상) 복구용
// =================================================================
export const fixSalesHistoryShape_v1 = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "512MiB", timeoutSeconds: 540 },
  async (request) => {
    logger.info(`[fixSalesHistoryShape_v1] called. v=${BUILD_VERSION}`, JSON.stringify(request.data ?? {}, null, 2));

    const userRole = request.auth?.token.role;
    if (!userRole || !["admin", "master"].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    const { productId } = (request.data || {}) as { productId?: string | null };

    const toArrayIfMap = <T = any>(v: any): T[] => {
      if (Array.isArray(v)) return v as T[];
      if (v && typeof v === "object") return Object.values(v) as T[];
      return [];
    };

    const normalizeItem = (item: any, idxKey: string) => {
      if (!item || typeof item !== "object") return item;
      const id = item.id || `recovered-item-${idxKey}`;
      return { ...item, id };
    };

    const normalizeVariantGroup = (vg: any, idxKey: string) => {
      if (!vg || typeof vg !== "object") return vg;
      const id = vg.id || `recovered-vg-${idxKey}`;
      const itemsRaw = vg.items;
      const itemsArr = toArrayIfMap<any>(itemsRaw).map((it, i) => normalizeItem(it, `${idxKey}-${i}`));
      return { ...vg, id, items: itemsArr };
    };

    const normalizeRound = (round: any, idxKey: string) => {
      if (!round || typeof round !== "object") return round;
      const roundId = round.roundId || `recovered-round-${idxKey}`;
      const roundName = round.roundName || "복구된 회차";
      const status = round.status || "draft";

      const vgsRaw = round.variantGroups;
      const vgsArr = toArrayIfMap<any>(vgsRaw).map((vg, i) => normalizeVariantGroup(vg, `${idxKey}-${i}`));

      // createdAt이 완전히 없어서 UI에서 정렬/표시가 꼬이는 케이스만 최소 보정
      const createdAt = round.createdAt ?? Timestamp.now();

      return {
        ...round,
        roundId,
        roundName,
        status,
        createdAt,
        variantGroups: vgsArr,
      };
    };

    try {
      const productsRef = db.collection("products");

      const docs: QueryDocumentSnapshot<DocumentData>[] = [];
      if (productId) {
        const snap = await productsRef.doc(productId).get();
        if (!snap.exists) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
        docs.push(snap as any);
      } else {
        const snap = await productsRef.get();
        docs.push(...snap.docs);
      }

      let scanned = 0;
      let fixedProducts = 0;
      let fixedRounds = 0;
      let errors = 0;

      const BATCH_LIMIT = 450;
      let currentBatch = db.batch();
      let batchCount = 0;

      for (const doc of docs) {
        scanned++;
        try {
          const product = doc.data() as any;
          const rawHistory = product?.salesHistory;

          const historyArr = toArrayIfMap<any>(rawHistory);
          const shouldFixSalesHistoryShape = !!rawHistory && !Array.isArray(rawHistory) && typeof rawHistory === "object";

          // 배열이어도 내부 round.variantGroups/items가 객체인 케이스가 있어 보정
          let anyRoundFixed = false;
          const normalized = historyArr.map((r: any, i: number) => {
            const beforeVgIsArray = Array.isArray(r?.variantGroups);
            const beforeItemsIsArray = Array.isArray(r?.variantGroups?.[0]?.items);
            const nr = normalizeRound(r, `${doc.id}-${i}`);
            const afterVgIsArray = Array.isArray(nr?.variantGroups);
            const afterItemsIsArray = Array.isArray(nr?.variantGroups?.[0]?.items);
            if (beforeVgIsArray !== afterVgIsArray || beforeItemsIsArray !== afterItemsIsArray) anyRoundFixed = true;
            return nr;
          });

          const shouldWrite = shouldFixSalesHistoryShape || anyRoundFixed;
          if (!shouldWrite) continue;

          fixedProducts++;
          if (anyRoundFixed || shouldFixSalesHistoryShape) fixedRounds += normalized.length;

          currentBatch.update(doc.ref, {
            salesHistory: normalized,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchCount++;

          if (batchCount >= BATCH_LIMIT) {
            await currentBatch.commit();
            logger.info(`[fixSalesHistoryShape_v1] 배치 커밋 완료 (${batchCount}문서)`);
            currentBatch = db.batch();
            batchCount = 0;
          }
        } catch (e: any) {
          errors++;
          logger.error(`[fixSalesHistoryShape_v1] doc=${doc.id} 처리 실패:`, e);
        }
      }

      if (batchCount > 0) {
        await currentBatch.commit();
        logger.info(`[fixSalesHistoryShape_v1] 마지막 배치 커밋 완료 (${batchCount}문서)`);
      }

      return {
        success: true,
        scanned,
        fixedProducts,
        fixedRounds,
        errors,
        message: productId
          ? `단일 상품 복구 완료: fixedProducts=${fixedProducts}, fixedRounds=${fixedRounds}, errors=${errors}`
          : `전체 스캔 완료: scanned=${scanned}, fixedProducts=${fixedProducts}, fixedRounds=${fixedRounds}, errors=${errors}`,
      };
    } catch (e: any) {
      logger.error(`[fixSalesHistoryShape_v1] 전체 실패:`, e);
      throw new HttpsError("internal", e?.message || "복구 중 오류가 발생했습니다.");
    }
  }
);

// =================================================================
// 11. 상품 목록 페이징 (일반 버전도 안전한 커서로 변경)
// =================================================================
export const getProductsPage = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, memory: "256MiB" },
  async (request) => {
    try {
      const pageSize = request.data?.pageSize || 20;
      // ✅ lastVisibleTimestamp 대신 lastDocId 사용
      const lastDocId = request.data?.lastDocId;
      
      let query = db.collection("products").where("isArchived", "==", false).orderBy("createdAt", "desc").limit(pageSize);
      
      // ✅ [개선] 문서 스냅샷 커서 적용
      if (lastDocId && typeof lastDocId === 'string') {
        const docSnap = await db.collection('products').doc(lastDocId).get();
        if (docSnap.exists) {
            query = query.startAfter(docSnap);
        }
      }

      const snap = await query.get();
      const items = snap.docs.map((d) => ({ ...(d.data() as Product), id: d.id }));
      const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      
      return { products: items, lastDocId: lastDoc?.id || null };
    } catch (error) {
      throw new HttpsError("internal", "페이지 로딩 실패");
    }
  }
);

// =================================================================
// 12. 앵콜 요청
// =================================================================
export const requestEncore = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, enforceAppCheck: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const userId = request.auth.uid;
    const productId = String(request.data?.productId || "").trim();
    const productRef = db.collection("products").doc(productId);
    const userRef = db.collection("users").doc(userId);
    try {
      await db.runTransaction(async (tx) => {
        const productSnap = await tx.get(productRef);
        if (!productSnap.exists) throw new HttpsError("not-found", "상품 없음");
        const product = productSnap.data() as Product;
        if (product.encoreRequesterIds?.includes(userId)) throw new HttpsError("already-exists", "이미 요청함");
        tx.update(productRef, {
          encoreCount: admin.firestore.FieldValue.increment(1),
          encoreRequesterIds: admin.firestore.FieldValue.arrayUnion(userId),
        });
        tx.update(userRef, { encoreRequestedProductIds: admin.firestore.FieldValue.arrayUnion(productId) });
      });
      return { success: true };
    } catch (error) {
      throw new HttpsError("internal", "앵콜 요청 실패");
    }
  }
);

// =================================================================
// 13. 상품 정보 변경 알림
// =================================================================
export const notifyUsersOfProductUpdate = onCall(
  { region: "asia-northeast3", cors: allowedOrigins, timeoutSeconds: 120 },
  async (request) => {
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) throw new HttpsError("permission-denied", "권한 없음");
    const { productId, roundId, productName, changes } = request.data;
    try {
      const ordersSnapshot = await db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]).get();
      const userIds = new Set<string>();
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        if (order.items?.some(i => i.productId === productId && i.roundId === roundId)) userIds.add(order.userId);
      });
      if (userIds.size === 0) return { success: true, message: "알림 대상 없음" };
      const batch = db.batch();
      userIds.forEach(uid => {
        const ref = db.collection("users").doc(uid).collection("notifications").doc();
        batch.set(ref, {
          message: `[상품 변경] '${productName}' 정보 변경: ${changes.join(", ")}`,
          read: false,
          timestamp: FieldValue.serverTimestamp(),
          type: 'PRODUCT_UPDATE',
          link: `/my-orders`,
        });
      });
      await batch.commit();
      return { success: true, message: "알림 전송 완료" };
    } catch (error) {
      throw new HttpsError("internal", "알림 전송 오류");
    }
  }
);

// =================================================================
// ✅ [수정] 14. 장바구니 유효성 검사 (안전한 로직 + 방어 코드 적용)
// =================================================================
export const validateCart = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
  const itemsToValidate = request.data.items as any[];
  const userId = request.auth?.uid;
  if (!itemsToValidate || !Array.isArray(itemsToValidate) || itemsToValidate.length === 0) {
    throw new HttpsError("invalid-argument", "검증할 데이터가 없습니다.");
  }

  try {
    const productIds = [...new Set(itemsToValidate.map(item => item.productId))];
    
    return await db.runTransaction(async (transaction) => {
      const userDocSnap = userId ? await transaction.get(db.collection("users").doc(userId)) : null;
      const userDoc = userDocSnap?.data() as UserDocument | undefined;

      // 1. 필요한 상품 정보 일괄 로드
      const productDocs = await Promise.all(productIds.map(id => transaction.get(db.collection("products").doc(id))));
      const productsMap = new Map(productDocs.map(doc => [doc.id, doc.data() as Product]));

      // 2. StockStats 키 생성 및 일괄 로드
      const statKeys = itemsToValidate.map((item) => statDocId(item.productId, item.roundId));
      const statsMap = await fetchStockStatsMapTx(transaction, statKeys);

      const validatedItems = itemsToValidate.map(item => {
        const product = productsMap.get(item.productId);
        if (!product) return { ...item, status: "REMOVED", reason: "상품 정보 없음" };
        
        // ✅ [개선] 방어 코드: salesHistory가 배열이 아닌 경우 대비
        const salesHistory = Array.isArray(product.salesHistory) ? product.salesHistory : [];
        const round = salesHistory.find(r => r.roundId === item.roundId);
        if (!round) return { ...item, status: "REMOVED", reason: "판매 회차 없음" };

        // ✅ [개선] 방어 코드: variantGroups가 배열이 아닌 경우 대비
        const variantGroups = Array.isArray(round.variantGroups) ? round.variantGroups : [];
        const vg = variantGroups.find(v => v.id === item.variantGroupId);
        
        // ID 일치 옵션 없으면 탈락
        if (!vg) return { ...item, status: "REMOVED", reason: "옵션 정보 없음" };

        // 등급 제한 체크
        if (userDoc && Array.isArray(round.allowedTiers) && !round.allowedTiers.includes(userDoc.loyaltyTier)) {
          return { ...item, status: "INELIGIBLE", reason: "구매 권한 없음" };
        }

        const total = (vg as any).totalPhysicalStock;

        // 재고 검증 로직
        if (total !== null && total !== -1) {
          const stat = statsMap.get(statDocId(item.productId, item.roundId));
          const vgId = vg.id || "default"; 

          // ✅ [수정] 점유 수량 = 예약됨(claimed) + 픽업완료(pickedUp) 모두 계산
          // pickedUp도 이미 소진된 재고이므로 예약 불가
          const claimed = getClaimed(stat, vgId);
          const pickedUp = getPickedUp(stat, vgId);
          const occupied = claimed + pickedUp;

          const remainingRaw = total - occupied;
          const remaining = Math.max(0, remainingRaw);

          const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity || 0);
          
          // 차감 단위 보안 체크
          const cartItemId = item.itemId; 
          const productItem = (vg.items || []).find((it: any) => it.id === cartItemId);
          
          const unit =
            typeof productItem?.stockDeductionAmount === "number" && productItem.stockDeductionAmount > 0
              ? productItem.stockDeductionAmount
              : 1;

          const requested = Math.max(0, qty) * unit;

          if (requested > remaining) {
            return {
              ...item,
              status: "REMOVED",
              reason: `재고 부족 (잔여: ${remaining})`,
            };
          }
        }

        return { ...item, status: "OK" };
      });

      return {
        validatedItems,
        summary: { sufficient: validatedItems.every(i => i.status === "OK"), reason: "OK" }
      };
    });
  } catch (error) {
    logger.error("validateCart error:", error);
    throw new HttpsError("internal", "장바구니 검증 중 오류가 발생했습니다.");
  }
});

// =================================================================
// 15. 개발용: 에뮬레이터에서 관리자 권한 부여
// =================================================================
export const setAdminClaimForEmulator = onCall({ region: "asia-northeast3", cors: allowedOrigins }, async (request) => {
  if (!process.env.FUNCTIONS_EMULATOR) throw new HttpsError("permission-denied", "에뮬레이터 전용");
  const userId = request.auth?.uid;
  if (!userId) throw new HttpsError("unauthenticated", "로그인 필요");
  await adminAuth().setCustomUserClaims(userId, { role: 'admin', tier: 'master' });
  return { success: true };
});

// =================================================================
// HELPER: syncOrderPickupDates
// =================================================================
async function syncOrderPickupDates(productId: string, roundId: string) {
  try {
    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists) return;
    const product = productSnap.data() as Product;
    const targetRound = product.salesHistory?.find(r => r.roundId === roundId);
    if (!targetRound) return;

    const newPickupDate = targetRound.pickupDate;
    const ordersSnap = await db.collection("orders").where("status", "in", ["RESERVED", "PREPAID"]).get();

    const batch = db.batch();
    let count = 0;
    ordersSnap.forEach(doc => {
      const order = doc.data() as Order;
      if (order.items?.some(i => i.productId === productId && i.roundId === roundId)) {
        batch.update(doc.ref, { pickupDate: newPickupDate });
        count++;
      }
    });
    if (count > 0) await batch.commit();
    logger.info(`[syncOrderPickupDates] ${count} orders synced.`);
  } catch (e) {
    logger.error("sync error:", e);
  }
}

async function fetchStockStatsMapTx(tx: Transaction, keys: string[]) {
  const unique = Array.from(new Set(keys)).filter(Boolean);
  if (unique.length === 0) return new Map<string, any>();

  const refs = unique.map((id) => db.collection(STOCK_STATS_COL).doc(id)) as DocumentReference[];

  const chunkSize = 50;
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += chunkSize) {
    chunks.push(refs.slice(i, i + chunkSize));
  }

  const snaps: DocumentSnapshot<any>[] = [];
  const results = await Promise.all(chunks.map((chunk) => tx.getAll(...chunk)));
  results.forEach((arr) => snaps.push(...arr));

  const map = new Map<string, any>();
  snaps.forEach((s) => {
    if (s.exists) map.set(s.id, s.data());
  });
  return map;
}
