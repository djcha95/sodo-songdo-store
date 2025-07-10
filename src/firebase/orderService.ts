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

const getAlreadyReservedQuantities = async (productIds: string[]): Promise<Map<string, number>> => {
  const reservedQuantities = new Map<string, number>();
  if (productIds.length === 0) {
    return reservedQuantities;
  }
  const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PICKED_UP']));
  
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach(orderDoc => {
    const order = orderDoc.data() as Order;
    order.items.forEach(item => {
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
      const productData = productDataMap.get(item.productId)!;
      const salesRound = productData.salesHistory.find(r => r.roundId === item.roundId);
      const variantGroup = salesRound?.variantGroups.find(vg => vg.id === item.variantGroupId);
      
      if (!salesRound || !variantGroup) {
        throw new Error(`판매 정보를 찾을 수 없습니다: ${item.productName}`);
      }

      // ✅ [개선] 생성될 OrderItem에 deadlineDate를 추가하기 위해 여기서 할당
      const deadlineDate = salesRound.deadlineDate;

      const totalPhysicalStock = variantGroup.totalPhysicalStock;
      
      let availableStock = Infinity;
      if (totalPhysicalStock !== null && totalPhysicalStock !== -1) {
        const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const alreadyReserved = reservedQuantitiesMap.get(key) || 0;
        availableStock = totalPhysicalStock - alreadyReserved;
      }

      const quantityToReserve = Math.max(0, Math.min(item.quantity, availableStock));
      const quantityToWaitlist = item.quantity - quantityToReserve;

      if (quantityToReserve > 0) {
        // ✅ [개선] deadlineDate를 예약 아이템에 포함시킵니다.
        itemsToReserve.push({ ...item, quantity: quantityToReserve, deadlineDate });
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

/**
 * ✨ [신규] 예약을 취소하는 함수
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

    // 1. 본인의 주문이 맞는지, '예약 확정' 상태인지 확인
    if (order.userId !== userId) {
      throw new Error("본인의 주문만 취소할 수 있습니다.");
    }
    if (order.status !== 'RESERVED') {
      throw new Error("예약 확정 상태의 주문만 취소할 수 있습니다.");
    }

    // 2. 취소 정책 확인 (마감 2시간 전까지만 가능)
    const firstItem = order.items[0];
    if (!firstItem || !firstItem.deadlineDate) {
        // 마감일 정보가 없는 레거시 주문 데이터는 일단 취소 가능하도록 처리
        // 혹은 throw new Error("주문의 마감일 정보를 찾을 수 없어 취소가 불가능합니다."); 와 같이 처리 가능
    } else {
      const deadline = firstItem.deadlineDate.toDate();
      const now = new Date();
      const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilDeadline < 2) {
        throw new Error("취소 불가: 마감 2시간 전에는 예약을 취소할 수 없습니다.");
      }
    }

    // 3. 주문 상태를 'CANCELED'로 변경
    transaction.update(orderRef, { status: 'CANCELED' });
    
    // 참고: 재고 복구 로직은 현재 포함되지 않았습니다.
    // 필요 시, 취소된 상품의 수량만큼 'products' 컬렉션의 재고를 다시 늘려주는 로직을 여기에 추가할 수 있습니다.
  });
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
