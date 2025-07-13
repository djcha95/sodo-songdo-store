// src/firebase/orderService.ts
import { getUserDocById } from './userService'; // ✅ userService에서 import 추가
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
} from 'firebase/firestore';
import type { FieldValue } from 'firebase/firestore';
// ✅ [수정] 사용하지 않는 WaitlistItem 타입 제거
import type { Order, OrderStatus, OrderItem, Product, SalesRound, WaitlistEntry } from '@/types'; // 타입 추가
import { Timestamp } from 'firebase/firestore'; // Timestamp 추가


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
    orderId: newOrderId 
  };
};

/**
 * @description 사용자의 예약을 취소하고, 상품 재고를 복구하는 함수
 */
export const cancelOrder = async (orderId: string, userId: string): Promise<void> => {
  const orderRef = doc(db, 'orders', orderId);

  await runTransaction(db, async (transaction) => {
    // --- 1. READ PHASE ---
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) throw new Error("주문 정보를 찾을 수 없습니다.");
    const order = orderDoc.data() as Order;

    if (order.userId !== userId) throw new Error("본인의 주문만 취소할 수 있습니다.");
    if (order.status !== 'RESERVED' && order.status !== 'PREPAID') {
        throw new Error("예약 또는 결제 완료 상태의 주문만 취소할 수 있습니다.");
    }
    
    const now = new Date();
    const pickupDate = order.pickupDate?.toDate();
    if (pickupDate && now >= pickupDate) throw new Error("픽업이 시작된 주문은 취소할 수 없습니다.");

    const productRefs = [...new Set(order.items.map(item => item.productId))].map(id => doc(db, 'products', id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    
    const productDataMap = new Map<string, Product>();
    for (const productSnap of productSnaps) {
        if (productSnap.exists()) {
            productDataMap.set(productSnap.id, { id: productSnap.id, ...productSnap.data() } as Product);
        }
    }

    // --- 2. WRITE PHASE ---
    transaction.update(orderRef, { status: 'CANCELED' });

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
 * @description 특정 주문의 상태를 업데이트하고, 픽업 시각을 기록합니다.
 * @param orderId - 주문 ID
 * @param status - 새로운 주문 상태
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
        const updateData: { status: OrderStatus; pickedUpAt?: FieldValue } = { status };

        if (status === 'PICKED_UP') {
            updateData.pickedUpAt = serverTimestamp();
        }
        batch.update(orderRef, updateData);
    });

    await batch.commit();
}

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

/**
 * @description 대기 목록 항목으로부터 새로운 주문을 생성합니다. (트랜잭션 내부에서만 호출)
 */
export const submitOrderFromWaitlist = async (
  transaction: any, // Firestore Transaction
  waitlistEntry: WaitlistEntry,
  product: Product,
  round: SalesRound
): Promise<void> => {
    const { userId, quantity, variantGroupId, itemId } = waitlistEntry; // ✅ variantGroupId, itemId 사용
    
    // ✅ [수정] 정확한 옵션 정보 찾기
    const vg = round.variantGroups.find(v => v.id === variantGroupId);
    const itemDetail = vg?.items.find(i => i.id === itemId);

    if (!vg || !itemDetail) {
        // 해당 옵션을 찾을 수 없으면 주문을 생성하지 않고 오류를 발생시켜 트랜잭션을 중단
        throw new Error(`주문 전환 실패: 상품(${product.groupName})의 옵션(ID: ${itemId})을 찾을 수 없습니다.`);
    }

    const userDoc = await getUserDocById(userId); // ✅ 사용자 정보 조회

    const newOrderRef = doc(collection(db, 'orders'));
    const orderData: Omit<Order, 'id'> = {
        userId,
        orderNumber: `SODOMALL-W-${Date.now()}`,
        items: [{
            productId: product.id,
            productName: product.groupName,
            imageUrl: product.imageUrls[0] || '',
            roundId: round.roundId,
            roundName: round.roundName,
            variantGroupId: vg.id, // ✅ 정확한 정보 사용
            variantGroupName: vg.groupName,
            itemId: itemDetail.id, // ✅ 정확한 정보 사용
            itemName: itemDetail.name,
            quantity,
            unitPrice: itemDetail.price,
            stock: itemDetail.stock,
            deadlineDate: round.deadlineDate,
            pickupDate: round.pickupDate,
        }],
        totalPrice: itemDetail.price * quantity,
        status: 'RESERVED',
        createdAt: serverTimestamp(),
        pickupDate: round.pickupDate,
        // ✅ [수정] 실제 사용자 정보로 customerInfo 채우기
        customerInfo: { 
            name: userDoc?.displayName || '알 수 없음', 
            phone: userDoc?.phone || '' 
        },
        notes: '대기 신청에서 자동으로 전환된 주문입니다.',
    };

    transaction.set(newOrderRef, orderData);
};