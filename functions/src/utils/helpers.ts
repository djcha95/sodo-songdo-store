// functions/src/utils/helpers.ts

// ✅ [수정] 클라이언트와 서버의 로직을 완전히 일치시키기 위해 전체적으로 업데이트합니다.
import type { LoyaltyTier } from "../types.js";

/**
 * @description ✅ [사용자 요청 반영] 등급 산정 기준을 '노쇼 횟수'에서 '픽업률' 중심으로 변경합니다.
 * - '참여 제한': 총 거래 5회 이상이면서 픽업률 50% 미만
 * - '주의 요망': 총 거래 5회 이상이면서 픽업률 70% 미만
 * - 등급 상승 조건은 기존의 '픽업 횟수 + 픽업률' 기준을 유지하여 성취감을 제공합니다.
 * @param pickupCount 총 픽업 완료 건수
 * @param noShowCount 총 노쇼(미픽업) 건수
 * @returns 계산된 LoyaltyTier 등급명
 */
export const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  const totalTransactions = pickupCount + noShowCount;

  // 1. 거래 내역이 없는 초기 사용자는 '공구새싹'
  if (totalTransactions === 0) {
    return "공구새싹";
  }

  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 2. 픽업률 기반 페널티 (총 거래 5회 이상부터 적용)
  //   - 신규 유저가 초반의 실수로 바로 페널티를 받는 것을 방지합니다.
  if (totalTransactions >= 5) {
    if (pickupRate < 50) {
      return "참여 제한";
    }
    if (pickupRate < 70) {
      return "주의 요망";
    }
  }

  // 3. 픽업률과 누적 픽업 건수를 조합한 등급 상승 (기존 상향된 기준 유지)
  if (pickupRate >= 98 && pickupCount >= 250) {
    return "공구의 신";
  }
  if (pickupRate >= 95 && pickupCount >= 100) {
    return "공구왕";
  }
  if (pickupRate >= 90 && pickupCount >= 30) {
    return "공구요정";
  }

  // 4. 위 조건에 모두 해당하지 않는 경우 '공구새싹'
  return "공구새싹";
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