// src/firebase/userService.ts
import { db, functions } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { UserDocument, PointLog, LoyaltyTier } from '@/types';
import { POINT_POLICIES } from './pointService';
import { calculateTier } from '@/utils/loyaltyUtils';

/* ------------------------------------------------------------------ */
/* 0. 유틸리티 함수                                                   */
/* ------------------------------------------------------------------ */

const generateReferralCode = (length = 6): string => {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SODO${result}`;
};


/* ------------------------------------------------------------------ */
/* 1. 로그인 시 사용자 문서 초기화 / 갱신                                */
/* ------------------------------------------------------------------ */
export const processUserSignIn = async (
  user: User,
  kakaoData: any | null,
): Promise<void> => {
  const userRef = doc(db, 'users', user.uid);
  const kakaoAccount = kakaoData?.kakao_account;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);

    if (snap.exists()) {
      // ✅ [수정] 기존 사용자를 위한 로직
      const userData = snap.data() as UserDocument;
      const updates: Partial<UserDocument> = {
        lastLoginDate: new Date().toISOString().split('T')[0],
        photoURL: user.photoURL || userData.photoURL,
      };

      // 만약 기존 사용자에게 referredBy 필드가 없다면, null 값으로 추가해줍니다.
      if (userData.referredBy === undefined) {
        updates.referredBy = null;
      }
      
      tx.update(userRef, updates);

    } else {
      // 신규 사용자를 위한 로직
      const signupPoints = POINT_POLICIES.NEW_USER_BASE.points;
      const signupReason = POINT_POLICIES.NEW_USER_BASE.reason;

      const now = new Date();
      const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

      const initialPointLog: Omit<PointLog, 'id'> = {
        amount: signupPoints,
        reason: signupReason,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expirationDate),
      };

      const newDoc: UserDocument = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phone: kakaoAccount?.phone_number || null,
        photoURL: user.photoURL,
        role: 'customer',
        createdAt: serverTimestamp(),
        points: signupPoints,
        loyaltyTier: '공구새싹',
        pickupCount: 0,
        noShowCount: 0,
        lastLoginDate: new Date().toISOString().split('T')[0],
        isSuspended: false,
        gender: kakaoAccount?.gender || null,
        ageRange: kakaoAccount?.age_range || null,
        pointHistory: [initialPointLog as PointLog],
        referralCode: generateReferralCode(),
        referredBy: null, // 신규 사용자는 여기서 추가
        nickname: '',
        nicknameChanged: false,
        hasCompletedTutorial: false,
      };
      tx.set(userRef, newDoc);
    }
  });
};


/* ------------------------------------------------------------------ */
/* 2. 추천인 코드 관련 함수                                            */
/* ------------------------------------------------------------------ */

/**
 * @description Cloud Function 'processReferralCode'를 호출하여 추천인 코드를 처리합니다.
 * @param code 사용자가 입력한 추천인 코드
 * @returns 성공 메시지
 */
export const submitReferralCode = async (code: string): Promise<string> => {
  if (!code) {
    throw new Error('초대 코드를 입력해주세요.');
  }

  // 'processReferralCode' 라는 이름의 Cloud Function을 가져옵니다.
  const processReferral = httpsCallable(functions, 'processReferralCode');

  try {
    const result = await processReferral({ code });
    // Cloud function은 { message: '...' } 형태의 데이터를 반환합니다.
    return (result.data as { message: string }).message;
  } catch (error: any) {
    console.error("Cloud Function 호출 오류:", error);
    // Firebase Cloud Function에서 보내는 오류 메시지를 그대로 사용자에게 전달합니다.
    throw new Error(error.message || '초대 코드 적용에 실패했습니다.');
  }
};

export const skipReferralCode = async (userId: string): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { referredBy: '__SKIPPED__' });
};


/* ------------------------------------------------------------------ */
/* 3. 조회용 유틸                                                      */
/* ------------------------------------------------------------------ */
export const getUserDocById = async (userId: string): Promise<UserDocument | null> => {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data() as UserDocument) : null;
};

export const updateUserRole = async (targetUserId: string, newRole: UserDocument['role']): Promise<void> => {
  if (!targetUserId || !newRole) {
    throw new Error("사용자 ID와 새로운 역할은 필수입니다.");
  }
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, { role: newRole });
};

export const adjustUserCounts = async (
  userId: string,
  newPickupCount: number,
  newNoShowCount: number
): Promise<void> => {
  if (newPickupCount < 0 || newNoShowCount < 0) {
    throw new Error("횟수는 0 이상이어야 합니다.");
  }
  const userRef = doc(db, 'users', userId);
  const newTier = calculateTier(newPickupCount, newNoShowCount);
  await updateDoc(userRef, {
    pickupCount: newPickupCount,
    noShowCount: newNoShowCount,
    loyaltyTier: newTier,
    manualTier: null,
  });
};

export const setManualTierForUser = async (
  userId: string,
  tier: LoyaltyTier | null
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  if (tier) {
    await updateDoc(userRef, {
      manualTier: tier,
      loyaltyTier: tier,
    });
  } else {
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const user = userSnap.data() as UserDocument;
      const newTier = calculateTier(user.pickupCount || 0, user.noShowCount || 0);
      await updateDoc(userRef, {
        manualTier: null,
        loyaltyTier: newTier,
      });
    }
  }
};