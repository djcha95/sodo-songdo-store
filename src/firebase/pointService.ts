// src/firebase/pointService.ts

import { db } from './firebaseConfig';
import {
  doc,
  runTransaction,
  Timestamp,
  arrayUnion,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import type { UserDocument, Order, OrderStatus, PointLog, Product } from '@/types';
import { calculateTier } from '@/utils/loyaltyUtils';

/**
 * @description 포인트 정책 정의
 * ✅ [수정] 취소 패널티 정책의 이름과 사유를 명확하게 변경했습니다.
 */
export const POINT_POLICIES = {
  LATE_PICKED_UP: { points: -40, reason: '지각 픽업 완료' },
  NO_SHOW: { points: -100, reason: '노쇼 (미픽업)' },
  CANCEL_IN_PENALTY_WINDOW: { points: -30, reason: '1차 마감 후 ~ 픽업일 13시 사이 취소' }, // ✅ [수정]
  CANCEL_ON_PICKUP_DAY: { points: -40, reason: '픽업 당일 취소' },
  DAILY_LOGIN: { points: 1, reason: '일일 첫 로그인' },
  MONTHLY_ATTENDANCE_BONUS: { points: 100, reason: '한달 연속 출석 보너스' },
  REVIEW_CREATED: { points: 5, reason: '리뷰 작성' },
  FRIEND_INVITED: { points: 30, reason: '친구 초대 성공' },
  COMMUNITY_PROMOTION: { points: 200, reason: '커뮤니티 홍보 인증' },
  NEW_USER_BASE: { points: 20, reason: '신규 회원 가입' },
  REFERRAL_BONUS_NEW_USER: { points: 30, reason: '추천인 코드 입력' },
  USE_WAITLIST_TICKET: { points: -50, reason: '대기 순번 상승권 사용'},
} as const;


/**
 * @description 주문 상태 변경에 따라 신뢰도 포인트를 적용하고 등급을 업데이트하는 핵심 함수
 */
export const applyPointChangeByStatus = async (
  transaction: any,
  userId: string,
  order: Order,
  newStatus: OrderStatus
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userDocSnap = await transaction.get(userRef);
  if (!userDocSnap.exists()) return;

  const userDoc = userDocSnap.data() as UserDocument;

  let policy: { points: number; reason: string } | null = null;
  let pickupCountIncrement = 0;
  let noShowCountIncrement = 0;

  switch (newStatus) {
    case 'PICKED_UP':
      const purchasePoints = Math.floor(order.totalPrice * 0.005);
      const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0; 
      const totalPoints = purchasePoints + prepaidBonus;
      
      let reason = `구매 확정 (결제액: ₩${order.totalPrice.toLocaleString()})`;
      if (prepaidBonus > 0) {
        reason = `선결제 ${reason}`;
      }

      policy = {
        points: totalPoints,
        reason: reason
      };
      pickupCountIncrement = 1;
      break;
    case 'NO_SHOW':
      policy = POINT_POLICIES.NO_SHOW;
      noShowCountIncrement = 1;
      break;
  }

  if (policy && policy.points !== 0) { 
    const newPoints = (userDoc.points || 0) + policy.points;
    const newTier = calculateTier(newPoints);
    const now = new Date();
    const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

    const newPointHistoryEntry: Omit<PointLog, 'id'> = {
      amount: policy.points,
      reason: policy.reason,
      createdAt: Timestamp.now(), 
      orderId: order.id,
      expiresAt: policy.points > 0 ? Timestamp.fromDate(expirationDate) : null,
    };

    const updateData: any = {
      points: newPoints,
      loyaltyTier: newTier,
      pointHistory: arrayUnion(newPointHistoryEntry), 
    };

    if (pickupCountIncrement > 0) {
      updateData.pickupCount = (userDoc.pickupCount || 0) + pickupCountIncrement;
    }
    if (noShowCountIncrement > 0) {
      updateData.noShowCount = (userDoc.noShowCount || 0) + noShowCountIncrement;
    }

    transaction.update(userRef, updateData);
  }
};

/**
 * @description 관리자가 수동으로 사용자의 포인트를 조정하고 등급을 업데이트합니다.
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
    const newTier = calculateTier(newPoints);
    
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
      loyaltyTier: newTier,
      pointHistory: arrayUnion(newPointHistoryEntry),
    });
  });
};

/**
 * @description 대기 순번 상승권을 사용하고 순번을 조정하는 트랜잭션 함수
 */
export const applyWaitlistPriorityTicket = async (
  userId: string,
  productId: string,
  roundId: string,
  itemId: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const productRef = doc(db, 'products', productId);
  const ticketCost = Math.abs(POINT_POLICIES.USE_WAITLIST_TICKET.points);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error('사용자를 찾을 수 없습니다.');
    const userData = userDoc.data() as UserDocument;
    if (userData.points < ticketCost) throw new Error(`포인트가 부족합니다. (${ticketCost}P 필요)`);
    
    const productDoc = await transaction.get(productRef);
    if (!productDoc.exists()) throw new Error('상품을 찾을 수 없습니다.');
    const productData = productDoc.data() as Product;
    
    const salesHistory = [...productData.salesHistory];
    const roundIndex = salesHistory.findIndex(r => r.roundId === roundId);
    if (roundIndex === -1) throw new Error('판매 회차를 찾을 수 없습니다.');
    
    const round = salesHistory[roundIndex];
    if (!round.waitlist) throw new Error('대기열 정보를 찾을 수 없습니다.');
    
    const entryIndex = round.waitlist.findIndex(e => e.userId === userId && e.itemId === itemId);
    if (entryIndex === -1) throw new Error('내 대기 정보를 찾을 수 없습니다. 이미 취소되었을 수 있습니다.');
    if (round.waitlist[entryIndex].isPrioritized) throw new Error('이미 순번 상승권을 사용한 대기입니다.');

    const newPoints = userData.points - ticketCost;
    const newTier = calculateTier(newPoints);
    const pointHistoryEntry: Omit<PointLog, 'id'> = {
      amount: -ticketCost,
      reason: POINT_POLICIES.USE_WAITLIST_TICKET.reason,
      createdAt: Timestamp.now(), 
      expiresAt: null,
    };

    transaction.update(userRef, {
      points: newPoints,
      loyaltyTier: newTier,
      pointHistory: arrayUnion(pointHistoryEntry),
    });

    round.waitlist[entryIndex].timestamp = Timestamp.now();
    round.waitlist[entryIndex].isPrioritized = true;
    round.waitlist.sort((a, b) => {
      if(a.isPrioritized && !b.isPrioritized) return -1;
      if(!a.isPrioritized && b.isPrioritized) return 1;
      return b.timestamp.toMillis() - a.timestamp.toMillis();
    });
    salesHistory[roundIndex] = round;
    transaction.update(productRef, { salesHistory });
  });
};

/**
 * @description 특정 사용자의 포인트 변동 내역을 가져옵니다.
 */
export const getPointHistory = async (
  userId: string,
  count: number = 20
): Promise<PointLog[]> => {
  const userRef = doc(db, 'users', userId);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) return [];

  const userData = userSnapshot.data() as UserDocument;
  const history = userData.pointHistory || [];

  return history
    .sort((a, b) => {
      const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(0);
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, count)
    .map((log, index) => ({
      ...log,
      id: `${((log.createdAt as Timestamp)?.seconds || Date.now())}-${index}`
    }));
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

      pointsToAdd += POINT_POLICIES.DAILY_LOGIN.points;
      const dailyLoginExpiration = new Date();
      dailyLoginExpiration.setFullYear(dailyLoginExpiration.getFullYear() + 1);
      pointLogsToAdd.push({
        amount: POINT_POLICIES.DAILY_LOGIN.points,
        reason: POINT_POLICIES.DAILY_LOGIN.reason,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(dailyLoginExpiration),
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (userData.lastLoginDate === yesterdayStr) {
        newConsecutiveDays += 1;
      } else {
        newConsecutiveDays = 1; 
      }

      if (newConsecutiveDays === 30) {
        pointsToAdd += POINT_POLICIES.MONTHLY_ATTENDANCE_BONUS.points;
        const bonusExpiration = new Date();
        bonusExpiration.setFullYear(bonusExpiration.getFullYear() + 1);
        pointLogsToAdd.push({
          amount: POINT_POLICIES.MONTHLY_ATTENDANCE_BONUS.points,
          reason: POINT_POLICIES.MONTHLY_ATTENDANCE_BONUS.reason,
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromDate(bonusExpiration),
        });
        newConsecutiveDays = 0; 
      }
      
      const newPoints = (userData.points || 0) + pointsToAdd;
      const newTier = calculateTier(newPoints);
      
      const updateData = {
        points: newPoints,
        loyaltyTier: newTier,
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