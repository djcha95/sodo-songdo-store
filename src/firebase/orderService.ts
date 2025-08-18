// src/firebase/orderService.ts

// ✅ [수정] Cloud Functions 사용을 위한 import 추가
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebaseConfig';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  deleteDoc,
  writeBatch,
  deleteField,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';
import type { FieldValue, DocumentData, OrderByDirection } from 'firebase/firestore';
import type { Order, OrderStatus, OrderItem } from '@/types';

/**
 * @description ✅ [수정] 주문 생성 시 클라이언트가 사용자 정보를 직접 수정하지 않도록 변경합니다.
 * 주문 생성에만 집중하고, 사용자 정보 업데이트(totalOrders 등)는 서버 트리거에 위임합니다.
 */
export const submitOrder = async (
  orderData: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>
): Promise<{ orderId?: string }> => {
  let newOrderId: string | undefined = undefined;

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', orderData.userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('주문 처리 중 사용자 정보를 찾을 수 없습니다.');
    }

    const newOrderRef = doc(collection(db, 'orders'));
    newOrderId = newOrderRef.id;
    const originalTotalPrice = orderData.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const newOrderData: Omit<Order, 'id'> = {
      ...orderData,
      status: 'RESERVED',
      createdAt: serverTimestamp(),
      orderNumber: `SODOMALL-${Date.now()}`,
      totalPrice: originalTotalPrice,
    };

    transaction.set(newOrderRef, newOrderData);
  });

  return { orderId: newOrderId };
};


/**
 * @description ✅ [수정] 사용자의 예약을 취소합니다.
 * 보안을 위해 Callable Cloud Function을 호출하며, '노쇼 처리' 여부를 함께 전달합니다.
 */
export const cancelOrder = async (
  order: Order,
  options: { treatAsNoShow: boolean } = { treatAsNoShow: false }
): Promise<void> => {
  try {
    const functions = getFunctions(getApp(), 'asia-northeast3');
    // ✅ [수정] 백엔드 폴더 구조 변경에 따라 함수 이름 수정
    const cancelOrderCallable = httpsCallable(functions, 'cancelOrder');
    
    // ✅ [수정] Cloud Function에 orderId와 함께 treatAsNoShow 플래그를 전달
    await cancelOrderCallable({ 
      orderId: order.id, 
      treatAsNoShow: options.treatAsNoShow 
    });
  
  } catch (error: any) {
    console.error("Callable function 'cancelOrder' failed:", error);
    if (error.code && error.message) {
      // Firebase HttpsError의 경우, 서버에서 보낸 메시지를 그대로 사용자에게 보여줍니다.
      const message = (error.details as any)?.message || error.message;
      throw new Error(message);
    }
    throw new Error('주문 취소 중 예상치 못한 오류가 발생했습니다.');
  }
};


/**
 * @description ✅ [수정] 여러 주문의 상태를 일괄적으로 변경하는, 단순화된 함수입니다.
 * 포인트 계산, 등급 산정, 알림 생성 등 모든 복잡한 로직을 제거하고
 * 오직 'status'와 '관련 timestamp'만 업데이트합니다.
 * 모든 후속 처리는 서버의 Cloud Function 트리거가 담당합니다.
 */
export const updateMultipleOrderStatuses = async (orderIds: string[], status: OrderStatus): Promise<void> => {
  if (orderIds.length === 0) return;

  const batch = writeBatch(db);
  
  // 상태에 따른 타임스탬프 필드를 결정합니다.
  let timestampField: string | null = null;
  if (status === 'PICKED_UP') timestampField = 'pickedUpAt';
  if (status === 'PREPAID') timestampField = 'prepaidAt';
  if (status === 'CANCELED') timestampField = 'canceledAt';

  orderIds.forEach(orderId => {
    const orderRef = doc(db, 'orders', orderId);
    const updateData: { status: OrderStatus, [key: string]: any } = { status };
    if (timestampField) {
      updateData[timestampField] = serverTimestamp();
    }
    // 상태와 타임스탬프만 업데이트하는 간단한 작업으로 변경
    batch.update(orderRef, updateData);
  });

  await batch.commit();
};

/**
 * @description ✅ [수정] 주문 분할 로직에서 포인트/등급/알림 관련 로직을 모두 제거합니다.
 * 💡 [개선 제안] 이 기능은 여러 문서를 다루는 복잡한 트랜잭션이므로,
 * 보안과 데이터 정합성을 위해 추후에 'Callable Cloud Function'으로 이전하는 것을 강력히 권장합니다.
 *
 * 이 함수는 이제 사용되지 않으므로, 더 이상 클라이언트에서 호출되어서는 안 됩니다.
 * 대신 `splitBundledOrder` callable 함수를 사용하세요.
 */
export const splitAndUpdateOrderStatus = async (
  originalOrderId: string,
  pickedUpQuantity: number,
  remainingStatus: OrderStatus
): Promise<void> => {
  if (pickedUpQuantity <= 0) {
    throw new Error('픽업 수량은 1 이상이어야 합니다.');
  }

  await runTransaction(db, async (transaction) => {
    const originalOrderRef = doc(db, 'orders', originalOrderId);
    const originalOrderDoc = await transaction.get(originalOrderRef);

    if (!originalOrderDoc.exists()) {
      throw new Error('분할할 원본 주문을 찾을 수 없습니다.');
    }

    const originalOrder = { id: originalOrderId, ...originalOrderDoc.data() } as Order;
    const originalItem = originalOrder.items[0];
    const originalQuantity = originalItem.quantity;
    const remainingQuantity = originalQuantity - pickedUpQuantity;

    if (remainingQuantity <= 0) {
      throw new Error('남는 수량이 없어 주문을 분할할 수 없습니다. 일반 상태 변경을 이용해주세요.');
    }

    // 1. 남는 수량에 대한 새 주문 생성
    const remainingItem: OrderItem = { ...originalItem, quantity: remainingQuantity };
    const remainingOrder: Omit<Order, 'id'> = {
      ...originalOrder,
      orderNumber: `${originalOrder.orderNumber}-REMAIN`,
      items: [remainingItem],
      totalPrice: remainingItem.unitPrice * remainingQuantity,
      status: remainingStatus,
      createdAt: serverTimestamp(),
      splitFrom: originalOrderId,
      notes: `[${originalOrder.orderNumber}]에서 분할된 ${remainingStatus} 주문`,
    };
    
    const newOrderRef = doc(collection(db, 'orders'));
    transaction.set(newOrderRef, remainingOrder);
    
    // 2. 픽업한 수량만큼 기존 주문 정보 수정
    const pickedUpItem: OrderItem = { ...originalItem, quantity: pickedUpQuantity };
    const pickedUpOrderUpdate = {
      items: [pickedUpItem],
      totalPrice: pickedUpItem.unitPrice * pickedUpQuantity,
      status: 'PICKED_UP' as OrderStatus,
      pickedUpAt: serverTimestamp(),
      notes: `[${newOrderRef.id}]로 ${remainingQuantity}개 분할 처리됨`,
    };
    
    transaction.update(originalOrderRef, pickedUpOrderUpdate);

    // 3. ❌ 포인트, 등급, 알림 관련 로직은 여기서 모두 제거! ❌
    // 서버의 onCreate, onUpdate 트리거가 새로 생성/수정된 주문들을 감지하고 모든 것을 처리합니다.
  });
};


// =================================================================
// ✅ [신규 추가] 주문 분할을 위한 Callable Function 호출
// =================================================================
export const splitBundledOrder = async (orderId: string): Promise<{ success: boolean; message: string }> => {
  if (!orderId) {
    throw new Error("주문 ID가 제공되지 않았습니다.");
  }

  try {
    const functions = getFunctions(getApp(), 'asia-northeast3');
    const splitOrderCallable = httpsCallable<{ orderId: string }, { success: boolean, message: string }>(functions, 'splitBundledOrder');
    
    const result = await splitOrderCallable({ orderId });
    
    return result.data;

  } catch (error: any) {
    console.error("Callable function 'splitBundledOrder' failed:", error);
    if (error.code && error.message) {
      // Firebase HttpsError의 경우, 서버에서 보낸 메시지를 그대로 사용자에게 보여줍니다.
      const message = (error.details as any)?.message || error.message;
      throw new Error(message);
    }
    throw new Error('주문 분할 중 예상치 못한 오류가 발생했습니다.');
  }
};


// =================================================================
// 아래의 읽기(Read) 및 기타 함수들은 수정할 필요가 없습니다.
// =================================================================

export const getUserOrders = async (userId: string): Promise<Order[]> => {
  if (!userId) return [];
  const q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

export const getUserOrdersPaginated = async (
  userId: string,
  pageSize: number,
  lastVisible: DocumentData | null
): Promise<{ orders: Order[], lastDoc: DocumentData | null }> => {
  if (!userId) return { orders: [], lastDoc: null };
  let q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(pageSize));
  if (lastVisible) {
    q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(pageSize));
  }
  const querySnapshot = await getDocs(q);
  const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  return { orders, lastDoc };
};

export const getUserOrdersByPickupDatePaginated = async (
  userId: string, pageSize: number, lastVisible: DocumentData | null,
  orderDirection: OrderByDirection = 'desc', startDate?: string,
): Promise<{ orders: Order[], lastDoc: DocumentData | null }> => {
  if (!userId) return { orders: [], lastDoc: null };
  const baseConditions: any[] = [where('userId', '==', userId)];
  if (startDate) { baseConditions.push(where('pickupDate', '>=', new Date(startDate))); }
  let q = query(collection(db, 'orders'), ...baseConditions, orderBy('pickupDate', orderDirection), limit(pageSize));
  if (lastVisible) {
    q = query(collection(db, 'orders'), ...baseConditions, orderBy('pickupDate', orderDirection), startAfter(lastVisible), limit(pageSize));
  }
  const querySnapshot = await getDocs(q);
  const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  return { orders, lastDoc };
};

export const getAllOrdersForAdmin = async (): Promise<Order[]> => {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

export const getOrdersByPhoneLast4 = async (phoneLast4: string): Promise<Order[]> => {
  if (!phoneLast4 || phoneLast4.length < 2) return [];
  const q = query(collection(db, 'orders'), where('customerInfo.phoneLast4', '==', phoneLast4), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  const updateData: { status: OrderStatus; pickedUpAt?: FieldValue } = { status };
  if (status === 'PICKED_UP') { updateData.pickedUpAt = serverTimestamp(); }
  await updateDoc(doc(db, 'orders', orderId), updateData);
};

export const updateOrderItemQuantity = async (orderId: string, itemId: string, newQuantity: number): Promise<void> => {
  if (newQuantity <= 0) { throw new Error("수량은 1 이상이어야 합니다."); }
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) { throw new Error("주문을 찾을 수 없습니다."); }
    const order = orderDoc.data() as Order;
    let itemFound = false;
    const newItems = order.items.map(item => {
      if (item.itemId === itemId) { itemFound = true; return { ...item, quantity: newQuantity }; }
      return item;
    });
    if (!itemFound) { throw new Error("주문에서 해당 품목을 찾을 수 없습니다."); }
    const newTotalPrice = newItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    transaction.update(orderRef, { items: newItems, totalPrice: newTotalPrice });
  });
};

export const revertOrderStatus = async (orderIds: string[], currentStatus: OrderStatus): Promise<void> => {
  const batch = writeBatch(db);
  orderIds.forEach(orderId => {
    const orderRef = doc(db, 'orders', orderId);
    const updateData: any = { status: 'RESERVED' };
    if (currentStatus === 'PICKED_UP') { updateData.pickedUpAt = deleteField(); } 
    else if (currentStatus === 'PREPAID') { updateData.prepaidAt = deleteField(); }
    batch.update(orderRef, updateData);
  });
  await batch.commit();
};

export const updateOrderNotes = async (orderId: string, notes: string): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { notes });
};

export const toggleOrderBookmark = async (orderId: string, isBookmarked: boolean): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { isBookmarked });
};

export const deleteOrder = async (orderId: string): Promise<void> => {
  const orderRef = doc(db, 'orders', orderId);
  await deleteDoc(orderRef);
};

export const deleteMultipleOrders = async (orderIds: string[]): Promise<void> => {
  const batch = writeBatch(db);
  orderIds.forEach(orderId => {
    const orderRef = doc(db, 'orders', orderId);
    batch.delete(orderRef);
  });
  await batch.commit();
}

export const searchOrdersUnified = async (searchTerm: string): Promise<Order[]> => {
  if (!searchTerm) return [];
  const isNumeric = /^\d+$/.test(searchTerm);
  const orderMap = new Map<string, Order>();
  if (isNumeric) {
    const phoneOrders = await getOrdersByPhoneLast4(searchTerm);
    phoneOrders.forEach(order => orderMap.set(order.id, order));
  }
  const nameQuery = query(
    collection(db, 'orders'),
    where('customerInfo.name', '>=', searchTerm),
    where('customerInfo.name', '<=', searchTerm + '\uf8ff'),
    limit(50)
  );
  const nameSnapshot = await getDocs(nameQuery);
  nameSnapshot.forEach(doc => {
    if (!orderMap.has(doc.id)) {
      orderMap.set(doc.id, { id: doc.id, ...doc.data() } as Order);
    }
  });
  const combinedResults = Array.from(orderMap.values());
  return combinedResults.sort((a, b) => {
    const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
    const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
    return timeB - timeA;
  });
};

export const getReservedQuantitiesMap = async (): Promise<Map<string, number>> => {
  const quantitiesMap = new Map<string, number>();
  const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']));
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach((doc) => {
    const order = doc.data() as Order;
    (order.items || []).forEach((item: OrderItem) => {
      const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
      quantitiesMap.set(key, (quantitiesMap.get(key) || 0) + item.quantity);
    });
  });
  return quantitiesMap;
};