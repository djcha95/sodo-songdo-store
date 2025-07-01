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
  writeBatch,
  increment,
  serverTimestamp,
  getCountFromServer,
  arrayUnion,
  arrayRemove, // [추가] 배열에서 요소 제거
  setDoc, // [추가] 문서 생성/업데이트
} from 'firebase/firestore';
// [수정] 해당 파일에서 직접 사용되지 않는 Timestamp 타입 임포트를 제거합니다.
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import type { Product, Banner, Order, TodayStockItem, TodayOrderItem, Category, OrderItem, StoreInfo, UserDocument } from './types';
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

// [수정] 앵콜 요청 시 상품 문서와 사용자 문서 모두 업데이트
export const updateEncoreRequest = async (productId: string, userId: string) => {
  const productRef = doc(db, 'products', productId);
  const userRef = doc(db, 'users', userId);
  
  const batch = writeBatch(db);

  // 상품 문서: encoreCount 증가 및 요청자 ID 추가
  batch.update(productRef, {
    encoreCount: increment(1),
    encoreRequesterIds: arrayUnion(userId),
  });

  // 사용자 문서: 요청한 상품 ID 추가 (영구 저장)
  batch.update(userRef, {
    encoreRequestedProductIds: arrayUnion(productId),
  });

  await batch.commit();
};

// [수정] 상품 상태가 'selling'으로 바뀔 때 encoreCount 초기화 및 요청자 목록 초기화
export const resetEncoreRequest = async (productId: string) => {
  const productRef = doc(db, 'products', productId);
  
  // 모든 사용자의 요청 기록에서 이 상품 ID 제거
  const usersQuery = query(collection(db, 'users'), where('encoreRequestedProductIds', 'array-contains', productId));
  const userDocs = await getDocs(usersQuery);
  
  const batch = writeBatch(db);
  userDocs.docs.forEach(userDoc => {
      const userRef = doc(db, 'users', userDoc.id);
      batch.update(userRef, {
          encoreRequestedProductIds: arrayRemove(productId),
      });
  });

  // 상품 문서의 encoreCount와 encoreRequesterIds 초기화
  batch.update(productRef, {
    encoreCount: 0,
    encoreRequesterIds: [],
  });
  
  await batch.commit();
};

// --- User Functions ---
// [추가] 사용자 문서가 있는지 확인하고 없으면 생성 (회원가입 시)
export const checkAndCreateUserDocument = async (uid: string, email: string | null, displayName: string | null, photoURL: string | null) => {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            uid,
            email,
            displayName,
            photoURL,
            isAdmin: false,
            createdAt: serverTimestamp(),
            encoreRequestedProductIds: [],
        } as UserDocument); // [수정] `createdAt` 필드에 대한 타입 캐스팅
    }
};

// [추가] Firestore에서 사용자 문서 데이터 불러오기
export const getUserDocument = async (uid: string): Promise<UserDocument | null> => {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data() as UserDocument : null;
};


// --- Product Batch (Bulk) Functions ---
export const updateProductsStatus = async (productIds: string[], isPublished: boolean) => {
  const batch = writeBatch(db);
  const newStatus = isPublished ? 'selling' : 'draft';

  productIds.forEach(id => {
    const productRef = doc(db, 'products', id);
    batch.update(productRef, { isPublished, status: newStatus });
    
    // [수정] 'selling'으로 변경될 때 앵콜 요청 기록 초기화 함수 호출
    if (newStatus === 'selling') {
      resetEncoreRequest(id); // 비동기 호출
    }
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

  const countQuery = query(productsCollection, ...queryConstraints);
  const snapshot = await getCountFromServer(countQuery);
  
  return snapshot.data().count;
};


// --- Banner Functions ---
export const addBanner = async (bannerData: Omit<Banner, 'id' | 'imageUrl' | 'createdAt'>, imageFile: File) => {
    const imageUrl = await uploadImages([imageFile], 'banners').then(urls => urls[0]);
    await addDoc(collection(db, 'banners'), { ...bannerData, imageUrl, createdAt: serverTimestamp() });
};

export const addBannerFromProduct = async (bannerData: Omit<Banner, 'id' | 'createdAt' | 'imageUrl'> & { imageUrl: string }) => {
    await addDoc(collection(db, 'banners'), { ...bannerData, createdAt: serverTimestamp() });
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