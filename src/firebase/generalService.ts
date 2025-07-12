// src/firebase/generalService.ts

import { db, storage } from './index';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData, CollectionReference, Query, DocumentReference } from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import type { 
    Product, Banner, StoreInfo, Order, OrderItem, VariantGroup, ProductItem, Category,
    TodayStockItem, TodayOrderItem, TodayPickupItem, TodayOngoingProductSummary
} from '@/types'; 

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
    // ✅ [수정] Firestore에서 정렬 규칙을 제거하고 모든 문서를 가져옵니다.
    const q: Query<DocumentData> = query(collection(db, 'categories'));
    
    const snapshot = await getDocs(q);
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    
    // ✅ [수정] 클라이언트 측에서 order 필드가 없는 경우까지 고려하여 안전하게 정렬합니다.
    return categories.sort((a, b) => {
        const orderA = a.order ?? Infinity; // order 필드가 없으면 맨 뒤로
        const orderB = b.order ?? Infinity;

        if (orderA !== orderB) {
            return orderA - orderB;
        }
        // order 값이 같거나 둘 다 없을 경우 이름순으로 2차 정렬
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


// --- Dashboard & Modal Functions ---
export async function getDailyDashboardData(): Promise<{
  todayStock: TodayStockItem[];
  todayPrepaidOrders: TodayOrderItem[];
  todayPickupDeadlineProducts: TodayPickupItem[];
}> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  const productsQuery: Query<DocumentData> = query(collection(db, 'products'), where('isArchived', '==', false));
  
  const ordersQuery: Query<DocumentData> = query(
    collection(db, 'orders'),
    where('pickupDate', '>=', todayStart),
    where('pickupDate', '<=', todayEnd),
    where('status', '==', 'paid')
  );

  const [productsSnapshot, ordersSnapshot] = await Promise.all([
    getDocs(productsQuery),
    getDocs(ordersQuery),
  ]);

  const todayStock: TodayStockItem[] = [];
  const todayPickupDeadlineProducts: TodayPickupItem[] = [];
  
  productsSnapshot.docs.forEach((docSnap: DocumentData) => {
    const product = docSnap.data() as Product;
    const activeRound = product.salesHistory
      .filter(r => r.status === 'selling' || r.status === 'scheduled')
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
      
    if (activeRound) {
        activeRound.variantGroups.forEach((vg: VariantGroup) => {
            if (vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1) {
                todayStock.push({
                    id: product.id,
                    variantGroupId: vg.id || '',
                    name: `${product.groupName} - ${vg.groupName}`,
                    quantity: vg.totalPhysicalStock,
                    unitType: vg.stockUnitType,
                });
            }
        });

        const pickupDeadline = activeRound.pickupDeadlineDate?.toDate();
        if (pickupDeadline && pickupDeadline >= todayStart && pickupDeadline <= todayEnd) {
            todayPickupDeadlineProducts.push({
                id: product.id,
                name: product.groupName,
                pickupDeadlineDate: activeRound.pickupDeadlineDate as Timestamp,
                optionsSummary: activeRound.variantGroups.flatMap((vg: VariantGroup) => 
                    vg.items.map((item: ProductItem) => ({
                        variantGroupName: vg.groupName,
                        unit: item.name,
                        currentStock: item.stock,
                    }))
                ),
            });
        }
    }
  });

  const todayPrepaidOrders: TodayOrderItem[] = [];
  ordersSnapshot.docs.forEach((docSnap: DocumentData) => {
    const order = docSnap.data() as Order;
    (order.items || []).forEach((item: OrderItem) => {
      todayPrepaidOrders.push({
        id: docSnap.id,
        customerName: order.customerInfo.name,
        productName: `${item.productName} - ${item.variantGroupName} - ${item.itemName}`, 
        quantity: item.quantity,
        status: order.status,
      });
    });
  });

  return { todayStock, todayPrepaidOrders, todayPickupDeadlineProducts };
}

export const getOngoingProductsSummary = async (): Promise<TodayOngoingProductSummary[]> => {
  const productsRef: CollectionReference<DocumentData> = collection(db, 'products');
  const q: Query<DocumentData> = query(productsRef, where('isArchived', '==', false), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  const summaries: TodayOngoingProductSummary[] = [];

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data() as Product;
    const activeRound = data.salesHistory.find(r => r.status === 'selling');

    if (activeRound) {
        summaries.push({
            id: docSnap.id,
            name: data.groupName || '이름 없음',
            deadlineDate: activeRound.deadlineDate,
            pickupDate: activeRound.pickupDate,
            variantGroupsSummary: activeRound.variantGroups.map((vg: VariantGroup) => ({
                variantGroupId: vg.id || '', 
                variantGroupName: vg.groupName,
                totalPhysicalStock: vg.totalPhysicalStock,
                stockUnitType: vg.stockUnitType,
                itemsSummary: (vg.items || []).map((item: ProductItem) => ({
                    itemId: item.id || '', 
                    itemName: item.name,
                    currentStock: item.stock,
                    stockDeductionAmount: item.stockDeductionAmount,
                })),
            })),
            totalReservedQuantity: 0, 
        });
    }
  });
  return summaries;
};