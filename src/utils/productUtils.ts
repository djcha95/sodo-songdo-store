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

// ✅ [수정] Firestore의 다양한 Timestamp 형식을 안정적으로 Date 객체로 변환합니다.
export const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  // Firestore v9 or admin SDK Timestamp
  if (typeof date === 'object' && typeof date.seconds === 'number' && typeof date.nanoseconds === 'number') {
    return new Timestamp(date.seconds, date.nanoseconds).toDate();
  }
  // Firestore v8 legacy Timestamp
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

// ✅ [수정] 1차/2차 공구 마감 시간을 명확하게 계산합니다.
export const getDeadlines = (round: OriginalSalesRound): { primaryEnd: dayjs.Dayjs | null, secondaryEnd: dayjs.Dayjs | null } => {
    // 1차 마감일은 데이터베이스에 저장된 deadlineDate를 사용합니다. ProductForm에서 이미 계산된 값입니다.
    const primaryEnd = safeToDate(round.deadlineDate) ? dayjs(safeToDate(round.deadlineDate)) : null;
    
    // 2차 마감일은 픽업일 오후 1시입니다.
    const pickupDate = safeToDate(round.pickupDate);
    const secondaryEnd = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0) : null;
    
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
                case 1: case 2: return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
                case 3: return (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0);
                case 4: return (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0);
                default: return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
            }
        });
    return sortedHistory[0] || null;
};

// ✅ [수정] determineActionState: 1차/2차 공구 로직을 반영하여 상태를 결정합니다.
export const determineActionState = (round: SalesRound, userDocument: UserDocument | null): ProductActionState => {
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  const now = dayjs();
  const publishAt = safeToDate(round.publishAt);
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  // 1. 발행 전 (오후 2시 전)
  if (publishAt && now.isBefore(publishAt)) {
    return 'SCHEDULED';
  }

  const isAllVariantsSoldOut = round.variantGroups.length > 0 && round.variantGroups.every(vg => {
      const totalStock = vg.totalPhysicalStock;
      if (totalStock === null || totalStock === -1) return false; // 무제한 재고는 품절이 아님
      const reserved = vg.reservedCount || 0;
      return totalStock - reserved <= 0;
  });
  
  // 2. 전체 품절 상태 확인
  if (isAllVariantsSoldOut) {
      // 1차 공구 기간 중 품절이면 '대기 가능'
      if (primaryEnd && now.isBefore(primaryEnd)) {
          return 'WAITLISTABLE';
      }
      // 2차 공구 기간 중 품절이거나 기간이 지나면 '앵콜 요청'
      return 'ENCORE_REQUESTABLE';
  }

  // 3. 판매 기간 확인 (1차 또는 2차)
  const salesEnd = secondaryEnd || primaryEnd;
  if (salesEnd && now.isAfter(salesEnd)) {
      return 'ENCORE_REQUESTABLE';
  }
  
  // 4. 판매중 상태
  if ((primaryEnd && now.isBefore(primaryEnd)) || (secondaryEnd && now.isBetween(primaryEnd!, secondaryEnd, null, '()'))) {
    // 1차 공구 기간 중 일부 품절 시에도 대기 가능 상태를 우선으로 표시
    if (primaryEnd && now.isBefore(primaryEnd)) {
      const isAnyVgSoldOut = round.variantGroups.some(vg => {
          const stockInfo = getStockInfo(vg);
          return stockInfo.isLimited && stockInfo.remainingUnits <= 0;
      });
      if (isAnyVgSoldOut) return 'WAITLISTABLE';
    }
      
    const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items?.length ?? 0) > 1;
    return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
  }
  
  // 모든 조건에 해당하지 않으면 종료
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