// functions/src/callable/missions.ts

import { https } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

import { MISSION_REWARDS } from '../pointService.js';
import type { UserDocument, Order } from '../types.js';

// 클라이언트의 getOrderStatusDisplay와 유사한 로직을 서버에도 구현
const getOrderStatusDisplay = (order: Order) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const pickupDeadline = order.pickupDeadlineDate ? (order.pickupDeadlineDate as Timestamp).toDate() : null;
  const isPickupDeadlinePassed = pickupDeadline && pickupDeadline.getTime() < now.getTime();

  if (order.status === 'CANCELED') return { type: 'cancelled' };
  if (order.status !== 'PICKED_UP' && isPickupDeadlinePassed) return { type: 'noshow' };
  if (order.status === 'PICKED_UP') return { type: 'completed' };
  return { type: 'pending' };
};

const calculateServerSideMissionStatus = async (
  db: FirebaseFirestore.Firestore,
  missionId: string,
  userDoc: UserDocument,
): Promise<boolean> => {
  const now = new Date();

  // --- 월간 미션용 날짜 계산 ---
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // --- 미션 ID에 따라 분기 ---
  if (missionId.startsWith('monthly') || missionId === 'no-show-free') {
    const ordersSnapshot = await db.collection('orders')
      .where('userId', '==', userDoc.uid)
      .where('pickupDate', '>=', startOfMonth)
      .where('pickupDate', '<=', endOfMonth)
      .get();
    const monthlyOrders = ordersSnapshot.docs.map(doc => doc.data() as Order);

    if (missionId === 'no-show-free') {
      const noShowCount = monthlyOrders.filter(o => getOrderStatusDisplay(o).type === 'noshow').length;
      return noShowCount === 0 && monthlyOrders.length > 0;
    }
    if (missionId === 'monthly-pickup') {
      const pickupTarget = 5;
      const pickupCount = monthlyOrders.filter(o => getOrderStatusDisplay(o).type === 'completed').length;
      return pickupCount >= pickupTarget;
    }
  }

  // ✅ [수정] 'signup-bonus' 미션은 별도 조건 없이 항상 '완료'로 간주하여,
  // 기존 사용자가 보상을 받을 수 있도록 허용합니다.
  if (missionId === 'signup-bonus') {
    return true; 
  }

  if (missionId.startsWith('consecutive-login-')) {
    const targetDays = parseInt(missionId.split('-')[2], 10);
    return (userDoc.consecutiveLoginDays || 0) >= targetDays;
  }
  
  if (missionId.startsWith('referral-count-')) {
    const targetCount = parseInt(missionId.split('-')[2], 10);
    const referralCount = userDoc.pointHistory?.filter(log => log.reason === '친구 초대 성공').length ?? 0;
    return referralCount >= targetCount;
  }

  return false;
};


export const claimMissionReward = https.onCall({
  cors: [/localhost:\d+/, "https://sodo-songdo.store", "https://www.sodo-songdo.store"],
  region: "asia-northeast3",
}, async (request) => {
  if (!request.auth) {
    throw new https.HttpsError('unauthenticated', '인증되지 않은 사용자입니다.');
  }

  const { missionId, uniquePeriodId } = request.data;
  if (!missionId || !uniquePeriodId) {
    throw new https.HttpsError('invalid-argument', '필수 정보(missionId, uniquePeriodId)가 누락되었습니다.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  const userRef = db.collection('users').doc(uid);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new https.HttpsError('not-found', '사용자 정보를 찾을 수 없습니다.');
      }
      const userData = userDoc.data() as UserDocument;

      if (userData.completedMissions?.[uniquePeriodId]) {
        return { success: false, message: '이미 보상을 받은 미션입니다.' };
      }

      const isCompleted = await calculateServerSideMissionStatus(db, missionId, userData);
      if (!isCompleted) {
        throw new https.HttpsError('failed-precondition', '미션 완료 조건을 충족하지 못했습니다. 데이터가 동기화될 때까지 잠시 기다려주세요.');
      }

      const reward = MISSION_REWARDS[missionId];
      if (!reward) {
        throw new https.HttpsError('not-found', '정의되지 않은 미션 보상입니다.');
      }

      const newPoints = (userData.points || 0) + reward.points;
      const now = new Date();
      const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

      const pointLog = {
        amount: reward.points,
        reason: reward.reason,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expirationDate),
      };

      const completedMissionPath = `completedMissions.${uniquePeriodId}`;

      transaction.update(userRef, {
        points: newPoints,
        pointHistory: FieldValue.arrayUnion(pointLog),
        [completedMissionPath]: true,
      });

      return { success: true, message: `"${reward.reason}" 보상으로 ${reward.points}P를 획득했습니다!` };
    });

    return result;

  } catch (error) {
    console.error("미션 보상 지급 중 오류 발생:", error);
    if (error instanceof https.HttpsError) {
      throw error;
    }
    throw new https.HttpsError('internal', '미션 보상 처리 중 서버에서 오류가 발생했습니다.');
  }
});