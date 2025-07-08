// src/firebase/productService.ts

import { db, storage } from './firebaseConfig';
import {
  collection, addDoc, query, doc, getDoc, getDocs, updateDoc,
  writeBatch, increment, arrayUnion, arrayRemove,
   getCountFromServer, where, orderBy, Timestamp
} from 'firebase/firestore';
import type { DocumentData, CollectionReference, Query, DocumentReference, WriteBatch, QueryConstraint } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { uploadImages } from './generalService';
import type { Product, SalesRound, VariantGroup, ProductItem } from '@/types';

/**
 * @description 대표 상품을 추가하고 첫 번째 판매 회차를 등록하는 함수
 */
export const addProductWithFirstRound = async (
  productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls' | 'isArchived'>,
  firstRoundData: Omit<SalesRound, 'roundId' | 'createdAt'>,
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
  newRoundData: Omit<SalesRound, 'roundId' | 'createdAt'>
) => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  
  const roundToAdd = {
    ...newRoundData,
    roundId: `round-${Date.now()}`,
    createdAt: Timestamp.now()
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
) => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
  const productSnap = await getDoc(productRef);

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

  await updateDoc(productRef, {
    salesHistory: newSalesHistory,
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
) => {
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
 * @description 특정 판매 회차의 특정 품목 재고를 업데이트하는 함수
 */
export const updateItemStock = async (
    productId: string,
    roundId: string,
    variantGroupId: string,
    itemId: string,
    newStock: number
) => {
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
        throw new Error("상품을 찾을 수 없습니다.");
    }

    const product = productSnap.data() as Product;

    const newSalesHistory = product.salesHistory.map((round: SalesRound) => {
        if (round.roundId === roundId) {
            return {
                ...round,
                variantGroups: round.variantGroups.map((vg: VariantGroup) => {
                    if (vg.id === variantGroupId) {
                        return {
                            ...vg,
                            items: vg.items.map((item: ProductItem) => 
                                item.id === itemId ? { ...item, stock: newStock } : item
                            ),
                        };
                    }
                    return vg;
                }),
            };
        }
        return round;
    });

    await updateDoc(productRef, {
        salesHistory: newSalesHistory,
    });
};

/**
 * @description 앵콜 요청을 처리하는 함수
 */
export const updateEncoreRequest = async (productId: string, userId: string) => {
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
 * @description 상품의 앵콜 요청 데이터를 리셋하는 함수
 */
export const resetEncoreRequest = async (productId: string) => {
  const productRef: DocumentReference<DocumentData> = doc(db, 'products', productId); 
  
  const usersQuery: Query<DocumentData> = query(collection(db, 'users'), where('encoreRequestedProductIds', 'array-contains', productId));
  const userDocs = await getDocs(usersQuery);
  
  const batch: WriteBatch = writeBatch(db);
  userDocs.docs.forEach(userDoc => {
      const userRef: DocumentReference<DocumentData> = doc(db, 'users', userDoc.id);
      batch.update(userRef, {
          encoreRequestedProductIds: arrayRemove(productId),
      });
  });

  batch.update(productRef, {
    encoreCount: 0,
    encoreRequesterIds: [],
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
  // 👇 [수정된 부분] 쿼리 조건을 '==' 으로 명확하게 변경했습니다.
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
 * @description 상품 개수 가져오기
 */
export const getProductsCount = async (category: string, storageType: string): Promise<number> => { 
  const productsCollection: CollectionReference<DocumentData> = collection(db, 'products');
  const queryConstraints: QueryConstraint[] = [];

  if (category !== 'all') {
    queryConstraints.push(where('category', '==', category));
  }
  if (storageType !== 'all') {
    queryConstraints.push(where('storageType', '==', storageType));
  }
  
  // 👇 [수정된 부분] 여기도 동일한 원리를 적용하여 '==' 으로 변경합니다.
  queryConstraints.push(where('isArchived', '==', false));

  const countQuery = query(productsCollection, ...queryConstraints);
  const snapshot = await getCountFromServer(countQuery);
  
  return snapshot.data().count;
};

/**
 * @description 상품 도착일 정보 가져오기 (캘린더용)
 */
export const getProductArrivals = async (): Promise<{ title: string; date: Date }[]> => {
  const productsRef: CollectionReference<DocumentData> = collection(db, 'products');
  // 👇 [수정된 부분] 여기도 동일한 원리를 적용하여 '==' 으로 변경합니다.
  const q: Query<DocumentData> = query(productsRef, where('isArchived', '==', false));
  const snapshot = await getDocs(q);

  const arrivals = snapshot.docs.flatMap(docSnap => {
    const product = docSnap.data() as Product;
    // salesHistory가 없을 수도 있는 구형 데이터를 고려
    if (!product.salesHistory) return [];
    
    return product.salesHistory.map(round => ({
      title: `${product.groupName} (${round.roundName})`,
      date: round.pickupDate.toDate(),
    }));
  });

  return arrivals;
};

/**
 * @description 상품 재고 확인 함수 (신/구형 데이터 구조 모두 지원)
 */
export const checkProductAvailability = async (productId: string, roundId: string, variantGroupId: string, itemId: string): Promise<boolean> => {
  const productDoc = await getProductById(productId);
  if (!productDoc) return false;

  let round: SalesRound | undefined | null = null;

  if ('salesHistory' in productDoc && Array.isArray(productDoc.salesHistory)) {
      round = productDoc.salesHistory.find(r => r.roundId === roundId);
  } else {
      round = productDoc as any;
  }
  
  if (!round) return false;

  const variantGroup = round.variantGroups.find((vg: VariantGroup) => vg.id === variantGroupId);
  if (!variantGroup) return false;
  
  const item = variantGroup.items.find((i: ProductItem) => i.id === itemId);
  if (!item) return false;

  const hasItemStock = item.stock === -1 || item.stock > 0;
  
  const hasPhysicalStock = 
    variantGroup.totalPhysicalStock === null || 
    variantGroup.totalPhysicalStock === -1 || 
    (variantGroup.totalPhysicalStock > 0 && variantGroup.totalPhysicalStock >= item.stockDeductionAmount);
  
  return hasItemStock && hasPhysicalStock;
};