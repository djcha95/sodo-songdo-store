// src/firebase/orderService.ts

import { db } from './firebaseConfig';
import {
  collection,
  addDoc,
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
import type { Order, OrderStatus, OrderItem, Product, SalesRound, VariantGroup } from '@/types';
import type { DocumentData } from 'firebase/firestore';

/**
 * 새로운 주문을 생성하고, 관련된 모든 상품의 재고를 트랜잭션 내에서 안전하게 차감합니다.
 * @param orderData 'id', 'createdAt' 등이 제외된 순수 주문 데이터
 * @returns 생성된 주문의 ID
 */
export const submitOrder = async (orderData: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>): Promise<string> => {
  const newOrderRef = doc(collection(db, 'orders'));
  
  await runTransaction(db, async (transaction) => {
    // 1. 주문에 포함된 각 상품에 대해 재고 확인 및 차감 로직 실행
    for (const item of orderData.items) {
      const productRef = doc(db, 'products', item.productId);
      const productDoc = await transaction.get(productRef);

      if (!productDoc.exists()) {
        throw new Error(`주문 처리 중 상품을 찾을 수 없습니다: ${item.productName}`);
      }

      const productData = productDoc.data() as Product;
      const salesHistory = productData.salesHistory || [];
      
      let roundFound = false;
      // ✅ [개선] 'any' 타입 대신 명확한 타입을 사용하여 안정성 강화
      const newSalesHistory = salesHistory.map((round: SalesRound) => {
        if (round.roundId === item.roundId) {
          roundFound = true;
          const newVariantGroups = round.variantGroups.map((vg: VariantGroup) => {
            if (vg.id === item.variantGroupId) {
              const stockToDeduct = item.quantity; // 주문 수량만큼 재고 차감
              
              // 옵션별 재고 차감
              const newItems = vg.items.map(productItem => {
                if (productItem.id === item.itemId) {
                  if (productItem.stock !== -1 && productItem.stock < item.quantity) {
                    throw new Error(`재고 부족: ${item.productName} (${item.itemName})`);
                  }
                  productItem.stock -= item.quantity;
                }
                return productItem;
              });
              vg.items = newItems;

              // 그룹 전체 물리적 재고 차감 (설정된 경우)
              if (vg.totalPhysicalStock != null && vg.totalPhysicalStock !== -1) {
                if (vg.totalPhysicalStock < stockToDeduct) {
                  throw new Error(`물리적 재고 부족: ${item.productName} (${vg.groupName})`);
                }
                vg.totalPhysicalStock -= stockToDeduct;
              }
            }
            return vg;
          });
          round.variantGroups = newVariantGroups;
        }
        return round;
      });

      if (!roundFound) {
        throw new Error(`판매 정보를 찾을 수 없습니다: ${item.productName}`);
      }
      
      transaction.update(productRef, { salesHistory: newSalesHistory });
    }

    // 2. 모든 재고 차감이 성공하면 주문 문서 생성
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
 * 특정 사용자의 모든 주문 목록을 가져옵니다. (마이페이지 등에서 사용)
 * @param userId 사용자 ID
 * @returns 생성일 기준 내림차순으로 정렬된 사용자의 주문 목록
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
 * 휴대폰 번호로 주문을 검색합니다. (픽업 처리 페이지 등에서 사용)
 * @param phoneNumber 전체 또는 일부 휴대폰 번호
 * @returns 검색된 주문 목록
 */
export const searchOrdersByPhoneNumber = async (phoneNumber: string): Promise<Order[]> => {
  if (!phoneNumber || phoneNumber.length < 4) return [];
  const querySnapshot = await getDocs(collection(db, 'orders'));
  const allOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  
  // ✅ [개선] 전체 번호가 아닌 끝자리만으로도 검색할 수 있도록 endsWith 사용
  return allOrders.filter(order => 
    order.customerInfo?.phone?.endsWith(phoneNumber)
  );
};


/**
 * 특정 주문의 상태를 업데이트합니다. (관리자 페이지 등에서 사용)
 * @param orderId 주문 ID
 * @param status 새로운 주문 상태
 */
export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
  await updateDoc(doc(db, 'orders', orderId), { status });
};


/**
 * '예약' 상태인 모든 상품의 총수량을 계산합니다. (대시보드 등에서 사용)
 * @returns 각 상품 옵션별 예약된 수량을 담은 객체 (키: '상품ID_회차ID_아이템ID')
 */
export const getReservedQuantities = async (): Promise<Record<string, number>> => {
  const quantities: Record<string, number> = {};
  const q = query(collection(db, 'orders'), where('status', '==', 'RESERVED'));
  
  const querySnapshot = await getDocs(q);
  
  querySnapshot.forEach((doc: DocumentData) => {
    const order = doc.data() as Order;
    order.items.forEach((item: OrderItem) => {
      // ✅ [개선] 더 정확한 재고 추적을 위해 상품, 회차, 아이템 ID를 모두 조합한 키 사용
      const itemKey = `${item.productId}_${item.roundId}_${item.itemId}`;
      quantities[itemKey] = (quantities[itemKey] || 0) + item.quantity;
    });
  });
  
  return quantities;
};