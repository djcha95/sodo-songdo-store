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
  sourceType?: 'SODOMALL' | 'SONGDOPICK_ONLY';
}

export interface StockInfo {
  isLimited: boolean;
  remainingUnits: number;
  unitPerBox: number;
}

export const getStockInfo = (vg?: VariantGroup | null): StockInfo => {
  // ✅ 방어: 옵션 그룹이 없거나 레거시 데이터면 "무제한" 취급(화면 크래시/오판 방지)
  if (!vg) return { isLimited: false, remainingUnits: Infinity, unitPerBox: 1 };

  const totalStock = vg.totalPhysicalStock;

  // ✅ null/undefined/-1은 "무제한"으로 간주
  const isLimited = typeof totalStock === 'number' && totalStock !== -1;
  if (!isLimited) {
    return { isLimited: false, remainingUnits: Infinity, unitPerBox: 1 };
  }

  const reservedRaw = (vg as any).reservedCount;
  const reserved =
    typeof reservedRaw === 'number' && Number.isFinite(reservedRaw) ? reservedRaw : 0;

  const remainingUnits = Math.max(0, totalStock - reserved);

  const units = (vg.items?.map((it) => it.stockDeductionAmount || 1) || []);
  const allSame = units.length > 0 && units.every((u) => u === units[0]);
  const unitPerBox = allSame && (units[0] || 1) > 1 ? (units[0] || 1) : 1;
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
  return null;
};

// 헬퍼: 주어진 날짜의 오후 2시(14:00) 구하기
const getOpenTime = (date: Date | null): Date | null => {
  if (!date) return null;
  // 입력된 날짜의 시/분/초를 무시하고 14:00:00으로 강제 설정
  return dayjs(date).hour(14).minute(0).second(0).millisecond(0).toDate();
};

export const getDeadlines = (round: OriginalSalesRound): { primaryEnd: dayjs.Dayjs | null, secondaryEnd: dayjs.Dayjs | null } => {
  const publishAt = safeToDate(round.publishAt);
  const deadlineDate = safeToDate(round.deadlineDate);
  const pickupDate = safeToDate(round.pickupDate);

  let primaryEnd: dayjs.Dayjs | null = null;
  let secondaryEnd: dayjs.Dayjs | null = null;

  // 1. [1차 마감: 설정된 날짜 혹은 다음날 13:00]
  if (deadlineDate) {
    // 관리자가 날짜를 지정했으면 그 날 13:00
    primaryEnd = dayjs(deadlineDate).hour(13).minute(0).second(0).millisecond(0);
  } else if (publishAt) {
    // 지정 안 했으면 오픈일 기준 다음 날 (토->월)
    const publishDay = dayjs(publishAt);
    let targetEndDay = publishDay.add(1, 'day'); 

    const dayOfWeek = publishDay.day(); // 0(일) ~ 6(토)
    if (dayOfWeek === 6) { 
        targetEndDay = publishDay.add(2, 'day'); // 토요일 -> 월요일
    } 
    
    // 시간은 무조건 오후 1시(13:00)
    primaryEnd = targetEndDay.hour(13).minute(0).second(0).millisecond(0);
  }

  // 2. [2차 마감: 픽업 당일 13:00]
  if (pickupDate) {
    secondaryEnd = dayjs(pickupDate).hour(13).minute(0).second(0).millisecond(0);
  }

  return { primaryEnd, secondaryEnd };
};

export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
  if (!Array.isArray(product.salesHistory) || product.salesHistory.length === 0) return null;
  const now = dayjs();

  const getPhasePriority = (round: OriginalSalesRound): number => {
    const { secondaryEnd } = getDeadlines(round);
    
    // 2차 마감까지 지났거나 수동/DB 종료이면 최하위
    if ((secondaryEnd && now.isAfter(secondaryEnd)) || round.manualStatus === 'ended' || round.status === 'ended') return 5;
    
    // ✅ [수정] 원본 날짜 대신 '오후 2시' 적용된 날짜 사용
    const rawPublishAt = safeToDate(round.publishAt);
    const publishAt = getOpenTime(rawPublishAt); // 14:00 적용

    // 1순위: 'scheduled'이나 발행일(14:00) 지남 -> 판매중
    if (round.status === 'scheduled' && publishAt && now.isSameOrAfter(publishAt)) return 1;

    // 2순위: DB상 상태가 이미 'selling'인 경우
    if (round.status === 'selling') return 2;

    // 3순위: 미래에 판매 예정 (14:00 전)
    if (round.status === 'scheduled' && publishAt && now.isBefore(publishAt)) return 3;

    return 4; // 기타 상태
  };

  const sortedHistory = [...product.salesHistory]
    .filter(r => {
      if (r.status === 'draft') return false;
      const pDate = safeToDate(r.publishAt);
      if (!pDate) return false; 
      return true;
    })
    .sort((a, b) => {
      const priorityA = getPhasePriority(a);
      const priorityB = getPhasePriority(b);

      if (priorityA !== priorityB) return priorityA - priorityB;

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
  
  // ✅ [수정] 오픈 시간을 해당일의 14:00:00으로 강제 변환
  const rawPublishAt = safeToDate(round.publishAt);
  const publishAt = getOpenTime(rawPublishAt); 

  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  // 1A. 아직 판매 시작 전(14:00 전)이면 '판매 예정'
  if (publishAt && now.isBefore(publishAt)) {
    return 'SCHEDULED';
  }

  // 1B. 종료 조건: 2차 마감일이 있으면 2차 마감 후 종료, 없으면 1차 마감 후 종료
  const finalDeadline = secondaryEnd || primaryEnd;
  if (finalDeadline && now.isAfter(finalDeadline)) {
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
  const totalA = vgA.totalPhysicalStock;
  const isLimitedA = typeof totalA === 'number' && totalA !== -1;
  const reservedA = typeof (vgA as any).reservedCount === 'number' ? (vgA as any).reservedCount : 0;
  const remainingStockA = isLimitedA ? Math.max(0, totalA - reservedA) : Infinity;
  const priceA = itemA.price;
  const totalB = vgB.totalPhysicalStock;
  const isLimitedB = typeof totalB === 'number' && totalB !== -1;
  const reservedB = typeof (vgB as any).reservedCount === 'number' ? (vgB as any).reservedCount : 0;
  const remainingStockB = isLimitedB ? Math.max(0, totalB - reservedB) : Infinity;
  const priceB = itemB.price;
  if (isLimitedA && !isLimitedB) return -1; if (!isLimitedA && isLimitedB) return 1;
  if (isLimitedA && isLimitedB) { if (remainingStockA !== remainingStockB) return remainingStockA - remainingStockB; }
  if (priceA !== priceB) return priceB - priceA;
  return 0;
};

export function computeRemainingUnits(vg: { totalPhysicalStock: number | null | undefined; reservedCount?: number | null | undefined }) {
  const total = vg.totalPhysicalStock;
  // ✅ null/undefined/-1은 무제한 취급
  if (typeof total !== 'number' || total === -1) return Infinity;
  const reservedRaw = vg.reservedCount;
  const reserved = typeof reservedRaw === 'number' && Number.isFinite(reservedRaw) ? reservedRaw : 0;
  return Math.max(0, total - reserved);
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