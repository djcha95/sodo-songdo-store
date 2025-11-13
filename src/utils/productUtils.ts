// src/utils/productUtils.ts

// ✅ [수정] 디버깅용 console.log 코드 7줄 제거
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

// ✅ [수정] SalesRound 인터페이스 재정의 (기존 코드 유지)
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
  | 'ENCORE_REQUESTABLE'
  | 'SCHEDULED'
  | 'ENDED'
  | 'INELIGIBLE'
  | 'AWAITING_STOCK'; // 'WAITLISTABLE' 제거, 'AWAITING_STOCK' 사용

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
    if (dayOfWeek === 6) primaryEndFallback = primaryEndFallback.add(2, 'day'); // 토요일 -> 월요일 13시
    else if (dayOfWeek === 0) primaryEndFallback = primaryEndFallback.add(1, 'day'); // 일요일 -> 월요일 13시
    
    const secondaryEndFallback = safeToDate(round.pickupDate) ? dayjs(safeToDate(round.pickupDate)).hour(13).minute(0).second(0) : null;
    return { primaryEnd: primaryEndFallback, secondaryEnd: secondaryEndFallback };
};

export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
    if (!Array.isArray(product.salesHistory) || product.salesHistory.length === 0) return null;
    const now = dayjs();
    
    // ✅ [수정] 이 함수 전체를 교체합니다.
    const getPhasePriority = (round: OriginalSalesRound): number => {
        const publishAt = safeToDate(round.publishAt);
        // 1. 수동 '종료' 또는 DB '종료'는 항상 최하순위
        if (round.manualStatus === 'ended' || round.status === 'ended') return 5;

        // 2. [1순위] 'scheduled' 상태이지만 발행일(publishAt)이 '지금'이거나 '과거'인 경우
        // (즉, 지금 당장 'selling'이 되어야 하는 라운드)
        if (round.status === 'scheduled' && publishAt && now.isSameOrAfter(publishAt)) return 1;
        
        // 3. [2순위] 이미 'selling' 중인 경우
        if (round.status === 'selling') return 2;

        // 4. [3순위] 'scheduled' 상태이고 발행일이 '미래'인 경우 (판매 예정)
        if (round.status === 'scheduled' && publishAt && now.isBefore(publishAt)) return 3;

        return 4; // Draft 등 기타 상태
    };

    const sortedHistory = [...product.salesHistory]
        .filter(r => r.status !== 'draft' && r.manualStatus !== 'ended')
        .sort((a, b) => {
            const priorityA = getPhasePriority(a);
            const priorityB = getPhasePriority(b);
            if (priorityA !== priorityB) return priorityA - priorityB;
            
            // ✅ [수정] 1순위, 2순위, 3순위 모두 createdAt(생성일) 내림차순으로 정렬
            // (즉, 동일 순위 내에서는 가장 최근에 만든 라운드가 이김)
            switch (priorityA) {
                case 1: // 'scheduled' (now)
                case 2: // 'selling'
                case 3: // 'scheduled' (future)
                    return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
                default:
                    return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
            }
        });
    return sortedHistory[0] || null;
};
// ✅ [수정] determineActionState의 round 파라미터 타입을 OriginalSalesRound로 명시
export const determineActionState = (round: OriginalSalesRound, userDocument: UserDocument | null): ProductActionState => {
  // 0. 관리자 수동 '종료' 또는 DB '종료' 상태 확인 (가장 먼저 ENDED 처리)
  // ✅ [수정] 'sold_out' 관련 로직을 제거합니다. 'ended' 상태만 즉시 종료시킵니다.
  if (round.manualStatus === 'ended' || round.status === 'ended') {
      return 'ENDED';
  }

  // 1. 판매 기간 확인
  const now = dayjs();
  const publishAt = safeToDate(round.publishAt);
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  // 1A. 아직 판매 시작 전이면 '판매 예정'
  if (publishAt && now.isBefore(publishAt)) {
    return 'SCHEDULED';
  }

  // 1B. 모든 판매 기간(2차 포함)이 종료되었으면 '판매 종료'
  // 2차 마감일(secondaryEnd, 픽업일 13시)이 존재하면 그것 기준으로, 없으면 1차 마감일(primaryEnd) 기준으로 판단
  const salesHasEnded = (secondaryEnd && now.isAfter(secondaryEnd)) || (!secondaryEnd && primaryEnd && now.isAfter(primaryEnd));
  if (salesHasEnded) {
    return 'ENDED';
  }

  // 2. 재고 확인 (함수 정의)
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
  // ✅ [수정] 재고가 없거나(isAllOptionsSoldOut) 수동 품절('sold_out') 상태인 경우,
  // (기간은 아직 안 끝났으므로) 'ENDED' 대신 'AWAITING_STOCK'을 반환합니다.
  if (isAllOptionsSoldOut() || round.manualStatus === 'sold_out') {
    return 'AWAITING_STOCK';
  }
  
  // 5. 등급 검사 통과 시 (또는 등급 제한이 없을 시), 옵션 선택 필요 여부에 따라 상태 결정
  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items?.length ?? 0) > 1;
  
  // 단일 옵션인데, 해당 옵션 아이템이 재고가 없는 경우 (isAllOptionsSoldOut는 아니지만, 유일한 옵션이 품절인 경우)
  if (!hasMultipleOptions) {
    const stockInfo = getStockInfo(round.variantGroups[0] as VariantGroup);
    if (stockInfo.isLimited && stockInfo.remainingUnits <= 0) {
      // ✅ [수정] 이 경우도 'AWAITING_STOCK'으로 처리합니다.
      return 'AWAITING_STOCK';
    }
  }

  return hasMultipleOptions ? 'REQUIRE_OPTION' : 'PURCHASABLE';
};

// ... (파일의 나머지 부분은 동일합니다) ...

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
  // unit이 0이거나 음수일 경우를 대비해 1로 보정
  const stockBound = Math.floor(remainingUnits / (unit > 0 ? unit : 1));
  
  // item.limitQuantity가 0, null, undefined인 경우 모두 Infinity로 처리
  const limitBound = (item.limitQuantity ?? null) !== null && Number.isFinite(item.limitQuantity) && (item.limitQuantity as number) > 0
    ? Number(item.limitQuantity) 
    : Infinity;
    
  // stockBound와 limitBound 중 작은 값을 반환
  const maxQty = Math.min(stockBound, limitBound);
  
  // 최종 수량이 Infinity가 아닌지 확인 (둘 다 무제한일 경우)
  // 현실적인 최대 수량 제한 (예: 999)
  const practicalMax = 999; 
  
  if (!isFinite(maxQty)) {
      return practicalMax;
  }
  
  return Math.max(0, Math.min(maxQty, practicalMax));
}