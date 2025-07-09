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
} from 'firebase/firestore';
import type { Order, OrderStatus, OrderItem, Product } from '@/types';

/**
 * @description 새로운 주문을 생성하고, 트랜잭션 내에서 실시간 재고를 확인하고 예약을 확정합니다.
 * @param orderData 'id', 'createdAt' 등이 제외된 순수 주문 데이터
 * @returns 생성된 주문의 ID
 */
export const submitOrder = async (orderData: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>): Promise<string> => {
  const newOrderRef = doc(collection(db, 'orders'));
  
  await runTransaction(db, async (transaction) => {
    // 1. 주문에 포함된 각 상품에 대해 실시간 재고 확인
    for (const item of orderData.items) {
      const productRef = doc(db, 'products', item.productId);
      const productDoc = await transaction.get(productRef);

      if (!productDoc.exists()) {
        throw new Error(`주문 처리 중 상품을 찾을 수 없습니다: ${item.productName}`);
      }

      const productData = productDoc.data() as Product;
      const salesRound = productData.salesHistory.find(r => r.roundId === item.roundId);
      const variantGroup = salesRound?.variantGroups.find(vg => vg.id === item.variantGroupId);
      
      if (!salesRound || !variantGroup) {
        throw new Error(`판매 정보를 찾을 수 없습니다: ${item.productName}`);
      }

      const totalPhysicalStock = variantGroup.totalPhysicalStock;

      if (totalPhysicalStock === null || totalPhysicalStock === -1) {
        continue;
      }

      const ordersQuery = query(
        collection(db, 'orders'),
        where('items', 'array-contains-any', [
          { 
            productId: item.productId, 
            roundId: item.roundId, 
            variantGroupId: item.variantGroupId,
            itemId: item.itemId,
          }
        ]),
        where('status', 'in', ['RESERVED', 'PICKED_UP', 'COMPLETED'])
      );
      
      const existingOrdersSnap = await getDocs(ordersQuery);
      
      let totalOrderedQuantity = 0;
      existingOrdersSnap.forEach(orderDoc => {
        const order = orderDoc.data() as Order;
        order.items.forEach((orderedItem: OrderItem) => {
          if (
            orderedItem.productId === item.productId &&
            orderedItem.roundId === item.roundId &&
            orderedItem.variantGroupId === item.variantGroupId
          ) {
            totalOrderedQuantity += orderedItem.quantity;
          }
        });
      });
      
      const availableStock = totalPhysicalStock - totalOrderedQuantity;

      if (availableStock < item.quantity) {
        throw new Error(`죄송합니다. '${item.productName}'의 재고가 부족합니다. (현재 ${availableStock}개 구매 가능)`);
      }
    }

    const orderNumber = `SODOMALL-${Date.now()}`;
    const newOrderData = {
      ...orderData,
      orderNumber,
      status: 'RESERVED' as OrderStatus,
      createdAt: serverTimestamp(),
    };
    transaction.set(newOrderRef, newOrderData);
  });

  return newOrderRef.id;
};


/**
 * 특정 사용자의 모든 주문 목록을 가져옵니다.
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
 * 휴대폰 번호로 주문을 검색합니다.
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
 * 특정 주문의 상태를 업데이트합니다.
 */
export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { status });
};

/**
 * ✅ [수정] 누락되었던 함수를 다시 추가합니다.
 * '예약' 상태인 모든 상품의 총수량을 계산합니다. (대시보드 등에서 사용)
 * @returns 각 상품 옵션별 예약된 수량을 담은 객체 (키: '상품ID_회차ID_아이템ID')
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
