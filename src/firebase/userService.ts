// src/firebase/userService.ts

import { db, functions } from './firebaseConfig';
// ✅ [수정] httpsCallable을 'firebase/functions'에서 가져옵니다.
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
  // ... (기존 코드와 동일)
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
export const processUserSignIn = async (user: User, kakaoData: any | null): Promise<void> => {
  // ... (기존 코드와 동일)
  const userRef = doc(db, 'users', user.uid);
  const kakaoAccount = kakaoData?.kakao_account;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists()) {
      const userData = snap.data() as UserDocument;
      const updates: Partial<UserDocument> = {
        lastLoginDate: new Date().toISOString().split('T')[0],
        photoURL: user.photoURL || userData.photoURL,
      };
      if (userData.referredBy === undefined) {
        updates.referredBy = null;
      }
      tx.update(userRef, updates);
    } else {
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
        referredBy: null,
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
export const submitReferralCode = async (code: string): Promise<string> => {
  // ... (기존 코드와 동일)
  if (!code) {
    throw new Error('초대 코드를 입력해주세요.');
  }
  const processReferral = httpsCallable(functions, 'processReferralCode');
  try {
    const result = await processReferral({ code });
    return (result.data as { message: string }).message;
  } catch (error: any) {
    console.error("Cloud Function 호출 오류:", error);
    throw new Error(error.message || '초대 코드 적용에 실패했습니다.');
  }
};

export const skipReferralCode = async (userId: string): Promise<void> => {
    // ... (기존 코드와 동일)
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { referredBy: '__SKIPPED__' });
};


/* ------------------------------------------------------------------ */
/* 3. 조회용 유틸                                                      */
/* ------------------------------------------------------------------ */
export const getUserDocById = async (userId: string): Promise<UserDocument | null> => {
  // ... (기존 코드와 동일)
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data() as UserDocument) : null;
};
export const updateUserRole = async (targetUserId: string, newRole: UserDocument['role']): Promise<void> => {
  // ... (기존 코드와 동일)
  if (!targetUserId || !newRole) {
    throw new Error("사용자 ID와 새로운 역할은 필수입니다.");
  }
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, { role: newRole });
};
export const adjustUserCounts = async (userId: string, newPickupCount: number, newNoShowCount: number): Promise<void> => {
  // ... (기존 코드와 동일)
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
export const setManualTierForUser = async (userId: string, tier: LoyaltyTier | null): Promise<void> => {
  // ... (기존 코드와 동일)
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


// ✅ [수정] 아래 searchUsers 함수를 파일의 맨 아래에 추가합니다.
/* ------------------------------------------------------------------ */
/* 4. 사용자 검색 (Cloud Function 호출)                                */
/* ------------------------------------------------------------------ */

/**
 * @description Cloud Function 'searchUsers'를 호출하여 이름 또는 전화번호로 사용자를 검색합니다.
 * @param searchTerm 사용자가 입력한 검색어
 * @returns 검색된 사용자 목록
 */
export const searchUsers = async (searchTerm: string): Promise<UserDocument[]> => {
  if (!searchTerm) return [];
  
  // 'searchUsers' 라는 이름의 Cloud Function을 호출
  const searchUsersFunction = httpsCallable(functions, 'searchUsers');
  
  try {
    const result = await searchUsersFunction({ searchTerm });
    return result.data as UserDocument[];
  } catch (error: any) {
    console.error("사용자 검색 Cloud Function 호출 오류:", error);
    throw new Error(error.message || '사용자 검색에 실패했습니다.');
  }
};