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
    const publishDay = deadlineDate.day();

    if (publishDay === 5) { // 금요일
      deadlineDate = deadlineDate.add(3, 'day');
    } else if (publishDay === 6) { // 토요일
      deadlineDate = deadlineDate.add(2, 'day');
    } else {
      deadlineDate = deadlineDate.add(1, 'day');
    }
    
    primaryEnd = deadlineDate.hour(13).minute(0).second(0).millisecond(0).toDate();

  } else {
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

export const determineActionState = (round: SalesRound, userDocument: UserDocument | null, selectedVg?: VariantGroup | null): ProductActionState => {
  // 0. 등급 확인
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  // 1. DB에 명시된 상태를 최우선으로 확인
  if (round.status === 'ended' || round.status === 'sold_out') {
    return 'ENCORE_REQUESTABLE';
  }

  // ✅ [핵심 수정] 2. 재고 상태를 시간보다 먼저 확인 (Admin 페이지 로직과 일치)
  // 모든 옵션의 재고가 0 이하이면, 판매 기간과 상관없이 '매진'으로 우선 처리합니다.
  const isAllVariantsSoldOut = round.variantGroups.length > 0 && round.variantGroups.every(vg => {
      const totalStock = vg.totalPhysicalStock;
      if (totalStock === null || totalStock === -1) { // 무제한 재고는 매진이 아님
          return false;
      }
      const reserved = vg.reservedCount || 0;
      return totalStock - reserved <= 0;
  });

  if (isAllVariantsSoldOut) {
      const now = dayjs();
      const { primaryEnd } = getDeadlines(round);
      // 단, 1차 공구 기간에는 '대기' 상태를 허용
      if (primaryEnd && now.isBefore(primaryEnd)) {
          return 'WAITLISTABLE';
      }
      // 1차 공구 기간이 끝났으면 '앵콜 요청' (완전 마감)
      return 'ENCORE_REQUESTABLE';
  }
  
  // 3. 시간 및 기타 상태 확인
  const now = dayjs();
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  if (round.status === 'scheduled') {
      const publishAtDate = safeToDate(round.publishAt);
      if(publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
      }
  }

  const hasMultipleOptions = round.variantGroups.length > 1;
  const isOptionSelected = !!selectedVg;

  // 4. 1차 공구 기간 로직
  if (primaryEnd && now.isBefore(primaryEnd)) {
    if (hasMultipleOptions && !isOptionSelected) return 'REQUIRE_OPTION';
    
    const vg = selectedVg || round.variantGroups[0];
    if (vg) {
      const totalStock = vg.totalPhysicalStock;
      if (totalStock === null || totalStock === -1) return 'PURCHASABLE';
      
      const reserved = vg.reservedCount || 0;
      const isSoldOut = totalStock - reserved <= 0;
      // 여기서의 isSoldOut은 개별 옵션에 대한 것
      return isSoldOut ? 'WAITLISTABLE' : 'PURCHASABLE';
    }
    return 'ENDED';
  }

  // 5. 2차 공구 기간 로직
  if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, '[]')) {
    if (hasMultipleOptions && !isOptionSelected) return 'REQUIRE_OPTION';
    
    const vg = selectedVg || round.variantGroups[0];
    const totalStock = vg?.totalPhysicalStock;

    if (totalStock === null || totalStock === -1) return 'AWAITING_STOCK'; 
    
    const reserved = vg.reservedCount || 0; 
    const isSoldOut = (totalStock || 0) - reserved <= 0;
    
    return isSoldOut ? 'ENCORE_REQUESTABLE' : 'PURCHASABLE';
  }

  // 6. 모든 판매 기간이 시간상으로 종료된 경우
  if ((secondaryEnd && now.isAfter(secondaryEnd)) || (primaryEnd && !secondaryEnd && now.isAfter(primaryEnd))) {
      return 'ENCORE_REQUESTABLE';
  }

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