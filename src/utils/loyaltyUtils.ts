// src/utils/loyaltyUtils.ts

import type { LoyaltyTier } from '@/types';

/**
 * @description 포인트 점수에 따라 적절한 신뢰도 등급을 반환합니다.
 * @param points 사용자의 현재 신뢰도 포인트
 * @returns 계산된 LoyaltyTier 등급명
 */
export const calculateTier = (points: number): LoyaltyTier => {
  if (points >= 500) {
    return '공구의 신';
  }
  if (points >= 200) {
    return '공구왕';
  }
  if (points >= 50) {
    return '공구요정';
  }
  if (points >= 0) {
    return '공구새싹';
  }
  if (points >= -299) {
    return '주의 요망';
  }
  return '참여 제한';
};