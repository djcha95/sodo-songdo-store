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
  // ✅ [수정] eventType이 null일 수 있는 가능성을 타입에 추가하여 오류를 해결합니다.
  eventType?: string | null; // eventType이 null도 허용하도록 변경
}


export interface StockInfo {
  isLimited: boolean;
  remainingUnits: number;
  unitPerBox: number;
}

export const getStockInfo = (vg: VariantGroup): StockInfo => {
  const totalStock = vg.totalPhysicalStock;
  const isLimited = totalStock !== null && totalStock !== -1;
  if (!isLimited) {
    return { isLimited: false, remainingUnits: Infinity, unitPerBox: 1 };
  }
  const reserved = vg.reservedCount || 0;
  const remainingUnits = Math.max(0, (totalStock || 0) - reserved);
  const units = (vg.items?.map(it => it.stockDeductionAmount || 1) || []);
  const allSame = units.length > 0 && units.every(u => u === units[0]);
  const unitPerBox = allSame && units[0] > 1 ? (units[0] || 1) : 1;
  return { isLimited: true, remainingUnits, unitPerBox };
};

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
  if (typeof date === 'object' && typeof date.seconds === 'number' && typeof date.nanoseconds === 'number') {
    return new Timestamp(date.seconds, date.nanoseconds).toDate();
  }
  if (typeof date === 'object' && typeof date._seconds === 'number' && typeof date._nanoseconds === 'number') {
    return new Timestamp(date._seconds, date._nanoseconds).toDate();
  }
  if (typeof date === 'string' || typeof date === 'number') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn('Unsupported date format encountered:', date);
  return null;
};

export const getDeadlines = (round: OriginalSalesRound): { primaryEnd: dayjs.Dayjs | null, secondaryEnd: dayjs.Dayjs | null } => {
    const publishAt = safeToDate(round.publishAt);
    if (!publishAt) return { primaryEnd: null, secondaryEnd: null };

    const deadlineDate = safeToDate(round.deadlineDate);
    if (deadlineDate) {
        const primaryEnd = dayjs(deadlineDate);
        const secondaryEnd = safeToDate(round.pickupDate) ? dayjs(safeToDate(round.pickupDate)).hour(13).minute(0).second(0) : null;
        return { primaryEnd, secondaryEnd };
    }

    const publishDay = dayjs(publishAt);
    let primaryEndFallback = publishDay.add(1, 'day').hour(13).minute(0).second(0);
    const dayOfWeek = primaryEndFallback.day();
    if (dayOfWeek === 6) primaryEndFallback = primaryEndFallback.add(2, 'day');
    else if (dayOfWeek === 0) primaryEndFallback = primaryEndFallback.add(1, 'day');
    
    const secondaryEndFallback = safeToDate(round.pickupDate) ? dayjs(safeToDate(round.pickupDate)).hour(13).minute(0).second(0) : null;
    return { primaryEnd: primaryEndFallback, secondaryEnd: secondaryEndFallback };
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
                case 1: case 2: return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
                case 3: return (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0);
                case 4: return (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0);
                default: return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
            }
        });
    return sortedHistory[0] || null;
};

// ✅ [수정] 이벤트 상품 관련 로직을 제거하여 단순화. 판매 상태는 이벤트 여부와 관계없이 동일한 규칙을 따르도록 함.
export const determineActionState = (round: SalesRound, userDocument: UserDocument | null): ProductActionState => {
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  const now = dayjs();
  const publishAt = safeToDate(round.publishAt);
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  if (publishAt && now.isBefore(publishAt)) {
    return 'SCHEDULED';
  }

  const isAllOptionsSoldOut = () => {
    if (!round.variantGroups || round.variantGroups.length === 0) return true;
    return round.variantGroups.every(vg => {
      const stockInfo = getStockInfo(vg);
      return stockInfo.isLimited && stockInfo.remainingUnits <= 0;
    });
  };

  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items?.length ?? 0) > 1;

  if (primaryEnd && now.isBefore(primaryEnd)) {
    if (isAllOptionsSoldOut()) {
      return 'WAITLISTABLE';
    }
    return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
  }

  if (primaryEnd && secondaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, '(]')) {
    const wasUnlimitedInPrimary = round.variantGroups.some(vg => {
        const stockInfo = getStockInfo(vg);
        return !stockInfo.isLimited;
    });

    if (wasUnlimitedInPrimary) {
        return 'AWAITING_STOCK';
    }
    
    if (isAllOptionsSoldOut()) {
      return 'ENCORE_REQUESTABLE';
    }
    return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
  }

  const salesEnd = secondaryEnd || primaryEnd;
  if (salesEnd && now.isAfter(salesEnd)) {
    return 'ENCORE_REQUESTABLE';
  }
  
  return 'ENDED';
};


export const sortProductsForDisplay = (a: { displayRound: SalesRound }, b: { displayRound: SalesRound }): number => {
    const roundA = a.displayRound;
    const roundB = b.displayRound;
    const vgA = roundA.variantGroups?.[0], vgB = roundB.variantGroups?.[0];
    const itemA = vgA?.items?.[0], itemB = vgB?.items?.[0];
    if (!vgA || !itemA) return 1; if (!vgB || !itemB) return -1;
    const isLimitedA = vgA.totalPhysicalStock !== null && vgA.totalPhysicalStock !== -1;
    const remainingStockA = isLimitedA ? (vgA.totalPhysicalStock || 0) - (vgA.reservedCount || 0) : Infinity;
    const priceA = itemA.price;
    const isLimitedB = vgB.totalPhysicalStock !== null && vgB.totalPhysicalStock !== -1;
    const remainingStockB = isLimitedB ? (vgB.totalPhysicalStock || 0) - (vgB.reservedCount || 0) : Infinity;
    const priceB = itemB.price;
    if (isLimitedA && !isLimitedB) return -1; if (!isLimitedA && isLimitedB) return 1;
    if (isLimitedA && isLimitedB) { if (remainingStockA !== remainingStockB) return remainingStockA - remainingStockB; }
    if (priceA !== priceB) return priceB - priceA;
    return 0;
};

export function computeRemainingUnits(vg: { totalPhysicalStock: number | null; reservedCount?: number | null }) {
  const total = vg.totalPhysicalStock;
  if (total === null || total === -1) return Infinity;
  const reserved = vg.reservedCount || 0;
  return Math.max(0, (total || 0) - reserved);
}

export function getMaxPurchasableQuantity(
  vg: { totalPhysicalStock: number | null; reservedCount?: number | null },
  item: { stockDeductionAmount?: number | null; limitQuantity?: number | null }
) {
  const remainingUnits = computeRemainingUnits(vg);
  const unit = Number(item.stockDeductionAmount ?? 1);
  const stockBound = Math.floor(remainingUnits / (unit > 0 ? unit : 1));
  const limitBound = Number.isFinite(item.limitQuantity ?? null) ? Number(item.limitQuantity) : Infinity;
  return Math.max(0, Math.min(stockBound, limitBound));
}