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

      // 물리적 총재고가 설정되지 않았거나 무제한(-1)이면 재고 체크를 건너뜁니다.
      if (totalPhysicalStock === null || totalPhysicalStock === -1) {
        continue; // 다음 아이템으로 넘어감
      }

      // 2. 'orders' 컬렉션에서 해당 상품 옵션이 포함된 모든 유효한 주문을 조회합니다.
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
        // '예약 완료', '픽업 완료', '구매 확정' 상태의 주문만 재고 계산에 포함
        where('status', 'in', ['RESERVED', 'PICKED_UP', 'COMPLETED'])
      );
      
      const existingOrdersSnap = await getDocs(ordersQuery);
      
      let totalOrderedQuantity = 0;
      existingOrdersSnap.forEach(orderDoc => {
        const order = orderDoc.data() as Order;
        order.items.forEach((orderedItem: OrderItem) => {
          // 동일한 상품 옵션에 대한 수량을 누적합니다.
          if (
            orderedItem.productId === item.productId &&
            orderedItem.roundId === item.roundId &&
            orderedItem.variantGroupId === item.variantGroupId
          ) {
            totalOrderedQuantity += orderedItem.quantity;
          }
        });
      });
      
      // 3. 실제 구매 가능한 재고를 계산합니다.
      const availableStock = totalPhysicalStock - totalOrderedQuantity;

      // 4. 현재 주문하려는 수량이 구매 가능한 재고보다 많은지 확인합니다.
      if (availableStock < item.quantity) {
        // 재고 부족 시, 트랜잭션을 중단하고 사용자에게 명확한 오류 메시지를 보냅니다.
        throw new Error(`죄송합니다. '${item.productName}'의 재고가 부족합니다. (현재 ${availableStock}개 구매 가능)`);
      }
    }

    // 5. 모든 상품의 재고가 충분함을 확인한 후, 주문 문서를 생성합니다.
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