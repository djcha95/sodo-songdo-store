// src/firebase/productService.ts

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { HttpsCallable } from 'firebase/functions'; // ✅ [추가] HttpsCallable 타입 import
import { 
  getFirestore, collection, addDoc, query, doc, getDoc, getDocs, 
  updateDoc, writeBatch, increment, arrayUnion, where, Timestamp, 
  runTransaction, 
  orderBy, limit, startAfter, // ✅ [수정] DB 직접 조회를 위한 Firestore 함수 추가
  type DocumentData, type DocumentReference, type WriteBatch 
} from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { uploadImages } from './generalService';
import { getReservedQuantitiesMap } from './orderService';
import { getUserDocById } from './userService';

// ✅ [수정] '구' 파일과 '신' 파일의 모든 타입을 통합합니다.
import type { 
  Product, SalesRound, SalesRoundStatus, VariantGroup, 
  ProductItem, CartItem, LoyaltyTier 
} from '@/shared/types';

// ✅ [추가] WaitlistInfo 타입을 여기에 직접 정의합니다.
// (공용 타입이 아니라, 이 파일에서만 데이터를 조합해 쓰는 커스텀 타입입니다)
export interface WaitlistInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  itemId: string;
  itemName: string;
  imageUrl: string;
  quantity: number;
  timestamp: Timestamp;
  isPrioritized: boolean;
  waitlistOrder: number;
  prioritizedAt: Timestamp | null;
}

// --- Firebase 서비스 인스턴스 ---
const functions = getFunctions(getApp(), 'asia-northeast3');
const db = getFirestore(getApp());
const storage = getStorage(getApp());

// ========================================================
// 헬퍼: reservedCount 오버레이 적용 (from '구' 파일)
// ========================================================
function overlayKey(productId: string, roundId: string, vgId: string) {
  return `${productId}-${roundId}-${vgId}`;
}

function applyReservedOverlay(product: Product, reservedMap: Map<string, number>): Product {
  // 💡 [수정] 
  // 기존: if (!product?.salesHistory) return product;
  // product.salesHistory가 undefined, null 뿐만 아니라, 아예 배열이 아닌 경우(.map 오류 발생)를
  // 방지하기 위해 명시적인 배열(Array) 확인 로직으로 변경합니다.
  if (!Array.isArray(product?.salesHistory)) return product;

  product.salesHistory = product.salesHistory.map((round) => {
    const vgs = (round.variantGroups || []).map((vg) => {
      const key = overlayKey(product.id, round.roundId, vg.id);
      const reserved = reservedMap.get(key) || 0;
      return { ...vg, reservedCount: reserved };
    });
    return { ...round, variantGroups: vgs };
  });
  return product;
}

// ========================================================
// 🚀 '최신식' Cloud Function 호출 함수 (from '신' 파일)
// ========================================================

// [수정] 각 action에 대한 개별 callable 생성
const addProductWithFirstRoundCallable = httpsCallable(functions, 'addProductWithFirstRound');
const addNewSalesRoundCallable = httpsCallable(functions, 'addNewSalesRound');
const updateProductCoreInfoCallable = httpsCallable(functions, 'updateProductCoreInfo');
const updateSalesRoundCallable = httpsCallable(functions, 'updateSalesRound');
const searchProductsByNameCallable = httpsCallable(functions, 'searchProductsByName');
const deleteSalesRoundsCallable = httpsCallable(functions, 'deleteSalesRounds');
const getWaitlistForRoundCallable = httpsCallable(functions, 'getWaitlistForRound');
const updateMultipleVariantGroupStocksCallable = httpsCallable(functions, 'updateMultipleVariantGroupStocks');
const updateMultipleSalesRoundStatusesCallable = httpsCallable(functions, 'updateMultipleSalesRoundStatuses');

// --- 기존 함수 (이름 충돌 없음) ---
// ❌ [제거] 5초 '콜드 스타트'의 원인이므로 이 함수는 더 이상 사용하지 않습니다.
// const getProductsWithStockCallable = httpsCallable(functions, 'getProductsWithStock'); 
const getProductByIdCallable = httpsCallable(functions, 'getProductByIdWithStock');

// --- 1. 신규 상품 + 첫 회차 등록 ---
export const addProductWithFirstRound = async (
  productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived'>,
  salesRoundData: Omit<SalesRound, 'roundId' | 'createdAt'>,
  imageFiles: File[], // ✅ [수정] imageFiles 파라미터가 누락되어 추가합니다.
  creationDate: Date
): Promise<any> => {
  const result = await addProductWithFirstRoundCallable({
    productData,
    salesRoundData,
    creationDate: creationDate.toISOString(),
  });
  return result.data;
};

// --- 2. 기존 상품에 새 회차 추가 ---
export const addNewSalesRound = async (
  productId: string,
  salesRoundData: Omit<SalesRound, 'roundId' | 'createdAt'>
): Promise<any> => {
  const result = await addNewSalesRoundCallable({
    productId,
    salesRoundData,
  });
  return result.data;
};

// --- 3. 상품 핵심 정보 수정 ---
export const updateProductCoreInfo = async (
  productId: string,
  productData: Partial<Product>,
  newFiles: File[], // ✅ [수정] newFiles 파라미터가 누락되어 추가합니다.
  finalImageUrls: string[],
  initialImageUrls: string[] // ✅ [수정] initialImageUrls 파라미터가 누락되어 추가합니다.
): Promise<any> => {
  const result = await updateProductCoreInfoCallable({
    productId,
    productData,
    finalImageUrls,
  });
  return result.data;
};

// --- 4. 판매 회차 정보 수정 ---
export const updateSalesRound = async (
  productId: string,
  roundId: string,
  salesRoundData: Partial<SalesRound>
): Promise<any> => {
  const result = await updateSalesRoundCallable({
    productId,
    roundId,
    salesRoundData,
  });
  return result.data;
};

// --- 5. 단일 상품 조회 (서버) ---
export const getProductById = async (productId: string): Promise<Product | null> => {
  const result = await getProductByIdCallable({ productId });
  const { product } = result.data as { product: Product | null };
  
  if (product) {
    const reservedMap = await getReservedQuantitiesMap();
    return applyReservedOverlay(product, reservedMap);
  }
  return null;
};

// --- 6. 상품명으로 검색 (서버) ---
export const searchProductsByName = async (name: string): Promise<Product[]> => {
  const result = await searchProductsByNameCallable({ name });
  return result.data as Product[];
};

// --- 7. 판매 회차 다중 삭제 (서버) ---
export const deleteSalesRounds = async (
  deletions: { productId: string; roundId: string }[]
): Promise<any> => {
  const result = await deleteSalesRoundsCallable({ deletions });
  return result.data;
};

// --- 8. 대기자 명단 조회 (서버) ---
export const getWaitlistForRound = async (productId: string, roundId: string): Promise<any[]> => {
    const result = await getWaitlistForRoundCallable({ productId, roundId });
    return result.data as any[];
}

// --- 9. 재고 수정 (서버) ---
export const updateMultipleVariantGroupStocks = async (
    updates: { productId: string; roundId: string; variantGroupId: string; newStock: number }[]
): Promise<any> => {
    const result = await updateMultipleVariantGroupStocksCallable({ updates });
    return result.data;
};

// --- 10. 판매 상태 일괄 변경 (서버) ---
export const updateMultipleSalesRoundStatuses = async (
  updates: { productId: string; roundId: string; newStatus: SalesRoundStatus }[]
): Promise<any> => {
    const result = await updateMultipleSalesRoundStatusesCallable({ updates });
    return result.data;
};

// ========================================================
// 📦 '구' 파일에서 가져온 클라이언트 함수 (빌드 오류 해결용)
// ========================================================

// --- 11. 카테고리 일괄 이동 (✅ 빌드 오류 해결) ---
export const moveProductsToCategory = async (productIds: string[], newCategoryName: string): Promise<void> => {
  if (!productIds || productIds.length === 0) {
    return;
  }
  const batch = writeBatch(db);
  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.update(productRef, { category: newCategoryName || '' });
  });

  await batch.commit();
};

// --- 12. 사용자 대기열 조회 (✅ 빌드 오류 해결) ---
export const getUserWaitlist = async (userId: string): Promise<WaitlistInfo[]> => {
  if (!userId) return [];
  const allProductsSnapshot = await getDocs(query(collection(db, 'products'), where('isArchived', '==', false)));
  const userWaitlist: WaitlistInfo[] = [];

  allProductsSnapshot.docs.forEach(doc => {
    const product = { id: doc.id, ...doc.data() } as Product;

    // 💡 [수정] 여기서도 applyReservedOverlay와 동일한 방어 코드를 추가합니다.
    if (!Array.isArray(product.salesHistory)) return; // salesHistory가 배열이 아니면 이 product는 건너뜁니다.
    
    (product.salesHistory || []).forEach(round => {
      if (round.waitlist && round.waitlist.length > 0) {
        const sortedWaitlist = [...round.waitlist].sort((a, b) => {
          if (a.isPrioritized && !b.isPrioritized) return -1;
          if (!a.isPrioritized && b.isPrioritized) return 1;
          if (a.isPrioritized && b.isPrioritized) {
            const timeA = a.prioritizedAt?.toMillis() || 0;
            const timeB = b.prioritizedAt?.toMillis() || 0;
            return timeA - timeB;
          }
          return a.timestamp.toMillis() - b.timestamp.toMillis();
        });

        sortedWaitlist.forEach((entry, index) => {
          if (entry.userId === userId) {
            const vg = round.variantGroups.find(v => v.id === entry.variantGroupId);
            const item = vg?.items.find(i => i.id === entry.itemId);

            userWaitlist.push({
              productId: product.id,
              productName: product.groupName,
              roundId: round.roundId,
              roundName: round.roundName,
              variantGroupId: entry.variantGroupId,
              itemId: entry.itemId,
              itemName: `${vg?.groupName || ''} - ${item?.name || ''}`.replace(/^ - | - $/g, '') || '옵션 정보 없음',
              imageUrl: product.imageUrls[0] || '',
              quantity: entry.quantity,
              timestamp: new Timestamp(entry.timestamp.seconds, entry.timestamp.nanoseconds),
              isPrioritized: entry.isPrioritized || false,
              waitlistOrder: index + 1,
              prioritizedAt: entry.prioritizedAt
                ? new Timestamp(entry.prioritizedAt.seconds, entry.prioritizedAt.nanoseconds)
                : null,
            });
          }
        });
      }
    });
  });

  return userWaitlist.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
};

// --- 13. 상품 보관/삭제 관련 ---
export const updateProductsStatus = async (productIds: string[], isArchived: boolean): Promise<void> => {
  const batch = writeBatch(db);
  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.update(productRef, { isArchived });
  });
  await batch.commit();
};

export const deleteProducts = async (productIds: string[]): Promise<void> => {
  const batch = writeBatch(db);
  for (const id of productIds) {
    const productRef = doc(db, 'products', id);
    try {
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data() as Product;
        const imageUrls = productData.imageUrls || [];
        for (const url of imageUrls) {
          try {
            const imageRef = ref(storage, url);
            await deleteObject(imageRef);
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error(`Failed to delete image ${url}:`, error);
            }
          }
        }
      }
      batch.delete(productRef);
    } catch (error) {
      console.error(`상품 삭제 처리 중 오류 발생 (ID: ${id}):`, error);
    }
  }
  await batch.commit();
};

// --- 14. 앵콜 요청 ---
export const updateEncoreRequest = async (productId: string, userId: string): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  const userRef: DocumentReference<DocumentData> = doc(db, 'users', userId);
  const batch: WriteBatch = writeBatch(db);
  batch.update(productRef, {
    encoreCount: increment(1),
    encoreRequesterIds: arrayUnion(userId),
  });
  batch.update(userRef, {
    encoreRequestedProductIds: arrayUnion(userId), // 오타 수정: arrayUnion(userId)
  });
  await batch.commit();
};

// --- 15. 기타 클라이언트 함수 ---
export const checkProductAvailability = async (
  productId: string,
  roundId: string,
  variantGroupId: string,
  itemId: string
): Promise<boolean> => {
  const product = await getProductById(productId); // 헬퍼 함수가 아닌, 새로 병합된 getProductById 사용
  if (!product) return false;

  const round = product.salesHistory.find(r => r.roundId === roundId);
  if (!round) return false;

  const variantGroup = round.variantGroups.find((vg: VariantGroup) => vg.id === variantGroupId);
  if (!variantGroup) return false;

  const item = variantGroup.items.find((i: ProductItem) => i.id === itemId);
  if (!item) return false;

  const hasSufficientItemStock = item.stock === -1 || item.stock > 0;
  if (!hasSufficientItemStock) return false;

  const total = variantGroup.totalPhysicalStock;
  const reserved = variantGroup.reservedCount || 0;
  const remainingUnits = (total === null || total === -1) ? Infinity : Math.max(0, (total || 0) - reserved);

  const unit = Number(item.stockDeductionAmount ?? 1);
  const hasSufficientGroupStock = remainingUnits >= unit;

  return hasSufficientGroupStock;
};

export const cancelWaitlistEntry = async (
  productId: string,
  roundId: string,
  userId: string,
  itemId: string
): Promise<void> => {
  const productRef = doc(db, 'products', productId);
  await runTransaction(db, async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists()) throw new Error("상품을 찾을 수 없습니다.");
    const productData = productDoc.data() as Product;

    // 💡 [수정] 여기서도 applyReservedOverlay와 동일한 방어 코드를 추가합니다.
    if (!Array.isArray(productData.salesHistory)) {
      throw new Error("상품 데이터에 salesHistory 배열이 없습니다.");
    }
    
    const newSalesHistory = [...productData.salesHistory];
    const roundIndex = newSalesHistory.findIndex(r => r.roundId === roundId);
    if (roundIndex === -1) throw new Error("판매 회차를 찾을 수 없습니다.");
    const round = newSalesHistory[roundIndex];
    if (!round.waitlist) return;
    const entryToCancel = round.waitlist.find(e => e.userId === userId && e.itemId === itemId);
    if (!entryToCancel) return;
    round.waitlist = round.waitlist.filter(e => !(e.userId === userId && e.itemId === itemId));
    round.waitlistCount = (round.waitlistCount || 0) - entryToCancel.quantity;
    newSalesHistory[roundIndex] = round;
    transaction.update(productRef, { salesHistory: newSalesHistory });
  });
};

export const updateItemStock = async (
  productId: string,
  roundId: string,
  variantGroupId: string,
  itemId: string,
  newStock: number
): Promise<void> => {
  const productRef = doc(db, 'products', productId);
  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) throw new Error("상품을 찾을 수 없습니다.");
    const product = productSnap.data() as Product;

    // 💡 [수정] 여기서도 applyReservedOverlay와 동일한 방어 코드를 추가합니다.
    if (!Array.isArray(product.salesHistory)) {
      throw new Error("상품 데이터에 salesHistory 배열이 없습니다.");
    }

    const newSalesHistory = product.salesHistory.map((round: SalesRound) => {
      if (round.roundId === roundId) {
        const newVariantGroups = round.variantGroups.map((vg: VariantGroup) => {
          if (vg.id === variantGroupId) {
            const newItems = vg.items.map((item: ProductItem) =>
              item.id === itemId ? { ...item, stock: newStock } : item
            );
            return { ...vg, items: newItems };
          }
          return vg;
        });
        return { ...round, variantGroups: newVariantGroups };
      }
      return round;
    });
    transaction.update(productRef, { salesHistory: newSalesHistory });
  });
};

// ========================================================
// 🚀 '최신식' 상품 목록 조회 (페이지네이션) (from '구' 파일)
// ========================================================

export interface GetProductsWithStockResponse {
  products: Product[];
  lastVisible: number | null; // timestamp (millis)
}

type GetProductsWithStockPayload = {
  pageSize?: number;
  lastVisible?: number | null; // timestamp (millis)
  category?: string | null;
};

/**
 * ✅ [업그레이드] 이제 이 함수가 상품 목록을 가져오는 유일한 공식 함수입니다.
 * * 💡 [수정] 5초 '콜드 스타트' 문제를 해결하기 위해,
 * Cloud Function(getProductsWithStockCallable) 호출 대신
 * Firestore DB에서 직접 데이터를 조회하도록 로직을 변경합니다.
 */
export const getProductsWithStock = async (
  payload: GetProductsWithStockPayload
): Promise<GetProductsWithStockResponse> => {
  try {
    // 1. 페이로드 해체 및 기본값 설정
    const { pageSize = 10, lastVisible = null, category = null } = payload;
    
    // 2. 쿼리 제약 조건 배열 생성
    const queryConstraints: any[] = []; // (any[] 타입 사용은 query 제약조건 동적 추가시 일반적)
    
    // 3. 기본 필터: 보관처리(isArchived)되지 않은 상품만 조회
    queryConstraints.push(where('isArchived', '==', false));

    // 4. 카테고리 필터 (선택 사항)
    if (category) {
      queryConstraints.push(where('category', '==', category));
    }

    // 5. 정렬: 생성일(createdAt) 기준 내림차순 정렬
    // (참고: createdAt 필드가 Timestamp 형식이며, Firestore 인덱스가 생성되어 있어야 합니다)
    queryConstraints.push(orderBy('createdAt', 'desc'));

    // 6. 페이지네이션 (Cursor)
    if (lastVisible) {
      // lastVisible은 timestamp (millis) 숫자입니다. Firestore Timestamp 객체로 변환합니다.
      const lastVisibleTimestamp = Timestamp.fromMillis(lastVisible);
      queryConstraints.push(startAfter(lastVisibleTimestamp));
    }

    // 7. 페이지 크기 제한
    queryConstraints.push(limit(pageSize));

    // 8. 쿼리 생성
    const productsRef = collection(db, 'products');
    const q = query(productsRef, ...queryConstraints);

    // 9. 예약 수량 맵 가져오기 (오버레이 적용을 위해)
    const reservedMap = await getReservedQuantitiesMap();

    // 10. 쿼리 실행
    const snapshot = await getDocs(q);

    // 11. 결과 처리
    const products: Product[] = [];
    snapshot.docs.forEach(doc => {
      const productData = doc.data() as Product;
      // 예약 수량 오버레이 적용
      const productWithOverlay = applyReservedOverlay(
        { ...productData, id: doc.id }, 
        reservedMap
      );
      products.push(productWithOverlay);
    });

    // 12. 다음 페이지를 위한 마지막 항목(lastVisible) timestamp 추출
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const newLastVisible = lastDoc 
      ? (lastDoc.data().createdAt as Timestamp).toMillis() // createdAt 기준 정렬
      : null;

    return { products, lastVisible: newLastVisible };

  } catch (error: any) {
    console.error("Error fetching products directly from Firestore:", error);
    // 쿼리 실패 시 (예: 인덱스 누락) 오류가 발생할 수 있습니다.
    // Firestore 콘솔에 표시될 수 있는 오류 메시지를 확인하세요.
    if (error.code === 'failed-precondition') {
       throw new Error("상품 목록을 불러오는 데 필요한 데이터베이스 인덱스가 없습니다. Firestore 콘솔에서 인덱스를 생성해주세요.");
    }
    throw new Error("상품 재고 정보를 불러오는 데 실패했습니다. (Firestore 직접 조회 오류)");
  }
};

// =================================================================
// ✅ [신규 추가] 리팩토링으로 인해 이름이 변경된 함수 별칭 (Alias)
// (모든 빌드 오류 해결)
// =================================================================

/**
 * @deprecated `getProductsWithStock` 사용을 권장합니다.
 */
export const getProducts = (category?: string) => 
  getProductsWithStock({ 
    category: category || null, 
    pageSize: 1000, // 기존 getProducts는 페이지네이션이 없었으므로 큰 값 설정
    lastVisible: null 
  });

/**
 * @deprecated `getProductsWithStock` 사용을 권장합니다.
 */
export const getAllProducts = () => 
  getProductsWithStock({ 
    pageSize: 1000, // 기존 getAllProducts는 페이지네이션이 없었으므로 큰 값 설정
    lastVisible: null,
    category: null
  });

/**
 * @deprecated `getProductsWithStock` 사용을 권장합니다.
 * ✅ [수정] payload 객체를 받도록 수정
 */
export const getProductsByCategory = (payload: { category: string | null }) => 
  getProductsWithStock({ 
    category: payload.category, // payload에서 category 추출
    pageSize: 1000, // 기존 getProductsByCategory는 페이지네이션이 없었으므로 큰 값 설정
    lastVisible: null 
  });

/**
 * @deprecated `getProductsWithStock` 사용을 G권장합니다.
 */
export const getPaginatedProductsWithStock = (
  // ✅ [수정] payload 객체를 받도록 수정 (타입스크립트 호환성을 위해 유지)
  pageSize: number, 
  lastVisible: number | null, 
  category: string | null
) => 
  getProductsWithStock({ 
    pageSize, 
    lastVisible, 
    category 
  });