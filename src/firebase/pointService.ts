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
  collection,
} from 'firebase/firestore';
// ✅ [수정] OrderStatus에 'LATE_CANCELED' 타입을 추가해야 합니다 (types.ts 파일에서).
import type { UserDocument, Order, OrderStatus, PointLog, LoyaltyTier } from '@/shared/types';
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
  // ✅ [신규] 2차 공구 기간 내 취소 패널티 (0.5 노쇼)
  LATE_CANCEL_PENALTY: { points: -50, reason: '마감 임박 취소 (0.5 노쇼)' },
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
} as const;

/**
 * 미션 완료 보상 정책
 * @description 모든 미션에 대한 보상 포인트를 정의합니다.
 */
export const MISSION_REWARDS: { [missionId: string]: { points: number; reason: string } } = {
  // 기존 월간 미션
  'no-show-free': { points: 50, reason: '미션 완료: 노쇼 없이 한 달' },
  'monthly-pickup': { points: 30, reason: '미션 완료: 이 달의 픽업 5회' },

  // 신규 달성 미션
  'signup-bonus': { points: 100, reason: '소도몰에 오신 것을 환영합니다!' },
  'first-nickname-set': { points: 20, reason: '첫 닉네임 설정 완료' },
  'consecutive-login-3': { points: 10, reason: '미션 완료: 3일 연속 출석' },
  'referral-count-1': { points: 100, reason: '미션 완료: 첫 친구 초대' },
};

/**
 * @description 주문 상태 변경에 따라 변경될 사용자 데이터를 계산하여 반환하는 함수
 * @important `types.ts` 파일에서 `UserDocument`의 `noShowCount` 타입을 `number`로 변경해야 합니다.
 */
export const calculateUserUpdateByStatus = (
  userDoc: UserDocument,
  order: Order,
  newStatus: OrderStatus
): {
    updateData: Partial<UserDocument>;
    pointLog: PointLog | null;
    tierChange: { from: LoyaltyTier; to: LoyaltyTier } | null;
} | null => {
  let policy: { points: number; reason: string } | null = null;
  let pickupCountIncrement = 0;
  // ✅ [수정] 0.5 노쇼를 반영하기 위해 number 타입으로 변경
  let noShowCountIncrement: number = 0;

  const oldTier = userDoc.loyaltyTier || '공구새싹';

  switch (newStatus) {
    case 'PICKED_UP':
      // ✅ [수정] order.totalPrice가 undefined일 경우를 대비하여 0을 기본값으로 사용
      const orderTotal = order.totalPrice || 0;
      const purchasePoints = Math.floor(orderTotal * 0.005);
      // ✅ [신규] 선결제 주문건에 5P 보너스 추가
      const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
      const totalPoints = purchasePoints + prepaidBonus;

      // ✅ [수정] 선결제 보너스가 있을 경우 사유에 명시
      let reason = `구매 확정 (결제액: ₩${orderTotal.toLocaleString()})`;
      if (prepaidBonus > 0) {
        reason = `[선결제 보너스] ${reason}`;
      }
      policy = { points: totalPoints, reason };
      pickupCountIncrement = 1;
      break;
    case 'NO_SHOW':
      policy = POINT_POLICIES.NO_SHOW;
      noShowCountIncrement = 1; // 1.0 노쇼
      break;
    // ✅ [신규] 2차 공구 기간 내 취소(0.5 노쇼) 케이스 추가
    case 'LATE_CANCELED':
      policy = POINT_POLICIES.LATE_CANCEL_PENALTY;
      noShowCountIncrement = 0.5; // 0.5 노쇼
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
  const expirationDate = new Date(now);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  const pointLog: PointLog | null = policy ? {
    id: doc(collection(db, 'users')).id,
    amount: policy.points,
    reason: policy.reason,
    createdAt: Timestamp.now(),
    orderId: order.id,
    expiresAt: policy.points > 0 ? Timestamp.fromDate(expirationDate) : null,
  } : null;

  // ✅ [수정] noShowCount가 number 타입이어야 함 (types.ts에서 수정 필요)
  const updateData: Partial<UserDocument> & { pointHistory?: any } = {
    points: newPoints,
    loyaltyTier: newTier,
    pickupCount: newPickupCount,
    noShowCount: newNoShowCount,
  };

  if (pointLog) {
    updateData.pointHistory = arrayUnion(pointLog);
  }

  return { updateData, pointLog, tierChange };
};

/**
 * @description 미션 완료 보상을 지급하는 Cloud Function 호출 함수
 */
export const claimMissionReward = async (missionId: string, uniquePeriodId: string): Promise<{success: boolean, message: string}> => {
  const functions = getFunctions(getApp(), 'asia-northeast3');
  const claimReward = httpsCallable(functions, 'claimMissionReward');

  try {
    const result = await claimReward({ missionId, uniquePeriodId });
    return (result.data as {success: boolean, message: string});
  } catch(error: any) {
    console.error("미션 보상 요청 함수 호출 실패:", error);
    if (error.code && error.message) {
        const message = (error.details as any)?.message || error.message;
        throw new Error(message);
    }
    throw new Error('미션 보상을 요청하는 중 알 수 없는 오류가 발생했습니다.');
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
    const expirationDate = new Date(now);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    const newPointHistoryEntry: PointLog = {
      id: doc(collection(db, 'users')).id,
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
 * @description 관리자가 포인트 내역을 직접 수정합니다.
 */
export const updatePointLog = async (
  userId: string,
  logId: string,
  newAmount: number,
  newReason: string
): Promise<void> => {
  if (!userId || !logId) {
    throw new Error('사용자 ID와 로그 ID는 필수입니다.');
  }

  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('사용자를 찾을 수 없습니다.');

    const userData = userDoc.data() as UserDocument;
    const history = (userData.pointHistory || []) as PointLog[];
    const logIndex = history.findIndex(log => log.id === logId);

    if (logIndex === -1) throw new Error('수정할 포인트 내역을 찾을 수 없습니다.');

    const oldLog = history[logIndex];
    const pointDifference = newAmount - oldLog.amount;

    const newPoints = (userData.points || 0) + pointDifference;

    const updatedLog = { ...oldLog, amount: newAmount, reason: newReason };
    const newHistory = [...history];
    newHistory[logIndex] = updatedLog;

    transaction.update(userRef, {
      points: newPoints,
      pointHistory: newHistory,
    });
  });
};

/**
 * @description 관리자가 포인트 내역을 삭제합니다.
 */
export const deletePointLog = async (userId: string, logId: string): Promise<void> => {
  if (!userId || !logId) {
    throw new Error('사용자 ID와 로그 ID는 필수입니다.');
  }

  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('사용자를 찾을 수 없습니다.');

    const userData = userDoc.data() as UserDocument;
    const history = (userData.pointHistory || []) as PointLog[];
    const logToDelete = history.find(log => log.id === logId);

    if (!logToDelete) throw new Error('삭제할 포인트 내역을 찾을 수 없습니다.');

    const newHistory = history.filter(log => log.id !== logId);
    const newPoints = (userData.points || 0) - logToDelete.amount;

    transaction.update(userRef, {
      points: newPoints,
      pointHistory: newHistory
    });
  });
};

/**
 * ✅ [신규] 관리자가 여러 포인트 내역을 한 번에 삭제합니다.
 */
export const deleteMultiplePointLogs = async (userId: string, logIds: string[]): Promise<void> => {
  if (!userId || logIds.length === 0) {
    throw new Error('사용자 ID와 로그 ID 목록은 필수입니다.');
  }

  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('사용자를 찾을 수 없습니다.');

    const userData = userDoc.data() as UserDocument;
    const history = (userData.pointHistory || []) as PointLog[];
    
    let pointsToDeduct = 0;
    const logsToDelete = new Set(logIds);

    const newHistory = history.filter(log => {
      if (logsToDelete.has(log.id)) {
        pointsToDeduct += log.amount;
        return false; // 이 로그는 삭제되므로 새 배열에서 제외
      }
      return true;
    });

    if (pointsToDeduct === 0 && newHistory.length === history.length) {
        throw new Error('삭제할 포인트 내역을 찾을 수 없습니다.');
    }

    const newPoints = (userData.points || 0) - pointsToDeduct;
    
    transaction.update(userRef, {
      points: newPoints,
      pointHistory: newHistory
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

  const historyWithIds = history.map((log, index) => ({
    ...log,
    id: log.id || `temp-${index}-${log.createdAt.toString()}`,
  }));

  const sorted = historyWithIds.sort((a, b) => {
    const aTime = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });

  return sorted;
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
      const pointLogsToAdd: PointLog[] = [];
      let newConsecutiveDays = userData.consecutiveLoginDays || 0;
      const pointIdBase = doc(collection(db, 'users')).id;

      // 1. 기본 일일 로그인 포인트 추가
      pointsToAdd += POINT_POLICIES.DAILY_LOGIN.points;
      const dailyLoginExpiration = new Date();
      dailyLoginExpiration.setFullYear(dailyLoginExpiration.getFullYear() + 1);
      pointLogsToAdd.push({
        id: `${pointIdBase}-daily`,
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
          id: `${pointIdBase}-milestone-${newConsecutiveDays}`,
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