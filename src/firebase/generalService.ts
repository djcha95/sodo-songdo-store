// src/firebase/generalService.ts

// ✅ [수정] 순환 의존성 해결:
// './index' 대신 './firebaseConfig'에서 직접 db와 storage를 가져옵니다.
import { db, storage } from './firebaseConfig'; 
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
  getDocFromServer,
} from 'firebase/firestore';
// [수정] 사용하지 않는 Timestamp 타입을 import 목록에서 제거합니다.
import type { DocumentData, Query, DocumentReference } from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

// ✅ [수정] 타입 오류 해결:
// '@/shared/types'에 존재하지 않는 4개의 타입을 import 목록에서 제거합니다.
import type { 
    Banner, Category, Product, Order, OrderItem
    // StoreInfo, TodayStockItem, TodayOrderItem, TodayPickupItem 
} from '@/shared/types'; 

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
// ✅ [참고] 'StoreInfo' 타입이 없으므로, 'any'로 임시 처리합니다.
// 나중에 @/shared/types에 StoreInfo를 정의하고 타입을 'StoreInfo | null'로 변경하세요.
const STORE_INFO_DOC_ID = 'main'; // 매장 정보는 하나의 문서로 관리

export const getStoreInfo = async (): Promise<any | null> => {
    const docRef = doc(db, 'storeInfo', STORE_INFO_DOC_ID);
    const docSnap = await getDocFromServer(docRef);
    return docSnap.exists() ? docSnap.data() as any : null;
};

export const updateStoreInfo = async (storeData: any): Promise<void> => {
    const docRef = doc(db, 'storeInfo', STORE_INFO_DOC_ID);
    await setDoc(docRef, storeData, { merge: true });
};

// DailyDashboardModal 컴포넌트에서 사용할 데이터 조회 함수
// ✅ [참고] 관련 타입이 없으므로 'any'로 임시 처리합니다.
export const getDailyDashboardData = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Get all products
    const productsRef = collection(db, 'products');
    const productsQuery = query(productsRef, where('isArchived', '==', false));
    const productsSnapshot = await getDocs(productsQuery);

    const todayStock: any[] = []; // TodayStockItem[]
    const todayPickupDeadlineProducts: any[] = []; // TodayPickupItem[]

    productsSnapshot.forEach(docSnap => {
        const product = { id: docSnap.id, ...docSnap.data() } as Product;
        product.salesHistory?.forEach(round => {
            const arrivalDate = round.arrivalDate?.toDate();
            if (arrivalDate && arrivalDate >= today && arrivalDate < tomorrow) {
                round.variantGroups.forEach(vg => {
                    todayStock.push({
                        id: `${product.id}-${vg.id}`,
                        variantGroupId: vg.id,
                        name: `${product.groupName} - ${vg.groupName}`,
                        quantity: vg.totalPhysicalStock,
                        unitType: vg.stockUnitType
                    });
                });
            }

            const pickupDeadline = round.pickupDeadlineDate?.toDate();
            if (pickupDeadline && pickupDeadline >= today && pickupDeadline < tomorrow) {
                todayPickupDeadlineProducts.push({
                    id: product.id,
                    name: product.groupName,
                    pickupDeadlineDate: round.pickupDeadlineDate!,
                    optionsSummary: round.variantGroups.map(vg => ({
                        variantGroupName: vg.groupName,
                        unit: vg.stockUnitType,
                        currentStock: vg.items.reduce((sum, item) => sum + (item.stock === -1 ? 0 : item.stock), 0)
                    }))
                });
            }
        });
    });

    // 2. Get prepaid orders
    const ordersRef = collection(db, 'orders');
    const ordersQuery = query(ordersRef, where('status', '==', 'PREPAID'));
    const ordersSnapshot = await getDocs(ordersQuery);
    const todayPrepaidOrders: any[] = []; // TodayOrderItem[]
    ordersSnapshot.forEach(docSnap => {
        const order = docSnap.data() as Order;
        order.items.forEach((item: OrderItem) => {
            todayPrepaidOrders.push({
                id: `${order.id}-${item.itemId}`,
                customerName: order.customerInfo.name,
                productName: item.itemName,
                quantity: item.quantity,
                status: order.status,
            });
        });
    });

    return { todayStock, todayPrepaidOrders, todayPickupDeadlineProducts };
};