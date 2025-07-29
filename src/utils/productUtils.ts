// src/utils/productUtils.ts

import type { 
  Product, 
  // ✅ [수정] 원본 타입을 별칭(Alias)으로 가져와 충돌을 방지합니다.
  SalesRound as OriginalSalesRound, 
  UserDocument, 
  VariantGroup as OriginalVariantGroup 
} from '@/types';
import { Timestamp } from 'firebase/firestore';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

// reservedCount 속성을 포함하는 확장된 VariantGroup 타입
export interface VariantGroup extends OriginalVariantGroup {
  reservedCount?: number;
}

// ✅ [수정] 확장된 VariantGroup을 포함하는 SalesRound 타입을 정의합니다.
// OriginalSalesRound를 상속받아 모든 기존 속성을 유지합니다.
export interface SalesRound extends OriginalSalesRound {
  variantGroups: VariantGroup[];
}

export type ProductActionState = 
  | 'LOADING' 
  | 'PURCHASABLE'         // 구매 가능
  | 'REQUIRE_OPTION'      // (카드용) 옵션 선택 필요
  | 'WAITLISTABLE'        // 대기 가능
  | 'ENCORE_REQUESTABLE'  // 앵콜 요청 가능 (현재 로직에서는 사용되지 않음)
  | 'SCHEDULED'           // 판매 예정
  | 'ENDED'               // 판매 종료
  | 'INELIGIBLE'          // 참여 등급 아님
  | 'AWAITING_STOCK';     // 재고 준비중

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
  
  console.warn("Unsupported date format:", date);
  return null;
};

/**
 * @description 고객에게 표시할 가장 적절한 판매 회차를 결정하는 통합 함수
 */
export const getDisplayRound = (product: Product): OriginalSalesRound | null => {
    if (!product.salesHistory || product.salesHistory.length === 0) return null;

    const now = new Date();
    const sellingRounds = product.salesHistory.filter(r => r.status === 'selling');
    if (sellingRounds.length > 0) {
        return sellingRounds.sort((a, b) => (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0))[0];
    }
    const nowSellingScheduled = product.salesHistory
        .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! <= now)
        .sort((_a, b) => (safeToDate(b.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0));
    if (nowSellingScheduled.length > 0) return nowSellingScheduled[0];
    const futureScheduledRounds = product.salesHistory
        .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! > now)
        .sort((a, b) => (safeToDate(a.publishAt)?.getTime() ?? 0) - (safeToDate(b.publishAt)?.getTime() ?? 0));
    if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];
    const pastRounds = product.salesHistory
        .filter(r => r.status === 'ended' || r.status === 'sold_out')
        .sort((a, b) => (safeToDate(b.deadlineDate)?.getTime() ?? 0) - (safeToDate(a.deadlineDate)?.getTime() ?? 0));
    if (pastRounds.length > 0) return pastRounds[0];
    const nonDraftRounds = product.salesHistory
        .filter(r => r.status !== 'draft')
        .sort((a, b) => (safeToDate(b.createdAt)?.getTime() ?? 0) - (safeToDate(a.createdAt)?.getTime() ?? 0));
    return nonDraftRounds[0] || null;
};


/**
 * @description 상품, 판매회차, 사용자 정보를 기반으로 현재 상품의 액션 상태를 결정하는 통합 함수
 * @returns {ProductActionState} 현재 상품의 상태
 */
export const determineActionState = (
    round: SalesRound,
    userDocument: UserDocument | null,
    selectedVg?: VariantGroup | null 
): ProductActionState => {
    const userTier = userDocument?.loyaltyTier;
    const allowedTiers = round.allowedTiers || [];

    // 1. 참여 등급 확인
    if (allowedTiers.length > 0 && (!userTier || !allowedTiers.includes(userTier))) {
        return 'INELIGIBLE';
    }

    const now = dayjs();
    const publishAtDate = safeToDate(round.publishAt);
    const pickupDate = safeToDate(round.pickupDate);
    // 판매 종료 시점 = 픽업일 오후 1시
    const finalSaleDeadline = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0).toDate() : null;

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
    
    // 재고 미설정(null)은 무제한으로 간주하므로, 유한 재고일 때만 품절 여부를 계산
    if (selectedVg && selectedVg.totalPhysicalStock !== null && selectedVg.totalPhysicalStock !== -1) {
        // 옵션 그룹의 실시간 예약수량을 직접 사용 (가장 정확한 방법)
        const reserved = selectedVg.reservedCount || 0;
        const totalStock = selectedVg.totalPhysicalStock || 0;
        const remainingStock = totalStock - reserved;
        
        // 남은 재고가 0 이하이면 품절
        if (remainingStock <= 0) {
            isSoldOut = true;
        }
    }

    // 4. 최종 상태 결정
    if (isSoldOut) {
        // 재고가 소진되었으면 '대기' 상태
        return 'WAITLISTABLE';
    } else {
        // 재고가 남아있으면 '구매 가능' 상태
        return 'PURCHASABLE';
    }
};