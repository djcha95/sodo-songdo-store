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
  const primaryEnd = publishAt 
    ? dayjs(publishAt).add(1, 'day').hour(13).minute(0).second(0).toDate()
    : safeToDate(round.deadlineDate);
  const secondaryEnd = pickupDate 
    ? dayjs(pickupDate).hour(13).minute(0).second(0).toDate()
    : null;
  return { primaryEnd, secondaryEnd };
};

export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;
  const now = new Date();
  const sellingRounds = product.salesHistory.filter(r => r.status === 'selling');
  if (sellingRounds.length > 0) {
    return sellingRounds.sort((a, b) => (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0))[0];
  }
  const nowSellingScheduled = product.salesHistory.filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! <= now).sort((_a, b) => (safeToDate(b.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0));
  if (nowSellingScheduled.length > 0) return nowSellingScheduled[0];
  const futureScheduledRounds = product.salesHistory.filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! > now).sort((a, b) => (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0));
  if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];
  const pastRounds = product.salesHistory.filter(r => r.status === 'ended' || r.status === 'sold_out').sort((a, b) => (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0));
  if (pastRounds.length > 0) return pastRounds[0];
  const nonDraftRounds = product.salesHistory.filter(r => r.status !== 'draft').sort((a, b) => (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0));
  return nonDraftRounds[0] || null;
};

// ✅ [수정] 로직의 확인 순서를 바로잡아 올바른 상태가 표시되도록 전면 수정
export const determineActionState = (round: SalesRound, userDocument: UserDocument | null, selectedVg?: VariantGroup | null): ProductActionState => {
  // 1. 등급 확인: 참여 자격이 없는지 먼저 확인
  const userTier = userDocument?.loyaltyTier;
  const allowedTiers = round.allowedTiers || [];
  if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier as LoyaltyTier))) {
    return 'INELIGIBLE';
  }

  const now = dayjs();
  const { primaryEnd: primaryDeadline, secondaryEnd: finalSaleDeadline } = getDeadlines(round);

  // 2. 판매 예정 확인: 아직 게시 시간이 되지 않았는지 확인
  if (round.status === 'scheduled') {
      const publishAtDate = safeToDate(round.publishAt);
      if(publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
      }
  }
  
  // 3. 1차 판매 기간 (오늘의 공동구매) 확인
  if (primaryDeadline && now.isBefore(primaryDeadline)) {
    let isSoldOut = false;
    if (selectedVg) {
      const totalStock = selectedVg.totalPhysicalStock;
      if (totalStock !== null && totalStock !== -1) {
        const reserved = selectedVg.reservedCount || 0;
        if (totalStock - reserved <= 0) isSoldOut = true;
      }
    }
    return isSoldOut ? 'WAITLISTABLE' : 'PURCHASABLE';
  }

  // 4. 2차 판매 기간 (마감임박 추가공구) 확인
  if (finalSaleDeadline && primaryDeadline && now.isBetween(primaryDeadline, finalSaleDeadline, null, '[]')) {
    const isLimitedStock = selectedVg ? (selectedVg.totalPhysicalStock !== null && selectedVg.totalPhysicalStock !== -1) : false;
    if (!isLimitedStock) {
      return 'AWAITING_STOCK'; // 2차 판매인데 재고 정보가 없으면 재고 준비중
    }
    let isSoldOut = false;
    if (selectedVg) {
      const reserved = selectedVg.reservedCount || 0;
      const totalStock = selectedVg.totalPhysicalStock || 0;
      if (totalStock - reserved <= 0) isSoldOut = true;
    }
    return isSoldOut ? 'WAITLISTABLE' : 'PURCHASABLE';
  }

  // 5. 모든 판매 기간이 지났으면 '예약 종료'로 최종 판정
  return 'ENDED';
};