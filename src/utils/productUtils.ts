// src/utils/productUtils.ts

import type {
  Product,
  SalesRound as OriginalSalesRound,
  UserDocument,
  VariantGroup as OriginalVariantGroup,
} from '@/shared/types';
import { Timestamp } from 'firebase/firestore';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);

export interface VariantGroup extends OriginalVariantGroup {
  reservedCount?: number;
}

// ✅ [수정] SalesRound 인터페이스 재정의
// eventType을 직접 정의하는 대신 OriginalSalesRound로부터 상속받도록 하여 타입 오류를 해결합니다.
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
    if (!Array.isArray(product.salesHistory) || product.salesHistory.length === 0) return null;
    const now = dayjs();
    const getPhasePriority = (round: OriginalSalesRound): number => {
        const publishAt = safeToDate(round.publishAt);
        // ✅ [추가] 수동 종료/매진된 상품은 가장 낮은 우선순위로 밀어냅니다.
        if (round.manualStatus === 'ended' || round.manualStatus === 'sold_out' || round.status === 'ended' || round.status === 'sold_out') return 5;
        
        if (round.status === 'selling') return 1;
        if (round.status === 'scheduled' && publishAt && now.isSameOrAfter(publishAt)) return 2;
        if (round.status === 'scheduled' && publishAt && now.isBefore(publishAt)) return 3;
        // 기존 4였던 'ended'/'sold_out'을 5로 옮겼으므로, 남은 상태에 대한 필터는 제거하거나 다른 우선순위를 부여합니다.
        // 현재 로직상 4번이 없으므로, default 처리로 변경합니다.
        return 4; // Draft 등 기타 상태
    };
    const sortedHistory = [...product.salesHistory]
        // ✅ [추가] draft, 수동 종료/매진된 상품은 제외합니다.
        .filter(r => r.status !== 'draft' && r.manualStatus !== 'ended' && r.manualStatus !== 'sold_out')
        .sort((a, b) => {
            const priorityA = getPhasePriority(a);
            const priorityB = getPhasePriority(b);
            if (priorityA !== priorityB) return priorityA - priorityB;
            switch (priorityA) {
                case 1: case 2: return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
                case 3: return (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0);
                // case 4: case 5: 는 여기서 처리되지 않고, default로 넘어갑니다.
                default: return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
            }
        });
    return sortedHistory[0] || null;
};

// ✅ [수정] determineActionState의 round 파라미터 타입을 OriginalSalesRound로 명시
export const determineActionState = (round: OriginalSalesRound, userDocument: UserDocument | null): ProductActionState => {
  // 0. 관리자 수동 상태 및 기본 상태 확인 (가장 먼저 ENDED 처리)
  if (round.manualStatus === 'ended' || round.manualStatus === 'sold_out' || round.status === 'ended' || round.status === 'sold_out') {
      return 'ENDED';
  }

  // 1. 판매 기간 확인
  const now = dayjs();
  const publishAt = safeToDate(round.publishAt);
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  // 아직 판매 시작 전이면 '판매 예정'
  if (publishAt && now.isBefore(publishAt)) {
    return 'SCHEDULED';
  }

  // 모든 판매 기간(2차 포함)이 종료되었으면 '판매 종료'
  const salesHasEnded = (secondaryEnd && now.isAfter(secondaryEnd)) || (!secondaryEnd && primaryEnd && now.isAfter(primaryEnd));
  if (salesHasEnded) {
    return 'ENDED';
  }

  // 2. 재고 확인
  const isAllOptionsSoldOut = () => {
    if (!round.variantGroups || round.variantGroups.length === 0) return true;
    // 모든 옵션 그룹의 재고가 0 이하인지 확인
    return round.variantGroups.every(vg => {
      const stockInfo = getStockInfo(vg as VariantGroup);
      // isLimited가 true이고, 남은 재고가 0 이하일 때
      return stockInfo.isLimited && stockInfo.remainingUnits <= 0;
    });
  };

  // 3. 재고 상태와 판매 기간에 따라 상태 결정
  if (isAllOptionsSoldOut()) {
    // 재고가 없고, 1차 판매 기간이라면 '대기 가능'
    if (primaryEnd && now.isBefore(primaryEnd)) {
      return 'WAITLISTABLE';
    }
    // 재고가 없고, 1차 판매 기간이 지났거나 2차 기간이라면 '판매 종료'
    // 2차 기간에 재고가 0이면 ENDED 처리하여 노출하지 않습니다.
    return 'ENDED';
  }
  
  // 4. 재고가 있다면, 옵션 선택 필요 여부에 따라 상태 결정
  const allowedTiers = round.allowedTiers;
  if (userDocument && Array.isArray(allowedTiers)) {
      const userTier = userDocument.manualTier || userDocument.loyaltyTier || '공구초보'; // 사용자의 유효 등급 확인 (기본값 '공구초보')
      if (!allowedTiers.includes(userTier)) {
          return 'INELIGIBLE'; // 허용 등급이 아니면 'INELIGIBLE' 반환
      }
  }

  // 5. 등급 검사 통과 시, 옵션 선택 필요 여부에 따라 상태 결정
  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items?.length ?? 0) > 1;
  return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
};

export const sortProductsForDisplay = (a: { displayRound: OriginalSalesRound }, b: { displayRound: OriginalSalesRound }): number => {
    const roundA = a.displayRound;
    const roundB = b.displayRound;
    const vgA = roundA.variantGroups?.[0], vgB = roundB.variantGroups?.[0];
    const itemA = vgA?.items?.[0], itemB = vgB?.items?.[0];
    if (!vgA || !itemA) return 1; if (!vgB || !itemB) return -1;
    const isLimitedA = vgA.totalPhysicalStock !== null && vgA.totalPhysicalStock !== -1;
    const remainingStockA = isLimitedA ? (vgA.totalPhysicalStock || 0) - ((vgA as VariantGroup).reservedCount || 0) : Infinity;
    const priceA = itemA.price;
    const isLimitedB = vgB.totalPhysicalStock !== null && vgB.totalPhysicalStock !== -1;
    const remainingStockB = isLimitedB ? (vgB.totalPhysicalStock || 0) - ((vgB as VariantGroup).reservedCount || 0) : Infinity;
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
