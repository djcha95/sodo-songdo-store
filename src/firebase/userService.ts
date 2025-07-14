// src/firebase/userService.ts

import { db } from './firebaseConfig';
// [수정] 사용하지 않는 addDoc, setDoc을 import 목록에서 제거합니다.
import { doc, runTransaction, serverTimestamp, collection, Timestamp, getDoc, query, orderBy, getDocs } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Order, OrderStatus, UserDocument, PointLog } from '@/types';

/**
 * @description 카카오 로그인 성공 시 사용자 정보를 Firestore에 생성하거나 업데이트합니다.
 * @param user Firebase Auth를 통해 로그인한 사용자 객체
 * @param kakaoData (선택) 카카오 /v2/user/me API를 통해 직접 받은 사용자 정보 객체
 */
export const processUserSignIn = async (user: User, kakaoData: any | null): Promise<void> => {
    const userRef = doc(db, 'users', user.uid);
    
    const kakaoAccount = kakaoData?.kakao_account;

    await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);

        if (userDoc.exists()) {
            // 문서가 이미 존재하면, 누락된 정보만 업데이트
            const existingData = userDoc.data() as UserDocument;
            const updates: Partial<UserDocument> = {};

            if (!existingData.displayName && user.displayName) {
                updates.displayName = user.displayName;
            }
            if (!existingData.phone && kakaoAccount?.phone_number) {
                updates.phone = kakaoAccount.phone_number;
            }
            if (!existingData.gender && kakaoAccount?.gender) {
                updates.gender = kakaoAccount.gender;
            }
            if (!existingData.ageRange && kakaoAccount?.age_range) {
                updates.ageRange = kakaoAccount.age_range;
            }
            
            if (Object.keys(updates).length > 0) {
                transaction.update(userRef, updates);
            }

        } else {
            // 새 사용자 문서 생성
            const newUserDocument: UserDocument = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                phone: kakaoAccount?.phone_number || null,
                photoURL: user.photoURL,
                role: 'customer',
                createdAt: serverTimestamp(),
                loyaltyPoints: 10,
                pickupCount: 0,
                noShowCount: 0,
                lastLoginDate: new Date().toISOString().split('T')[0],
                isRestricted: false,
                gender: kakaoAccount?.gender || null,
                ageRange: kakaoAccount?.age_range || null,
            };
            transaction.set(userRef, newUserDocument);
            await addPointLog(transaction, user.uid, 10, '신규 가입');
        }
    });
};


/**
 * 신뢰도 점수 로그를 기록하는 헬퍼 함수
 */
const addPointLog = async (
  transaction: any,
  userId: string,
  amount: number,
  reason: string
) => {
  const logRef = doc(collection(db, 'users', userId, 'pointLogs'));
  const now = Timestamp.now();
  const expiresAt = new Timestamp(now.seconds + 90 * 24 * 60 * 60, now.nanoseconds);

  transaction.set(logRef, {
    amount,
    reason,
    createdAt: now,
    expiresAt,
  });
};

/**
 * 주문 상태를 업데이트하고 사용자의 신뢰도 점수를 조정하는 트랜잭션 함수
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
    
    transaction.update(userRef, updates);

    const orderUpdateData: any = { status: newStatus };
    if (newStatus === 'PICKED_UP') {
      orderUpdateData.pickedUpAt = serverTimestamp();
    }
    transaction.update(orderRef, orderUpdateData);

    if (pointChange !== 0) {
      await addPointLog(transaction, order.userId, pointChange, reason);
    }
  });
};


/**
 * 일일 첫 로그인 시 포인트를 지급하는 함수
 */
export const recordDailyVisit = async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    const todayStr = new Date().toISOString().split('T')[0];

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) return;

            const lastLogin = userDoc.data().lastLoginDate;
            
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