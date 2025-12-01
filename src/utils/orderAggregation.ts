// src/utils/orderAggregation.ts

import { Order, AggregatedOrderGroup, UniversalTimestamp } from '@/shared/types';

/**
 * 주문 목록을 받아 '동일 상품 + 동일 옵션 + 동일 픽업일' 기준으로 묶어 반환합니다.
 * 백엔드에서 이미 병합된 주문은 그대로 유지되며, 과거 분리된 주문들은 시각적으로 합쳐집니다.
 */
export const aggregateOrders = (orders: Order[]): AggregatedOrderGroup[] => {
  const groupsMap = new Map<string, AggregatedOrderGroup>();

  orders.forEach((order) => {
    // 취소된 주문은 집계에서 제외하려면 아래 주석 해제 (운영 정책에 따라 결정)
    // if (order.status === 'CANCELED' || order.status === 'NO_SHOW') return;

    if (!order.items || order.items.length === 0) return;

    // ⚠️ [Future Debt] 현재 시스템은 Order 1개당 Item 1개라고 가정합니다.
    // 추후 장바구니/합배송 등으로 한 주문에 여러 상품이 담기는 구조가 되면
    // 여기서 order.items를 순회하도록 로직 수정이 필요합니다.
    const item = order.items[0]; 

    // 날짜 비교를 위한 키 생성 (Timestamp 객체 처리)
    const pickupDateMillis = toMillis(order.pickupDate);
    
    // ✅ 그룹 키: 상품ID + 회차ID + 옵션ID + 픽업날짜
    // 이 키가 같으면 화면상에서 하나의 카드로 뭉칩니다.
    const groupKey = `${item.productId}_${item.roundId}_${item.variantGroupId}_${pickupDateMillis}`;

    // 💰 가격 계산: 
    // 주문 전체의 totalPrice가 아니라, 해당 아이템의 '단가 * 수량'을 사용합니다.
    // (쿠폰/배송비 등이 포함된 order.totalPrice와 구분하여, 순수 상품 금액 합계를 보여주기 위함)
    const itemTotalPrice = item.unitPrice * item.quantity;

    if (groupsMap.has(groupKey)) {
      // 이미 그룹이 존재하면 수량과 가격을 합산 (Legacy Data 호환)
      const existingGroup = groupsMap.get(groupKey)!;
      existingGroup.totalQuantity += item.quantity;
      existingGroup.totalPrice += itemTotalPrice; 
      existingGroup.originalOrders.push({
        orderId: order.id,
        quantity: item.quantity,
        status: order.status
      });
    } else {
      // 새로운 그룹 생성
      groupsMap.set(groupKey, {
        groupKey,
        customerInfo: order.customerInfo,
        item: { ...item }, // 아이템 정보 복사
        totalQuantity: item.quantity,
        totalPrice: itemTotalPrice,
        status: order.status, // 그룹의 대표 상태 (보통 첫 번째 주문 상태)
        pickupDate: order.pickupDate,
        pickupDeadlineDate: order.pickupDeadlineDate,
        originalOrders: [{
          orderId: order.id,
          quantity: item.quantity,
          status: order.status
        }]
      });
    }
  });

  return Array.from(groupsMap.values());
};

// 헬퍼: Timestamp나 Date를 밀리초 숫자로 변환
function toMillis(date: UniversalTimestamp | Date | null | undefined): number {
  if (!date) return 0;
  if (typeof date === 'number') return date;
  if (date instanceof Date) return date.getTime();
  if ('toMillis' in date && typeof date.toMillis === 'function') return date.toMillis(); // Firestore Admin
  if ('seconds' in date) return (date as any).seconds * 1000; // Firestore Client-like object
  return 0;
}