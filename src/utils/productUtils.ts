// src/utils/productUtils.ts

import type {
  Product,
  SalesRound as OriginalSalesRound,
  UserDocument,
  VariantGroup as OriginalVariantGroup,
  LoyaltyTier,
} from '@/types';
import { Timestamp } from 'firebase/firestore';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);

export interface VariantGroup extends OriginalVariantGroup {
  reservedCount?: number;
}

export interface SalesRound extends OriginalSalesRound {
  variantGroups: VariantGroup[];
}

export type ProductActionState =
  | 'LOADING'
  | 'PURCHASABLE'
  | 'REQUIRE_OPTION' 
  | 'WAITLISTABLE'
  | 'ENCORE_REQUESTABLE'
  | 'SCHEDULED'
  | 'ENDED'
  | 'INELIGIBLE' 
  | 'AWAITING_STOCK';

export const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && (date._seconds !== undefined || date.seconds !== undefined)) {
    const seconds = date.seconds ?? date._seconds;
    const nanoseconds = date.nanoseconds ?? date._nanoseconds ?? 0;
    return new Timestamp(seconds, nanoseconds).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn('Unsupported date format:', date);
  return null;
};

export const getDeadlines = (round: OriginalSalesRound): { primaryEnd: Date | null, secondaryEnd: Date | null } => {
  const publishAt = safeToDate(round.publishAt);
  const pickupDate = safeToDate(round.pickupDate);

  let primaryEnd: Date | null = null;
  
  if (publishAt) {
    let deadlineDate = dayjs(publishAt);
    const publishDay = deadlineDate.day(); // Sunday=0, Monday=1, ..., Friday=5, Saturday=6

    // ✅ [수정] 금요일(5) 또는 토요일(6)에 게시되면 마감일은 다음 주 월요일 13시
    if (publishDay === 5) { // Friday -> Monday
      deadlineDate = deadlineDate.add(3, 'day'); 
    } else if (publishDay === 6) { // Saturday -> Monday
      deadlineDate = deadlineDate.add(2, 'day');
    } else { // 그 외 요일은 다음날
      deadlineDate = deadlineDate.add(1, 'day'); 
    }
    
    primaryEnd = deadlineDate.hour(13).minute(0).second(0).millisecond(0).toDate();

  } else {
    // publishAt이 없는 레거시 데이터용 폴백
    primaryEnd = safeToDate(round.deadlineDate);
  }
  
  const secondaryEnd = pickupDate 
    ? dayjs(pickupDate).hour(13).minute(0).second(0).toDate()
    : null;
    
  return { primaryEnd, secondaryEnd };
};


export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;
  const now = dayjs();

  const getPhasePriority = (round: OriginalSalesRound): number => {
    const publishAt = safeToDate(round.publishAt);
    if (round.status === 'selling') return 1; 
    if (round.status === 'scheduled' && publishAt && now.isSameOrAfter(publishAt)) return 2;
    if (round.status === 'scheduled' && publishAt && now.isBefore(publishAt)) return 3; 
    if (round.status === 'ended' || round.status === 'sold_out') return 4; 
    return 5; 
  };

  const sortedHistory = [...product.salesHistory]
    .filter(r => r.status !== 'draft') 
    .sort((a, b) => {
      const priorityA = getPhasePriority(a);
      const priorityB = getPhasePriority(b);
      
      if (priorityA !== priorityB) return priorityA - priorityB;

      switch (priorityA) {
        case 1: 
        case 2: 
          return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
        case 3: 
          return (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0);
        case 4: 
          return (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0);
        default:
          return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
      }
    });

  return sortedHistory[0] || null;
};

// ✅ [수정] 전체 로직을 요청하신 규칙에 맞게 재작성했습니다.
export const determineActionState = (round: SalesRound, userDocument: UserDocument | null, selectedVg?: VariantGroup | null): ProductActionState => {
  // 0. 등급 확인
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  // 1. 시간 및 상태 확인
  const now = dayjs();
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  if (round.status === 'scheduled') {
      const publishAtDate = safeToDate(round.publishAt);
      if(publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
      }
  }
  
  // 2. 옵션 선택 필요 여부 확인
  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items.length || 0) > 1;
  const isOptionSelected = !!selectedVg;
  
  // =========================================================
  // 3. 1차 공구 기간 로직 ( ~ primaryEnd)
  // =========================================================
  if (primaryEnd && now.isBefore(primaryEnd)) {
    if (hasMultipleOptions && !isOptionSelected) {
      return 'REQUIRE_OPTION';
    }
    
    // 1차 공구에서는 한정수량 품절 시 '대기' 상태가 됨
    let isSoldOut = false;
    const vg = selectedVg || round.variantGroups[0];
    if (vg) {
      const totalStock = vg.totalPhysicalStock;
      if (totalStock !== null && totalStock !== -1) { // 한정 수량일 경우에만 품절 체크
        const reserved = vg.reservedCount || 0;
        if (totalStock - reserved <= 0) {
          isSoldOut = true;
        }
      }
    }
    return isSoldOut ? 'WAITLISTABLE' : 'PURCHASABLE';
  }

  // =========================================================
  // 4. 2차 공구 기간 로직 (primaryEnd ~ secondaryEnd)
  // =========================================================
  if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, '[]')) {
    if (hasMultipleOptions && !isOptionSelected) {
      return 'REQUIRE_OPTION';
    }
    
    // 2차 공구에서는 모든 제품이 한정수량으로 취급됨.
    const vg = selectedVg || round.variantGroups[0];
    const totalStock = vg?.totalPhysicalStock;

    // 2차인데 무제한 재고로 잘못 설정된 경우, '재고 준비중'으로 표시.
    if (totalStock === null || totalStock === -1) {
      return 'AWAITING_STOCK'; 
    }
    
    // 2차에서는 품절 시 '대기' 없이 바로 마감 (앵콜 요청 가능 상태로)
    const reserved = vg.reservedCount || 0; 
    const isSoldOut = (totalStock || 0) - reserved <= 0;
    
    return isSoldOut ? 'ENCORE_REQUESTABLE' : 'PURCHASABLE';
  }

  // =========================================================
  // 5. 모든 판매 기간이 종료된 경우
  // =========================================================
  if (round.status === 'ended' || round.status === 'sold_out' || (secondaryEnd && now.isAfter(secondaryEnd)) || (primaryEnd && !secondaryEnd && now.isAfter(primaryEnd))) {
      return 'ENCORE_REQUESTABLE';
  }

  // 위 모든 경우에 해당하지 않는 기본 마감 상태
  return 'ENDED';
};


export const sortProductsForDisplay = (a: { displayRound: SalesRound }, b: { displayRound: SalesRound }): number => {
    const roundA = a.displayRound;
    const roundB = b.displayRound;

    const vgA = roundA.variantGroups?.[0];
    const vgB = roundB.variantGroups?.[0];
    const itemA = vgA?.items?.[0];
    const itemB = vgB?.items?.[0];

    if (!vgA || !itemA) return 1;
    if (!vgB || !itemB) return -1;

    const isLimitedA = vgA.totalPhysicalStock !== null && vgA.totalPhysicalStock !== -1;
    const remainingStockA = isLimitedA ? (vgA.totalPhysicalStock || 0) - (vgA.reservedCount || 0) : Infinity;
    const priceA = itemA.price;

    const isLimitedB = vgB.totalPhysicalStock !== null && vgB.totalPhysicalStock !== -1;
    const remainingStockB = isLimitedB ? (vgB.totalPhysicalStock || 0) - (vgB.reservedCount || 0) : Infinity;
    const priceB = itemB.price;

    if (isLimitedA && !isLimitedB) return -1;
    if (!isLimitedA && isLimitedB) return 1;

    if (isLimitedA && isLimitedB) {
        if (remainingStockA !== remainingStockB) {
            return remainingStockA - remainingStockB;
        }
    }

    if (priceA !== priceB) {
        return priceB - priceA;
    }

    return 0;
};