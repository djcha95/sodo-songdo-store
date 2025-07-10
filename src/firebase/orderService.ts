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
import type { Order, OrderStatus, OrderItem, Product, SalesRound, WaitlistItem } from '@/types';

/**
 * @description 주문을 생성하고 재고를 차감하는 트랜잭션.
 * 주문 생성과 상품 재고 차감을 하나의 원자적 트랜잭션으로 묶어 처리합니다.
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
      
      const newSalesHistory = productUpdates.get(item.productId) || JSON.parse(JSON.stringify(productData.salesHistory));
      
      const roundIndex = newSalesHistory.findIndex((r: SalesRound) => r.roundId === item.roundId);
      if (roundIndex === -1) throw new Error(`판매 회차 정보를 찾을 수 없습니다: ${item.productName}`);
      
      const groupIndex = newSalesHistory[roundIndex].variantGroups.findIndex((vg: any) => vg.id === item.variantGroupId);
      if (groupIndex === -1) throw new Error(`옵션 그룹 정보를 찾을 수 없습니다: ${item.productName}`);

      const itemIndex = newSalesHistory[roundIndex].variantGroups[groupIndex].items.findIndex((i: any) => i.id === item.itemId);
      if (itemIndex === -1) throw new Error(`세부 옵션 정보를 찾을 수 없습니다: ${item.itemName}`);
      
      const variantGroup = newSalesHistory[roundIndex].variantGroups[groupIndex];
      const productItem = variantGroup.items[itemIndex];
      
      const groupStock = variantGroup.totalPhysicalStock;
      const itemStock = productItem.stock;

      let availableStock = Infinity;
      if (groupStock !== null && groupStock !== -1) {
          availableStock = Math.min(availableStock, groupStock);
      }
      if (itemStock !== -1) {
          availableStock = Math.min(availableStock, itemStock);
      }
      
      if (availableStock >= item.quantity) {
        itemsToReserve.push({ ...item, quantity: item.quantity });
        
        if (groupStock !== null && groupStock !== -1) {
            variantGroup.totalPhysicalStock -= item.quantity;
        }
        if (itemStock !== -1) {
            productItem.stock -= item.quantity;
        }

        productUpdates.set(item.productId, newSalesHistory);

      } else {
        throw new Error(`죄송합니다. ${item.productName}(${item.itemName})의 재고가 부족합니다.`);
      }
    }

    if (itemsToReserve.length > 0) {
      const newOrderRef = doc(collection(db, 'orders'));
      newOrderId = newOrderRef.id;
      const reservedTotalPrice = itemsToReserve.reduce((total, i) => total + (i.unitPrice * i.quantity), 0);
      
      const newOrderData: Omit<Order, 'id'> = {
        ...orderData,
        items: itemsToReserve,
        totalPrice: reservedTotalPrice,
        orderNumber: `SODOMALL-${Date.now()}`,
        status: 'RESERVED',
        createdAt: serverTimestamp(),
      };
      transaction.set(newOrderRef, newOrderData);
      reservedItemCount = itemsToReserve.reduce((sum, i) => sum + i.quantity, 0);

      for (const [productId, updatedSalesHistory] of productUpdates.entries()) {
        const productRef = doc(db, 'products', productId);
        transaction.update(productRef, { salesHistory: updatedSalesHistory });
      }
    }
  });

  return { 
    reservedCount: reservedItemCount, 
    waitlistedItems: detailedWaitlistedItems,
    orderId: newOrderId 
  };
};

/**
 * @description ✅ [FIX] 사용자의 예약을 취소하고, 상품 재고를 복구하는 함수 (트랜잭션 오류 해결)
 */
export const cancelOrder = async (orderId: string, userId: string): Promise<void> => {
  const orderRef = doc(db, 'orders', orderId);

  await runTransaction(db, async (transaction) => {
    // --- 1. READ PHASE ---
    // 모든 읽기 작업을 쓰기 작업 전에 수행합니다.
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) {
      throw new Error("주문 정보를 찾을 수 없습니다.");
    }
    const order = orderDoc.data() as Order;

    // 유효성 검사
    if (order.userId !== userId) throw new Error("본인의 주문만 취소할 수 있습니다.");
    if (order.status !== 'RESERVED') throw new Error("예약 확정 상태의 주문만 취소할 수 있습니다.");
    
    const now = new Date();
    const pickupDate = order.pickupDate?.toDate();
    if (pickupDate && now >= pickupDate) {
      throw new Error("픽업이 시작된 주문은 취소할 수 없습니다.");
    }

    // 재고를 복구할 상품들의 참조와 데이터를 미리 읽어옵니다.
    const productRefs = [...new Set(order.items.map(item => item.productId))].map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    
    const productDataMap = new Map<string, Product>();
    for (const productSnap of productSnaps) {
        if (productSnap.exists()) {
            productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() } as Product);
        }
    }

    // --- 2. WRITE PHASE ---
    // 모든 쓰기 작업을 읽기 작업 후에 수행합니다.

    // 주문 상태를 'CANCELED'로 변경
    transaction.update(orderRef, { status: 'CANCELED' });

    // 각 상품의 재고를 복구
    for (const item of order.items) {
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

        if (variantGroup.totalPhysicalStock !== null && variantGroup.totalPhysicalStock !== -1) {
            variantGroup.totalPhysicalStock += item.quantity;
        }
        if (productItem.stock !== -1) {
            productItem.stock += item.quantity;
        }

        const productRef = doc(db, 'products', item.productId);
        transaction.update(productRef, { salesHistory: newSalesHistory });
    }
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
 * @description 전화번호 뒷자리로 주문을 검색합니다. (주로 관리자용)
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
 * @description 특정 주문의 상태를 업데이트합니다. (주로 관리자용)
 */
export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { status });
};

/**
 * @description 현재 예약중인 모든 상품의 수량을 가져옵니다.
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
