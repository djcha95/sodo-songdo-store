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
  type Transaction,
} from 'firebase/firestore';
import type { FieldValue, DocumentData, OrderByDirection } from 'firebase/firestore';
import type { Order, OrderStatus, OrderItem, Product, SalesRound, WaitlistEntry, UserDocument, PointLog, NotificationType } from '@/types';
// ✅ [수정] 새로운 계산 함수 import
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
    let isAnyItemLimited = false;
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

      const allowedTiers = round.allowedTiers || [];
      if (allowedTiers.length > 0) {
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

      const isLimited = variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1;

      if (isLimited) {
        isAnyItemLimited = true;
      } else {
        const availableStock = productItem.stock === -1 ? Infinity : productItem.stock;
        if (availableStock < item.quantity) {
          throw new Error(`죄송합니다. ${item.productName}(${item.itemName})의 재고가 부족합니다.`);
        }

        if (productItem.stock !== -1) productItem.stock -= item.quantity;

        productUpdates.set(item.productId, salesHistoryForUpdate);
      }

      itemsToReserve.push({ ...item, stockDeductionAmount: productItem.stockDeductionAmount || 1, arrivalDate: round.arrivalDate ?? null, deadlineDate: round.deadlineDate, pickupDate: round.pickupDate, pickupDeadlineDate: round.pickupDeadlineDate ?? null });
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
        wasPrepaymentRequired: isAnyItemLimited || orderData.wasPrepaymentRequired,
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
 * @description 대기열을 처리하는 내부 헬퍼 함수
 */
const processWaitlistForCancelledItem = async (
  transaction: Transaction,
  item: OrderItem,
  productDataMap: Map<string, Product>
) => {
  const productRef = doc(db, 'products', item.productId);
  const productData = productDataMap.get(item.productId);
  if (!productData) return;

  const salesHistory = [...productData.salesHistory];
  const roundIndex = salesHistory.findIndex(r => r.roundId === item.roundId);
  if (roundIndex === -1) return;

  const round = salesHistory[roundIndex];
  if (!round.waitlist || round.waitlist.length === 0) return;

  let availableStock = item.quantity;

  const sortedWaitlist = round.waitlist.sort((a, b) => {
    if (a.isPrioritized && !b.isPrioritized) return -1;
    if (!a.isPrioritized && b.isPrioritized) return 1;
    return a.timestamp.toMillis() - b.timestamp.toMillis();
  });

  const remainingWaitlist: WaitlistEntry[] = [];
  const usersNotified = new Set<string>();

  for (const entry of sortedWaitlist) {
    if (availableStock <= 0) {
      remainingWaitlist.push(entry);
      continue;
    }

    if (entry.variantGroupId === item.variantGroupId && entry.itemId === item.itemId) {
      const quantityToConvert = Math.min(entry.quantity, availableStock);

      if (quantityToConvert > 0) {
        const partialEntry = { ...entry, quantity: quantityToConvert };
        try {
          await submitOrderFromWaitlist(transaction, partialEntry, productData, round);
          availableStock -= quantityToConvert;
          if (!usersNotified.has(entry.userId)) {
            await createNotification(entry.userId, `대기하시던 '${productData.groupName}' 상품이 예약으로 전환되었습니다!`, { type: "WAITLIST_CONFIRMED", link: "/mypage/history" });
            usersNotified.add(entry.userId);
          }
        } catch (e) {
          console.error("대기열 자동 전환 중 주문 생성 실패:", e);
        }
      }

      const remainingQuantity = entry.quantity - quantityToConvert;
      if (remainingQuantity > 0) {
        remainingWaitlist.push({ ...entry, quantity: remainingQuantity });
      }
    } else {
      remainingWaitlist.push(entry);
    }
  }

  round.waitlist = remainingWaitlist;
  round.waitlistCount = remainingWaitlist.reduce((acc, curr) => acc + curr.quantity, 0);
  salesHistory[roundIndex] = round;

  transaction.update(productRef, { salesHistory });
}

/**
 * @description 사용자의 예약을 취소하고, 상품 재고를 복구하며, 신뢰도 점수를 조정하는 함수
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
    const productIds = [...new Set(currentOrder.items.map(item => item.productId))];
    const productRefs = productIds.map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    const productDataMap = new Map<string, Product>();
    productSnaps.forEach(snap => {
      if (snap.exists()) productDataMap.set(snap.id, { id: snap.id, ...snap.data() } as Product);
    });

    transaction.update(orderRef, { status: 'CANCELED', canceledAt: serverTimestamp() });

    for (const item of currentOrder.items) {
      await processWaitlistForCancelledItem(transaction, item, productDataMap);
    }

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

/**
 * @description ✨ [수정] 하나의 주문을 두 개로 분할하고, 상태 변경 후 알림을 생성합니다.
 */
export const splitAndUpdateOrderStatus = async (
  originalOrderId: string,
  pickedUpQuantity: number,
  remainingStatus: OrderStatus
): Promise<void> => {
  if (pickedUpQuantity <= 0) {
    throw new Error('픽업 수량은 1 이상이어야 합니다.');
  }

  // ✅ [수정] 트랜잭션이 성공적으로 완료되면 알림에 필요한 정보를 반환하도록 구조 변경
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

    // --- 1. 남은 수량에 대한 주문 생성 ---
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
        transaction.update(userRefForRemaining, calculatedUpdate.updateData);
        updatedUserDocForRemaining = { ...updatedUserDocForRemaining, ...calculatedUpdate.updateData };
      }
    }


    // --- 2. 원본 주문을 '픽업 완료' 상태로 수정 ---
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
        transaction.update(userRefForPickedUp, calculatedUpdate.updateData);
        updatedUserDocForPickedUp = { ...updatedUserDocForPickedUp, ...calculatedUpdate.updateData };
      }
    }


    // --- 3. 알림 생성을 위한 정보 반환 ---
    // Note: 여기서는 updatedUserDocForRemaining의 noShowCount를 사용 (마지막으로 업데이트된 정보)
    const finalUserDoc = updatedUserDocForRemaining || updatedUserDocForPickedUp;
    if (finalUserDoc) {
        return {
            userId: originalOrder.userId,
            userDoc: finalUserDoc, // 최신 사용자 문서 상태
            productName: originalItem.productName,
            pickedUpQuantity,
            remainingQuantity,
            remainingStatus,
        };
    }
    return null;
  });

  // --- 4. ✅ [수정] 트랜잭션 완료 후 반환된 정보로 알림 전송
  if (notificationInfo) {
    // 픽업 완료 알림
    await createNotification(
      notificationInfo.userId,
      `'${notificationInfo.productName}' ${notificationInfo.pickedUpQuantity}개를 픽업해주셔서 감사합니다!`,
      { type: 'ORDER_PICKED_UP', link: '/mypage/history' }
    );

    // 남은 수량(노쇼 등)에 대한 알림
    if (notificationInfo.remainingStatus === 'NO_SHOW') {
      const newNoShowCount = notificationInfo.userDoc.noShowCount; 
      let noShowMessage = '';
      let noShowType: NotificationType = 'NO_SHOW_WARNING';

      if (newNoShowCount === 1) {
          noShowMessage = `[주의] '${notificationInfo.productName}' ${notificationInfo.remainingQuantity}개가 노쇼 처리되었습니다. 앞으로 2회 더 노쇼 시 참여가 제한됩니다.`;
      } else if (newNoShowCount === 2) {
          noShowMessage = `[경고] '${notificationInfo.productName}' ${notificationInfo.remainingQuantity}개가 노쇼 처리되었습니다. 다음 노쇼 시 참여가 제한됩니다.`;
      } else if (newNoShowCount && newNoShowCount >= 3) { // 3회 이상 노쇼일 경우
          noShowMessage = `[안내] '${notificationInfo.productName}' ${notificationInfo.remainingQuantity}개가 노쇼 처리되어, 반복된 약속 불이행으로 참여가 제한되었습니다.`;
          noShowType = 'PARTICIPATION_RESTRICTED';
      }
      
      await createNotification(
          notificationInfo.userId,
          noShowMessage,
          { type: noShowType, link: '/mypage' }
      );
    }
  }
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

export const searchOrdersByPhoneNumber = async (phoneNumber: string): Promise<Order[]> => {
  if (!phoneNumber || phoneNumber.length < 4) return [];
  const querySnapshot = await getDocs(collection(db, 'orders'));
  const allOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

  return allOrders.filter(order =>
    order.customerInfo?.phone?.endsWith(phoneNumber)
  );
};

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
 * ✅ [수정] Firestore 트랜잭션 규칙(읽기 후 쓰기)을 준수하도록 로직 전면 재작성
 */
export const updateMultipleOrderStatuses = async (orderIds: string[], status: OrderStatus): Promise<void> => {
  const notificationsToSend: { userId: string; message: string; link: string; type: NotificationType }[] = [];

  await runTransaction(db, async (transaction) => {
    // --- 1. 읽기 단계: 필요한 모든 문서를 미리 다 읽어옵니다. ---
    
    const ordersMap = new Map<string, Order>();
    const usersMap = new Map<string, UserDocument>();
    const productDocs = new Map<string, Product>();
    const userIds = new Set<string>();
    const productIdsToRead = new Set<string>();

    // 1-1. 주문 정보 읽기
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

    // 1-2. 사용자 정보 읽기
    for (const userId of userIds) {
      const userRef = doc(db, 'users', userId);
      const userDoc = await transaction.get(userRef);
      if (userDoc.exists()) {
        usersMap.set(userId, { uid: userId, ...userDoc.data() } as UserDocument);
      }
    }

    // 1-3. 상품 정보 읽기 (PREPAID 상태 변경 시 재고 차감에 필요)
    const productRefs = Array.from(productIdsToRead).map(id => doc(db, 'products', id));
    if (productRefs.length > 0) {
      const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      productSnaps.forEach(snap => {
        if (snap.exists()) {
          productDocs.set(snap.id, { id: snap.id, ...snap.data() } as Product);
        }
      });
    }

    // --- 2. 쓰기 단계: 미리 읽어온 데이터를 바탕으로 모든 변경 작업을 수행합니다. ---

    for (const order of ordersMap.values()) {
      const userDoc = usersMap.get(order.userId);
      if (!userDoc) continue; // 사용자 정보가 없으면 해당 주문은 건너뜀

      const userRef = doc(db, 'users', order.userId);
      const orderRef = doc(db, 'orders', order.id);
      
      // 2-1. 포인트 및 사용자 정보 변경 계산 및 업데이트
      const userUpdateResult = calculateUserUpdateByStatus(userDoc, order, status);
      let updatedUserDoc = userDoc; // 알림 생성을 위한 최신 사용자 문서 상태

      if (userUpdateResult) {
        transaction.update(userRef, userUpdateResult.updateData);
        // 알림 생성에 사용될 수 있도록, 변경된 사용자 정보를 변수에 저장
        updatedUserDoc = { ...userDoc, ...userUpdateResult.updateData };
      }

      // 2-2. 주문 정보 변경
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

      // 2-3. 알림 생성 준비 (읽기 작업 없이, 미리 읽은 데이터 사용)
      const productName = order.items[0]?.productName || '주문하신 상품';
      switch (status) {
        case 'PREPAID':
          notificationsToSend.push({ userId: order.userId, message: `'${productName}' 상품의 선입금이 확인되어 예약이 확정되었습니다!`, link: '/mypage/history', type: 'PAYMENT_CONFIRMED'});
          break;
        case 'PICKED_UP':
          notificationsToSend.push({ userId: order.userId, message: `'${productName}' 상품을 픽업해주셔서 감사합니다!`, link: '/mypage', type: 'ORDER_PICKED_UP'});
          break;
        case 'NO_SHOW':
        case 'CANCELED': // 취소 상태도 노쇼와 유사한 알림 로직을 탈 수 있음
              const newNoShowCount = updatedUserDoc.noShowCount || userDoc.noShowCount || 0; // updateMultipleOrderStatuses의 userDoc은 트랜잭션 시작 시의 값이므로 updatedUserDoc 사용
              let alertMessage = '';
              let alertType: NotificationType = 'NO_SHOW_WARNING';

              if (newNoShowCount === 1) {
                  alertMessage = `[주의] '${productName}' 상품이 ${status === 'NO_SHOW' ? '노쇼' : '취소'} 처리되었습니다. 앞으로 2회 더 누적 시 참여가 제한됩니다.`;
              } else if (newNoShowCount === 2) {
                  alertMessage = `[경고] '${productName}' 상품이 ${status === 'NO_SHOW' ? '노쇼' : '취소'} 처리되었습니다. 다음 누적 시 참여가 제한됩니다.`;
              } else if (newNoShowCount >= 3) { // 3회 이상 노쇼일 경우
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

  // --- 3. 트랜잭션 완료 후 알림 전송 ---
  for (const notif of notificationsToSend) {
    await createNotification(notif.userId, notif.message, { type: notif.type, link: notif.link });
  }
};


/**
 * @description [신규] 특정 주문의 단일 품목 수량을 변경하고 총액을 재계산합니다.
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
 */
export const updateOrderNotes = async (orderId: string, notes: string): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { notes });
};

/**
 * @description (신규) 주문의 북마크 상태를 토글합니다.
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
  transaction: Transaction, // Firestore Transaction
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

  const userRef = doc(db, 'users', userId);
  const userDocSnap = await transaction.get(userRef);
  const userDoc = userDocSnap.exists() ? userDocSnap.data() as UserDocument : null;

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
    orderNumber: `SODOMALL-W-${Date.now()}`,
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