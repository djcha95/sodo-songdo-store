// functions/src/utils/helpers.ts

// Tier 계산 로직
export const calculateTier = (pickupCount: number, noShowCount: number): string => {
  const totalTransactions = pickupCount + noShowCount;

  if (totalTransactions === 0) {
    return "공구새싹";
  }

  if (noShowCount >= 3) {
    return "참여 제한";
  }

  const pickupRate = (pickupCount / totalTransactions) * 100;

  if (pickupRate >= 98 && pickupCount >= 50) return "공구의 신";
  if (pickupRate >= 95 && pickupCount >= 20) return "공구왕";
  if (pickupRate >= 90 && pickupCount >= 5) return "공구요정";
  if (pickupRate >= 80) return "공구새싹";
  return "주의 요망";
};

// 포인트 정책
export const POINT_POLICIES = {
  FRIEND_INVITED: { points: 30, reason: "친구 초대 성공" },
};