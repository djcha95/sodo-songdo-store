// src/firebase/orderService.ts
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
import type { Order, OrderStatus, OrderItem, Product, SalesRound, UserDocument, PointLog, NotificationType } from '@/types';
import { calculateUserUpdateByStatus, POINT_POLICIES } from './pointService'; 
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
 * @description 주문을 생성합니다. (더 복잡한 재고 확인 로직은 Cloud Function으로 이전됨)
 */
export const submitOrder = async (
  orderData: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>
): Promise<{
  reservedCount: number;
  orderId?: string
}> => {
  // 참고: 이 함수는 Cloud Function 'submitOrder'를 호출하는 것으로 대체하는 것이
  // 더 안전하고 일관된 재고 관리에 도움이 됩니다.
  // 현재는 클라이언트 측 로직으로 유지합니다.
  let reservedItemCount = 0;
  let newOrderId: string | undefined = undefined;

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', orderData.userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('주문 처리 중 사용자 정보를 찾을 수 없습니다.');
    }
    const userDoc = userSnap.data() as UserDocument;

    const newOrderRef = doc(collection(db, 'orders'));
    newOrderId = newOrderRef.id;
    const originalTotalPrice = orderData.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const newTotalOrders = (userDoc.totalOrders || 0) + 1;
    const newPickupRate = newTotalOrders > 0 ? ((userDoc.pickupCount || 0) / newTotalOrders) * 100 : 0;
  
    transaction.update(userRef, {
      totalOrders: newTotalOrders,
      pickupRate: newPickupRate
    });

    const newOrderData: Omit<Order, 'id'> = {
      ...orderData,
      status: 'RESERVED',
      createdAt: serverTimestamp(),
      orderNumber: `SODOMALL-${Date.now()}`,
      totalPrice: originalTotalPrice,
    };

    transaction.set(newOrderRef, newOrderData);
    reservedItemCount = orderData.items.reduce((sum, i) => sum + i.quantity, 0);
  });

  return { reservedCount: reservedItemCount, orderId: newOrderId };
};

/**
 * @description 사용자의 예약을 취소합니다.
 */
export const cancelOrder = async (order: Order): Promise<void> => {
  const orderRef = doc(db, 'orders', order.id);

  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) throw new Error("주문 정보를 찾을 수 없습니다.");
    const currentOrder = orderDoc.data() as Order;

    if (currentOrder.status !== 'RESERVED' && currentOrder.status !== 'PREPAID') {
      throw new Error("예약 또는 결제 완료 상태의 주문만 취소할 수 있습니다.");
    }

    const userRef = doc(db, 'users', currentOrder.userId);
    const userSnap = await transaction.get(userRef);
    
    transaction.update(orderRef, { status: 'CANCELED', canceledAt: serverTimestamp() });

    // 참고: 주문 취소 시 대기자 전환 로직은 Cloud Function의 onUpdate 트리거로 처리하는 것이 이상적입니다.

    const now = new Date();
    const deadlineDate = safeToDate(currentOrder.items[0]?.deadlineDate);
    if (deadlineDate && now > deadlineDate && userSnap.exists()) {
      const cancelPenaltyPolicy = POINT_POLICIES.CANCEL_PENALTY;
      const ratePenalty = Math.max(cancelPenaltyPolicy.maxRatePenalty, Math.floor(order.totalPrice * cancelPenaltyPolicy.rate) * -1);
      const totalPenalty = cancelPenaltyPolicy.basePoints + ratePenalty;

      const userDoc = userSnap.data() as UserDocument;
      const newPoints = (userDoc.points || 0) + totalPenalty;
      const pointHistoryUpdate: Omit<PointLog, 'id'> = {
        amount: totalPenalty,
        reason: cancelPenaltyPolicy.reason,
        createdAt: Timestamp.now(),
        orderId: order.id,
      };

      transaction.update(userRef, {
        points: newPoints,
        pointHistory: arrayUnion(pointHistoryUpdate),
      });
    }
  });
};

export const splitAndUpdateOrderStatus = async (
  originalOrderId: string,
  pickedUpQuantity: number,
  remainingStatus: OrderStatus
): Promise<void> => {
  if (pickedUpQuantity <= 0) {
    throw new Error('픽업 수량은 1 이상이어야 합니다.');
  }

  const notificationInfo = await runTransaction(db, async (transaction) => {
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
    
    const userRefForRemaining = doc(db, 'users', originalOrder.userId);
    const userSnapForRemaining = await transaction.get(userRefForRemaining);
    let updatedUserDocForRemaining = userSnapForRemaining.exists() ? userSnapForRemaining.data() as UserDocument : null;

    if (updatedUserDocForRemaining) {
      const calculatedUpdate = calculateUserUpdateByStatus(updatedUserDocForRemaining, { ...remainingOrder, id: newOrderRef.id }, remainingStatus);
      if (calculatedUpdate) {
        const tempDoc = { ...updatedUserDocForRemaining, ...calculatedUpdate.updateData };
        const totalOrders = tempDoc.totalOrders ?? 0;
        const pickupCount = tempDoc.pickupCount ?? 0;
        calculatedUpdate.updateData.pickupRate = totalOrders > 0 ? (pickupCount / totalOrders) * 100 : 0;
        transaction.update(userRefForRemaining, calculatedUpdate.updateData);
        updatedUserDocForRemaining = { ...updatedUserDocForRemaining, ...calculatedUpdate.updateData };
      }
    }

    const pickedUpItem: OrderItem = { ...originalItem, quantity: pickedUpQuantity };
    const pickedUpOrderUpdate = {
      items: [pickedUpItem],
      totalPrice: pickedUpItem.unitPrice * pickedUpQuantity,
      status: 'PICKED_UP' as OrderStatus,
      pickedUpAt: serverTimestamp(),
      notes: `[${newOrderRef.id}]로 ${remainingQuantity}개 분할 처리됨`,
    };
    
    transaction.update(originalOrderRef, pickedUpOrderUpdate);
    const orderForPointCalculation: Order = {
      ...originalOrder,
      ...pickedUpOrderUpdate,
      pickedUpAt: Timestamp.now(),
    };

    const userRefForPickedUp = doc(db, 'users', originalOrder.userId);
    const userSnapForPickedUp = await transaction.get(userRefForPickedUp);
    let updatedUserDocForPickedUp = userSnapForPickedUp.exists() ? userSnapForPickedUp.data() as UserDocument : null;

    if (updatedUserDocForPickedUp) {
      const calculatedUpdate = calculateUserUpdateByStatus(updatedUserDocForPickedUp, orderForPointCalculation, 'PICKED_UP');
      if (calculatedUpdate) {
        const tempDoc = { ...updatedUserDocForPickedUp, ...calculatedUpdate.updateData };
        const totalOrders = tempDoc.totalOrders ?? 0;
        const pickupCount = tempDoc.pickupCount ?? 0;
        calculatedUpdate.updateData.pickupRate = totalOrders > 0 ? (pickupCount / totalOrders) * 100 : 0;
        transaction.update(userRefForPickedUp, calculatedUpdate.updateData);
        updatedUserDocForPickedUp = { ...updatedUserDocForPickedUp, ...calculatedUpdate.updateData }
      }
    }

    const finalUserDoc = updatedUserDocForRemaining || updatedUserDocForPickedUp;
    if (finalUserDoc) {
        return {
            userId: originalOrder.userId, userDoc: finalUserDoc, productName: originalItem.productName,
            pickedUpQuantity, remainingQuantity, remainingStatus,
        };
    }
    return null;
  });

  if (notificationInfo) {
    await createNotification(
      notificationInfo.userId,
      `'${notificationInfo.productName}' ${notificationInfo.pickedUpQuantity}개를 픽업해주셔서 감사합니다!`,
      { type: 'ORDER_PICKED_UP', link: '/mypage/history' }
    );

    if (notificationInfo.remainingStatus === 'NO_SHOW') {
      const newNoShowCount = notificationInfo.userDoc.noShowCount; 
      let noShowMessage = '';
      let noShowType: NotificationType = 'NO_SHOW_WARNING';

      if (newNoShowCount === 1) {
          noShowMessage = `[주의] '${notificationInfo.productName}' ${notificationInfo.remainingQuantity}개가 노쇼 처리되었습니다. 앞으로 2회 더 노쇼 시 참여가 제한됩니다.`;
      } else if (newNoShowCount === 2) {
          noShowMessage = `[경고] '${notificationInfo.productName}' ${notificationInfo.remainingQuantity}개가 노쇼 처리되었습니다. 다음 노쇼 시 참여가 제한됩니다.`;
      } else if (newNoShowCount && newNoShowCount >= 3) {
          noShowMessage = `[안내] '${notificationInfo.productName}' ${notificationInfo.remainingQuantity}개가 노쇼 처리되어, 반복된 약속 불이행으로 참여가 제한되었습니다.`;
          noShowType = 'PARTICIPATION_RESTRICTED';
      }
      
      await createNotification(notificationInfo.userId, noShowMessage, { type: noShowType, link: '/mypage' });
    }
  }
};

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

export const updateMultipleOrderStatuses = async (orderIds: string[], status: OrderStatus): Promise<void> => {
  const notificationsToSend: { userId: string; message: string; link: string; type: NotificationType }[] = [];
  await runTransaction(db, async (transaction) => {
    const ordersMap = new Map<string, Order>();
    const usersMap = new Map<string, UserDocument>();
    const productDocs = new Map<string, Product>();
    const userIds = new Set<string>();
    const productIdsToRead = new Set<string>();
    for (const orderId of orderIds) {
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await transaction.get(orderRef);
      if (orderDoc.exists()) {
        const order = { id: orderId, ...orderDoc.data() } as Order;
        ordersMap.set(orderId, order);
        userIds.add(order.userId);
        if (status === 'PREPAID' && order.wasPrepaymentRequired) {
          order.items.forEach(item => productIdsToRead.add(item.productId));
        }
      }
    }
    for (const userId of userIds) {
      const userRef = doc(db, 'users', userId);
      const userDoc = await transaction.get(userRef);
      if (userDoc.exists()) {
        usersMap.set(userId, { uid: userId, ...userDoc.data() } as UserDocument);
      }
    }
    const productRefs = Array.from(productIdsToRead).map(id => doc(db, 'products', id));
    if (productRefs.length > 0) {
      const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      productSnaps.forEach(snap => {
        if (snap.exists()) {
          productDocs.set(snap.id, { id: snap.id, ...snap.data() } as Product);
        }
      });
    }
    for (const order of ordersMap.values()) {
      const userDoc = usersMap.get(order.userId);
      if (!userDoc) continue;
      const userRef = doc(db, 'users', order.userId);
      const orderRef = doc(db, 'orders', order.id);
      const userUpdateResult = calculateUserUpdateByStatus(userDoc, order, status);
      let updatedUserDoc = userDoc;
      if (userUpdateResult) {
        const tempUpdatedUserDoc = { ...userDoc, ...userUpdateResult.updateData };
        const totalOrders = tempUpdatedUserDoc.totalOrders ?? 0;
        const pickupCount = tempUpdatedUserDoc.pickupCount ?? 0;
        const newPickupRate = totalOrders > 0 ? (pickupCount / totalOrders) * 100 : 0;
        userUpdateResult.updateData.pickupRate = newPickupRate;
        transaction.update(userRef, userUpdateResult.updateData);
        updatedUserDoc = { ...userDoc, ...userUpdateResult.updateData, pickupRate: newPickupRate };
      }
      const updateData: any = { status };
      if (status === 'PICKED_UP') updateData.pickedUpAt = serverTimestamp();
      if (status === 'PREPAID') updateData.prepaidAt = serverTimestamp();
      if (status === 'PREPAID' && order.wasPrepaymentRequired) {
        for (const item of order.items) {
          const productData = productDocs.get(item.productId);
          if (!productData) throw new Error(`재고 차감 실패: 상품(${item.productId})을 찾을 수 없습니다.`);
          const newSalesHistory = JSON.parse(JSON.stringify(productData.salesHistory));
          const roundIndex = newSalesHistory.findIndex((r: SalesRound) => r.roundId === item.roundId);
          if (roundIndex === -1) continue;
          const groupIndex = newSalesHistory[roundIndex].variantGroups.findIndex((vg: any) => vg.id === item.variantGroupId);
          if (groupIndex === -1) continue;
          const variantGroup = newSalesHistory[roundIndex].variantGroups[groupIndex];
          const isGroupStockManaged = variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1;
          if (isGroupStockManaged) {
            const deductionAmount = item.quantity * (item.stockDeductionAmount || 1);
            if (variantGroup.totalPhysicalStock < deductionAmount) {
              throw new Error(`재고 부족: ${variantGroup.groupName} (${variantGroup.totalPhysicalStock}개 남음)`);
            }
            variantGroup.totalPhysicalStock -= deductionAmount;
          }
          transaction.update(doc(db, 'products', item.productId), { salesHistory: newSalesHistory });
        }
      }
      transaction.update(orderRef, updateData);
      const productName = order.items[0]?.productName || '주문하신 상품';
      switch (status) {
        case 'PREPAID':
          notificationsToSend.push({ userId: order.userId, message: `'${productName}' 상품의 선입금이 확인되어 예약이 확정되었습니다!`, link: '/mypage/history', type: 'PAYMENT_CONFIRMED'});
          break;
        case 'PICKED_UP':
          notificationsToSend.push({ userId: order.userId, message: `'${productName}' 상품을 픽업해주셔서 감사합니다!`, link: '/mypage', type: 'ORDER_PICKED_UP'});
          break;
        case 'NO_SHOW':
        case 'CANCELED':
              const newNoShowCount = updatedUserDoc.noShowCount || userDoc.noShowCount || 0;
              let alertMessage = '';
              let alertType: NotificationType = 'NO_SHOW_WARNING';
              if (newNoShowCount === 1) {
                  alertMessage = `[주의] '${productName}' 상품이 ${status === 'NO_SHOW' ? '노쇼' : '취소'} 처리되었습니다. 앞으로 2회 더 누적 시 참여가 제한됩니다.`;
              } else if (newNoShowCount === 2) {
                  alertMessage = `[경고] '${productName}' 상품이 ${status === 'NO_SHOW' ? '노쇼' : '취소'} 처리되었습니다. 다음 누적 시 참여가 제한됩니다.`;
              } else if (newNoShowCount >= 3) {
                  alertMessage = `[안내] '${productName}' 상품이 ${status === 'NO_SHOW' ? '노쇼' : '취소'} 처리되어, 반복된 약속 불이행으로 참여가 제한되었습니다.`;
                  alertType = 'PARTICIPATION_RESTRICTED';
              }
              if (alertMessage) {
                notificationsToSend.push({ userId: order.userId, message: alertMessage, link: '/mypage', type: alertType });
              }
          break;
      }
    }
  });
  for (const notif of notificationsToSend) {
    await createNotification(notif.userId, notif.message, { type: notif.type, link: notif.link });
  }
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