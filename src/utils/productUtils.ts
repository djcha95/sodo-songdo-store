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
  | 'REQUIRE_OPTION' // 옵션 선택이 필요한 상태
  | 'WAITLISTABLE'
  | 'ENCORE_REQUESTABLE'
  | 'SCHEDULED'
  | 'ENDED'
  | 'INELIGIBLE' // 등급 미달
  | 'AWAITING_STOCK'; // 재고 준비중

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

/**
 * ✅ [수정] 주말 마감 정책을 반영하도록 마감일 계산 로직을 복구합니다.
 * 토요일 또는 일요일에 발행된 상품은 마감일이 월요일 13시가 됩니다.
 */
export const getDeadlines = (round: OriginalSalesRound): { primaryEnd: Date | null, secondaryEnd: Date | null } => {
  const publishAt = safeToDate(round.publishAt);
  const pickupDate = safeToDate(round.pickupDate);

  let primaryEnd: Date | null = null;
  
  if (publishAt) {
    let deadlineDate = dayjs(publishAt);
    const publishDay = deadlineDate.day(); // dayjs에서 일요일은 0, 토요일은 6

    // 1. 주말 정책 적용
    if (publishDay === 6) { // 토요일에 발행된 경우
      deadlineDate = deadlineDate.add(2, 'day'); // 마감일은 월요일
    } else if (publishDay === 0) { // 일요일에 발행된 경우
      deadlineDate = deadlineDate.add(1, 'day'); // 마감일은 월요일
    } else { // 평일에 발행된 경우
      deadlineDate = deadlineDate.add(1, 'day'); // 마감일은 다음 날
    }
    
    // 2. 마감 시간을 오후 1시(13:00)로 설정
    primaryEnd = deadlineDate.hour(13).minute(0).second(0).millisecond(0).toDate();

  } else {
    // publishAt이 없는 레거시 데이터를 위한 예외 처리
    primaryEnd = safeToDate(round.deadlineDate);
  }
  
  // 2차 마감일(픽업 마감일) 로직은 그대로 유지
  const secondaryEnd = pickupDate 
    ? dayjs(pickupDate).hour(13).minute(0).second(0).toDate()
    : null;
    
  return { primaryEnd, secondaryEnd };
};


// ✅ [개선] 가독성 및 유지보수성을 위해 우선순위 기반 정렬 로직으로 리팩토링
export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;
  const now = dayjs();

  // 각 판매 회차의 상태에 따라 우선순위를 부여하는 함수
  const getPhasePriority = (round: OriginalSalesRound): number => {
    const publishAt = safeToDate(round.publishAt);
    if (round.status === 'selling') return 1; // 1순위: 현재 판매 중
    if (round.status === 'scheduled' && publishAt && now.isSameOrAfter(publishAt)) return 2; // 2순위: 게시 시간이 지난 판매 예정 (판매 중으로 간주)
    if (round.status === 'scheduled' && publishAt && now.isBefore(publishAt)) return 3; // 3순위: 미래의 판매 예정
    if (round.status === 'ended' || round.status === 'sold_out') return 4; // 4순위: 지난 공구
    return 5; // 5순위: 기타
  };

  const sortedHistory = [...product.salesHistory]
    .filter(r => r.status !== 'draft') // 'draft' 상태는 항상 제외
    .sort((a, b) => {
      const priorityA = getPhasePriority(a);
      const priorityB = getPhasePriority(b);
      
      // 우선순위가 다르면 순위가 높은(숫자가 낮은) 것을 앞으로
      if (priorityA !== priorityB) return priorityA - priorityB;

      // 우선순위가 같을 경우, 2차 정렬 기준 적용
      switch (priorityA) {
        case 1: // 판매 중
        case 2: // 게시된 판매 예정
          // 최신순 (생성일 기준 내림차순)
          return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
        case 3: // 미래의 판매 예정
          // 가장 빨리 다가오는 순 (게시일 기준 오름차순)
          return (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0);
        case 4: // 지난 공구
          // 가장 최근에 마감된 순 (마감일 기준 내림차순)
          return (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0);
        default:
          // 기타 (생성일 기준 내림차순)
          return (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0);
      }
    });

  // 정렬된 목록의 첫 번째 항목을 반환
  return sortedHistory[0] || null;
};


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

  const hasMultipleOptions = round.variantGroups.length > 1 || (round.variantGroups[0]?.items.length || 0) > 1;
  
  // 3. 1차 판매 기간 (오늘의 공동구매) 확인
  if (primaryDeadline && now.isBefore(primaryDeadline)) {
    if (hasMultipleOptions && !selectedVg) {
      return 'REQUIRE_OPTION'; // 옵션 선택 필요
    }
    
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
    if (hasMultipleOptions && !selectedVg) {
        return 'REQUIRE_OPTION'; // 옵션 선택 필요
    }

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

  // 5. 모든 판매 기간이 지났으면 '예약 종료' 또는 '앵콜 요청 가능'
  if (round.status === 'ended' || round.status === 'sold_out') {
      return 'ENCORE_REQUESTABLE';
  }

  return 'ENDED';
};