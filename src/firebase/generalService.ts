// src/firebase/generalService.ts

import { db, storage } from './index';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  writeBatch,
  addDoc,
  updateDoc,
  getDocFromServer, // ✅ [수정] getDocFromServer를 import 목록에 추가합니다.
} from 'firebase/firestore';
import type { DocumentData, Query, DocumentReference } from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import type { Banner, StoreInfo, Category, Product } from '@/types'; 

// --- Helper Functions ---
export const uploadImages = async (files: File[], path: string): Promise<string[]> => {
  const uploadPromises = files.map(file => {
    const storageRef: StorageReference = ref(storage, `${path}/${uuidv4()}-${file.name}`);
    return uploadBytes(storageRef, file).then(snapshot => getDownloadURL(snapshot.ref));
  });
  return Promise.all(uploadPromises);
};

// --- Category Functions ---
export const getCategories = async (): Promise<Category[]> => {
    const q: Query<DocumentData> = query(collection(db, 'categories'));
    const snapshot = await getDocs(q);
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    
    return categories.sort((a, b) => {
        const orderA = a.order ?? Infinity;
        const orderB = b.order ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
    });
};

export const addCategory = async (categoryData: Omit<Category, 'id'>) => {
    await addDoc(collection(db, 'categories'), categoryData);
};

export const updateCategory = async (categoryId: string, categoryData: Partial<Category>) => {
    const categoryRef: DocumentReference<DocumentData> = doc(db, 'categories', categoryId);
    await updateDoc(categoryRef, categoryData);
};

export const updateCategoriesOrder = async (categories: Category[]) => {
    const batch = writeBatch(db);
    categories.forEach((category, index) => {
        const categoryRef = doc(db, 'categories', category.id);
        batch.update(categoryRef, { order: index });
    });
    await batch.commit();
};

export const deleteCategory = async (categoryId: string, categoryName: string) => {
    const batch = writeBatch(db);

    const categoryRef = doc(db, 'categories', categoryId);
    batch.delete(categoryRef);

    const productsToUpdateQuery = query(
        collection(db, "products"),
        where("category", "==", categoryName)
    );

    const productSnapshots = await getDocs(productsToUpdateQuery);
    productSnapshots.forEach((productDoc) => {
        const productRef = doc(db, 'products', productDoc.id);
        batch.update(productRef, { category: "" });
    });

    await batch.commit();
};

export const getProductsCountByCategory = async (): Promise<Record<string, number>> => {
  const productsQuery = query(collection(db, 'products'), where('isArchived', '==', false));
  const snapshot = await getDocs(productsQuery);
  
  const mainCategoryCounts: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const product = doc.data() as Product;
    const categoryName = product.category || '__UNASSIGNED__'; 
    mainCategoryCounts[categoryName] = (mainCategoryCounts[categoryName] || 0) + 1;
  });

  return mainCategoryCounts;
};


// --- Banner Functions ---
export const getActiveBanners = async (): Promise<Banner[]> => {
    const q: Query<DocumentData> = query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
};

// --- Store Info Functions ---
const STORE_INFO_DOC_ID = 'main'; // 매장 정보는 하나의 문서로 관리

export const getStoreInfo = async (): Promise<StoreInfo | null> => {
    const docRef = doc(db, 'storeInfo', STORE_INFO_DOC_ID);
    // ✅ [수정] getDoc을 getDocFromServer로 변경하여 캐시를 사용하지 않도록 합니다.
    const docSnap = await getDocFromServer(docRef);
    return docSnap.exists() ? docSnap.data() as StoreInfo : null;
};

export const updateStoreInfo = async (storeData: StoreInfo): Promise<void> => {
    const docRef = doc(db, 'storeInfo', STORE_INFO_DOC_ID);
    await setDoc(docRef, storeData, { merge: true });
};