// functions/src/utils/pointService.ts

/**
 * @description 미션 완료 보상 정책
 * 서버 환경에서 사용될 포인트 정책입니다.
 */
export const MISSION_REWARDS: { [missionId: string]: { points: number; reason: string } } = {
  // --- 기존 미션 ---
  'no-show-free': { points: 50, reason: '미션 완료: 노쇼 없이 한 달' },
  'monthly-pickup': { points: 30, reason: '미션 완료: 이 달의 픽업 5회' },
  'first-referral': { points: 150, reason: '미션 완료: 첫 친구 초대 성공' },
  'first-nickname-set': { points: 20, reason: '첫 닉네임 설정 완료' },

  // --- ✅ [신규] 아주 쉬운 미션들 추가 ---
  'signup-bonus': { points: 100, reason: '소도몰에 오신 것을 환영합니다!' },
  
  // 연속 출석 미션 (단계별)
  'consecutive-login-2': { points: 5, reason: '미션 완료: 2일 연속 출석' },
  'consecutive-login-3': { points: 10, reason: '미션 완료: 3일 연속 출석' },
  'consecutive-login-5': { points: 20, reason: '미션 완료: 5일 연속 출석' },
  'consecutive-login-10': { points: 50, reason: '미션 완료: 10일 연속 출석' },

  // 친구 초대 미션 (횟수별)
  'referral-count-1': { points: 100, reason: '미션 완료: 첫 친구 초대 성공!' },
  'referral-count-3': { points: 300, reason: '미션 완료: 3명 친구 초대' },
  'referral-count-5': { points: 500, reason: '미션 완료: 5명 친구 초대' },
};

// 참고: 연속 출석 보상 등 다른 정책들도 필요하다면 여기에 추가할 수 있습니다.
export const ATTENDANCE_MILESTONES = {
    // ...
};