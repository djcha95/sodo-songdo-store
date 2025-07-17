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
} from 'firebase/firestore';
import type { FieldValue, Timestamp } from 'firebase/firestore'; // Timestamp 타입 추가
import type { Order, OrderStatus, OrderItem, Product, SalesRound, WaitlistEntry } from '@/types';
import { updateOrderStatusAndLoyalty } from './userService';

/**
 * @description 주문을 생성하고 재고를 차감하는 트랜잭션.
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
    const itemsToReserve: OrderItem[] = [];
    const productUpdates = new Map<string, SalesRound[]>();

    const productRefs = [...new Set(orderData.items.map(item => item.productId))].map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

    const productDataMap = new Map<string, Product>();
    for (const productSnap of productSnaps) {
      if (!productSnap.exists()) {
        throw new Error(`주문 처리 중 상품을 찾을 수 없습니다 (ID: ${productSnap.id}).`);
      }
      productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() } as Product);
    }

    for (const item of orderData.items) {
      const productData = productDataMap.get(item.productId);
      if (!productData) throw new Error(`상품 데이터를 처리할 수 없습니다: ${item.productName}`);

      // 트랜잭션 내에서 동일 상품을 여러 번 처리할 경우를 대비해, 수정된 이력을 productUpdates 맵에서 가져와 사용
      // 깊은 복사를 통해 원본 salesHistory를 변경하지 않도록 합니다.
      const salesHistoryForUpdate = productUpdates.has(item.productId) 
          ? productUpdates.get(item.productId)!
          : JSON.parse(JSON.stringify(productData.salesHistory)); // 기존 로직 유지

      const roundIndex = salesHistoryForUpdate.findIndex((r: SalesRound) => r.roundId === item.roundId);
      if (roundIndex === -1) throw new Error(`판매 회차 정보를 찾을 수 없습니다: ${item.productName}`);
      const round = salesHistoryForUpdate[roundIndex];

      const groupIndex = round.variantGroups.findIndex((vg: any) => vg.id === item.variantGroupId);
      if (groupIndex === -1) throw new Error(`옵션 그룹 정보를 찾을 수 없습니다: ${item.productName}`);
      const variantGroup = round.variantGroups[groupIndex];

      const itemIndex = variantGroup.items.findIndex((i: any) => i.id === item.itemId);
      if (itemIndex === -1) throw new Error(`세부 옵션 정보를 찾을 수 없습니다: ${item.itemName}`);
      const productItem = variantGroup.items[itemIndex];

      let availableStock = Infinity;
      if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) availableStock = Math.min(availableStock, variantGroup.totalPhysicalStock);
      if (productItem.stock !== -1) availableStock = Math.min(availableStock, productItem.stock);

      if (availableStock >= item.quantity) {
        itemsToReserve.push({
          ...item,
          stockDeductionAmount: productItem.stockDeductionAmount || 1,
          arrivalDate: round.arrivalDate ?? null,
          deadlineDate: round.deadlineDate,
          pickupDate: round.pickupDate,
          pickupDeadlineDate: round.pickupDeadlineDate ?? null,
        });

        // 재고 차감 로직 복원
        const deductionAmount = item.quantity * (productItem.stockDeductionAmount || 1);
        if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
            variantGroup.totalPhysicalStock -= deductionAmount;
        }
        if (productItem.stock !== -1) {
            productItem.stock -= item.quantity;
        }
        
        // 수정된 판매 이력을 맵에 다시 저장
        productUpdates.set(item.productId, salesHistoryForUpdate);

      } else {
        throw new Error(`죄송합니다. ${item.productName}(${item.itemName})의 재고가 부족합니다.`);
      }
    }

    if (itemsToReserve.length > 0) {
      const newOrderRef = doc(collection(db, 'orders'));
      newOrderId = newOrderRef.id;
      const reservedTotalPrice = itemsToReserve.reduce((total, i) => total + (i.unitPrice * i.quantity), 0);
      const phoneLast4 = orderData.customerInfo.phone.slice(-4);
      
      // 첫 번째 아이템의 라운드 정보를 기준으로 주문의 pickupDate 설정 (원래 로직 유지)
      const firstItem = orderData.items[0];
      const productForRound = productDataMap.get(firstItem.productId);
      const roundForOrder = productForRound?.salesHistory.find(r => r.roundId === firstItem.roundId);

      const newOrderData: Omit<Order, 'id'> = {
        userId: orderData.userId,
        customerInfo: { ...orderData.customerInfo, phoneLast4 },
        items: itemsToReserve,
        totalPrice: reservedTotalPrice,
        orderNumber: `SODOMALL-${Date.now()}`,
        status: 'RESERVED',
        createdAt: serverTimestamp(),
        pickupDate: roundForOrder!.pickupDate,
        pickupDeadlineDate: roundForOrder!.pickupDeadlineDate ?? null,
        notes: orderData.notes ?? '',
        isBookmarked: orderData.isBookmarked ?? false,
      };
      
      transaction.set(newOrderRef, newOrderData);
      reservedItemCount = itemsToReserve.reduce((sum, i) => sum + i.quantity, 0);

      // productUpdates 맵에 있는 모든 상품의 salesHistory를 업데이트
      for (const [productId, updatedSalesHistory] of productUpdates.entries()) {
        const productRef = doc(db, 'products', productId);
        transaction.update(productRef, { salesHistory: updatedSalesHistory });
      }
    }
  });

  return { reservedCount: reservedItemCount, orderId: newOrderId };
};

/**
 * @description 사용자의 예약을 취소하고, 상품 재고를 복구하며, 필요시 신뢰도 점수를 조정하는 함수
 * @param order - 취소할 주문 객체
 * @param isPenalty - 페널티(신뢰도 점수 차감)를 적용할지 여부
 */
export const cancelOrder = async (order: Order, isPenalty: boolean): Promise<void> => {
  const orderRef = doc(db, 'orders', order.id);

  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) throw new Error("주문 정보를 찾을 수 없습니다.");
    const currentOrder = orderDoc.data() as Order;

    if (currentOrder.userId !== order.userId) throw new Error("본인의 주문만 취소할 수 있습니다.");
    if (currentOrder.status !== 'RESERVED' && currentOrder.status !== 'PREPAID') {
      throw new Error("예약 또는 결제 완료 상태의 주문만 취소할 수 없습니다.");
    }

    const now = new Date();
    // 주문 객체에 최상위 pickupDate가 있을 경우를 대비해 첫 번째 아이템의 deadlineDate를 기준으로 검사
    const deadlineDate = currentOrder.items[0]?.deadlineDate?.toDate();
    if (deadlineDate && now > deadlineDate) throw new Error("예약 마감 시간이 지난 주문은 취소할 수 없습니다.");


    const productRefs = [...new Set(currentOrder.items.map(item => item.productId))].map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

    const productDataMap = new Map<string, Product>();
    for (const productSnap of productSnaps) {
      if (productSnap.exists()) {
        productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() } as Product);
      }
    }

    transaction.update(orderRef, { status: 'CANCELED' });

    for (const item of currentOrder.items) {
      const productData = productDataMap.get(item.productId);
      if (!productData) continue;

      // 깊은 복사를 통해 원본 salesHistory를 변경하지 않도록 합니다.
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
  });

  if (isPenalty) {
    // updateOrderStatusAndLoyalty는 Firestore 트랜잭션 외부에서 호출되어야 합니다.
    // 이는 이 함수 내부에서 다시 트랜잭션을 실행하거나, 독립적인 업데이트를 수행하기 때문입니다.
    await updateOrderStatusAndLoyalty(order, 'CANCELED', -10, '예약 마감 후 취소');
  } else {
    await updateOrderStatusAndLoyalty(order, 'CANCELED', 0, '일반 예약 취소');
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

export const updateMultipleOrderStatuses = async (orderIds: string[], status: OrderStatus): Promise<void> => {
  const batch = writeBatch(db);

  orderIds.forEach(orderId => {
    const orderRef = doc(db, 'orders', orderId);
    const updateData: { status: OrderStatus; pickedUpAt?: FieldValue; prepaidAt?: FieldValue } = { status };

    if (status === 'PICKED_UP') {
      updateData.pickedUpAt = serverTimestamp();
    }
    if (status === 'PREPAID') {
      updateData.prepaidAt = serverTimestamp();
    }
    // NO_SHOW의 경우, 별도의 타임스탬프는 기록하지 않고 상태만 변경

    batch.update(orderRef, updateData);
  });

  await batch.commit();
}

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
    // 'NO_SHOW'의 경우, 별도의 타임스탬프가 없으므로 상태만 변경

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
  // 'RESERVED'와 'PREPAID' 상태 모두 예약된 수량으로 간주합니다.
  const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']));

  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((doc) => {
    const order = doc.data() as Order;
    order.items.forEach((item: OrderItem) => {
      const itemKey = `${item.productId}_${item.roundId}_${item.itemId}`;
      quantities[itemKey] = (quantities[itemKey] || 0) + item.quantity;
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
  const phoneLast4 = userDoc?.phone?.slice(-4) || '';

  const orderData: Omit<Order, 'id'> = {
    userId,
    orderNumber: `SODOMALL-W-${Date.now()}`,
    items: [{
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
    }],
    totalPrice: itemDetail.price * quantity,
    status: 'RESERVED',
    createdAt: serverTimestamp(),
    pickupDate: round.pickupDate,
    pickupDeadlineDate: round.pickupDeadlineDate ?? null,
    customerInfo: {
      name: userDoc?.displayName || '알 수 없음',
      phone: userDoc?.phone || '',
      phoneLast4,
    },
    notes: '대기 신청에서 자동으로 전환된 주문입니다.',
  };

  transaction.set(newOrderRef, orderData);
};

/**
 * @description [수정] 전화번호 또는 고객 이름으로 주문을 통합 검색합니다.
 * @param searchTerm - 검색어 (숫자, 문자열 모두 가능)
 */
export const searchOrdersUnified = async (searchTerm: string): Promise<Order[]> => {
  if (!searchTerm) return [];

  const isNumeric = /^\d+$/.test(searchTerm);
  const orderMap = new Map<string, Order>();

  // 1. 전화번호 뒷자리로 검색
  if (isNumeric) {
    const phoneOrders = await getOrdersByPhoneLast4(searchTerm);
    phoneOrders.forEach(order => orderMap.set(order.id, order));
  }

  // 2. 고객 이름으로 검색 (대소문자 구분 없이 '시작 문자' 기준)
  // 이름 검색 시 orderBy를 제거하여 인덱싱 문제를 피하고, 클라이언트 측에서 정렬을 수행합니다.
  const nameQuery = query(
    collection(db, 'orders'),
    where('customerInfo.name', '>=', searchTerm),
    where('customerInfo.name', '<=', searchTerm + '\uf8ff'),
    limit(50) // 이름 검색은 최대 50개로 제한
  );
  const nameSnapshot = await getDocs(nameQuery);
  nameSnapshot.forEach(doc => {
    if (!orderMap.has(doc.id)) {
      orderMap.set(doc.id, { id: doc.id, ...doc.data() } as Order);
    }
  });

  const combinedResults = Array.from(orderMap.values());
  
  // 최신순으로 정렬하여 반환
  return combinedResults.sort((a, b) => {
    const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
    const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
    return timeB - timeA;
  });
};

/**
 * @description ✅ [신규] ProductListPageAdmin에서 사용할 예약 수량 Map을 반환하는 함수
 */
export const getReservedQuantitiesMap = async (): Promise<Map<string, number>> => {
  const quantitiesMap = new Map<string, number>();
  // 'RESERVED'와 'PREPAID' 상태 모두 예약된 수량으로 간주합니다.
  const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']));

  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((doc) => {
    const order = doc.data() as Order;
    (order.items || []).forEach((item: OrderItem) => {
      // 상품 ID - 판매 회차 ID - 하위 그룹 ID 를 키로 사용
      const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
      quantitiesMap.set(key, (quantitiesMap.get(key) || 0) + item.quantity);
    });
  });

  return quantitiesMap;
};