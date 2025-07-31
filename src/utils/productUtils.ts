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

dayjs.extend(isBetween);

// reservedCount 속성을 포함하는 확장된 VariantGroup 타입
export interface VariantGroup extends OriginalVariantGroup {
  reservedCount?: number;
}

export interface SalesRound extends OriginalSalesRound {
  variantGroups: VariantGroup[];
}

// ✅ [수정] 'AWAITING_STOCK' 상태를 다시 추가했습니다.
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

  if (
    typeof date === 'object' &&
    (date._seconds !== undefined || date.seconds !== undefined)
  ) {
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

/**
 * @description 고객에게 표시할 가장 적절한 판매 회차를 결정하는 통합 함수
 */
export const getDisplayRound = (
  product: Product,
): OriginalSalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;

  const now = new Date();
  const sellingRounds = product.salesHistory.filter(
    r => r.status === 'selling',
  );
  if (sellingRounds.length > 0) {
    return sellingRounds.sort(
      (a, b) =>
        (safeToDate(b.createdAt)?.getTime() ?? 0) -
        (safeToDate(a.createdAt)?.getTime() ?? 0),
    )[0];
  }
  const nowSellingScheduled = product.salesHistory
    .filter(
      r =>
        r.status === 'scheduled' &&
        safeToDate(r.publishAt) &&
        safeToDate(r.publishAt)! <= now,
    )
    .sort(
      (_a, b) =>
        (safeToDate(b.publishAt)?.getTime() ?? 0) -
        (safeToDate(b.publishAt)?.getTime() ?? 0),
    );
  if (nowSellingScheduled.length > 0) return nowSellingScheduled[0];
  const futureScheduledRounds = product.salesHistory
    .filter(
      r =>
        r.status === 'scheduled' &&
        safeToDate(r.publishAt) &&
        safeToDate(r.publishAt)! > now,
    )
    .sort(
      (a, b) =>
        (safeToDate(a.publishAt)?.getTime() ?? 0) -
        (safeToDate(b.publishAt)?.getTime() ?? 0),
    );
  if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];
  const pastRounds = product.salesHistory
    .filter(r => r.status === 'ended' || r.status === 'sold_out')
    .sort(
      (a, b) =>
        (safeToDate(b.deadlineDate)?.getTime() ?? 0) -
        (safeToDate(a.deadlineDate)?.getTime() ?? 0),
    );
  if (pastRounds.length > 0) return pastRounds[0];
  const nonDraftRounds = product.salesHistory
    .filter(r => r.status !== 'draft')
    .sort(
      (a, b) =>
        (safeToDate(b.createdAt)?.getTime() ?? 0) -
        (safeToDate(a.createdAt)?.getTime() ?? 0),
    );
  return nonDraftRounds[0] || null;
};

/**
 * @description 상품, 판매회차, 사용자 정보를 기반으로 현재 상품의 액션 상태를 결정하는 통합 함수
 * @returns {ProductActionState} 현재 상품의 상태
 */
export const determineActionState = (
  round: SalesRound,
  userDocument: UserDocument | null,
  selectedVg?: VariantGroup | null,
): ProductActionState => {
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];

  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  const now = dayjs();
  const publishAtDate = safeToDate(round.publishAt);
  const primaryDeadline = safeToDate(round.deadlineDate); // 1차 마감일 (오늘의 공동구매 마감)
  const pickupDate = safeToDate(round.pickupDate); // 픽업 시작일
  
  // ✅ [수정] 최종 마감일을 요청대로 '픽업일 오후 1시'로 명확히 정의합니다.
  const finalSaleDeadline = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0).toDate() : null;

  if (round.status === 'scheduled' && publishAtDate && now.isBefore(publishAtDate)) {
    return 'SCHEDULED';
  }
  
  if (finalSaleDeadline && now.isAfter(finalSaleDeadline)) {
    return 'ENDED';
  }

  const isLimitedStock = selectedVg ? (selectedVg.totalPhysicalStock !== null && selectedVg.totalPhysicalStock !== -1) : false;

  // ✅ [추가] '재고 준비중' 상태를 판별하는 로직을 추가합니다.
  // 조건: 1차 마감 이후 && 최종 마감 이전 && 무제한 상품일 경우
  if (primaryDeadline && now.isAfter(primaryDeadline) && finalSaleDeadline && now.isBefore(finalSaleDeadline)) {
    if (!isLimitedStock) {
      return 'AWAITING_STOCK';
    }
  }

  let isSoldOut = false;
  if (selectedVg && isLimitedStock) { 
    const reserved = selectedVg.reservedCount || 0;
    const totalStock = selectedVg.totalPhysicalStock || 0;
    const remainingStock = totalStock - reserved;
    if (remainingStock <= 0) {
      isSoldOut = true;
    }
  }

  if (isSoldOut) {
    return 'WAITLISTABLE';
  }
  
  // 1차 마감 이전이면서 재고가 있으면 구매 가능
  if (primaryDeadline && now.isBefore(primaryDeadline)) {
    return 'PURCHASABLE';
  }

  // 1차 마감 이후지만 한정수량 상품에 재고가 남아있으면 구매 가능 (추가공구)
  if (primaryDeadline && now.isAfter(primaryDeadline) && isLimitedStock && !isSoldOut) {
    return 'PURCHASABLE';
  }

  // 위의 모든 조건에 해당하지 않으면 최종 마감 전이라도 다른 상태(예: 무제한 상품의 재고준비중)가 될 수 있으므로, 마지막에 ENDED를 배치
  return 'ENDED';
};