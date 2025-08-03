// src/utils/loyaltyUtils.ts
// ✅ [확인] 이 파일은 이미 올바른 로직을 가지고 있어 수정이 필요 없습니다.
// 서버 측('functions/src/utils/helpers.ts') 코드를 이 파일의 로직과 동일하게 수정했습니다.

import type { LoyaltyTier } from '@/types';

/**
 * @description ✅ [전면 개편] 사용자의 누적 픽업/노쇼 건수를 바탕으로 '신뢰 등급'을 계산합니다.
 * 등급은 이제 포인트와 무관하며, 사용자의 장기적인 신뢰도를 반영합니다.
 * * @param pickupCount 총 픽업 완료 건수
 * @param noShowCount 총 노쇼(미픽업) 건수
 * @returns 계산된 LoyaltyTier 등급명
 */
export const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
  const totalTransactions = pickupCount + noShowCount;

  // 거래 내역이 없는 초기 사용자는 '새싹' 등급
  if (totalTransactions === 0) {
    return '공구새싹';
  }

  // 노쇼가 3회 이상 누적되면 즉시 '참여 제한'
  if (noShowCount >= 3) {
    return '참여 제한';
  }

  const pickupRate = (pickupCount / totalTransactions) * 100;

  // 픽업률과 누적 픽업 건수를 조합하여 등급 결정
  if (pickupRate >= 98 && pickupCount >= 50) {
    return '공구의 신';
  }
  if (pickupRate >= 95 && pickupCount >= 20) {
    return '공구왕';
  }
  if (pickupRate >= 90 && pickupCount >= 5) {
    return '공구요정';
  }
  if (pickupRate >= 70) {
    return '공구새싹';
  }
  
  // 픽업률이 70% 미만일 경우 '주의 요망'
  return '주의 요망';
};
