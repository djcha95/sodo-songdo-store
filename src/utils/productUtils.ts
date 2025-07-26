// src/utils/productUtils.ts

import type { Product, SalesRound, UserDocument, ProductItem, VariantGroup } from '@/types';
import { Timestamp } from 'firebase/firestore';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

// ✅ [통합] 모든 컴포넌트에서 사용할 상품 상태 타입을 여기서 정의합니다.
export type ProductActionState = 
  | 'LOADING' 
  | 'PURCHASABLE'         // 구매 가능
  | 'REQUIRE_OPTION'      // (카드용) 옵션 선택 필요
  | 'WAITLISTABLE'        // 대기 가능
  | 'ENCORE_REQUESTABLE'  // 앵콜 요청 가능
  | 'SCHEDULED'           // 판매 예정
  | 'ENDED'               // 판매 종료
  | 'INELIGIBLE'          // 참여 등급 아님
  | 'AWAITING_STOCK';     // (카드용) 재고 준비중 (추가 공구)

export const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn("Unsupported date format:", date);
  return null;
};

/**
 * @description 고객에게 표시할 가장 적절한 판매 회차를 결정하는 통합 함수
 * 우선순위: 1. 현재 판매중 2. 곧 판매 시작될 예정 3. 가장 최근에 종료된 순
 */
export const getDisplayRound = (product: Product): SalesRound | null => {
    if (!product.salesHistory || product.salesHistory.length === 0) return null;

    const now = new Date();
    const sellingRounds = product.salesHistory.filter(r => r.status === 'selling');
    if (sellingRounds.length > 0) {
        return sellingRounds.sort((a, b) => (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0))[0];
    }
    const nowSellingScheduled = product.salesHistory
        .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! <= now)
        .sort((a, b) => (safeToDate(b.publishAt)?.getTime() ?? 0) - (safeToDate(a.publishAt)?.getTime() ?? 0));
    if (nowSellingScheduled.length > 0) return nowSellingScheduled[0];
    const futureScheduledRounds = product.salesHistory
        .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! > now)
        .sort((a, b) => (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0));
    if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];
    const pastRounds = product.salesHistory
        .filter(r => r.status === 'ended' || r.status === 'sold_out')
        .sort((a, b) => (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0));
    if (pastRounds.length > 0) return pastRounds[0];
    const nonDraftRounds = product.salesHistory
        .filter(r => r.status !== 'draft')
        .sort((a, b) => (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0));
    return nonDraftRounds[0] || null;
};


/**
 * @description 상품, 판매회차, 사용자 정보를 기반으로 현재 상품의 액션 상태를 결정하는 통합 함수
 * @returns {ProductActionState} 현재 상품의 상태
 */
// src/utils/productUtils.ts

// src/utils/productUtils.ts

export const determineActionState = (
    round: SalesRound,
    product: Product,
    userDocument: UserDocument | null,
    selectedItem?: ProductItem | null,
    selectedVg?: VariantGroup
): ProductActionState => {
    const userTier = userDocument?.loyaltyTier;
    const allowedTiers = round.allowedTiers || [];
    if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier))) {
        return 'INELIGIBLE';
    }

    const now = dayjs();
    const publishAtDate = safeToDate(round.publishAt);
    if (round.status === 'scheduled' && publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
    }

    const primaryEndDate = safeToDate(round.deadlineDate);
    const pickupDate = safeToDate(round.pickupDate);
    const finalSaleDeadline = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0) : null;
    
    if (finalSaleDeadline && now.isAfter(finalSaleDeadline)) {
        return 'ENDED';
    }
    
    if (primaryEndDate && now.isAfter(primaryEndDate) && finalSaleDeadline && now.isBefore(finalSaleDeadline)) {
        const stockNotSet = round.variantGroups.every(vg => vg.totalPhysicalStock === null);
        if (stockNotSet) {
            return 'AWAITING_STOCK';
        }
    }

    // ▼▼▼▼▼ [수정] 재고 계산 로직 수정 ▼▼▼▼▼
    let isSoldOut: boolean;

    if (selectedVg && selectedItem) {
      // 옵션이 선택된 경우 (상세 페이지 등)
      const reservedKey = `${product.id}-${round.roundId}-${selectedVg.id}`;
      const reserved = product.reservedQuantities?.[reservedKey] || 0;
      const totalStock = selectedVg.totalPhysicalStock;
      const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : totalStock - reserved;
      isSoldOut = remainingStock < selectedItem.stockDeductionAmount;
    } else {
      // 옵션이 선택되지 않은 경우 (그룹 상품 카드)
      // '모든' 하위 옵션이 품절 상태여야만 전체 품절로 간주합니다.
      isSoldOut = round.variantGroups.every(vg => {
        const stock = vg.totalPhysicalStock;
        // 재고 미설정(null) 또는 무제한(-1)이면 품절이 아닙니다.
        if (stock === null || stock === -1) return false; 
        
        const reservedKey = `${product.id}-${round.roundId}-${vg.id}`;
        const reserved = product.reservedQuantities?.[reservedKey] || 0;
        
        // 남은 재고가 0 이하면 품절입니다.
        return stock - reserved <= 0;
      });
    }
    // ▲▲▲▲▲ [수정] 재고 계산 로직 수정 끝 ▲▲▲▲▲

    const isActuallySelling = round.status === 'selling' || (round.status === 'scheduled' && publishAtDate && now.isAfter(publishAtDate));

    if (isActuallySelling) {
        if (!isSoldOut) {
            return 'PURCHASABLE';
        } else {
            const today1pm = now.clone().hour(13).minute(0).second(0);
            const salesStart = now.isBefore(today1pm) ? today1pm.subtract(1, 'day') : today1pm;
            const salesEnd = salesStart.add(1, 'day');
            const createdAt = dayjs(safeToDate(round.createdAt));
            const isTodaysProduct = createdAt.isBetween(salesStart, salesEnd, null, '[)');
            
            if (isTodaysProduct) {
                return 'WAITLISTABLE';
            } else {
                return 'ENCORE_REQUESTABLE';
            }
        }
    }

    if (round.status === 'ended' || round.status === 'sold_out') {
        return 'ENCORE_REQUESTABLE';
    }

    return 'ENDED';
};