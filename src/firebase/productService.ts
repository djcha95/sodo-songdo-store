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

  // 여러 업데이트가 동일한 상품을 대상으로 할 수 있으므로, 먼저 모든 상품 문서를 한 번씩만 읽습니다.
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
            return { ...vg, totalPhysicalStock: update.newStock };
          }
          return vg;
        });
        return { ...round, variantGroups: newVariantGroups };
      }
      return round;
    });
    
    // 메모리 내의 데이터를 업데이트하여 동일 상품에 대한 후속 업데이트가 반영되도록 합니다.
    productData.salesHistory = newSalesHistory; 
  }

  // ✅ [수정] productId를 사용하지 않으므로 .values()를 사용해 더 간결하게 만듭니다.
  // 최종적으로 변경된 모든 상품 데이터를 배치에 추가합니다.
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

  // 1. 업데이트가 필요한 모든 고유한 상품 문서를 한 번씩만 읽어옵니다.
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
  
  // 2. 메모리에 로드된 상품 데이터에 모든 상태 변경을 적용합니다.
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

    // 메모리 내 데이터를 업데이트하여 동일 상품에 대한 후속 업데이트가 반영되도록 합니다.
    productData.salesHistory = newSalesHistory;
  }

  // ✅ [수정] productId를 사용하지 않으므로 .values()를 사용해 더 간결하게 만듭니다.
  // 3. 최종적으로 변경된 모든 상품 데이터를 배치에 추가하여 한 번에 씁니다.
  for (const { productRef, productData } of productsToUpdate.values()) {
    batch.update(productRef, { salesHistory: productData.salesHistory });
  }

  await batch.commit();
};

/**
 * @description 각 카테고리 및 하위 카테고리에 속한 상품의 개수를 정확하게 계산합니다.
 * @returns { mainCategoryCounts, subCategoryCounts } 객체
 */
export const getProductsCountByCategory = async (): Promise<{
  mainCategoryCounts: Record<string, number>;
  subCategoryCounts: Record<string, number>;
}> => {
  // 1. 모든 카테고리와 모든 상품 정보를 동시에 가져옵니다.
  const categoriesQuery = query(collection(db, 'categories'));
  const productsQuery = query(collection(db, 'products'), where('isArchived', '==', false));
  
  const [categoriesSnapshot, productsSnapshot] = await Promise.all([
    getDocs(categoriesQuery),
    getDocs(productsQuery)
  ]);

  // 2. 카테고리 이름과 ID를 매핑하는 '지도'를 만듭니다.
  const categoryNameToIdMap = new Map<string, string>();
  categoriesSnapshot.docs.forEach(doc => {
    const category = doc.data() as Category;
    categoryNameToIdMap.set(category.name, doc.id);
  });

  const mainCategoryCounts: Record<string, number> = {};
  const subCategoryCounts: Record<string, number> = {};

  // 3. 모든 상품을 순회하며 개수를 집계합니다.
  productsSnapshot.docs.forEach(doc => {
    const product = doc.data() as Product;
    
    // 4. 상품의 카테고리 '이름'으로 카테고리 'ID'를 찾습니다.
    if (product.category) {
      const categoryId = categoryNameToIdMap.get(product.category);
      if (categoryId) {
        // ID를 키로 사용하여 개수를 올립니다.
        mainCategoryCounts[categoryId] = (mainCategoryCounts[categoryId] || 0) + 1;
      }
    }
    
    // 5. 하위 카테고리도 동일하게 처리합니다.
    if (product.category && product.subCategory) {
      const categoryId = categoryNameToIdMap.get(product.category);
      if (categoryId) {
        // '대분류ID_하위분류이름' 형식의 고유 키를 사용합니다.
        const subCategoryKey = `${categoryId}_${product.subCategory}`;
        subCategoryCounts[subCategoryKey] = (subCategoryCounts[subCategoryKey] || 0) + 1;
      }
    }
  });

  return { mainCategoryCounts, subCategoryCounts };
};