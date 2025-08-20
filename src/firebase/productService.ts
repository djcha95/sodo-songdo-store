// src/firebase/productService.ts

import { db, storage } from './firebaseConfig';
import {
  collection, addDoc, query, doc, getDoc, getDocs, updateDoc,
  writeBatch, increment, arrayUnion, where, orderBy, Timestamp,
  runTransaction, startAfter, limit, getCountFromServer,
  type DocumentData, type Query, type DocumentReference, type WriteBatch,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { uploadImages } from './generalService';
import type {
  Product, SalesRound, SalesRoundStatus, VariantGroup,
  ProductItem, CartItem, WaitlistInfo, PaginatedProductsResponse
} from '@/types';

// ✅ [추가] 박스→실개수 기준 예약량 맵
import { getReservedQuantitiesMap } from './orderService';
import { getUserDocById } from './userService';

// ========================================================
// 헬퍼: reservedCount 오버레이 적용
// ========================================================
function overlayKey(productId: string, roundId: string, vgId: string) {
  return `${productId}-${roundId}-${vgId}`;
}

function applyReservedOverlay(product: Product, reservedMap: Map<string, number>): Product {
  if (!product?.salesHistory) return product;
  product.salesHistory = product.salesHistory.map((round) => {
    const vgs = (round.variantGroups || []).map((vg) => {
      const key = overlayKey(product.id, round.roundId, vg.id);
      const reserved = reservedMap.get(key) || 0; // 박스→실개수 누적값
      return { ...vg, reservedCount: reserved };
    });
    return { ...round, variantGroups: vgs };
  });
  return product;
}

// ========================================================
// 상태/보관/카테고리 관련
// ========================================================
export const updateProductsStatus = async (productIds: string[], isArchived: boolean): Promise<void> => {
  const batch = writeBatch(db);
  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.update(productRef, { isArchived });
  });
  await batch.commit();
};

/**
 * ✅ [신규 추가] Vercel 빌드 오류를 해결하기 위한 함수입니다.
 * 여러 상품을 지정된 카테고리로 한 번에 이동시킵니다.
 * @param productIds 이동할 상품 ID 배열
 * @param newCategoryName 새 카테고리 이름. '' 또는 null로 지정하면 '분류 없음'이 됩니다.
 */
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

// ========================================================
// 검색/생성/수정
// ========================================================
export const searchProductsByName = async (name: string): Promise<Product[]> => {
  if (!name) return [];
  const productsRef = collection(db, 'products');
  const q = query(
    productsRef,
    where('groupName', '>=', name),
    where('groupName', '<=', name + '\uf8ff'),
    limit(10)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Product);
};

export const addProductWithFirstRound = async (
  productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived'>,
  firstRoundData: Omit<SalesRound, 'roundId' | 'createdAt' | 'waitlist' | 'waitlistCount'>,
  imageFiles: File[],
  creationDate: Date
): Promise<string> => {
  const imageUrls = await uploadImages(imageFiles, 'products');
  const creationTimestamp = Timestamp.fromDate(creationDate);

  const newProduct: Omit<Product, 'id'> = {
    ...productData,
    imageUrls,
    isArchived: false,
    createdAt: creationTimestamp,
    salesHistory: [{
      ...firstRoundData,
      roundId: `round-${Date.now()}`,
      createdAt: creationTimestamp,
      waitlist: [],
      waitlistCount: 0,
    }],
  };

  const docRef = await addDoc(collection(db, 'products'), newProduct);
  return docRef.id;
};

export const addNewSalesRound = async (
  productId: string,
  newRoundData: Omit<SalesRound, 'roundId' | 'createdAt' | 'waitlist' | 'waitlistCount'>
): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  const roundToAdd: SalesRound = {
    ...newRoundData,
    roundId: `round-${Date.now()}`,
    createdAt: Timestamp.now(),
    waitlist: [],
    waitlistCount: 0,
    allowedTiers: newRoundData.allowedTiers || [],
  };
  await updateDoc(productRef, {
    salesHistory: arrayUnion(roundToAdd)
  });
};

export const updateSalesRound = async (
  productId: string,
  roundId: string,
  updatedData: Partial<Omit<SalesRound, 'roundId' | 'createdAt'>>
): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) { throw new Error("상품을 찾을 수 없습니다."); }
    const product = productSnap.data() as Product;
    const newSalesHistory = product.salesHistory.map(round => {
      if (round.roundId === roundId) {
        const finalUpdatedData = { ...round, ...updatedData };
        if ('allowedTiers' in updatedData) {
          finalUpdatedData.allowedTiers = updatedData.allowedTiers || [];
        }
        return finalUpdatedData;
      }
      return round;
    });
    transaction.update(productRef, { salesHistory: newSalesHistory });
  });
};

export const updateProductCoreInfo = async (
  productId: string,
  productData: Partial<Omit<Product, 'id' | 'salesHistory'>>,
  newImageFiles: File[],
  existingImageUrls: string[],
  originalAllImageUrls: string[]
): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  let finalImageUrls = existingImageUrls;

  if (newImageFiles.length > 0) {
    const newUrls = await uploadImages(newImageFiles, 'products');
    finalImageUrls = [...finalImageUrls, ...newUrls];
  }

  const imageUrlsToDelete = originalAllImageUrls.filter(url => !existingImageUrls.includes(url));
  const deletePromises = imageUrlsToDelete.map(url => {
    try {
      const imageRef = ref(storage, url);
      return Promise.resolve(deleteObject(imageRef));
    } catch (e) {
      console.warn(`이미지 삭제 실패 (URL: ${url}):`, e);
      return Promise.resolve();
    }
  });
  await Promise.all(deletePromises);
  await updateDoc(productRef, { ...productData, imageUrls: finalImageUrls });
};

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

// ========================================================
// 읽기(fetch) — 오버레이 적용 버전
// ========================================================
export const getProductById = async (productId: string): Promise<Product | null> => {
  const docRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  const [docSnap, reservedMap] = await Promise.all([getDoc(docRef), getReservedQuantitiesMap()]);
  if (!docSnap.exists()) return null;
  const product = { id: docSnap.id, ...docSnap.data() } as Product;
  return applyReservedOverlay(product, reservedMap);
};

export const getProducts = async (
  archived: boolean = false,
  pageSize: number = 10,
  lastVisible: DocumentData | null = null
): Promise<PaginatedProductsResponse> => {
  let productsQuery: Query<DocumentData> = query(
    collection(db, 'products'),
    where('isArchived', '==', archived),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  if (lastVisible) {
    productsQuery = query(
      collection(db, 'products'),
      where('isArchived', '==', archived),
      orderBy('createdAt', 'desc'),
      startAfter(lastVisible),
      limit(pageSize)
    );
  }

  const [snapshot, reservedMap] = await Promise.all([getDocs(productsQuery), getReservedQuantitiesMap()]);
  const products = snapshot.docs.map((doc) =>
    applyReservedOverlay({ id: doc.id, ...doc.data() } as Product, reservedMap)
  );
  const newLastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

  return { products, lastVisible: newLastVisible };
};

export const getProductsByCategory = async (
  categoryName: string | null,
  pageSize: number,
  lastVisible: DocumentData | null = null
): Promise<{ products: Product[], lastDoc: DocumentData | null, totalCount: number }> => {
  const productsRef = collection(db, 'products');

  let baseQuery: Query;
  if (categoryName === null) {
    baseQuery = query(productsRef, where('category', 'in', ['', null]), where('isArchived', '==', false));
  } else {
    baseQuery = query(productsRef, where('category', '==', categoryName), where('isArchived', '==', false));
  }

  const [countSnapshot, reservedMap] = await Promise.all([
    getCountFromServer(baseQuery),
    getReservedQuantitiesMap(),
  ]);

  const totalCount = countSnapshot.data().count;

  let paginatedQuery = query(baseQuery, orderBy('groupName'), limit(pageSize));
  if (lastVisible) {
    paginatedQuery = query(baseQuery, orderBy('groupName'), startAfter(lastVisible), limit(pageSize));
  }

  const documentSnapshots = await getDocs(paginatedQuery);
  const products = documentSnapshots.docs.map((doc) =>
    applyReservedOverlay({ id: doc.id, ...doc.data() } as Product, reservedMap)
  );
  const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1] || null;

  return { products, lastDoc, totalCount };
};

export const getAllProducts = async (archived: boolean = false): Promise<Product[]> => {
  const productsQuery: Query<DocumentData> = query(
    collection(db, 'products'),
    where('isArchived', '==', archived),
    orderBy('createdAt', 'desc')
  );
  const [snapshot, reservedMap] = await Promise.all([getDocs(productsQuery), getReservedQuantitiesMap()]);
  return snapshot.docs.map((doc: DocumentData) =>
    applyReservedOverlay({ id: doc.id, ...doc.data() } as Product, reservedMap)
  );
};

// ========================================================
// 재고/가용성/대기열
// ========================================================
interface ArrivalInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  arrivalDate: Timestamp;
}

export const getProductArrivals = async (): Promise<ArrivalInfo[]> => {
  // 단순 도착일 조회이므로 오버레이 불필요
  const products = await getAllProducts(false);
  const arrivals: ArrivalInfo[] = [];
  products.forEach(product => {
    product.salesHistory.forEach(round => {
      if (round.arrivalDate) {
        arrivals.push({
          productId: product.id,
          productName: product.groupName,
          roundId: round.roundId,
          roundName: round.roundName,
          arrivalDate: round.arrivalDate,
        });
      }
    });
  });
  return arrivals;
};

export const checkProductAvailability = async (
  productId: string,
  roundId: string,
  variantGroupId: string,
  itemId: string
): Promise<boolean> => {
  const product = await getProductById(productId); // ✅ 오버레이 반영된 객체
  if (!product) return false;

  const round = product.salesHistory.find(r => r.roundId === roundId);
  if (!round) return false;

  const variantGroup = round.variantGroups.find((vg: VariantGroup) => vg.id === variantGroupId);
  if (!variantGroup) return false;

  const item = variantGroup.items.find((i: ProductItem) => i.id === itemId);
  if (!item) return false;

  // 아이템 자체 재고
  const hasSufficientItemStock = item.stock === -1 || item.stock > 0;
  if (!hasSufficientItemStock) return false;

  // ✅ 그룹 잔여 재고(총 − 예약) 기준으로 판단
  const total = variantGroup.totalPhysicalStock;
  const reserved = variantGroup.reservedCount || 0;
  const remainingUnits = (total === null || total === -1) ? Infinity : Math.max(0, (total || 0) - reserved);

  const unit = Number(item.stockDeductionAmount ?? 1);
  const hasSufficientGroupStock = remainingUnits >= unit;

  return hasSufficientGroupStock;
};

export const getUserWaitlist = async (userId: string): Promise<WaitlistInfo[]> => {
  if (!userId) return [];
  const allProductsSnapshot = await getDocs(query(collection(db, 'products'), where('isArchived', '==', false)));
  const userWaitlist: WaitlistInfo[] = [];

  allProductsSnapshot.docs.forEach(doc => {
    const product = { id: doc.id, ...doc.data() } as Product;
    (product.salesHistory || []).forEach(round => {
      if (round.waitlist && round.waitlist.length > 0) {

        // ✅ 3단계 정렬 규칙
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
              timestamp: entry.timestamp,
              isPrioritized: entry.isPrioritized || false,
              waitlistOrder: index + 1,
              prioritizedAt: entry.prioritizedAt || null,
            });
          }
        });
      }
    });
  });

  return userWaitlist.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
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

export const getWaitlistForRound = async (
  productId: string,
  roundId: string
): Promise<(WaitlistInfo & {userName: string})[]> => {
  const product = await getProductById(productId);
  if (!product) throw new Error("상품 정보를 찾을 수 없습니다.");

  const round = product.salesHistory.find(r => r.roundId === roundId);
  if (!round || !round.waitlist) return [];

  const sortedWaitlist = [...round.waitlist].sort((a, b) => {
    if (a.isPrioritized && !b.isPrioritized) return -1;
    if (!a.isPrioritized && b.isPrioritized) return 1;
    return a.timestamp.toMillis() - b.timestamp.toMillis();
  });

  const detailedWaitlist = await Promise.all(
    sortedWaitlist.map(async (entry) => {
      const userDoc = await getUserDocById(entry.userId);
      const vg = round.variantGroups.find(v => v.id === entry.variantGroupId);
      const item = vg?.items.find(i => i.id === entry.itemId);

      return {
        productId: product.id,
        productName: product.groupName,
        roundId: round.roundId,
        roundName: round.roundName,
        itemName: `${vg?.groupName || ''} - ${item?.name || ''}`.replace(/^ - | - $/g, '') || '옵션 정보 없음',
        imageUrl: product.imageUrls[0] || '',
        userName: userDoc?.displayName || '알 수 없음',
        ...entry,
      };
    })
  );

  return detailedWaitlist;
};

// ========================================================
// 기타
// ========================================================
export const getProductsByIds = async (productIds: string[]): Promise<Product[]> => {
  if (productIds.length === 0) return [];

  // Firestore 'in' 쿼리 30개 제한 고려
  const chunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += 30) {
    chunks.push(productIds.slice(i, i + 30));
  }

  const [snapshots, reservedMap] = await Promise.all([
    Promise.all(
      chunks.map(chunk => {
        const productsQuery = query(collection(db, 'products'), where('__name__', 'in', chunk));
        return getDocs(productsQuery);
      })
    ),
    getReservedQuantitiesMap(),
  ]);

  const products: Product[] = [];
  snapshots.forEach(snapshot => {
    snapshot.forEach(docSnap => {
      const p = { id: docSnap.id, ...docSnap.data() } as Product;
      products.push(applyReservedOverlay(p, reservedMap));
    });
  });

  return products;
};

// ========================================================
// 그룹/아이템 재고 조정 (관리자)
// ========================================================
export const updateMultipleVariantGroupStocks = async (
  updates: { productId: string; roundId: string; variantGroupId: string; newStock: number; }[]
): Promise<void> => {
  const batch = writeBatch(db);
  const productsToUpdate = new Map<string, { productRef: DocumentReference<DocumentData>; productData: Product }>();

  for (const update of updates) {
    if (!productsToUpdate.has(update.productId)) {
      const productRef = doc(db, 'products', update.productId);
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        productsToUpdate.set(update.productId, {
          productRef,
          productData: productSnap.data() as Product,
        });
      }
    }
  }

  for (const update of updates) {
    const productInfo = productsToUpdate.get(update.productId);
    if (!productInfo) continue;

    const { productData } = productInfo;
    const newSalesHistory = productData.salesHistory.map((round: SalesRound) => {
      if (round.roundId === update.roundId) {
        const newVariantGroups = round.variantGroups.map((vg: VariantGroup) => {
          if (vg.id === update.variantGroupId) {
            return { ...vg, totalPhysicalStock: update.newStock };
          }
          return vg;
        });
        return { ...round, variantGroups: newVariantGroups };
      }
      return round;
    });
    productData.salesHistory = newSalesHistory;
  }

  for (const { productRef, productData } of productsToUpdate.values()) {
    batch.update(productRef, { salesHistory: productData.salesHistory });
  }
  await batch.commit();
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

export const updateSalesRoundStatus = async (
  productId: string,
  roundId: string,
  newStatus: SalesRound['status']
): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) throw new Error("상품을 찾을 수 없습니다.");
    const product = productSnap.data() as Product;
    const newSalesHistory = product.salesHistory.map(round => {
      if (round.roundId === roundId) {
        return { ...round, status: newStatus };
      }
      return round;
    });
    transaction.update(productRef, { salesHistory: newSalesHistory });
  });
};

export const updateMultipleSalesRoundStatuses = async (
  updates: { productId: string; roundId: string; newStatus: SalesRoundStatus }[]
): Promise<void> => {
  const batch = writeBatch(db);
  const productsToUpdate = new Map<string, { productRef: DocumentReference<DocumentData>; productData: Product }>();
  for (const update of updates) {
    if (!productsToUpdate.has(update.productId)) {
      const productRef = doc(db, 'products', update.productId);
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        productsToUpdate.set(update.productId, {
          productRef,
          productData: productSnap.data() as Product,
        });
      }
    }
  }
  for (const update of updates) {
    const productInfo = productsToUpdate.get(update.productId);
    if (!productInfo) continue;
    const { productData } = productInfo;
    const newSalesHistory = productData.salesHistory.map((round: SalesRound) => {
      if (round.roundId === update.roundId) {
        return { ...round, status: update.newStatus };
      }
      return round;
    });
    productData.salesHistory = newSalesHistory;
  }
  for (const { productRef, productData } of productsToUpdate.values()) {
    batch.update(productRef, { salesHistory: productData.salesHistory });
  }
  await batch.commit();
};

export const deleteSalesRounds = async (
  deletions: { productId: string; roundId: string }[]
): Promise<void> => {
  const batch = writeBatch(db);
  const productsToUpdate = new Map<string, { roundsToDelete: Set<string> }>();

  for (const { productId, roundId } of deletions) {
    if (!productsToUpdate.has(productId)) {
      productsToUpdate.set(productId, { roundsToDelete: new Set() });
    }
    productsToUpdate.get(productId)!.roundsToDelete.add(roundId);
  }

  for (const [productId, { roundsToDelete }] of productsToUpdate.entries()) {
    const productRef = doc(db, 'products', productId);
    try {
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        const productData = productSnap.data() as Product;
        const newSalesHistory = productData.salesHistory.filter(
          (round) => !roundsToDelete.has(round.roundId)
        );
        batch.update(productRef, { salesHistory: newSalesHistory });
      }
    } catch (error) {
      console.error(`판매 회차 삭제를 위해 상품(${productId}) 처리 중 오류:`, error);
    }
  }
  await batch.commit();
};

// ========================================================
// 장바구니 실시간 재고 조회 (그룹 총재고만 제공 — 예약은 화면집계로 커버)
// ========================================================
export const getLiveStockForItems = async (
  items: CartItem[]
): Promise<Record<string, { itemStock: number; groupStock: number | null }>> => {
  if (items.length === 0) return {};
  const productIds = [...new Set(items.map(item => item.productId))];
  const productSnapshots = await Promise.all(productIds.map(id => getDoc(doc(db, 'products', id))));
  const productsMap = new Map<string, Product>();
  productSnapshots.forEach(snap => {
    if (snap.exists()) {
      productsMap.set(snap.id, { id: snap.id, ...snap.data() } as Product);
    }
  });
  const stockInfo: Record<string, { itemStock: number; groupStock: number | null }> = {};
  items.forEach(item => {
    const product = productsMap.get(item.productId);
    const round = product?.salesHistory.find(r => r.roundId === item.roundId);
    const group = round?.variantGroups.find(vg => vg.id === item.variantGroupId);
    const productItem = group?.items.find(i => i.id === item.itemId);
    if (productItem && group) {
      const uniqueId = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      stockInfo[uniqueId] = {
        itemStock: productItem.stock,
        groupStock: group.totalPhysicalStock, // 예약 반영은 화면에서 reservedMap 기반으로 처리
      };
    }
  });
  return stockInfo;
};