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

    if (publishDay === 6) { 
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

export const determineActionState = (round: SalesRound, userDocument: UserDocument | null): ProductActionState => {
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  if (round.status === 'ended' || round.status === 'sold_out') {
    return 'ENCORE_REQUESTABLE';
  }
  
  const isAllVariantsSoldOut = round.variantGroups.length > 0 && round.variantGroups.every(vg => {
      const totalStock = vg.totalPhysicalStock;
      if (totalStock === null || totalStock === -1) return false;
      const reserved = vg.reservedCount || 0;
      return totalStock - reserved <= 0;
  });

  if (isAllVariantsSoldOut) {
      const now = dayjs();
      const { primaryEnd } = getDeadlines(round);
      if (primaryEnd && now.isBefore(primaryEnd)) return 'WAITLISTABLE';
      return 'ENCORE_REQUESTABLE';
  }
  
  const now = dayjs();
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  if (round.status === 'scheduled') {
      const publishAtDate = safeToDate(round.publishAt);
      if(publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
      }
  }

  // [수정] 여러 구매 옵션(items)이 있는 경우를 명확하게 감지
  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items?.length ?? 0) > 1;

  if (primaryEnd && now.isBefore(primaryEnd)) {
    const isAnyVgSoldOut = round.variantGroups.some(vg => {
        const totalStock = vg.totalPhysicalStock;
        if (totalStock === null || totalStock === -1) return false;
        return (totalStock - (vg.reservedCount || 0)) <= 0;
    });

    if (isAnyVgSoldOut) return 'WAITLISTABLE';
    
    return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
  }

  if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, '[]')) {
    const isAnyVgAvailable = round.variantGroups.some(vg => {
        const totalStock = vg.totalPhysicalStock;
        if (totalStock === null || totalStock === -1) return false; // 무제한 재고는 2차 판매 안함
        return (totalStock - (vg.reservedCount || 0)) > 0;
    });

    if (isAnyVgAvailable) {
        return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
    }
    
    const hasInfiniteStock = round.variantGroups.some(vg => vg.totalPhysicalStock === null || vg.totalPhysicalStock === -1);
    if (hasInfiniteStock) {
        return 'AWAITING_STOCK';
    }

    return 'ENCORE_REQUESTABLE';
  }

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