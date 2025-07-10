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

// ✅ [추가] 현재 예약된 총수량을 계산하는 헬퍼 함수
const getAlreadyReservedQuantities = async (productIds: string[]): Promise<Map<string, number>> => {
  const reservedQuantities = new Map<string, number>();
  if (productIds.length === 0) {
    return reservedQuantities;
  }

  // 최적화를 위해 관련 상품 ID가 포함된 주문들만 가져오도록 시도할 수 있으나,
  // Firestore의 array-contains-any는 10개로 제한되므로, 모든 예약 주문을 가져와 클라이언트에서 필터링합니다.
  const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PICKED_UP']));
  
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach(orderDoc => {
    const order = orderDoc.data() as Order;
    order.items.forEach(item => {
      // 현재 확인하려는 상품 목록에 포함된 아이템만 계산
      if (productIds.includes(item.productId)) {
        const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const currentQty = reservedQuantities.get(key) || 0;
        reservedQuantities.set(key, currentQty + item.quantity);
      }
    });
  });
  return reservedQuantities;
};


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

  // ✅ [수정] 트랜잭션 시작 전에, 주문할 상품들의 현재 총 예약 수량을 미리 계산합니다.
  const productIds = [...new Set(orderData.items.map(item => item.productId))];
  const reservedQuantitiesMap = await getAlreadyReservedQuantities(productIds);

  await runTransaction(db, async (transaction) => {
    const productDataMap = new Map<string, Product>();
    
    // 1단계: 모든 상품 문서 읽기
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

    // 2단계: 메모리에서 재고 계산 및 분배
    for (const item of orderData.items) {
      const productData = productDataMap.get(item.productId)!;
      const salesRound = productData.salesHistory.find(r => r.roundId === item.roundId);
      const variantGroup = salesRound?.variantGroups.find(vg => vg.id === item.variantGroupId);
      
      if (!salesRound || !variantGroup) {
        throw new Error(`판매 정보를 찾을 수 없습니다: ${item.productName}`);
      }

      const totalPhysicalStock = variantGroup.totalPhysicalStock;
      
      let availableStock = Infinity;
      if (totalPhysicalStock !== null && totalPhysicalStock !== -1) {
        // ✅ [수정] 미리 계산해온 예약 수량을 사용하여 정확한 재고를 계산합니다.
        const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const alreadyReserved = reservedQuantitiesMap.get(key) || 0;
        availableStock = totalPhysicalStock - alreadyReserved;
      }

      const quantityToReserve = Math.max(0, Math.min(item.quantity, availableStock));
      const quantityToWaitlist = item.quantity - quantityToReserve;

      if (quantityToReserve > 0) {
        itemsToReserve.push({ ...item, quantity: quantityToReserve });
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

    // 3단계: 모든 쓰기 작업
    if (itemsToReserve.length > 0) {
      const newOrderRef = doc(collection(db, 'orders'));
      newOrderId = newOrderRef.id;
      const reservedTotalPrice = itemsToReserve.reduce((total, item) => total + (item.unitPrice * item.quantity), 0);
      
      const newOrderData = {
        ...orderData,
        items: itemsToReserve,
        totalPrice: reservedTotalPrice,
        orderNumber: `SODOMALL-${Date.now()}`,
        status: 'RESERVED' as OrderStatus,
        createdAt: serverTimestamp(),
      };
      transaction.set(newOrderRef, newOrderData);
      reservedItemCount = itemsToReserve.reduce((sum, item) => sum + item.quantity, 0);
    }
    
    if (itemsToWaitlist.length > 0) {
        const waitlistByProduct: Record<string, (WaitlistEntry & { roundId: string })[]> = {};
        for(const item of itemsToWaitlist) {
            if(!waitlistByProduct[item.productId]) {
                waitlistByProduct[item.productId] = [];
            }
            waitlistByProduct[item.productId].push(item);
        }
        
        for (const productId in waitlistByProduct) {
            const productRef = doc(db, 'products', productId);
            const productData = productDataMap.get(productId)!;
            const newSalesHistory = [...productData.salesHistory];

            for (const waitlistItem of waitlistByProduct[productId]) {
                const roundIndex = newSalesHistory.findIndex(r => r.roundId === waitlistItem.roundId);
                if (roundIndex !== -1) {
                    const newWaitlistEntry: WaitlistEntry = {
                        userId: waitlistItem.userId,
                        quantity: waitlistItem.quantity,
                        timestamp: waitlistItem.timestamp,
                    };
                    newSalesHistory[roundIndex].waitlist.push(newWaitlistEntry);
                    newSalesHistory[roundIndex].waitlistCount = (newSalesHistory[roundIndex].waitlistCount || 0) + waitlistItem.quantity;
                }
            }
            transaction.update(productRef, { salesHistory: newSalesHistory });
        }
    }
  });

  return { 
    reservedCount: reservedItemCount, 
    waitlistedItems: detailedWaitlistedItems,
    orderId: newOrderId 
  };
};

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

export const searchOrdersByPhoneNumber = async (phoneNumber: string): Promise<Order[]> => {
  if (!phoneNumber || phoneNumber.length < 4) return [];
  const querySnapshot = await getDocs(collection(db, 'orders'));
  const allOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  
  return allOrders.filter(order => 
    order.customerInfo?.phone?.endsWith(phoneNumber)
  );
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { status });
};

// 이 함수는 대시보드 등 다른 곳에서 전체 예약 수량을 보여줄 때 사용할 수 있습니다.
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