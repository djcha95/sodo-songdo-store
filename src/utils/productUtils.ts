// src/utils/productUtils.ts

import type {
  Product,
  SalesRound as OriginalSalesRound,
  UserDocument,
  VariantGroup as OriginalVariantGroup,
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

  // 1. 참여 등급 확인
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier))) {
    return 'INELIGIBLE';
  }

  const now = dayjs();
  const publishAtDate = safeToDate(round.publishAt);

  const deadlineDate = safeToDate(round.deadlineDate);
  const finalSaleDeadline = deadlineDate
    ? dayjs(deadlineDate).add(1, 'day').hour(13).minute(0).second(0).toDate()
    : null;

  // 2. 판매 기간 확인
  if (round.status === 'scheduled' && publishAtDate && now.isBefore(publishAtDate)) {
    return 'SCHEDULED';
  }
  
  if (finalSaleDeadline && now.isAfter(finalSaleDeadline)) {
    return 'ENDED';
  }

  // 이 시점부터는 판매 기간 내에 있다고 간주

  // 3. 재고 상태 확인 (품절 여부)
  let isSoldOut = false;
  
  // ✅ [수정] selectedVg가 null이나 undefined가 아닌지 먼저 확인
  if (selectedVg) { 
    const isLimitedStock = selectedVg.totalPhysicalStock !== null && selectedVg.totalPhysicalStock !== -1;

    if (isLimitedStock) {
      const reserved = selectedVg.reservedCount || 0;
      const totalStock = selectedVg.totalPhysicalStock || 0;
      const remainingStock = totalStock - reserved;

      if (remainingStock <= 0) {
        isSoldOut = true;
      }
    }
  }

  // 4. 최종 상태 결정
  if (isSoldOut) {
    // 한정 수량 상품이고, 품절이고, 판매 기간 내라면 '대기 가능'
    // ✅ [수정] isLimitedStock을 다시 계산하지 않고, if(selectedVg) 블록 밖으로 isSoldOut만 사용
    // isSoldOut은 selectedVg가 존재하고 한정 수량일 때만 true가 될 수 있음.
    return 'WAITLISTABLE';
  } else {
    // 재고가 남아있으면 '구매 가능' 상태
    return 'PURCHASABLE';
  }
};