// src/firebase/productService.ts

import { db, storage } from './firebaseConfig';
import {
  collection, addDoc, query, doc, getDoc, getDocs, updateDoc,
  writeBatch,
  increment, arrayUnion, where, orderBy, Timestamp, runTransaction,
  startAfter, limit, getCountFromServer
} from 'firebase/firestore';
import type { DocumentData, Query, DocumentReference, WriteBatch } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { uploadImages } from './generalService';
import type { Product, SalesRound, SalesRoundStatus, VariantGroup, ProductItem, WaitlistEntry, CartItem } from '@/types';
import { getUserDocById } from './userService'; // userService에서 사용자 정보 조회를 위해 import
import { submitOrderFromWaitlist } from './orderService'; // orderService에서 import


// --- BulkActionBar.tsx에서 사용할 함수 추가 ---

/**
 * @description 여러 상품의 보관(archive) 상태를 일괄 변경합니다.
 * @param productIds - 상태를 변경할 상품 ID 배열
 * @param isArchived - 새로운 보관 상태 (true: 숨김, false: 게시)
 */
export const updateProductsStatus = async (productIds: string[], isArchived: boolean): Promise<void> => {
  const batch = writeBatch(db);
  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.update(productRef, { isArchived });
  });
  await batch.commit();
};

/**
 * @description 여러 상품을 일괄 삭제합니다. Firestore 문서와 Storage의 이미지 파일을 모두 삭제합니다.
 * @param productIds - 삭제할 상품 ID 배열
 */
export const deleteProducts = async (productIds: string[]): Promise<void> => {
  const batch = writeBatch(db);

  for (const id of productIds) {
    const productRef = doc(db, 'products', id);
    
    try {
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data() as Product;
        const imageUrls = productData.imageUrls || [];

        // Storage에서 이미지 삭제
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
      // Firestore 문서 삭제를 배치에 추가
      batch.delete(productRef);

    } catch (error) {
      console.error(`상품 삭제 처리 중 오류 발생 (ID: ${id}):`, error);
    }
  }

  await batch.commit();
};


// ... (기존 함수들은 그대로 유지) ...


// ✅ [추가] 상품 이름으로 상품을 검색하는 함수
/**
 * @description 상품 이름으로 상품을 검색합니다. (자동완성 및 중복 확인용)
 * Firestore의 한계로 인해 '포함' 검색은 불가능하며, '시작' 검색만 지원합니다.
 * @param name - 검색할 상품명
 * @returns - 검색된 상품 목록
 */
export const searchProductsByName = async (name: string): Promise<Product[]> => {
  if (!name) {
    return [];
  }
  const productsRef = collection(db, 'products');
  // 'groupName' 필드가 검색어(name)로 시작하는 문서를 찾는 쿼리
  const q = query(
    productsRef,
    where('groupName', '>=', name),
    where('groupName', '<=', name + '\uf8ff'),
    limit(10) // 최대 10개까지만 결과 반환
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Product);
};


/**
 * @description 대표 상품을 추가하고 첫 번째 판매 회차를 등록하는 함수
 */
export const addProductWithFirstRound = async (
  productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived'>,
  firstRoundData: Omit<SalesRound, 'roundId' | 'createdAt' | 'waitlist' | 'waitlistCount'>,
  imageFiles: File[]
): Promise<string> => {
  const imageUrls = await uploadImages(imageFiles, 'products');
  const now = Timestamp.now();

  const newProduct: Omit<Product, 'id'> = {
    ...productData,
    imageUrls,
    isArchived: false,
    createdAt: now,
    salesHistory: [{
      ...firstRoundData,
      roundId: `round-${Date.now()}`,
      createdAt: now,
      waitlist: [],
      waitlistCount: 0,
    }],
  };

  const docRef = await addDoc(collection(db, 'products'), newProduct);
  return docRef.id;
};

/**
 * @description 기존 상품에 새로운 판매 회차를 추가하는 함수
 */
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
  };

  await updateDoc(productRef, {
    salesHistory: arrayUnion(roundToAdd)
  });
};

/**
 * @description 특정 판매 회차의 정보를 수정하는 함수
 */
export const updateSalesRound = async (
  productId: string,
  roundId: string,
  updatedData: Partial<Omit<SalesRound, 'roundId' | 'createdAt'>>
): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  
  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("상품을 찾을 수 없습니다.");
    }
    
    const product = productSnap.data() as Product;
    const newSalesHistory = product.salesHistory.map(round => {
      if (round.roundId === roundId) {
        return { ...round, ...updatedData };
      }
      return round;
    });
    
    transaction.update(productRef, { salesHistory: newSalesHistory });
  });
};


/**
 * @description 상품의 고유 정보(이름, 설명, 이미지 등)를 수정하는 함수
 */
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
      return Promise.resolve(deleteObject(imageRef)); // Promise.resolve()로 감싸서 항상 Promise를 반환하도록 함
    } catch (e) {
      console.warn(`이미지 삭제 실패 (URL: ${url}):`, e);
      return Promise.resolve(); // 오류 발생 시에도 Promise.all이 실패하지 않도록 resolve
    }
  });
  await Promise.all(deletePromises);

  await updateDoc(productRef, { ...productData, imageUrls: finalImageUrls });
};

/**
 * @description 앵콜 요청을 처리하는 함수
 */
export const updateEncoreRequest = async (productId: string, userId: string): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  const userRef: DocumentReference<DocumentData> = doc(db, 'users', userId);
  
  const batch: WriteBatch = writeBatch(db);

  batch.update(productRef, {
    encoreCount: increment(1),
    encoreRequesterIds: arrayUnion(userId),
  });

  batch.update(userRef, {
    encoreRequestedProductIds: arrayUnion(productId),
  });

  await batch.commit();
};

/**
 * @description 상품 ID로 상품 정보 가져오기
 */
export const getProductById = async (productId: string): Promise<Product | null> => {
    const docRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null;
};

/**
 * @description 모든 대표 상품 목록 가져오기
 */
export const getProducts = async (archived: boolean = false): Promise<Product[]> => {
  const queryConstraints = [
    where('isArchived', '==', archived),
    orderBy('createdAt', 'desc')
  ];

  const productsQuery: Query<DocumentData> = query(
    collection(db, 'products'),
    ...queryConstraints
  );
  
  const snapshot = await getDocs(productsQuery);
  return snapshot.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() } as Product));
};


/**
 * @description 여러 개의 하위 그룹 재고를 한 번의 작업으로 업데이트하는 함수
 * 이 함수는 대시보드에서 여러 품목의 재고를 일괄적으로 변경할 때 유용합니다.
 */
export const updateMultipleVariantGroupStocks = async (
  updates: {
    productId: string;
    roundId: string;
    variantGroupId: string;
    newStock: number;
  }[]
): Promise<void> => {
  const batch = writeBatch(db);

  // 업데이트가 필요한 모든 상품 문서를 한 번씩만 읽기 위해 Map을 사용합니다.
  const productsToUpdate = new Map<string, { productRef: DocumentReference<DocumentData>; productData: Product }>();

  // 먼저 필요한 모든 상품 데이터를 가져와 메모리에 로드합니다.
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
  
  // 메모리에 로드된 상품 데이터에 모든 변경사항을 적용합니다.
  for (const update of updates) {
    const productInfo = productsToUpdate.get(update.productId);
    if (!productInfo) continue;

    const { productData } = productInfo;

    const newSalesHistory = productData.salesHistory.map((round: SalesRound) => {
      if (round.roundId === update.roundId) {
        const newVariantGroups = round.variantGroups.map((vg: VariantGroup) => {
          if (vg.id === update.variantGroupId) {
            // totalPhysicalStock을 업데이트합니다.
            return { ...vg, totalPhysicalStock: update.newStock };
          }
          return vg;
        });
        return { ...round, variantGroups: newVariantGroups };
      }
      return round;
    });
    
    // 메모리에 있는 productData를 업데이트합니다.
    productData.salesHistory = newSalesHistory; 
  }

  // 최종적으로 변경된 모든 상품 데이터를 배치에 추가합니다.
  for (const { productRef, productData } of productsToUpdate.values()) {
    batch.update(productRef, { salesHistory: productData.salesHistory });
  }

  await batch.commit();
};


/**
 * @description 특정 판매 회차의 대기 명단에 사용자를 추가합니다.
 */
export const addWaitlistEntry = async (
  productId: string,
  roundId: string,
  userId: string,
  quantity: number, // ❗이곳에 쉼표(,)를 추가했습니다.
  variantGroupId: string,
  itemId: string
): Promise<void> => {
  const productRef = doc(db, 'products', productId);

  await runTransaction(db, async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists()) {
      throw new Error("상품을 찾을 수 없습니다.");
    }

    const productData = productDoc.data() as Product;
    const newSalesHistory = [...productData.salesHistory];
    const roundIndex = newSalesHistory.findIndex(r => r.roundId === roundId);

    if (roundIndex === -1) {
      throw new Error("판매 회차 정보를 찾을 수 없습니다.");
    }

    const round = newSalesHistory[roundIndex];

    const existingEntry = round.waitlist?.find(entry => entry.userId === userId && entry.itemId === itemId);
    if (existingEntry) {
      throw new Error("이미 대기를 신청한 상품입니다.");
    }
    
    const newWaitlistEntry: WaitlistEntry = {
      userId,
      quantity,
      timestamp: Timestamp.now(),
      variantGroupId,
      itemId,
    };
    
    round.waitlist = [...(round.waitlist || []), newWaitlistEntry];
    round.waitlistCount = (round.waitlistCount || 0) + quantity;

    newSalesHistory[roundIndex] = round;

    transaction.update(productRef, {
      salesHistory: newSalesHistory,
    });
  });
};

/**
 * @description 특정 판매 회차의 특정 품목 재고를 업데이트하는 함수
 */
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
        if (!productSnap.exists()) {
            throw new Error("상품을 찾을 수 없습니다.");
        }
        
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

/**
 * @description 상품의 최종 구매 가능 여부를 확인합니다.
 */
export const checkProductAvailability = async (productId: string, roundId: string, variantGroupId: string, itemId: string): Promise<boolean> => {
  const productDoc = await getProductById(productId);
  if (!productDoc) return false;

  const round = productDoc.salesHistory.find(r => r.roundId === roundId);
  if (!round) return false;

  const variantGroup = round.variantGroups.find((vg: VariantGroup) => vg.id === variantGroupId);
  if (!variantGroup) return false;
  
  const item = variantGroup.items.find((i: ProductItem) => i.id === itemId);
  if (!item) return false;

  const hasSufficientItemStock = item.stock === -1 || item.stock > 0;
  if (!hasSufficientItemStock) {
    return false;
  }

  const hasSufficientGroupStock = 
    variantGroup.totalPhysicalStock === null || 
    variantGroup.totalPhysicalStock === -1 || 
    variantGroup.totalPhysicalStock >= item.stockDeductionAmount;
  
  return hasSufficientGroupStock;
};

/**
 * @description 특정 카테고리 이름으로 상품 목록을 페이지 단위로 가져옵니다.
 */
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

    const countSnapshot = await getCountFromServer(baseQuery);
    const totalCount = countSnapshot.data().count;

    let paginatedQuery = query(baseQuery, orderBy('groupName'), limit(pageSize));
    if (lastVisible) {
        paginatedQuery = query(baseQuery, orderBy('groupName'), startAfter(lastVisible), limit(pageSize));
    }
    
    const documentSnapshots = await getDocs(paginatedQuery);
    const products = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1] || null;

    return { products, lastDoc, totalCount };
};

/**
 * @description 여러 상품들의 카테고리를 특정 카테고리로 일괄 변경합니다.
 */
export const moveProductsToCategory = async (productIds: string[], targetCategoryName: string | null): Promise<void> => {
  const batch = writeBatch(db);
  const newCategory = targetCategoryName === null ? '' : targetCategoryName;

  productIds.forEach(productId => {
    const productRef = doc(db, 'products', productId);
    batch.update(productRef, { category: newCategory });
  });

  await batch.commit();
};

/**
 * @description 여러 CartItem의 실시간 재고 정보를 한 번에 가져옵니다.
 */
export const getLiveStockForItems = async (
  items: CartItem[]
): Promise<Record<string, { itemStock: number; groupStock: number | null }>> => {
  if (items.length === 0) return {};

  const productIds = [...new Set(items.map(item => item.productId))];
  const productSnapshots = await Promise.all(
    productIds.map(id => getDoc(doc(db, 'products', id)))
  );

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
        groupStock: group.totalPhysicalStock,
      };
    }
  });

  return stockInfo;
};

/**
 * @description 특정 판매 회차의 'status'를 업데이트하는 함수
 */
export const updateSalesRoundStatus = async (
  productId: string,
  roundId: string,
  newStatus: SalesRound['status'] 
): Promise<void> => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);

  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("상품을 찾을 수 없습니다.");
    }

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

/**
 * @description 여러 판매 회차의 'status'를 한 번에 업데이트하는 함수
 * @param updates - { productId, roundId, newStatus } 객체 배열
 */
export const updateMultipleSalesRoundStatuses = async (
  updates: { productId: string; roundId: string; newStatus: SalesRoundStatus }[]
): Promise<void> => {
  const batch = writeBatch(db);
  const productsToUpdate = new Map<string, { productRef: DocumentReference<DocumentData>; productData: Product }>();

  // 필요한 모든 상품 문서를 한 번씩 읽어 메모리에 로드
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

  // 메모리에 로드된 상품 데이터에 모든 변경사항 적용
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
    
    // 메모리에 있는 productData를 업데이트
    productData.salesHistory = newSalesHistory; 
  }

  // 최종적으로 변경된 모든 상품 데이터를 배치에 추가
  for (const { productRef, productData } of productsToUpdate.values()) {
    batch.update(productRef, { salesHistory: productData.salesHistory });
  }

  await batch.commit();
};


/**
 * @description 입고일(arrivalDate)이 지정된 모든 판매 회차 목록을 가져옵니다.
 */
interface ArrivalInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  arrivalDate: Timestamp;
}

export const getProductArrivals = async (): Promise<ArrivalInfo[]> => {
  const products = await getProducts(false); // isArchived가 false인 상품만 가져옴
  const arrivals: ArrivalInfo[] = [];

  products.forEach(product => {
    product.salesHistory.forEach(round => {
      // arrivalDate가 존재하는 경우에만 추가
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

export interface WaitlistInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  userId: string;
  userName: string; // 사용자 이름 추가
  quantity: number;
  timestamp: Timestamp;
}

/**
 * @description 모든 판매 회차의 대기 명단 정보를 가져옵니다.
 */
export const getAllWaitlists = async (): Promise<WaitlistInfo[]> => {
  const products = await getProducts(false); // 보관처리되지 않은 상품만 조회
  const allWaitlists: WaitlistInfo[] = [];

  for (const product of products) {
    for (const round of product.salesHistory) {
      if (round.waitlist && round.waitlist.length > 0) {
        for (const entry of round.waitlist) {
          const userDoc = await getUserDocById(entry.userId);
          allWaitlists.push({
            productId: product.id,
            productName: product.groupName,
            roundId: round.roundId,
            roundName: round.roundName,
            userName: userDoc?.displayName || '알 수 없음', // 사용자 이름 추가
            ...entry
          });
        }
      }
    }
  }

  // 최신순으로 정렬
  allWaitlists.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
  
  return allWaitlists;
};

/**
 * @description 특정 판매 회차의 대기 명단 정보를 사용자 이름과 함께 가져옵니다.
 */
export const getWaitlistForRound = async (productId: string, roundId: string): Promise<WaitlistInfo[]> => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("상품 정보를 찾을 수 없습니다.");
  }

  const round = product.salesHistory.find(r => r.roundId === roundId);
  if (!round || !round.waitlist) {
    return [];
  }

  // 대기 시간순으로 정렬 (선착순)
  const sortedWaitlist = round.waitlist.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

  // 각 대기 항목에 사용자 이름을 추가
  const detailedWaitlist = await Promise.all(
    sortedWaitlist.map(async (entry) => {
      const userDoc = await getUserDocById(entry.userId);
      return {
        productId: product.id,
        productName: product.groupName,
        roundId: round.roundId,
        roundName: round.roundName,
        userName: userDoc?.displayName || '알 수 없음',
        ...entry,
      };
    })
  );

  return detailedWaitlist;
};

/**
 * @description 재고를 추가하고, 대기자 명단을 선착순으로 예약 전환 처리합니다.
 */
export const addStockAndProcessWaitlist = async (
  productId: string,
  roundId: string,
  variantGroupId: string, // 어떤 옵션의 재고를 추가할지 명시
  additionalStock: number
): Promise<{ convertedCount: number; failedCount: number; }> => {
  let availableStock = additionalStock;
  let convertedCount = 0;
  let failedCount = 0;

  const productRef = doc(db, 'products', productId);

  return runTransaction(db, async (transaction) => {
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists()) throw new Error("상품을 찾을 수 없습니다.");

    const product = productDoc.data() as Product;
    const salesHistory = [...product.salesHistory];
    const roundIndex = salesHistory.findIndex(r => r.roundId === roundId);
    if (roundIndex === -1) throw new Error("판매 회차를 찾을 수 없습니다.");
    
    const round = salesHistory[roundIndex];
    if (!round.waitlist || round.waitlist.length === 0) return { convertedCount: 0, failedCount: 0 };

    // 선착순으로 대기 목록 정렬
    const sortedWaitlist = round.waitlist.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    const remainingWaitlist: WaitlistEntry[] = [];
    
    // 재고 업데이트
    const groupIndex = round.variantGroups.findIndex(vg => vg.id === variantGroupId);
    if (groupIndex === -1) throw new Error("상품 옵션을 찾을 수 없습니다.");
    
    const originalStock = round.variantGroups[groupIndex].totalPhysicalStock;
    if (originalStock !== null && originalStock !== -1) {
        round.variantGroups[groupIndex].totalPhysicalStock = originalStock + additionalStock;
    }
    
    for (const entry of sortedWaitlist) {
      if (entry.quantity <= availableStock) {
        try {
          // 재고 차감 및 주문 생성 (orderService에 새 함수 필요)
          await submitOrderFromWaitlist(transaction, entry, product, round);
          availableStock -= entry.quantity;
          convertedCount++;
        } catch (e) {
            console.error(`주문 전환 실패 (사용자: ${entry.userId}):`, e);
            failedCount++;
            remainingWaitlist.push(entry); // 실패 시 다시 대기 목록에 포함
        }
      } else {
        remainingWaitlist.push(entry);
      }
    }
    
    // 대기 목록에서 성공적으로 전환된 사용자들 제거
    round.waitlist = remainingWaitlist;
    round.waitlistCount = remainingWaitlist.reduce((sum, entry) => sum + entry.quantity, 0);
    salesHistory[roundIndex] = round;
    
    transaction.update(productRef, { salesHistory });

    return { convertedCount, failedCount };
  });
};