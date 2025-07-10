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
  Timestamp,
} from 'firebase/firestore';
import type { Order, OrderStatus, OrderItem, Product, WaitlistEntry, WaitlistItem } from '@/types';

/**
 * 특정 상품들에 대해 이미 예약된 수량을 계산합니다.
 * @param productIds - 재고를 확인할 상품 ID 배열
 * @returns {Promise<Map<string, number>>} 상품별 예약된 수량 맵
 */
const getAlreadyReservedQuantities = async (productIds: string[]): Promise<Map<string, number>> => {
  const reservedQuantities = new Map<string, number>();
  if (productIds.length === 0) {
    return reservedQuantities;
  }
  const q = query(collection(db, 'orders'), where('status', '==', 'RESERVED'));
  
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach(orderDoc => {
    const order = orderDoc.data() as Order;
    order.items.forEach(item => {
      if (productIds.includes(item.productId)) {
        const itemKey = `${item.productId}-${item.roundId}-${item.variantGroupId || 'default'}`;
        const currentQty = reservedQuantities.get(itemKey) || 0;
        reservedQuantities.set(itemKey, currentQty + item.quantity);
      }
    });
  });
  return reservedQuantities;
};


/**
 * 주문을 생성하고 재고를 확인하여 예약 또는 대기 처리합니다.
 * @param orderData - 생성할 주문 데이터
 * @returns 예약된 상품 수량, 대기 등록된 아이템 목록, 생성된 주문 ID
 */
export const submitOrder = async (
  orderData: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>
): Promise<{ 
  reservedCount: number; 
  waitlistedItems: WaitlistItem[];
  orderId?: string 
}> => {
  
  let reservedItemCount = 0;
  let newOrderId: string | undefined = undefined;
  const detailedWaitlistedItems: WaitlistItem[] = [];

  const productIds = [...new Set(orderData.items.map(item => item.productId))];
  const reservedQuantitiesMap = await getAlreadyReservedQuantities(productIds);

  await runTransaction(db, async (transaction) => {
    const productDataMap = new Map<string, Product>();
    
    for (const item of orderData.items) {
      if (!productDataMap.has(item.productId)) {
        const productRef = doc(db, 'products', item.productId);
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          throw new Error(`상품을 찾을 수 없습니다: ${item.productName}`);
        }
        productDataMap.set(item.productId, productDoc.data() as Product);
      }
    }

    const itemsToReserve: OrderItem[] = [];
    const itemsToWaitlist: (WaitlistEntry & { productId: string; roundId: string })[] = [];

    for (const item of orderData.items) {
      const productData = productDataMap.get(item.productId);
      if (!productData) {
          throw new Error(`상품 데이터를 처리하는 중 오류가 발생했습니다: ${item.productName}`);
      }

      const salesRound = productData.salesHistory.find(r => r.roundId === item.roundId);
      const variantGroup = salesRound?.variantGroups.find(vg => vg.id === item.variantGroupId);
      
      if (!salesRound || !variantGroup) {
        throw new Error(`판매 정보를 찾을 수 없습니다: ${item.productName}`);
      }
      
      const deadlineDate = salesRound.deadlineDate;
      const totalPhysicalStock = variantGroup.totalPhysicalStock;
      
      let availableStock = Infinity;
      if (totalPhysicalStock !== null && totalPhysicalStock !== -1) {
        const itemKey = `${item.productId}-${item.roundId}-${item.variantGroupId || 'default'}`;
        const alreadyReserved = reservedQuantitiesMap.get(itemKey) || 0;
        availableStock = totalPhysicalStock - alreadyReserved;
      }

      const quantityToReserve = Math.max(0, Math.min(item.quantity, availableStock));
      const quantityToWaitlist = item.quantity - quantityToReserve;

      if (quantityToReserve > 0) {
        // ✨ [수정] 예약 아이템 생성 시, 서버에서 확인한 재고(totalPhysicalStock)를 stock 속성에 저장합니다.
        itemsToReserve.push({ 
            ...item, 
            quantity: quantityToReserve, 
            deadlineDate,
            stock: totalPhysicalStock, 
        });
      }

      if (quantityToWaitlist > 0) {
        const waitlistItemInfo = {
          productId: item.productId,
          roundId: item.roundId,
          userId: orderData.userId,
          quantity: quantityToWaitlist,
          timestamp: Timestamp.now(),
        };
        itemsToWaitlist.push(waitlistItemInfo);
        
        detailedWaitlistedItems.push({
          productId: item.productId,
          productName: item.variantGroupName,
          itemName: item.itemName,
          quantity: quantityToWaitlist,
          imageUrl: item.imageUrl,
          timestamp: waitlistItemInfo.timestamp,
        });
      }
    }

    if (itemsToReserve.length > 0) {
      const newOrderRef = doc(collection(db, 'orders'));
      newOrderId = newOrderRef.id;
      const reservedTotalPrice = itemsToReserve.reduce((total, item) => total + (item.unitPrice * item.quantity), 0);
      
      const newOrderData: Omit<Order, 'id'> = {
        ...orderData,
        items: itemsToReserve,
        totalPrice: reservedTotalPrice,
        orderNumber: `SODOMALL-${Date.now()}`,
        status: 'RESERVED',
        createdAt: serverTimestamp(),
      };
      transaction.set(newOrderRef, newOrderData);
      reservedItemCount = itemsToReserve.reduce((sum, item) => sum + item.quantity, 0);
    }
    
    if (itemsToWaitlist.length > 0) {
      // 대기자 등록 로직
    }
  });

  return { 
    reservedCount: reservedItemCount, 
    waitlistedItems: detailedWaitlistedItems,
    orderId: newOrderId 
  };
};

/**
 * 사용자의 예약을 취소하는 함수.
 * @param orderId 취소할 주문의 ID
 * @param userId 현재 로그인한 사용자의 ID
 */
export const cancelOrder = async (orderId: string, userId: string): Promise<void> => {
  const orderRef = doc(db, 'orders', orderId);

  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) {
      throw new Error("주문 정보를 찾을 수 없습니다.");
    }

    const order = orderDoc.data() as Order;

    if (order.userId !== userId) {
      throw new Error("본인의 주문만 취소할 수 있습니다.");
    }
    if (order.status !== 'RESERVED') {
      throw new Error("예약 확정 상태의 주문만 취소할 수 있습니다.");
    }

    const firstItem = order.items[0];
    if (!firstItem || !firstItem.deadlineDate) {
      // 마감일 정보가 없는 레거시 데이터는 취소를 허용합니다.
    } else {
      const now = new Date();
      
      const pickupDate = order.pickupDate?.toDate();
      if (pickupDate && now >= pickupDate) {
        throw new Error("픽업이 시작된 주문은 취소할 수 없습니다.");
      }

      const deadline = firstItem.deadlineDate.toDate();
      const isLimited = firstItem.stock != null;
      
      const uploadDate = new Date(deadline.getTime() - (24 + 13) * 60 * 60 * 1000);
      uploadDate.setHours(0, 0, 0, 0);

      let isCancellable = false;

      if (isLimited) {
        const freeCancelEnd = new Date(uploadDate.getTime());
        freeCancelEnd.setHours(22, 0, 0, 0);

        const cautiousCancelEnd = new Date(uploadDate.getTime());
        cautiousCancelEnd.setDate(cautiousCancelEnd.getDate() + 1);
        cautiousCancelEnd.setHours(10, 0, 0, 0);
        
        if (now <= cautiousCancelEnd) isCancellable = true;

      } else {
        const cautiousCancelEnd = new Date(uploadDate.getTime());
        cautiousCancelEnd.setDate(cautiousCancelEnd.getDate() + 1);
        cautiousCancelEnd.setHours(13, 0, 0, 0);

        if (now <= cautiousCancelEnd) isCancellable = true;
      }

      if (!isCancellable) {
        throw new Error("취소 가능한 시간이 지났습니다.");
      }
    }

    transaction.update(orderRef, { status: 'CANCELED' });
  });
};

/**
 * 특정 사용자의 모든 주문 내역을 가져옵니다.
 * @param userId 사용자 ID
 * @returns 주문 배열
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
 * 전화번호 뒷자리로 주문을 검색합니다. (주로 관리자용)
 * @param phoneNumber 전화번호 뒷자리
 * @returns 필터링된 주문 배열
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
 * 특정 주문의 상태를 업데이트합니다. (주로 관리자용)
 * @param orderId 주문 ID
 * @param status 변경할 주문 상태
 */
export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { status });
};

/**
 * 현재 예약중인 모든 상품의 수량을 가져옵니다.
 * @returns 상품별 예약 수량
 */
export const getReservedQuantities = async (): Promise<Record<string, number>> => {
  const quantities: Record<string, number> = {};
  const q = query(collection(db, 'orders'), where('status', '==', 'RESERVED'));
  
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