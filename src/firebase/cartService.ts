// src/firebase/cartService.ts

import { db } from './firebaseConfig';
import {
  collection,
  doc,
  runTransaction,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import type { CartItem, Product, Order, OrderItem } from '@/types';

/**
 * @description 실시간 재고를 확인하고 장바구니에 아이템을 추가하는 트랜잭션 함수
 * @param userId 사용자의 UID
 * @param cartItem 장바구니에 추가할 아이템 정보
 */
export const addCartItemWithStockCheck = async (userId: string, cartItem: CartItem) => {
  const productRef = doc(db, 'products', cartItem.productId);
  const cartRef = doc(db, 'users', userId, 'cart', cartItem.itemId);

  try {
    await runTransaction(db, async (transaction) => {
      // 1. 최신 상품 정보 가져오기
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) {
        throw new Error("상품 정보를 찾을 수 없습니다.");
      }
      const product = productSnap.data() as Product;

      // 2. 현재 판매 회차 및 옵션 그룹 정보 찾기
      const salesRound = product.salesHistory.find(r => r.roundId === cartItem.roundId);
      if (!salesRound) {
        throw new Error("진행중인 판매 회차가 아닙니다.");
      }
      const variantGroup = salesRound.variantGroups.find(vg => vg.id === cartItem.variantGroupId);
      if (!variantGroup) {
        throw new Error("상품 옵션을 찾을 수 없습니다.");
      }
      const totalPhysicalStock = variantGroup.totalPhysicalStock;

      // 물리적 총재고가 설정되지 않았거나 무제한(-1)이면 체크하지 않음
      if (totalPhysicalStock === null || totalPhysicalStock === -1) {
        // 재고 체크가 필요 없으므로 바로 장바구니에 추가
        transaction.set(cartRef, { ...cartItem, createdAt: serverTimestamp() });
        return;
      }

      // 3. 'orders' 컬렉션에서 이미 주문된 수량 계산
      const ordersQuery = query(
        collection(db, 'orders'),
        where('items', 'array-contains-any', [
          // 다양한 조건으로 주문된 상품을 찾기 위한 쿼리 배열 (필요에 따라 확장)
          { productId: cartItem.productId, roundId: cartItem.roundId, itemId: cartItem.itemId }
        ]),
        where('status', 'in', ['RESERVED', 'PICKED_UP', 'COMPLETED']) // 취소/노쇼가 아닌 주문만
      );
      
      const orderDocs = await getDocs(ordersQuery);
      let totalOrderedQuantity = 0;
      orderDocs.forEach(orderDoc => {
        const order = orderDoc.data() as Order;
        order.items.forEach((item: OrderItem) => {
          if (item.productId === cartItem.productId && item.roundId === cartItem.roundId && item.variantGroupId === cartItem.variantGroupId) {
            totalOrderedQuantity += item.quantity;
          }
        });
      });
      
      // 4. 실제 구매 가능한 재고 계산
      const availableStock = totalPhysicalStock - totalOrderedQuantity;

      // 5. 재고 확인 및 장바구니 추가
      if (availableStock >= cartItem.quantity) {
        // TODO: 장바구니에 담는 로직을 여기에 구현합니다.
        // 현재는 users/{userId}/cart/{itemId} 에 덮어쓰는 방식으로 구현합니다.
        // 기존에 담겨있던 상품에 수량을 더하고 싶다면 transaction.get(cartRef) 로직이 추가되어야 합니다.
        transaction.set(cartRef, { ...cartItem, createdAt: serverTimestamp() });
      } else {
        // 재고 부족 시 에러 발생
        throw new Error(`죄송합니다. 재고가 부족합니다. (남은 수량: ${availableStock}개)`);
      }
    });
  } catch (error) {
    console.error("장바구니 추가 중 오류:", error);
    // 트랜잭션 외부로 에러를 다시 던져서 컴포넌트에서 처리할 수 있도록 함
    throw error;
  }
};
