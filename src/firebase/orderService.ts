// src/firebase/orderService.ts
import { getUserDocById } from './userService';
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
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';
import type { FieldValue, DocumentData, OrderByDirection } from 'firebase/firestore';
import type { Order, OrderStatus, OrderItem, Product, SalesRound, WaitlistEntry, UserDocument, PointLog } from '@/types';
import { applyPointChangeByStatus, POINT_POLICIES } from './pointService';
import { createNotification } from './notificationService';


const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  return null;
};

/**
 * @description 주문을 생성하고, 재고를 차감하는 트랜잭션.
 */
export const submitOrder = async (
  orderData: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>
): Promise<{
  reservedCount: number;
  orderId?: string
}> => {

  let reservedItemCount = 0;
  let newOrderId: string | undefined = undefined;

  await runTransaction(db, async (transaction) => {
    // ✅ [1순위 검증] '참여 제한' 등급은 모든 주문을 차단합니다.
    const userRef = doc(db, 'users', orderData.userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('주문 처리 중 사용자 정보를 찾을 수 없습니다.');
    }
    const userDoc = userSnap.data() as UserDocument;

    if (userDoc.loyaltyTier === '참여 제한') {
      throw new Error('반복적인 약속 불이행으로 인해 현재 공동구매 참여가 제한되었습니다.');
    }
    
    const itemsToReserve: OrderItem[] = [];
    const productUpdates = new Map<string, SalesRound[]>();
    const productRefs = [...new Set(orderData.items.map(item => item.productId))].map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    const productDataMap = new Map<string, Product>();
    for (const productSnap of productSnaps) {
      if (!productSnap.exists()) throw new Error(`주문 처리 중 상품을 찾을 수 없습니다 (ID: ${productSnap.id}).`);
      productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() } as Product);
    }
    for (const item of orderData.items) {
      const productData = productDataMap.get(item.productId);
      if (!productData) throw new Error(`상품 데이터를 처리할 수 없습니다: ${item.productName}`);
      const salesHistoryForUpdate = productUpdates.has(item.productId) 
          ? productUpdates.get(item.productId)!
          : JSON.parse(JSON.stringify(productData.salesHistory));
      const roundIndex = salesHistoryForUpdate.findIndex((r: SalesRound) => r.roundId === item.roundId);
      if (roundIndex === -1) throw new Error(`판매 회차 정보를 찾을 수 없습니다: ${item.productName}`);
      const round = salesHistoryForUpdate[roundIndex];

      // ✅ [2순위 검증] 상품별 참여 등급 제한을 확인합니다.
      const allowedTiers = round.allowedTiers || [];
      if (allowedTiers.length > 0) { // 참여 등급 제한이 있는 경우
          if (!userDoc.loyaltyTier || !allowedTiers.includes(userDoc.loyaltyTier)) {
              throw new Error(`'${item.productName}' 상품은 지정된 등급의 회원만 구매할 수 있습니다.`);
          }
      }

      const groupIndex = round.variantGroups.findIndex((vg: any) => vg.id === item.variantGroupId);
      if (groupIndex === -1) throw new Error(`옵션 그룹 정보를 찾을 수 없습니다: ${item.itemName}`);
      
      const variantGroup = round.variantGroups[groupIndex];

      const itemIndex = variantGroup.items.findIndex((i: any) => i.id === item.itemId);
      if (itemIndex === -1) throw new Error(`세부 옵션 정보를 찾을 수 없습니다: ${item.itemName}`);
      const productItem = variantGroup.items[itemIndex];
      let availableStock = Infinity;
      if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) availableStock = Math.min(availableStock, variantGroup.totalPhysicalStock);
      if (productItem.stock !== -1) availableStock = Math.min(availableStock, productItem.stock);

      // ✅ [삭제] 기존의 복잡했던 선주문 기간 검증 로직을 제거하고, 위의 통합된 'allowedTiers' 검증으로 대체합니다.

      if (availableStock >= item.quantity) {
        itemsToReserve.push({ ...item, stockDeductionAmount: productItem.stockDeductionAmount || 1, arrivalDate: round.arrivalDate ?? null, deadlineDate: round.deadlineDate, pickupDate: round.pickupDate, pickupDeadlineDate: round.pickupDeadlineDate ?? null });
        const deductionAmount = item.quantity * (productItem.stockDeductionAmount || 1);
        if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) variantGroup.totalPhysicalStock -= deductionAmount;
        if (productItem.stock !== -1) productItem.stock -= item.quantity;
        productUpdates.set(item.productId, salesHistoryForUpdate);
      } else {
        throw new Error(`죄송합니다. ${item.productName}(${item.itemName})의 재고가 부족합니다.`);
      }
    }

    if (itemsToReserve.length > 0) {
      const newOrderRef = doc(collection(db, 'orders'));
      newOrderId = newOrderRef.id;
      const originalTotalPrice = itemsToReserve.reduce((total, i) => total + (i.unitPrice * i.quantity), 0);
      
      const phoneLast4 = orderData.customerInfo.phone.slice(-4);
      const firstItem = orderData.items[0];
      const productForRound = productDataMap.get(firstItem.productId);
      const roundForOrder = productForRound?.salesHistory.find(r => r.roundId === firstItem.roundId);

      const newOrderData: Omit<Order, 'id'> = {
        userId: orderData.userId,
        customerInfo: { ...orderData.customerInfo, phoneLast4 },
        items: itemsToReserve,
        totalPrice: originalTotalPrice,
        orderNumber: `SODOMALL-${Date.now()}`,
        status: 'RESERVED',
        createdAt: serverTimestamp(),
        pickupDate: roundForOrder!.pickupDate,
        pickupDeadlineDate: roundForOrder!.pickupDeadlineDate ?? null,
        notes: orderData.notes ?? '',
        isBookmarked: orderData.isBookmarked ?? false,
        wasPrepaymentRequired: orderData.wasPrepaymentRequired ?? false,
      };
      
      transaction.set(newOrderRef, newOrderData);
      reservedItemCount = itemsToReserve.reduce((sum, i) => sum + i.quantity, 0);

      for (const [productId, updatedSalesHistory] of productUpdates.entries()) {
        const productRef = doc(db, 'products', productId);
        transaction.update(productRef, { salesHistory: updatedSalesHistory });
      }
    }
  });

  return { reservedCount: reservedItemCount, orderId: newOrderId };
};

/**
 * @description 사용자의 예약을 취소하고, 상품 재고를 복구하며, 신뢰도 점수를 조정하는 함수
 */
export const cancelOrder = async (order: Order): Promise<void> => {
  const orderRef = doc(db, 'orders', order.id);

  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) throw new Error("주문 정보를 찾을 수 없습니다.");
    const currentOrder = orderDoc.data() as Order;

    if (currentOrder.userId !== order.userId) throw new Error("본인의 주문만 취소할 수 있습니다.");
    if (currentOrder.status !== 'RESERVED' && currentOrder.status !== 'PREPAID') {
      throw new Error("예약 또는 결제 완료 상태의 주문만 취소할 수 있습니다.");
    }

    // --- 3단계: 모든 데이터 쓰기 ---

    // 1. 사용자 포인트 페널티 적용 (필요시)
    const now = new Date();
    const deadlineDate = safeToDate(currentOrder.items[0]?.deadlineDate);
    const pickupDate = safeToDate(currentOrder.pickupDate);
    let penaltyPolicy: { points: number; reason: string } | null = null;
    
    if (pickupDate && now.toDateString() === pickupDate.toDateString()) {
        penaltyPolicy = POINT_POLICIES.CANCEL_ON_PICKUP_DAY;
    } else if (deadlineDate && now > deadlineDate) { 
        penaltyPolicy = POINT_POLICIES.CANCEL_AFTER_DEADLINE;
    }

    if (penaltyPolicy) {
        const userRef = doc(db, 'users', currentOrder.userId);
        const userSnap = await transaction.get(userRef);
        if (userSnap.exists()) {
            const userDoc = userSnap.data() as UserDocument;
            const newPoints = (userDoc.points || 0) + penaltyPolicy.points;
            const pointHistoryUpdate: Omit<PointLog, 'id'> = { 
                amount: penaltyPolicy.points,
                reason: penaltyPolicy.reason,
                createdAt: serverTimestamp() as Timestamp,
                orderId: currentOrder.id,
            };
            transaction.update(userRef, {
                points: newPoints,
                pointHistory: arrayUnion(pointHistoryUpdate),
            });
        }
    }


    const productRefs = [...new Set(currentOrder.items.map(item => item.productId))].map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

    const productDataMap = new Map<string, Product>();
    for (const productSnap of productSnaps) {
      if (productSnap.exists()) {
        productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() } as Product);
      }
    }

    transaction.update(orderRef, { status: 'CANCELED', canceledAt: serverTimestamp() });

    for (const item of currentOrder.items) {
      const productData = productDataMap.get(item.productId);
      if (!productData) continue;

      const newSalesHistory = JSON.parse(JSON.stringify(productData.salesHistory));
      const roundIndex = newSalesHistory.findIndex((r: SalesRound) => r.roundId === item.roundId);
      if (roundIndex === -1) continue;
      const groupIndex = newSalesHistory[roundIndex].variantGroups.findIndex((vg: any) => vg.id === item.variantGroupId);
      if (groupIndex === -1) continue;
      const itemIndex = newSalesHistory[roundIndex].variantGroups[groupIndex].items.findIndex((i: any) => i.id === item.itemId);
      if (itemIndex === -1) continue;

      const variantGroup = newSalesHistory[roundIndex].variantGroups[groupIndex];
      const productItem = variantGroup.items[itemIndex];
      const stockDeductionAmount = item.stockDeductionAmount || 1;
      if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
        variantGroup.totalPhysicalStock += item.quantity * stockDeductionAmount;
      }
      if (productItem.stock !== -1) {
        productItem.stock += item.quantity;
      }

      const productRef = doc(db, 'products', item.productId);
      transaction.update(productRef, { salesHistory: newSalesHistory });
    }

    // 3. 주문 상태를 'CANCELED'로 변경
    transaction.update(orderRef, { status: 'CANCELED', canceledAt: serverTimestamp() });
  });
};


/**
 * @description 특정 사용자의 모든 주문 내역을 가져옵니다.
 */
export const getUserOrders = async (userId: string): Promise<Order[]> => {
  if (!userId) return [];
  const q = query(
    collection(db, 'orders'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

/**
 * @description [주문일순] 특정 사용자의 주문 내역을 페이지 단위로 가져옵니다.
 */
export const getUserOrdersPaginated = async (
  userId: string,
  pageSize: number,
  lastVisible: DocumentData | null
): Promise<{ orders: Order[], lastDoc: DocumentData | null }> => {
  if (!userId) return { orders: [], lastDoc: null };

  let q = query(
    collection(db, 'orders'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  if (lastVisible) {
    q = query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      startAfter(lastVisible),
      limit(pageSize)
    );
  }

  const querySnapshot = await getDocs(q);
  const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  
  return { orders, lastDoc };
};


/**
 * @description [픽업일순] 특정 사용자의 주문 내역을 페이지 단위로 가져옵니다.
 */
export const getUserOrdersByPickupDatePaginated = async (
  userId: string,
  pageSize: number,
  lastVisible: DocumentData | null,
  orderDirection: OrderByDirection = 'desc',
  startDate?: string,
): Promise<{ orders: Order[], lastDoc: DocumentData | null }> => {
    if (!userId) return { orders: [], lastDoc: null };

    const baseConditions: any[] = [
        where('userId', '==', userId),
        where('status', 'in', ['RESERVED', 'PREPAID', 'PICKED_UP', 'COMPLETED', 'NO_SHOW']),
    ];
    
    if (startDate) {
        baseConditions.push(where('pickupDate', '>=', new Date(startDate)));
    }

    let q = query(
        collection(db, 'orders'),
        ...baseConditions,
        orderBy('pickupDate', orderDirection),
        limit(pageSize)
    );

    if (lastVisible) {
        q = query(
            collection(db, 'orders'),
            ...baseConditions,
            orderBy('pickupDate', orderDirection),
            startAfter(lastVisible),
            limit(pageSize)
        );
    }

    const querySnapshot = await getDocs(q);
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
    
    return { orders, lastDoc };
};


/**
 * @description 관리자를 위해 모든 주문 내역을 가져옵니다.
 */
export const getAllOrdersForAdmin = async (): Promise<Order[]> => {
  const q = query(
    collection(db, 'orders'),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};


/**
 * @description [사용 중단 예정] 전화번호 뒷자리로 주문을 검색합니다. (클라이언트 필터링 방식)
 */
export const searchOrdersByPhoneNumber = async (phoneNumber: string): Promise<Order[]> => {
  if (!phoneNumber || phoneNumber.length < 4) return [];
  const querySnapshot = await getDocs(collection(db, 'orders'));
  const allOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

  return allOrders.filter(order =>
    order.customerInfo?.phone?.endsWith(phoneNumber)
  );
};

/**
 * @description [신규] 전화번호 뒷자리로 주문을 검색합니다. (인덱싱된 필드 사용)
 * @param phoneLast4 - 전화번호 뒷 4자리
 */
export const getOrdersByPhoneLast4 = async (phoneLast4: string): Promise<Order[]> => {
  if (!phoneLast4 || phoneLast4.length < 2) return [];

  const q = query(
    collection(db, 'orders'),
    where('customerInfo.phoneLast4', '==', phoneLast4),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
};

/**
 * @description 특정 주문의 상태를 업데이트하고, 픽업 시각을 기록합니다.
 */
export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  const updateData: { status: OrderStatus; pickedUpAt?: FieldValue } = { status };

  if (status === 'PICKED_UP') {
    updateData.pickedUpAt = serverTimestamp();
  }

  await updateDoc(doc(db, 'orders', orderId), updateData);
};

/**
 * @description 여러 주문의 상태를 일괄 변경하고, 신뢰도 포인트를 적용하며, 필요시 알림을 보냅니다.
 */
export const updateMultipleOrderStatuses = async (orderIds: string[], status: OrderStatus): Promise<void> => {
  
  const notificationsToSend: { userId: string; message: string; link: string }[] = [];

  await runTransaction(db, async (transaction) => {
    for (const orderId of orderIds) {
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) continue;

      const order = { id: orderId, ...orderDoc.data() } as Order;
      
      await applyPointChangeByStatus(transaction, order.userId, order, status);
      
      const updateData: { status: OrderStatus; pickedUpAt?: FieldValue; prepaidAt?: FieldValue } = { status };
      if (status === 'PICKED_UP') updateData.pickedUpAt = serverTimestamp();
      if (status === 'PREPAID') updateData.prepaidAt = serverTimestamp();
      
      transaction.update(orderRef, updateData);

      if (status === 'PREPAID') {
        const productName = order.items[0]?.productName || '주문하신 상품';
        notificationsToSend.push({
          userId: order.userId,
          message: `'${productName}' 상품의 선입금이 확인되어 예약이 확정되었습니다!`,
          link: '/mypage/history'
        });
      }
    }
  });

  for (const notif of notificationsToSend) {
    await createNotification(notif.userId, notif.message, {
      type: 'PAYMENT_CONFIRMED',
      link: notif.link,
    });
  }
};

/**
 * @description [신규] 특정 주문의 단일 품목 수량을 변경하고 총액을 재계산합니다.
 * @param orderId 주문 ID
 * @param itemId 변경할 품목의 ID (OrderItem의 itemId)
 * @param newQuantity 새로운 수량
 */
export const updateOrderItemQuantity = async (orderId: string, itemId: string, newQuantity: number): Promise<void> => {
  if (newQuantity <= 0) {
    throw new Error("수량은 1 이상이어야 합니다.");
  }
  const orderRef = doc(db, 'orders', orderId);

  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) {
      throw new Error("주문을 찾을 수 없습니다.");
    }

    const order = orderDoc.data() as Order;
    let itemFound = false;

    const newItems = order.items.map(item => {
      if (item.itemId === itemId) {
        itemFound = true;
        return { ...item, quantity: newQuantity };
      }
      return item;
    });

    if (!itemFound) {
      throw new Error("주문에서 해당 품목을 찾을 수 없습니다.");
    }

    const newTotalPrice = newItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    transaction.update(orderRef, {
      items: newItems,
      totalPrice: newTotalPrice,
    });
  });
};


/**
 * @description [수정] 주문 상태를 이전(예약 확정)으로 되돌리는 통합 함수
 * @param orderIds 되돌릴 주문 ID 배열
 * @param currentStatus 현재 상태 (이 상태에 따라 어떤 필드를 삭제할지 결정)
 */
export const revertOrderStatus = async (orderIds: string[], currentStatus: OrderStatus): Promise<void> => {
  const batch = writeBatch(db);

  orderIds.forEach(orderId => {
    const orderRef = doc(db, 'orders', orderId);
    const updateData: any = { status: 'RESERVED' };

    if (currentStatus === 'PICKED_UP') {
      updateData.pickedUpAt = deleteField();
    } else if (currentStatus === 'PREPAID') {
      updateData.prepaidAt = deleteField();
    }

    batch.update(orderRef, updateData);
  });
  await batch.commit();
};


/**
 * @description (신규) 주문에 대한 관리자 비고를 업데이트합니다.
 * @param orderId - 주문 ID
 * @param notes - 저장할 비고 내용
 */
export const updateOrderNotes = async (orderId: string, notes: string): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { notes });
};

/**
 * @description (신규) 주문의 북마크 상태를 토글합니다.
 * @param orderId - 주문 ID
 * @param isBookmarked - 새로운 북마크 상태 (true/false)
 */
export const toggleOrderBookmark = async (orderId: string, isBookmarked: boolean): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { isBookmarked });
};

/**
 * @description 특정 주문을 데이터베이스에서 영구적으로 삭제합니다.
 */
export const deleteOrder = async (orderId: string): Promise<void> => {
  const orderRef = doc(db, 'orders', orderId);
  await deleteDoc(orderRef);
};

/**
 * @description [신규] 여러 주문을 한 번에 삭제합니다.
 */
export const deleteMultipleOrders = async (orderIds: string[]): Promise<void> => {
  const batch = writeBatch(db);
  orderIds.forEach(orderId => {
    const orderRef = doc(db, 'orders', orderId);
    batch.delete(orderRef);
  });
  await batch.commit();
}

/**
 * @description 현재 예약중인 모든 상품의 수량을 가져옵니다.
 */
export const getReservedQuantities = async (): Promise<Record<string, number>> => {
  const quantities: Record<string, number> = {};
  const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']));
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach((doc) => {
    const order = doc.data() as Order;
    (order.items || []).forEach((item: OrderItem) => {
      const key = `${item.productId}_${item.roundId}_${item.itemId}`;
      quantities[key] = (quantities[key] || 0) + item.quantity;
    });
  });
  return quantities;
};

/**
 * @description 대기 목록 항목으로부터 새로운 주문을 생성합니다. (트랜잭션 내부에서만 호출)
 */
export const submitOrderFromWaitlist = async (
  transaction: any, // Firestore Transaction
  waitlistEntry: WaitlistEntry,
  product: Product,
  round: SalesRound
): Promise<void> => {
  const { userId, quantity, variantGroupId, itemId } = waitlistEntry;
  const vg = round.variantGroups.find(v => v.id === variantGroupId);
  const itemDetail = vg?.items.find(i => i.id === itemId);
  if (!vg || !itemDetail) {
    throw new Error(`주문 전환 실패: 상품(${product.groupName})의 옵션(ID: ${itemId})을 찾을 수 없습니다.`);
  }
  const userDoc = await getUserDocById(userId);
  const newOrderRef = doc(collection(db, 'orders'));
  const newOrderId = newOrderRef.id;
  const phoneLast4 = userDoc?.phone?.slice(-4) || '';
  
  const orderItemPayload: OrderItem = {
    id: `${newOrderId}-${itemDetail.id}`,
    productId: product.id,
    productName: product.groupName,
    imageUrl: product.imageUrls[0] || '',
    roundId: round.roundId,
    roundName: round.roundName,
    variantGroupId: vg.id,
    variantGroupName: vg.groupName,
    itemId: itemDetail.id,
    itemName: itemDetail.name,
    quantity,
    unitPrice: itemDetail.price,
    stock: itemDetail.stock,
    stockDeductionAmount: itemDetail.stockDeductionAmount || 1,
    arrivalDate: round.arrivalDate ?? null,
    deadlineDate: round.deadlineDate,
    pickupDate: round.pickupDate,
    pickupDeadlineDate: round.pickupDeadlineDate ?? null,
    isPrepaymentRequired: round.isPrepaymentRequired ?? false,
  };

  const orderData: Omit<Order, 'id'> = {
    userId,
    orderNumber: `SODOMALL-W-${newOrderId}`,
    items: [orderItemPayload],
    totalPrice: itemDetail.price * quantity,
    status: 'RESERVED',
    createdAt: serverTimestamp(),
    pickupDate: round.pickupDate,
    pickupDeadlineDate: round.pickupDeadlineDate ?? null,
    customerInfo: { name: userDoc?.displayName || '알 수 없음', phone: userDoc?.phone || '', phoneLast4, },
    notes: '대기 신청에서 자동으로 전환된 주문입니다.',
    wasPrepaymentRequired: round.isPrepaymentRequired ?? false,
  };
  transaction.set(newOrderRef, orderData);
};

/**
 * @description [수정] 전화번호 또는 고객 이름으로 주문을 통합 검색합니다.
 */
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

/**
 * @description [신규] ProductListPageAdmin에서 사용할 예약 수량 Map을 반환하는 함수
 */
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