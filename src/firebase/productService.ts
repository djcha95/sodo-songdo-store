// src/firebase/productService.ts

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  getFirestore, collection, addDoc, query, doc, getDoc, getDocs, 
  updateDoc, writeBatch, increment, arrayUnion, where, Timestamp, 
  runTransaction, 
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
  if (!product?.salesHistory) return product;
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

const productApi = httpsCallable(functions, 'productApi');
const getProductsWithStockCallable = httpsCallable(functions, 'getProductsWithStock');
const getProductByIdCallable = httpsCallable(functions, 'getProductByIdWithStock');

// --- 1. 신규 상품 + 첫 회차 등록 ---
export const addProductWithFirstRound = async (
  productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived'>,
  salesRoundData: Omit<SalesRound, 'roundId' | 'createdAt'>,
  imageFiles: File[],
  creationDate: Date
): Promise<any> => {
  const result = await productApi({
    action: 'CREATE_PRODUCT_WITH_ROUND',
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
  const result = await productApi({
    action: 'ADD_NEW_ROUND',
    productId,
    salesRoundData,
  });
  return result.data;
};

// --- 3. 상품 핵심 정보 수정 ---
export const updateProductCoreInfo = async (
  productId: string,
  productData: Partial<Product>,
  newFiles: File[],
  finalImageUrls: string[],
  initialImageUrls: string[]
): Promise<any> => {
  const result = await productApi({
    action: 'UPDATE_PRODUCT_CORE',
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
  const result = await productApi({
    action: 'UPDATE_ROUND',
    productId,
    roundId,
    salesRoundData,
  });
  return result.data;
};

// --- 5. 단일 상품 조회 (서버) ---
// (참고: '구' 파일의 클라이언트 'getProductById'는 이 함수로 대체됩니다)
export const getProductById = async (productId: string): Promise<Product | null> => {
  const result = await getProductByIdCallable({ productId });
  const product = result.data as Product | null;
  
  // '구' 파일의 오버레이 로직을 클라이언트에서도 한번 더 적용 (안전장치)
  if (product) {
    const reservedMap = await getReservedQuantitiesMap();
    return applyReservedOverlay(product, reservedMap);
  }
  return null;
};

// --- 6. 상품명으로 검색 (서버) ---
export const searchProductsByName = async (name: string): Promise<Product[]> => {
  const result = await productApi({ action: 'SEARCH_BY_NAME', name });
  return result.data as Product[];
};

// --- 7. 판매 회차 다중 삭제 (서버) ---
export const deleteSalesRounds = async (
  deletions: { productId: string; roundId: string }[]
): Promise<any> => {
  const result = await productApi({ action: 'DELETE_ROUNDS', deletions });
  return result.data;
};

// --- 8. 대기자 명단 조회 (서버) ---
export const getWaitlistForRound = async (productId: string, roundId: string): Promise<any[]> => {
    const result = await productApi({ action: 'GET_WAITLIST', productId, roundId });
    return result.data as any[];
}

// --- 9. 재고 수정 (서버) ---
export const updateMultipleVariantGroupStocks = async (
    updates: { productId: string; roundId: string; variantGroupId: string; newStock: number }[]
): Promise<any> => {
    const result = await productApi({ action: 'UPDATE_STOCKS', updates });
    return result.data;
};

// --- 10. 판매 상태 일괄 변경 (서버) ---
export const updateMultipleSalesRoundStatuses = async (
  updates: { productId: string; roundId: string; newStatus: SalesRoundStatus }[]
): Promise<any> => {
    const result = await productApi({ action: 'BULK_UPDATE_STATUS', updates });
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
  lastVisible: number | null; // '구' 파일에서는 lastVisible이 number (timestamp) 였습니다.
}

type GetProductsWithStockPayload = {
  pageSize?: number;
  lastVisible?: number | null;
  category?: string | null;
};

/**
 * ✅ [업그레이드] 이제 이 함수가 상품 목록을 가져오는 유일한 공식 함수입니다.
 * (from '구' 파일, '신' 파일의 getProductsWithStockCallable을 사용)
 */
export const getProductsWithStock = async (
  payload: GetProductsWithStockPayload
): Promise<GetProductsWithStockResponse> => {
  try {
    // '신' 파일의 'getProductsWithStockCallable'를 사용합니다.
    const result = await getProductsWithStockCallable(payload);
    return result.data as GetProductsWithStockResponse;
  } catch (error) {
    console.error("Error calling getProductsWithStock:", error);
    throw new Error("상품 재고 정보를 불러오는 데 실패했습니다.");
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
 * @deprecated `getProductsWithStock` 사용을 권장합니다.
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