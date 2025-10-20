// src/utils/loyaltyUtils.ts

// ✅ [수정] LoyaltyTier 타입을 이 파일 내에 직접 정의하여 독립적으로 만듭니다.
export type LoyaltyTier =
  | '공구의 신'
  | '공구왕'
  | '공구요정'
  | '공구새싹'
  | '공구초보' // '공구초보' 추가
  | '공구제한'; // '공구제한'으로 변경


/**
 * @description ✅ [사용자 요청 반영] 신뢰 등급 계산 로직을 수정합니다.
 * '참여 제한'과 '주의 요망' 등급이 자동으로 부여되는 조건을 제거합니다.
 * 모든 사용자는 '공구새싹' 등급에서 시작하여 긍정적인 활동을 통해 등급이 상승합니다.
 * 부정적인 등급은 추후 관리자가 수동으로 지정하는 기능으로 대체됩니다.
 * @param pickupCount 총 픽업 완료 건수 (주문 건 기준)
 * @param noShowCount 총 노쇼(미픽업) 건수 (주문 건 기준)
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