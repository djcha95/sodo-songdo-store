// functions/src/utils/helpers.ts

// ✅ [수정] 클라이언트('src/utils/loyaltyUtils.ts')와 등급 계산 로직을 완벽하게 통일했습니다.
// '공구새싹' 등급의 픽업률 기준을 80%에서 70%로 수정하여 데이터 불일치 버그를 해결합니다.
import type { LoyaltyTier } from "../types.js";

// Tier 계산 로직
export const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  const totalTransactions = pickupCount + noShowCount;

  // 거래 내역이 없는 초기 사용자는 '새싹' 등급
  if (totalTransactions === 0) {
    return "공구새싹";
  }

  // 노쇼가 3회 이상 누적되면 즉시 '참여 제한'
  if (noShowCount >= 3) {
    return "참여 제한";
  }

  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 픽업률과 누적 픽업 건수를 조합하여 등급 결정
  if (pickupRate >= 98 && pickupCount >= 50) {
    return "공구의 신";
  }
  if (pickupRate >= 95 && pickupCount >= 20) {
    return "공구왕";
  }
  if (pickupRate >= 90 && pickupCount >= 5) {
    return "공구요정";
  }
  // ✅ [핵심 수정] 80에서 70으로 기준을 변경하여 클라이언트와 로직을 통일합니다.
  if (pickupRate >= 70) {
    return "공구새싹";
  }
  
  // 픽업률이 70% 미만일 경우 '주의 요망'
  return "주의 요망";
};


// 포인트 정책
export const POINT_POLICIES = {
  FRIEND_INVITED: { points: 30, reason: "친구 초대 성공" },
};
