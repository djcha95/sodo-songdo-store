// src/firebase.ts

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  writeBatch,
  increment,
  serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import type { Product, Banner, Order, TodayStockItem, TodayOrderItem, Category, OrderItem, StoreInfo } from './types';
import { v4 as uuidv4 } from 'uuid';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Helper: Image Upload
const uploadImages = async (files: File[], path: string): Promise<string[]> => {
  const uploadPromises = files.map(file => {
    const storageRef = ref(storage, `${path}/${uuidv4()}-${file.name}`);
    return uploadBytes(storageRef, file).then(snapshot => getDownloadURL(snapshot.ref));
  });
  return Promise.all(uploadPromises);
};

// --- Product Functions ---
export const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'imageUrls'>, imageFiles: File[]): Promise<string> => {
  const imageUrls = await uploadImages(imageFiles, 'products');
  const docRef = await addDoc(collection(db, 'products'), { ...productData, imageUrls, createdAt: serverTimestamp() });
  return docRef.id;
};

export const getProductById = async (productId: string): Promise<Product | null> => {
    const docRef = doc(db, 'products', productId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null;
};

export const updateProduct = async (productId: string, productData: Partial<Product>, newImageFiles?: File[], existingImageUrls?: string[]) => {
    let finalImageUrls = existingImageUrls || [];
    if (newImageFiles && newImageFiles.length > 0) {
        const newUrls = await uploadImages(newImageFiles, 'products');
        finalImageUrls = [...finalImageUrls, ...newUrls];
    }
    await updateDoc(doc(db, 'products', productId), { ...productData, imageUrls: finalImageUrls });
};

export const getProductArrivals = async (): Promise<Product[]> => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const q = query(collection(db, "products"), where("arrivalDate", ">=", todayStart));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
};

export const addEncoreStock = async (productId: string, additionalStock: number) => {
  if (additionalStock <= 0) {
    throw new Error("추가할 재고는 0보다 커야 합니다.");
  }
  const productRef = doc(db, 'products', productId);

  await updateDoc(productRef, {
    stock: increment(additionalStock),
    reservationStock: increment(additionalStock),
    encoreCount: increment(1),
    status: 'selling',
    isPublished: true,
  });
};

export const updateProductOnsiteSaleStatus = async (productId: string, isAvailable: boolean) => {
  const productRef = doc(db, 'products', productId);
  await updateDoc(productRef, { isAvailableForOnsiteSale: isAvailable });
};

// --- Product Batch (Bulk) Functions ---
export const updateProductsStatus = async (productIds: string[], isPublished: boolean) => {
  const batch = writeBatch(db);
  const newStatus = isPublished ? 'selling' : 'draft';

  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.update(productRef, { isPublished, status: newStatus });
  });

  await batch.commit();
};

export const deleteProducts = async (productIds: string[]) => {
  const batch = writeBatch(db);

  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.delete(productRef);
  });

  await batch.commit();
};


// --- Product Count Function ---
export const getProductsCount = async (category: string, storageType: string): Promise<number> => {
  const productsCollection = collection(db, 'products');
  const queryConstraints = [];

  if (category !== 'all') {
    queryConstraints.push(where('category', '==', category));
  }
  if (storageType !== 'all') {
    queryConstraints.push(where('storageType', '==', storageType));
  }

  // 검색 쿼리는 클라이언트에서 처리하므로 여기서는 제외
  const countQuery = query(productsCollection, ...queryConstraints);
  const snapshot = await getCountFromServer(countQuery);
  
  return snapshot.data().count;
};


// --- Banner Functions ---
export const addBanner = async (bannerData: Omit<Banner, 'id' | 'imageUrl'> & { order: number; createdAt: Timestamp }, imageFile: File) => {
    const imageUrl = await uploadImages([imageFile], 'banners').then(urls => urls[0]);
    await addDoc(collection(db, 'banners'), { ...bannerData, imageUrl });
};

export const updateBanner = async (id: string, data: Partial<Omit<Banner, 'id' | 'imageUrl'>>, imageFile?: File) => {
    const bannerRef = doc(db, 'banners', id);
    const bannerSnap = await getDoc(bannerRef);
    if (!bannerSnap.exists()) throw new Error("배너를 찾을 수 없습니다.");
    let bannerDataToUpdate: Partial<Banner> = { ...data };

    if (imageFile) {
        if (bannerSnap.data().imageUrl) {
          const oldImageUrl = bannerSnap.data().imageUrl;
          try {
            const oldImageRef = ref(storage, oldImageUrl);
            await deleteObject(oldImageRef);
          } catch (e) {
            console.warn("이전 배너 이미지 삭제 실패:", e);
          }
        }
        bannerDataToUpdate.imageUrl = await uploadImages([imageFile], 'banners').then(urls => urls[0]);
    }
    await updateDoc(bannerRef, bannerDataToUpdate);
};

export const deleteBanner = async (id: string) => {
    const bannerRef = doc(db, 'banners', id);
    const bannerSnap = await getDoc(bannerRef);
    if (bannerSnap.exists() && bannerSnap.data().imageUrl) {
        await deleteObject(ref(storage, bannerSnap.data().imageUrl)).catch(e => console.warn(e));
    }
    await deleteDoc(bannerRef);
};

export const getAllBanners = async (): Promise<Banner[]> => {
    const q = query(collection(db, 'banners'), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
};

export const getActiveBanners = async (): Promise<Banner[]> => {
    const q = query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
};

export const updateBannerOrderBatch = async (updates: { id: string; order: number }[]) => {
  const batch = writeBatch(db);
  updates.forEach(update => {
    const bannerRef = doc(db, 'banners', update.id);
    batch.update(bannerRef, { order: update.order });
  });
  await batch.commit();
};


// --- Category Functions ---
export const getCategories = async (): Promise<Category[]> => {
    const q = query(collection(db, 'categories'), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
};

export const addCategory = async (categoryData: Omit<Category, 'id'>) => {
    await addDoc(collection(db, 'categories'), categoryData);
};

export const updateCategory = async (categoryId: string, categoryData: Partial<Category>) => {
    await updateDoc(doc(db, 'categories', categoryId), categoryData);
};

export const deleteCategory = async (categoryId: string) => {
    await deleteDoc(doc(db, 'categories', categoryId));
};

// --- Order Functions ---
export const createOrder = async (orderData: Omit<Order, 'id' | 'orderDate'>) => {
    const batch = writeBatch(db);
    const orderRef = doc(collection(db, 'orders'));
    batch.set(orderRef, { ...orderData, id: orderRef.id, orderDate: serverTimestamp() });

    for (const item of orderData.items) {
        const productRef = doc(db, 'products', item.id);
        batch.update(productRef, { stock: increment(-item.quantity) });
    }
    
    await batch.commit();
    return orderRef.id;
};

export const searchOrdersByPhoneNumber = async (phoneSuffix: string): Promise<Order[]> => {
    const q = query(collection(db, 'orders'), where('customerPhoneLast4', '==', phoneSuffix)); 
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

export const updateOrderStatus = async (orderIds: string[], status: Order['status']) => {
    const batch = writeBatch(db);
    for (const id of orderIds) {
        const orderRef = doc(db, 'orders', id);
        batch.update(orderRef, { status });
        if (status === 'cancelled') {
            const orderSnap = await getDoc(orderRef);
            if (orderSnap.exists()) {
                const orderData = orderSnap.data() as Order;
                for (const item of orderData.items) {
                    const productRef = doc(db, 'products', item.id);
                    batch.update(productRef, { stock: increment(item.quantity) });
                }
                if (orderData.userId) {
                    const userRef = doc(db, 'users', orderData.userId);
                    batch.update(userRef, { noShowCount: increment(1) });
                }
            }
        }
    }
    await batch.commit();
};

export const getUserOrders = async (userId: string): Promise<Order[]> => {
    const q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('orderDate', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

// --- Dashboard & Modal Functions ---
export async function getDailyDashboardData(): Promise<{ todayStock: TodayStockItem[], todayPrepaidOrders: TodayOrderItem[] }> {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const stockQuery = query(collection(db, 'products'), where('arrivalDate', '>=', todayStart), where('arrivalDate', '<=', todayEnd));
    const stockSnapshot = await getDocs(stockQuery);
    const todayStock: TodayStockItem[] = stockSnapshot.docs.map(doc => {
        const product = doc.data() as Product;
        return { id: doc.id, name: product.name, quantity: product.stock ?? 0 };
    });

    const ordersQuery = query(
        collection(db, 'orders'),
        where('pickupDate', '>=', todayStart),
        where('pickupDate', '<=', todayEnd),
        where('status', '==', 'paid')
    );
    const ordersSnapshot = await getDocs(ordersQuery);
    const todayPrepaidOrders: TodayOrderItem[] = [];
    ordersSnapshot.docs.forEach(doc => {
        const order = doc.data() as Order;
        (order.items || []).forEach((item: OrderItem) => {
            todayPrepaidOrders.push({
                id: order.id,
                customerName: order.customerName,
                productName: item.name,
                quantity: item.quantity,
                status: order.status,
            });
        });
    });
    return { todayStock, todayPrepaidOrders };
}

// --- Store Info Functions ---
export const getStoreInfo = async (): Promise<StoreInfo | null> => {
    const docRef = doc(db, 'storeInfo', 'main');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as StoreInfo : null;
};