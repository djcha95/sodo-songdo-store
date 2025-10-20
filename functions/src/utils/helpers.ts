// functions/src/utils/helpers.ts

// ✅ [수정] 클라이언트와 서버의 로직을 완전히 일치시키기 위해 전체적으로 업데이트합니다.
import type { LoyaltyTier } from "@/shared/types";

/**
 * @description ✅ [사용자 요청 반영] 상향된 등급 기준(250/100/30회)을 적용합니다.
 * @param pickupCount 총 픽업 완료 건수
 * @param noShowCount 총 노쇼(미픽업) 건수
 * @returns 계산된 LoyaltyTier 등급명
 */
export const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  // 1. 픽업/노쇼 0회 -> 공구초보
  if (pickupCount === 0 && noShowCount === 0) {
    return '공구초보';
  }

  const totalTransactions = pickupCount + noShowCount;
  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 2. 긍정적 등급 (기존 로직 유지)
  if (pickupRate >= 98 && pickupCount >= 250) {
    return '공구의 신';
  }
  if (pickupRate >= 95 && pickupCount >= 100) {
    return '공구왕';
  }
  if (pickupRate >= 90 && pickupCount >= 30) {
    return '공구요정';
  }

  // 3. 픽업 1회 이상, '요정' 미만 -> 공구새싹
  if (pickupCount > 0) {
    return '공구새싹';
  }

  // 4. 그 외 (예: 픽업 0, 노쇼 1회) -> 공구초보
  return '공구초보';
};

/**
 * @description ✅ [수정] 누락된 정책들을 모두 추가하여 클라이언트와 정책을 동기화합니다.
 */
export const POINT_POLICIES = {
  LATE_PICKED_UP: { points: -40, reason: "지각 픽업 완료" },
  NO_SHOW: { points: -100, reason: "노쇼 (미픽업)" },
  CANCEL_PENALTY: {
    basePoints: -20,
    rate: 0.003,
    maxRatePenalty: -100,
    reason: "예약 취소 (마감 후)",
  },
  DAILY_LOGIN: { points: 1, reason: "일일 첫 로그인" },
  MONTHLY_ATTENDANCE_BONUS: { points: 100, reason: "한달 연속 출석 보너스" },
  REVIEW_CREATED: { points: 5, reason: "리뷰 작성" },
  FRIEND_INVITED: { points: 30, reason: "친구 초대 성공" },
  COMMUNITY_PROMOTION: { points: 200, reason: "커뮤니티 홍보 인증" },
  NEW_USER_BASE: { points: 20, reason: "신규 회원 가입" },
  REFERRAL_BONUS_NEW_USER: { points: 30, reason: "추천인 코드 입력" },
};