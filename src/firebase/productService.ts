// src/firebase/productService.ts

import { db, storage } from './firebaseConfig';
import {
  collection, addDoc, query, doc, getDoc, getDocs, updateDoc,
  writeBatch,
  increment, arrayUnion, where, orderBy, Timestamp, runTransaction
} from 'firebase/firestore';
import type { DocumentData, Query, DocumentReference, WriteBatch } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { uploadImages } from './generalService';
import type { Product, SalesRound, SalesRoundStatus, VariantGroup, ProductItem, WaitlistEntry, Category } from '@/types';


// ... addProductWithFirstRound 부터 updateMultipleRoundStatuses 까지 기존 함수들은 그대로 둡니다 ...
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
      return deleteObject(imageRef);
    } catch (e) {
      console.warn(`이미지 삭제 실패 (URL: ${url}):`, e);
      return Promise.resolve(); 
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
 * @description 특정 판매 회차의 대기 명단에 사용자를 추가합니다.
 */
export const addWaitlistEntry = async (
  productId: string,
  roundId: string,
  userId: string,
  quantity: number
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

    const existingEntry = round.waitlist?.find(entry => entry.userId === userId);
    if (existingEntry) {
      throw new Error("이미 대기를 신청한 상품입니다.");
    }
    
    const newWaitlistEntry: WaitlistEntry = {
      userId,
      quantity,
      timestamp: Timestamp.now(),
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
 * @description 특정 판매 회차의 특정 하위 그룹 재고(totalPhysicalStock)를 업데이트하는 함수
 */
export const updateVariantGroupStock = async (
    productId: string,
    roundId: string,
    variantGroupId: string,
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
                        return { ...vg, totalPhysicalStock: newStock };
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
 * @description 여러 개의 하위 그룹 재고를 한 번의 작업으로 업데이트하는 함수
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


/**
 * @description 여러 판매 회차의 상태를 일괄적으로 업데이트합니다.
 */
export const updateMultipleRoundStatuses = async (
  updates: { productId: string; roundId: string; newStatus: SalesRoundStatus }[]
) => {
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

    const newSalesHistory = productData.salesHistory.map(round => {
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


/**
 * @description 입고일(arrivalDate)이 지정된 모든 판매 회차 목록을 가져와 달력에 표시하기 좋은 형태로 반환합니다.
 */
interface ArrivalInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  arrivalDate: Timestamp;
}

export const getProductArrivals = async (): Promise<ArrivalInfo[]> => {
  const products = await getProducts(false);

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

// ✅ [신규 추가] 특정 카테고리에 속한 상품 목록을 가져오는 함수
/**
 * @description 특정 카테고리 이름으로 상품 목록을 조회합니다.
 * @param categoryName - 조회할 카테고리 이름. 'null' 전달 시 분류 없는 상품 조회.
 */
export const getProductsByCategory = async (categoryName: string | null): Promise<Product[]> => {
  let q: Query;
  const productsRef = collection(db, 'products');

  if (categoryName === null) {
    // 카테고리 필드가 없거나 빈 문자열인 경우 (분류 없는 상품)
    q = query(productsRef, where('category', 'in', ['', null]), where('isArchived', '==', false));
  } else {
    // 특정 카테고리 이름으로 조회
    q = query(productsRef, where('category', '==', categoryName), where('isArchived', '==', false));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
};


// ✅ [신규 추가] 여러 상품의 카테고리를 한 번에 업데이트하는 함수
/**
 * @description 여러 상품들의 카테고리를 특정 카테고리로 일괄 변경합니다.
 * @param productIds - 카테고리를 변경할 상품 ID 배열
 * @param targetCategoryName - 새로 지정할 카테고리 이름
 */
export const moveProductsToCategory = async (productIds: string[], targetCategoryName: string): Promise<void> => {
  const batch = writeBatch(db);

  productIds.forEach(productId => {
    const productRef = doc(db, 'products', productId);
    // 하위 분류는 사용하지 않으므로 빈 문자열로 설정
    batch.update(productRef, { category: targetCategoryName, subCategory: '' });
  });

  await batch.commit();
};