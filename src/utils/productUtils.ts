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
    } else if (publishDay === 0) { 
      deadlineDate = deadlineDate.add(1, 'day'); 
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
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  const now = dayjs();
  const { primaryEnd: primaryDeadline, secondaryEnd: finalSaleDeadline } = getDeadlines(round);

  if (round.status === 'scheduled') {
      const publishAtDate = safeToDate(round.publishAt);
      if(publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
      }
  }

  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items.length || 0) > 1;
  
  if (primaryDeadline && now.isBefore(primaryDeadline)) {
    if (hasMultipleOptions && !selectedVg) {
      return 'REQUIRE_OPTION';
    }
    
    let isSoldOut = false;
    if (selectedVg) { 
      const totalStock = selectedVg.totalPhysicalStock; 
      if (totalStock !== null && totalStock !== -1) {
        const reserved = selectedVg.reservedCount || 0;
        if (totalStock - reserved <= 0) {
            isSoldOut = true;
        }
      }
    }
    return isSoldOut ? 'WAITLISTABLE' : 'PURCHASABLE';
  }

  if (finalSaleDeadline && primaryDeadline && now.isBetween(primaryDeadline, finalSaleDeadline, null, '[]')) {
    if (hasMultipleOptions && !selectedVg) {
        return 'REQUIRE_OPTION';
    }

    const isLimitedStock = selectedVg ? (selectedVg.totalPhysicalStock !== null && selectedVg.totalPhysicalStock !== -1) : false;
    if (!isLimitedStock) {
      return 'AWAITING_STOCK'; 
    }

    let isSoldOut = false;
    if (selectedVg) {
      const reserved = selectedVg.reservedCount || 0; 
      const totalStock = selectedVg.totalPhysicalStock || 0;
      if (totalStock - reserved <= 0) {
        isSoldOut = true;
      }
    }
    return isSoldOut ? 'WAITLISTABLE' : 'PURCHASABLE';
  }

  if (round.status === 'ended' || round.status === 'sold_out') {
      return 'ENCORE_REQUESTABLE';
  }

  return 'ENDED';
};

/**
 * ✅ [추가] 상품 목록을 주어진 정렬 규칙에 따라 정렬하는 함수
 * 1. 한정 수량 상품 우선
 * 2. 남은 수량이 적은 순
 * 3. 가격이 높은 순
 * @param a Product
 * @param b Product
 * @returns number
 */
export const sortProductsForDisplay = (a: { displayRound: SalesRound }, b: { displayRound: SalesRound }): number => {
    const roundA = a.displayRound;
    const roundB = b.displayRound;

    // 옵션이 여러 개인 경우, 첫 번째 옵션을 기준으로 정렬합니다.
    const vgA = roundA.variantGroups?.[0];
    const vgB = roundB.variantGroups?.[0];
    const itemA = vgA?.items?.[0];
    const itemB = vgB?.items?.[0];

    // 데이터가 불완전할 경우를 대비한 방어 코드
    if (!vgA || !itemA) return 1;
    if (!vgB || !itemB) return -1;

    // --- 정렬에 필요한 지표 계산 ---
    const isLimitedA = vgA.totalPhysicalStock !== null && vgA.totalPhysicalStock !== -1;
    const remainingStockA = isLimitedA ? (vgA.totalPhysicalStock || 0) - (vgA.reservedCount || 0) : Infinity;
    const priceA = itemA.price;

    const isLimitedB = vgB.totalPhysicalStock !== null && vgB.totalPhysicalStock !== -1;
    const remainingStockB = isLimitedB ? (vgB.totalPhysicalStock || 0) - (vgB.reservedCount || 0) : Infinity;
    const priceB = itemB.price;

    // --- 1. 한정 수량 상품을 우선으로 정렬 ---
    if (isLimitedA && !isLimitedB) return -1; // A(한정)가 B(무제한)보다 앞으로
    if (!isLimitedA && isLimitedB) return 1;  // B(한정)가 A(무제한)보다 앞으로

    // --- 2. (둘 다 한정 수량일 경우) 남은 재고가 적은 순으로 정렬 (오름차순) ---
    if (isLimitedA && isLimitedB) {
        if (remainingStockA !== remainingStockB) {
            return remainingStockA - remainingStockB;
        }
    }

    // --- 3. (재고가 같거나 둘 다 무제한일 경우) 가격이 높은 순으로 정렬 (내림차순) ---
    if (priceA !== priceB) {
        return priceB - priceA;
    }

    // 모든 조건이 같을 경우 기존 순서 유지
    return 0;
};