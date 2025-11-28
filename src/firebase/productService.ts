// src/firebase/productService.ts

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { HttpsCallable } from 'firebase/functions';
import {
  getFirestore, collection, addDoc, query, doc, getDoc, getDocs,
  updateDoc, writeBatch, increment, arrayUnion, where, Timestamp,
  runTransaction,
  orderBy, limit, startAfter, // DB 직접 조회를 위한 Firestore 함수
  type DocumentData, type DocumentReference, type WriteBatch,
  type QueryConstraint
} from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { uploadImages } from './generalService';
import { getReservedQuantitiesMap } from './orderService';
import { getUserDocById } from './userService';

// ✅ '구' 파일과 '신' 파일의 모든 타입을 통합합니다.
import type {
  Product, SalesRound, SalesRoundStatus, VariantGroup,
  ProductItem, CartItem, LoyaltyTier
} from '@/shared/types';

// ✅ WaitlistInfo 타입을 여기에 직접 정의합니다.
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
// 헬퍼: reservedCount 오버레이 적용
// ========================================================
function overlayKey(productId: string, roundId: string, vgId: string) {
  return `${productId}-${roundId}-${vgId}`;
}

function applyReservedOverlay(product: Product, reservedMap: Map<string, number>): Product {
  // 💡 salesHistory 배열 방어 로직
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
// 🚀 '최신식' Cloud Function 호출 함수
// ========================================================

// 각 action에 대한 개별 callable 생성
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
const getProductByIdCallable = httpsCallable(functions, 'getProductByIdWithStock');

// --- 1. 신규 상품 + 첫 회차 등록 ---
export const addProductWithFirstRound = async (
  productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived' | 'isOnsite'>,
  salesRoundData: Omit<SalesRound, 'roundId' | 'createdAt'>,
  imageFiles: File[],
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

  // ✅ 회차 추가 후, 상품을 "새로 등록된 공구"처럼 맨 앞에 노출되게
  const productRef = doc(db, 'products', productId);
  await updateDoc(productRef, {
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
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
// 11. [수정] 현장판매(Onsite) 수동 전환 토글 (최상위 필드 동기화 추가)
// ========================================================
export const toggleSalesRoundOnsiteStatus = async (
  productId: string,
  roundId: string,
  isOnsite: boolean
): Promise<void> => {
  const productRef = doc(db, 'products', productId);

  await runTransaction(db, async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists()) throw new Error("상품을 찾을 수 없습니다.");

    const productData = productDoc.data() as Product;
    if (!Array.isArray(productData.salesHistory)) {
      throw new Error("salesHistory 데이터가 손상되었습니다.");
    }

    // 1. 해당 라운드 상태 업데이트
    const newSalesHistory = productData.salesHistory.map(r => {
      if (r.roundId === roundId) {
        return {
          ...r,
          isManuallyOnsite: isOnsite,
          // 현장판매 전환 시 manualStatus가 ended나 sold_out이면 안 되므로 selling 상태 보장 (선택사항)
          // 여기서는 원본 요청대로 단순히 플래그만 변경합니다.
        };
      }
      return r;
    });

    // 2. ✅ [핵심] 최상위 'isOnsite' 플래그 동기화
    // 모든 라운드 중 하나라도 현장판매 중이면 true, 아니면 false
    const hasAnyOnsiteRound = newSalesHistory.some(r => r.isManuallyOnsite === true);

    transaction.update(productRef, {
      salesHistory: newSalesHistory,
      isOnsite: hasAnyOnsiteRound // 검색용 필드 업데이트
    });
  });
};


// ========================================================
// 📦 '구' 파일에서 가져온 클라이언트 함수
// ========================================================

// --- 12. 사용자 대기열 조회 ---
export const getUserWaitlist = async (userId: string): Promise<WaitlistInfo[]> => {
  if (!userId) return [];
  const allProductsSnapshot = await getDocs(query(collection(db, 'products'), where('isArchived', '==', false)));
  const userWaitlist: WaitlistInfo[] = [];

  allProductsSnapshot.docs.forEach(doc => {
    const product = { id: doc.id, ...doc.data() } as Product;

    // 💡 salesHistory 배열 방어 코드
    if (!Array.isArray(product.salesHistory)) return;

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
    encoreRequestedProductIds: arrayUnion(userId),
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

    // 💡 salesHistory 배열 방어 코드
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

    // 💡 salesHistory 배열 방어 코드
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
// 🚀 [수정] '최신식' 상품 목록 조회 (탭별 필터링 적용)
// ========================================================

export interface GetProductsWithStockResponse {
  products: Product[];
  lastVisible: number | null;
}

// ✅ 탭 타입 정의
type ProductTabType = 'all' | 'today' | 'additional' | 'onsite';

type GetProductsWithStockPayload = {
  pageSize?: number;
  lastVisible?: number | null;
  tab?: ProductTabType | null; // ✅ 탭 파라미터 추가
};

export const getProductsWithStock = async (
  payload: GetProductsWithStockPayload
): Promise<GetProductsWithStockResponse> => {
  try {
    const { pageSize = 10, lastVisible = null, tab = 'all' } = payload; // tab 기본값 'all'

    const queryConstraints: QueryConstraint[] = []; // 타입을 QueryConstraint[]로 명시

    // 1. ✅ 탭별 필터링 로직 분기
    if (tab === 'onsite') {
      // [현장판매 탭]: isOnsite가 true인 것만 가져옴 (매우 빠름)
      queryConstraints.push(where('isOnsite', '==', true));
      // 현장판매는 보통 종료된 것도 포함해서 보여줄지, active만 보여줄지 결정해야 함.
      // 일단 '보관(Archive)'된 것은 제외
      queryConstraints.push(where('isArchived', '==', false));
    } else {
      // [전체 / 오늘의공구 / 추가예약]: 기존 로직 (활성 상품 전체 로드)
      // 'today'와 'additional'은 시간 기준이라 DB 쿼리로 완벽 분리가 어려움 -> Fetch 후 프론트 필터링 유지
      queryConstraints.push(where('isArchived', '==', false));
    }

    // 2. 정렬 (createdAt 내림차순)
    queryConstraints.push(orderBy('createdAt', 'desc'));

    // 3. 페이지네이션 커서
    if (lastVisible) {
      const lastVisibleTimestamp = Timestamp.fromMillis(lastVisible);
      // startAfter는 정렬 필드의 값으로 사용해야 하므로, 여기서 'createdAt' 필드를 사용
      queryConstraints.push(startAfter(lastVisibleTimestamp));
    }

    // 4. 페이지 사이즈
    queryConstraints.push(limit(pageSize));

    const productsRef = collection(db, 'products');
    const q = query(productsRef, ...queryConstraints);

    // 예약 수량 맵
    const reservedMap = await getReservedQuantitiesMap();

    const snapshot = await getDocs(q);

    const products: Product[] = [];
    snapshot.docs.forEach(docSnap => {
      const productData = docSnap.data() as Product;
      const productWithOverlay = applyReservedOverlay(
        { ...productData, id: docSnap.id },
        reservedMap
      );
      products.push(productWithOverlay);
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const newLastVisible = lastDoc
      ? (lastDoc.data().createdAt as Timestamp).toMillis()
      : null;

    return { products, lastVisible: newLastVisible };

  } catch (error: any) {
    console.error("Error fetching products:", error);
    // ✅ 인덱스 에러 발생 시 콘솔에 링크가 뜹니다. 해당 링크를 클릭해서 인덱스를 생성해주세요.
    if (error.code === 'failed-precondition') {
      throw new Error("DB 인덱스가 필요합니다. 콘솔(F12)의 링크를 클릭하여 생성해주세요.");
    }
    throw new Error("상품 로드 실패");
  }
};


// =================================================================
// ✅ [신규] 기존 데이터 일괄 복구 (마이그레이션) 스크립트
// 기존에 등록된 상품들은 'isOnsite' 필드가 없으므로, 이걸 한번 돌려서 생성해줘야 합니다.
// =================================================================
export const syncAllProductsOnsiteStatus = async () => {
  console.log("🔄 현장판매 상태 동기화 시작...");
  const snapshot = await getDocs(collection(db, 'products'));
  const batch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data() as Product;
    // salesHistory 중 하나라도 isManuallyOnsite가 true인지 확인
    const isActuallyOnsite = data.salesHistory?.some(r => r.isManuallyOnsite === true) ?? false;

    // 현재 필드값이 없거나 실제 상태와 다르면 업데이트
    if (data.isOnsite !== isActuallyOnsite) {
      batch.update(doc.ref, { isOnsite: isActuallyOnsite });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`✅ ${count}개의 상품 상태가 동기화되었습니다.`);
  } else {
    console.log("✅ 동기화할 상품이 없습니다.");
  }
};

// =================================================================
// ✅ 기존 함수들에 대한 별칭 수정
// =================================================================

/**
 * @deprecated `getProductsWithStock` 사용 권장
 */
export const getProducts = () =>
  getProductsWithStock({
    pageSize: 1000,
    lastVisible: null,
  });

/**
 * @deprecated `getProductsWithStock` 사용 권장
 */
export const getAllProducts = () =>
  getProductsWithStock({
    pageSize: 1000,
    lastVisible: null,
  });

/**
 * @deprecated ModernProductList에서 사용하는 함수
 * tab 파라미터를 받을 수 있도록 수정
 * 기존 시그니처 유지: (pageSize, lastVisible, category, tab)
 * category는 무시
 */
export const getPaginatedProductsWithStock = (
  pageSize: number,
  lastVisible: number | null,
  category: string | null, // 얘는 안 씀
  tab: ProductTabType = 'all' // ✅ tab 추가
) =>
  getProductsWithStock({
    pageSize,
    lastVisible,
    tab
  });