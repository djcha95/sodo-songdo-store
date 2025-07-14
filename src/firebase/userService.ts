// src/firebase/userService.ts

import { db } from './firebaseConfig';
import { doc, runTransaction, serverTimestamp, collection, addDoc, Timestamp, getDoc, query, orderBy, getDocs } from 'firebase/firestore';
import type { Order, OrderStatus, UserDocument, PointLog } from '@/types';

/**
 * 신뢰도 점수 로그를 기록하는 헬퍼 함수
 * @param transaction Firestore 트랜잭션 객체
 * @param userId 사용자 ID
 * @param amount 변경된 점수
 * @param reason 점수 변경 사유
 */
const addPointLog = async (
  transaction: any,
  userId: string,
  amount: number,
  reason: string
) => {
  const logRef = doc(collection(db, 'users', userId, 'pointLogs'));
  const now = Timestamp.now();
  const expiresAt = new Timestamp(now.seconds + 90 * 24 * 60 * 60, now.nanoseconds); // 90일 후 소멸

  transaction.set(logRef, {
    amount,
    reason,
    createdAt: now,
    expiresAt,
  });
};

/**
 * 주문 상태를 업데이트하고 사용자의 신뢰도 점수를 조정하는 트랜잭션 함수
 * @param orderId 주문 ID
 * @param newStatus 새로운 주문 상태
 * @param pointChange 점수 변경량 (+10, -10, -50 등)
 * @param reason 점수 변경 사유
 */
export const updateOrderStatusAndLoyalty = async (
  order: Order,
  newStatus: OrderStatus,
  pointChange: number,
  reason: string
) => {
  const orderRef = doc(db, 'orders', order.id);
  const userRef = doc(db, 'users', order.userId);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error("사용자 정보를 찾을 수 없습니다.");
    }

    const currentPoints = userDoc.data().loyaltyPoints || 0;
    const currentPickupCount = userDoc.data().pickupCount || 0;
    const currentNoShowCount = userDoc.data().noShowCount || 0;
    
    const updates: any = {
      loyaltyPoints: currentPoints + pointChange,
    };

    if (newStatus === 'PICKED_UP') {
      updates.pickupCount = currentPickupCount + 1;
    } else if (newStatus === 'NO_SHOW') {
      updates.noShowCount = currentNoShowCount + 1;
    }
    
    // 1. 사용자 정보 업데이트 (점수, 카운트)
    transaction.update(userRef, updates);

    // 2. 주문 상태 업데이트
    const orderUpdateData: any = { status: newStatus };
    if (newStatus === 'PICKED_UP') {
      orderUpdateData.pickedUpAt = serverTimestamp();
    }
    transaction.update(orderRef, orderUpdateData);

    // 3. 점수 변경 로그 기록
    if (pointChange !== 0) {
      await addPointLog(transaction, order.userId, pointChange, reason);
    }
  });
};


/**
 * 일일 첫 로그인 시 포인트를 지급하는 함수
 * @param userId 사용자 ID
 */
export const recordDailyVisit = async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    const todayStr = new Date().toISOString().split('T')[0];

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) return;

            const lastLogin = userDoc.data().lastLoginDate;
            
            // 마지막 로그인 날짜가 오늘이 아닐 경우에만 포인트 지급
            if (lastLogin !== todayStr) {
                const currentPoints = userDoc.data().loyaltyPoints || 0;
                
                transaction.update(userRef, {
                    loyaltyPoints: currentPoints + 1,
                    lastLoginDate: todayStr,
                });

                await addPointLog(transaction, userId, 1, '일일 접속');
            }
        });
    } catch (error) {
        console.error("일일 방문 포인트 지급 오류:", error);
        // 이 오류는 사용자에게 직접적인 영향을 주지 않으므로, 에러를 던지지 않고 콘솔에만 기록
    }
};

/**
 * @description 사용자 ID로 사용자 문서를 가져옵니다.
 */
export const getUserDocById = async (userId: string): Promise<UserDocument | null> => {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data() as UserDocument : null;
};

/**
 * @description 특정 사용자의 포인트 변동 내역 전체를 가져옵니다.
 */
export const getPointHistory = async (userId: string): Promise<PointLog[]> => {
  const logsRef = collection(db, 'users', userId, 'pointLogs');
  const q = query(logsRef, orderBy('createdAt', 'desc'));
  
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as PointLog));
};