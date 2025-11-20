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
  const deadlineDate = safeToDate(round.deadlineDate);
  const pickupDate = safeToDate(round.pickupDate);

  // deadlineDate가 있으면, publishAt이 이상해도 무조건 이걸 사용합니다.
  if (deadlineDate) {
    const primaryEnd = dayjs(deadlineDate);
    const secondaryEnd = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0) : null;
    return { primaryEnd, secondaryEnd };
  }

  // deadlineDate가 없을 때만 기존 방식(publishAt 기준 +1일)을 사용합니다.
  if (publishAt) {
    const publishDay = dayjs(publishAt);
    let primaryEndFallback = publishDay.add(1, 'day').hour(13).minute(0).second(0);
    const dayOfWeek = primaryEndFallback.day();
    if (dayOfWeek === 6) primaryEndFallback = primaryEndFallback.add(2, 'day'); // 토요일 -> 월요일
    else if (dayOfWeek === 0) primaryEndFallback = primaryEndFallback.add(1, 'day'); // 일요일 -> 월요일

    const secondaryEndFallback = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0) : null;
    return { primaryEnd: primaryEndFallback, secondaryEnd: secondaryEndFallback };
  }

  // 둘 다 없으면 null 반환
  return { primaryEnd: null, secondaryEnd: null };
};

export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
  if (!Array.isArray(product.salesHistory) || product.salesHistory.length === 0) return null;
  const now = dayjs();

  const getPhasePriority = (round: OriginalSalesRound): number => {
    const publishAt = safeToDate(round.publishAt);
    const deadlineDate = safeToDate(round.deadlineDate);

    // 1. '마감일'이 존재하고 현재 시간보다 이전이면 '종료(5순위)' 처리
    if (deadlineDate && now.isAfter(deadlineDate)) return 5;

    // 2. 수동 '종료' 또는 DB '종료'는 항상 최하순위
    if (round.manualStatus === 'ended' || round.status === 'ended') return 5;

    // 3. [1순위] 'scheduled' 상태이지만 발행일이 지났으면 '판매 중'으로 취급
    if (round.status === 'scheduled' && publishAt && now.isSameOrAfter(publishAt)) return 1;

    // 4. [2순위] 이미 'selling' 중인 경우
    if (round.status === 'selling') return 2;

    // 5. [3순위] 미래에 판매될 예정인 경우
    if (round.status === 'scheduled' && publishAt && now.isBefore(publishAt)) return 3;

    return 4; // 기타 상태
  };

  const sortedHistory = [...product.salesHistory]
    .filter(r => {
      // [핵심 수정] 불완전한 회차를 강력하게 필터링합니다.
      // 1. Draft 상태 제외
      if (r.status === 'draft') return false;

      // 2. 필수 날짜 데이터가 없는 '좀비 회차' 제외
      // publishAt이나 deadlineDate 중 하나라도 유효하지 않으면 표시하지 않음
      const pDate = safeToDate(r.publishAt);
      const dDate = safeToDate(r.deadlineDate);

      // 날짜 정보가 아예 없으면 화면에 띄울 수 없으므로 제외
      if (!pDate || !dDate) return false;

      return true;
    })
    .sort((a, b) => {
      const priorityA = getPhasePriority(a);
      const priorityB = getPhasePriority(b);

      // 우선순위가 다르면 우선순위 낮은(숫자 작은) 것부터
      if (priorityA !== priorityB) return priorityA - priorityB;

      // 우선순위가 같으면 '생성일' 최신순으로
      return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
    });

  return sortedHistory[0] || null;
};

export const determineActionState = (round: OriginalSalesRound, userDocument: UserDocument | null): ProductActionState => {
  // 0. 관리자 수동 '종료' 또는 DB '종료' 상태 확인
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

  // 1B. 모든 판매 기간이 종료되었으면 '판매 종료'
  const salesHasEnded = (secondaryEnd && now.isAfter(secondaryEnd)) || (!secondaryEnd && primaryEnd && now.isAfter(primaryEnd));
  if (salesHasEnded) {
    return 'ENDED';
  }

  // 2. 재고 확인
  const isAllOptionsSoldOut = () => {
    if (!round.variantGroups || round.variantGroups.length === 0) return true;
    return round.variantGroups.every(vg => {
      const stockInfo = getStockInfo(vg as VariantGroup);
      return stockInfo.isLimited && stockInfo.remainingUnits <= 0;
    });
  };

  // 3. 재고 상태와 판매 기간에 따라 상태 결정
  // 재고가 없거나 수동 품절인 경우 'AWAITING_STOCK' 반환
  if (isAllOptionsSoldOut() || round.manualStatus === 'sold_out') {
    return 'AWAITING_STOCK';
  }

  // 4. 옵션 선택 여부 등 결정
  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items?.length ?? 0) > 1;

  if (!hasMultipleOptions) {
    const stockInfo = getStockInfo(round.variantGroups[0] as VariantGroup);
    if (stockInfo.isLimited && stockInfo.remainingUnits <= 0) {
      return 'AWAITING_STOCK';
    }
  }

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

  const limitBound = (item.limitQuantity ?? null) !== null && Number.isFinite(item.limitQuantity) && (item.limitQuantity as number) > 0
    ? Number(item.limitQuantity)
    : Infinity;

  const maxQty = Math.min(stockBound, limitBound);
  const practicalMax = 999;

  if (!isFinite(maxQty)) {
    return practicalMax;
  }

  return Math.max(0, Math.min(maxQty, practicalMax));
}