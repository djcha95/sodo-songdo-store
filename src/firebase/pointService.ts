// src/firebase/pointService.ts

import { db } from './firebaseConfig';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  doc,
  runTransaction,
  Timestamp,
  arrayUnion,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import type { UserDocument, Order, OrderStatus, PointLog, LoyaltyTier } from '@/types';
import { calculateTier } from '@/utils/loyaltyUtils';


/**
 * @description 연속 출석 보상 정책
 */
export const ATTENDANCE_MILESTONES: { [key: number]: { points: number; reason:string } } = {
  7: { points: 10, reason: '7일 연속 출석 달성!' },
  15: { points: 25, reason: '15일 연속 출석 달성!' },
  30: { points: 70, reason: '30일 연속 출석! (한달)' },
  60: { points: 150, reason: '60일 연속 출석! (두달)' },
  100: { points: 300, reason: '100일 연속 출석! 💯' },
  150: { points: 500, reason: '150일 연속 출석! 대단해요!' },
};

/**
 * @description 포인트 정책 정의
 */
export const POINT_POLICIES = {
  LATE_PICKED_UP: { points: -40, reason: '지각 픽업 완료' },
  NO_SHOW: { points: -100, reason: '노쇼 (미픽업)' },
  CANCEL_PENALTY: {
    basePoints: -20, 
    rate: 0.003,
    maxRatePenalty: -100,
    reason: '예약 취소 (마감 후)'
  },
  DAILY_LOGIN: { points: 1, reason: '일일 첫 로그인' },
  REVIEW_CREATED: { points: 5, reason: '리뷰 작성' },
  FRIEND_INVITED: { points: 100, reason: '친구 초대 성공' },
  COMMUNITY_PROMOTION: { points: 200, reason: '커뮤니티 홍보 인증' },
  NEW_USER_BASE: { points: 20, reason: '신규 회원 가입' },
  REFERRAL_BONUS_NEW_USER: { points: 30, reason: '추천인 코드 입력' },
  USE_WAITLIST_TICKET: { points: -50, reason: '대기 순번 상승권 사용'},
} as const;

/**
 * ✅ [신규] 미션 완료 보상 정책
 * @description 미션 ID를 키로 사용하여 보상 포인트를 정의합니다.
 */
export const MISSION_REWARDS: { [missionId: string]: { points: number; reason: string } } = {
  'no-show-free': { points: 50, reason: '미션 완료: 노쇼 없이 한 달' },
  'monthly-pickup': { points: 30, reason: '미션 완료: 이 달의 픽업 5회' },
  'first-referral': { points: 150, reason: '미션 완료: 첫 친구 초대 성공' }
};

/**
 * @description 주문 상태 변경에 따라 변경될 사용자 데이터를 계산하여 반환하는 함수
 */
export const calculateUserUpdateByStatus = (
  userDoc: UserDocument,
  order: Order,
  newStatus: OrderStatus
): { 
    updateData: Partial<UserDocument>; 
    pointLog: Omit<PointLog, 'id'> | null;
    tierChange: { from: LoyaltyTier; to: LoyaltyTier } | null;
} | null => {
  let policy: { points: number; reason: string } | null = null;
  let pickupCountIncrement = 0;
  let noShowCountIncrement = 0;

  const oldTier = userDoc.loyaltyTier || '공구새싹';

  switch (newStatus) {
    case 'PICKED_UP':
      const purchasePoints = Math.floor(order.totalPrice * 0.005);
      const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0; 
      const totalPoints = purchasePoints + prepaidBonus;
      
      let reason = `구매 확정 (결제액: ₩${order.totalPrice.toLocaleString()})`;
      if (prepaidBonus > 0) {
        reason = `선결제 ${reason}`;
      }
      policy = { points: totalPoints, reason };
      pickupCountIncrement = 1;
      break;
    case 'NO_SHOW':
      policy = POINT_POLICIES.NO_SHOW;
      noShowCountIncrement = 1;
      break;
  }

  if (!policy && pickupCountIncrement === 0 && noShowCountIncrement === 0) {
    return null;
  }

  const newPoints = (userDoc.points || 0) + (policy?.points || 0);
  const newPickupCount = (userDoc.pickupCount || 0) + pickupCountIncrement;
  const newNoShowCount = (userDoc.noShowCount || 0) + noShowCountIncrement;
  
  const newTier = calculateTier(newPickupCount, newNoShowCount);

  let tierChange: { from: LoyaltyTier, to: LoyaltyTier } | null = null;
  if (oldTier !== newTier) {
      tierChange = { from: oldTier, to: newTier };
  }

  const now = new Date();
  const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

  const pointLog: Omit<PointLog, 'id'> | null = policy ? {
    amount: policy.points,
    reason: policy.reason,
    createdAt: Timestamp.now(), 
    orderId: order.id,
    expiresAt: policy.points > 0 ? Timestamp.fromDate(expirationDate) : null,
  } : null;

  const updateData: Partial<UserDocument> & { pointHistory?: any } = {
    points: newPoints,
    loyaltyTier: newTier,
    pickupCount: newPickupCount,
    noShowCount: newNoShowCount,
  };
  
  if (pointLog) {
    updateData.pointHistory = arrayUnion(pointLog);
  }
  
  // 참고: 실제 프로덕션에서는 이 함수를 호출하는 Cloud Function Trigger에서
  // 아래와 같은 미션 완료 체크 및 보상 지급 로직을 함께 처리해야 합니다.
  // 예시:
  // if (newStatus === 'PICKED_UP') {
  //   await checkAndAwardMissionCompletion(userId, 'monthly-pickup');
  // }

  return { updateData, pointLog, tierChange };
};

/**
 * ✅ [신규] 미션 완료 보상을 지급하는 Cloud Function 호출 함수
 */
export const claimMissionReward = async (missionId: string, uniquePeriodId: string): Promise<{success: boolean, message: string}> => {
  const functions = getFunctions(getApp(), 'asia-northeast3');
  const claimReward = httpsCallable(functions, 'claimMissionReward');
  
  try {
    const result = await claimReward({ missionId, uniquePeriodId });
    return (result.data as {success: boolean, message: string});
  } catch(error: any) {
    console.error("미션 보상 요청 함수 호출 실패:", error);
    throw new Error(error.message || '미션 보상을 요청하는 중 오류가 발생했습니다.');
  }
};


/**
 * @description 관리자가 수동으로 사용자의 포인트를 조정합니다.
 */
export const adjustUserPoints = async (
  userId: string,
  amount: number,
  reason: string
): Promise<void> => {
  if (!userId || !reason) {
    throw new Error('사용자 ID와 조정 사유는 필수입니다.');
  }
  if (amount === 0) {
    throw new Error('포인트 조정 값은 0이 될 수 없습니다.');
  }

  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    const currentPoints = userDoc.data().points || 0;
    const newPoints = currentPoints + amount;
    
    const now = new Date();
    const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

    const newPointHistoryEntry: Omit<PointLog, 'id'> = {
      amount,
      reason: `(수동) ${reason}`,
      createdAt: Timestamp.now(), 
      expiresAt: amount > 0 ? Timestamp.fromDate(expirationDate) : null,
    };

    transaction.update(userRef, {
      points: newPoints,
      pointHistory: arrayUnion(newPointHistoryEntry),
    });
  });
};

/**
 * @description 사용자의 포인트 적립/사용 내역을 가져옵니다.
 */
export const getPointHistory = async (userId: string): Promise<PointLog[]> => {
  if (!userId) {
    console.error("User ID is required to get point history.");
    return [];
  }

  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    console.error("User document not found for ID:", userId);
    return [];
  }

  const userData = userDoc.data() as UserDocument;
  const history = (userData.pointHistory as PointLog[]) || [];

  return history.sort((a, b) => {
    const aTime = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
};


/**
 * @description 대기 순번 상승권 사용을 위해 Cloud Function을 호출합니다.
 */
export const applyWaitlistPriorityTicket = async (
  productId: string,
  roundId: string,
  itemId: string
): Promise<void> => {
  const functions = getFunctions(getApp(), 'asia-northeast3');
  const useWaitlistTicket = httpsCallable(functions, 'useWaitlistTicket');

  try {
    const payload = { productId, roundId, itemId };
    const result = await useWaitlistTicket(payload);
    
    if (!(result.data as any).success) {
      throw new Error((result.data as any).message || '서버에서 요청 처리에 실패했습니다.');
    }
  } catch (error) {
    console.error("순번 상승권 사용 함수 호출 실패:", error);
    if (error instanceof Error && 'code' in error && 'message' in error) {
        throw new Error((error as any).message);
    }
    throw new Error('순번 상승권 사용 중 오류가 발생했습니다.');
  }
};

/**
 * @description 사용자의 일일 방문을 기록하고 포인트와 등급을 업데이트합니다.
 */
export const recordDailyVisit = async (userId: string): Promise<void> => {
  const todayStr = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);

  try {
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) return;

      const userData = userDoc.data() as UserDocument;
      
      if (userData.lastLoginDate === todayStr) {
        return;
      }

      let pointsToAdd = 0;
      const pointLogsToAdd: Omit<PointLog, 'id'>[] = [];
      let newConsecutiveDays = userData.consecutiveLoginDays || 0;

      // 1. 기본 일일 로그인 포인트 추가
      pointsToAdd += POINT_POLICIES.DAILY_LOGIN.points;
      const dailyLoginExpiration = new Date();
      dailyLoginExpiration.setFullYear(dailyLoginExpiration.getFullYear() + 1);
      pointLogsToAdd.push({
        amount: POINT_POLICIES.DAILY_LOGIN.points,
        reason: POINT_POLICIES.DAILY_LOGIN.reason,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(dailyLoginExpiration),
      });

      // 2. 연속 출석일 계산
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (userData.lastLoginDate === yesterdayStr) {
        newConsecutiveDays += 1;
      } else {
        newConsecutiveDays = 1; 
      }

      // 3. 연속 출석 Milestone 달성 여부 확인 및 보상 추가
      const milestoneBonus = ATTENDANCE_MILESTONES[newConsecutiveDays];
      if (milestoneBonus) {
        pointsToAdd += milestoneBonus.points;
        const bonusExpiration = new Date();
        bonusExpiration.setFullYear(bonusExpiration.getFullYear() + 1);
        pointLogsToAdd.push({
          amount: milestoneBonus.points,
          reason: milestoneBonus.reason,
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromDate(bonusExpiration),
        });
      }
      
      const newPoints = (userData.points || 0) + pointsToAdd;
      
      const updateData = {
        points: newPoints,
        lastLoginDate: todayStr,
        consecutiveLoginDays: newConsecutiveDays,
        pointHistory: arrayUnion(...pointLogsToAdd),
      };

      transaction.update(userRef, updateData);
    });
  } catch (error) {
    console.error("일일 방문 기록 오류:", error);
  }
};


/**
 * @description 사용자 문서를 Firestore에서 삭제합니다. (주의: Authentication 계정은 직접 삭제하지 않음)
 */
export const deleteUserDocument = async (userId: string): Promise<void> => {
  const userDocRef = doc(db, 'users', userId);
  await deleteDoc(userDocRef);
};