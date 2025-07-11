// src/firebase/generalService.ts

import { db, storage } from './index';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
// ❗ [수정] 사용되지 않는 CollectionReference 타입을 제거합니다.
import type { DocumentData, Query, DocumentReference } from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import type { Banner, StoreInfo, Category } from '@/types'; 

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

export const deleteCategory = async (categoryId: string) => {
    const categoryRef: DocumentReference<DocumentData> = doc(db, 'categories', categoryId);
    await deleteDoc(categoryRef);
};


// --- Banner Functions ---
export const getActiveBanners = async (): Promise<Banner[]> => {
    const q: Query<DocumentData> = query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
};

// --- Store Info Functions ---
export const getStoreInfo = async (): Promise<StoreInfo | null> => {
    const docRef = doc(db, 'storeInfo', 'main');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as StoreInfo : null;
};

export const updateStoreInfo = async (storeData: StoreInfo): Promise<void> => {
    const docRef = doc(db, 'storeInfo', 'main');
    await setDoc(docRef, storeData, { merge: true });
};