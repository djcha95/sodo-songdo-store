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
import type { Product, SalesRound, SalesRoundStatus, VariantGroup, ProductItem, CartItem, WaitlistInfo, PaginatedProductsResponse } from '@/types';
import { getUserDocById } from './userService';

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

export const searchProductsByName = async (name: string): Promise<Product[]> => {
  if (!name) {
    return [];
  }
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
    if (!productSnap.exists()) {
      throw new Error("상품을 찾을 수 없습니다.");
    }
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
    encoreRequestedProductIds: arrayUnion(productId),
  });
  await batch.commit();
};

export const getProductById = async (productId: string): Promise<Product | null> => {
    const docRef: DocumentReference<DocumentData> = doc(db, 'products', productId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null;
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
  const snapshot = await getDocs(productsQuery);
  const products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Product));
  const newLastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
  return {
    products,
    lastVisible: newLastVisible,
  };
};

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
  if (!hasSufficientItemStock) return false;
  const hasSufficientGroupStock = 
    variantGroup.totalPhysicalStock === null || 
    variantGroup.totalPhysicalStock === -1 || 
    variantGroup.totalPhysicalStock >= item.stockDeductionAmount;
  return hasSufficientGroupStock;
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

export const moveProductsToCategory = async (productIds: string[], targetCategoryName: string | null): Promise<void> => {
  const batch = writeBatch(db);
  const newCategory = targetCategoryName === null ? '' : targetCategoryName;
  productIds.forEach(productId => {
    const productRef = doc(db, 'products', productId);
    batch.update(productRef, { category: newCategory });
  });
  await batch.commit();
};

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

export const getAllProducts = async (archived: boolean = false): Promise<Product[]> => {
  const productsQuery: Query<DocumentData> = query(
    collection(db, 'products'),
    where('isArchived', '==', archived),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(productsQuery);
  return snapshot.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() } as Product));
};

interface ArrivalInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  arrivalDate: Timestamp;
}

export const getProductArrivals = async (): Promise<ArrivalInfo[]> => {
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

export const getUserWaitlist = async (userId: string): Promise<WaitlistInfo[]> => {
  if (!userId) return [];
  const allProductsSnapshot = await getDocs(query(collection(db, 'products'), where('isArchived', '==', false)));
  const userWaitlist: WaitlistInfo[] = [];

  allProductsSnapshot.docs.forEach(doc => {
    const product = { id: doc.id, ...doc.data() } as Product;
    (product.salesHistory || []).forEach(round => {
      if (round.waitlist && round.waitlist.length > 0) {
        
        // ✅ [로직 수정] 새로운 3단계 정렬 규칙 적용
        const sortedWaitlist = [...round.waitlist].sort((a, b) => {
          // 1순위: isPrioritized가 true인 항목이 무조건 앞으로 온다.
          if (a.isPrioritized && !b.isPrioritized) return -1;
          if (!a.isPrioritized && b.isPrioritized) return 1;

          // 2순위: isPrioritized가 둘 다 true이면, prioritizedAt이 오래된 순서(선착순)
          if (a.isPrioritized && b.isPrioritized) {
            const timeA = a.prioritizedAt?.toMillis() || 0;
            const timeB = b.prioritizedAt?.toMillis() || 0;
            return timeA - timeB;
          }

          // 3순위: isPrioritized가 둘 다 false이면, 기존처럼 timestamp(대기 시작)가 오래된 순서
          return a.timestamp.toMillis() - b.timestamp.toMillis();
        });

        // 정렬된 목록을 순회하며 현재 사용자의 항목을 찾고, 순번을 부여
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

export const getWaitlistForRound = async (productId: string, roundId: string): Promise<(WaitlistInfo & {userName: string})[]> => {
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

export const getProductsByIds = async (productIds: string[]): Promise<Product[]> => {
  if (productIds.length === 0) {
    return [];
  }
  // Firestore 'in' 쿼리는 최대 30개의 값을 지원합니다. (v9 SDK에서는 10개에서 30개로 늘어남)
  // 안전하게 30개 단위로 나누어 처리합니다.
  const productChunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += 30) {
    productChunks.push(productIds.slice(i, i + 30));
  }

  const productPromises = productChunks.map(chunk => {
    const productsQuery = query(collection(db, 'products'), where('__name__', 'in', chunk));
    return getDocs(productsQuery);
  });

  const querySnapshots = await Promise.all(productPromises);
  const products: Product[] = [];
  querySnapshots.forEach(snapshot => {
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() } as Product);
    });
  });

  return products;
};

// src/firebase/productService.ts 파일에 이 함수를 추가하세요.
// 다른 import 구문들과 함께 toast도 import 해주세요.
import toast from 'react-hot-toast';

export const deleteOldProducts = async (
  collectionPath = 'products',
  timestampField = 'createdAt',
) => {
  // 기준 시간 설정 (한국 시각 2025년 8월 10일 0시 0분)
  const cutoffDate = new Date('2025-08-10T00:00:00+09:00');
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  const promise = new Promise(async (resolve, reject) => {
    try {
      const q = query(
        collection(db, collectionPath),
        where(timestampField, '<', cutoffTimestamp),
      );

      const querySnapshot = await getDocs(q);
      const documentsToDelete: DocumentData[] = [];
      querySnapshot.forEach((doc) => documentsToDelete.push(doc));

      if (documentsToDelete.length === 0) {
        return resolve('삭제할 오래된 상품 데이터가 없습니다.');
      }

      const batchSize = 500;
      for (let i = 0; i < documentsToDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = documentsToDelete.slice(i, i + batchSize);

        chunk.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();
      }

      resolve(
        `총 ${documentsToDelete.length}개의 오래된 상품 데이터를 삭제했습니다.`,
      );
    } catch (error) {
      console.error('오래된 상품 정보 삭제 중 오류 발생:', error);
      reject(error);
    }
  });

  toast.promise(promise, {
    loading: '오래된 상품 데이터를 삭제하는 중입니다...',
    success: (message) => `${message}`,
    error: '삭제 작업 중 오류가 발생했습니다.',
  });
};