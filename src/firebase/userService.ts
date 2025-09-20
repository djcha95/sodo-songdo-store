// src/firebase/userService.ts


import {
  collection,
  query,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  getDoc,
  updateDoc,
} from 'firebase/firestore/lite';

import type { User as FirebaseUser } from 'firebase/auth';
import type { UserDocument, PointLog, LoyaltyTier } from '@/types';
import { POINT_POLICIES } from './pointService';
import { calculateTier } from '@/utils/loyaltyUtils';
import { getFirebaseServices } from './firebaseInit'; // ✅ firebaseInit import
import { httpsCallable } from 'firebase/functions'; // ✅ httpsCallable import 추가


// ---------------------------------------------------------------------------------
// 👇👇👇 중요: 아래 두 값을 본인의 Firebase 프로젝트에 맞게 수정해주세요! 👇👇👇
// ---------------------------------------------------------------------------------
const FIREBASE_PROJECT_ID = 'sso-do'; // 예: sodomall-12345
const FIREBASE_REGION = 'asia-northeast3'; // 예: asia-northeast3 (서울)
// ---------------------------------------------------------------------------------

// Cloud Function URL을 동적으로 생성합니다.
const setUserRoleUrl = `https://${FIREBASE_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/setUserRole`;


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
export const processUserSignIn = async (user: FirebaseUser, kakaoData: any | null): Promise<void> => {
  const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
  const userRef = doc(db, 'users', user.uid);
  const kakaoAccount = kakaoData?.kakao_account;

  const phoneNumber = kakaoAccount?.phone_number?.replace(/-/g, '') || null;
  const phoneLast4 = phoneNumber ? phoneNumber.slice(-4) : undefined;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists()) {
      const userData = snap.data() as UserDocument;
      const updates: Partial<UserDocument> = {
        lastLoginDate: new Date().toISOString().split('T')[0],
        photoURL: user.photoURL || userData.photoURL,
        displayName: user.displayName || userData.displayName,
        email: user.email || userData.email,
      };
      if (userData.referredBy === undefined) {
        updates.referredBy = null;
      }
      if (phoneNumber && userData.phone !== phoneNumber) {
        updates.phone = phoneNumber;
        updates.phoneLast4 = phoneLast4;
      } else if (!userData.phoneLast4 && phoneLast4) {
        updates.phoneLast4 = phoneLast4;
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
        phone: phoneNumber,
        phoneLast4: phoneLast4,
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
  if (!code) {
    throw new Error('초대 코드를 입력해주세요.');
  }
  const { functions } = await getFirebaseServices(); // ✅ 함수 내에서 functions 호출
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
  const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { referredBy: '__SKIPPED__' });
};

/* ------------------------------------------------------------------ */
/* 3. 조회 및 관리용 유틸                                              */
/* ------------------------------------------------------------------ */

/**
 * ✅ [핵심 수정] 사용자의 역할(커스텀 클레임 및 Firestore 문서)을 업데이트합니다.
 * @param targetUid 역할을 변경할 대상 사용자의 UID
 * @param newRole 새로운 역할 ('customer', 'admin', 'master')
 */
export const updateUserRole = async (targetUid: string, newRole: UserDocument['role']): Promise<string> => {
  const { auth } = await getFirebaseServices(); // ✅ 함수 내에서 auth 호출
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("인증된 관리자가 없습니다. 다시 로그인해주세요.");
  }

  // 1. 현재 로그인한 관리자의 ID 토큰을 가져옵니다. (서버 인증용)
  const idToken = await currentUser.getIdToken();

  // 2. 백엔드의 setUserRole HTTP 함수를 호출하여 실제 권한을 변경합니다.
  const response = await fetch(`${setUserRoleUrl}?uid=${targetUid}&role=${newRole}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Cloud Function Error:", errorText);
    throw new Error(`역할 변경에 실패했습니다. (서버 응답: ${response.status})`);
  }

  // 성공 메시지를 반환합니다.
  return await response.text();
};


export const getUserDocById = async (userId: string): Promise<UserDocument | null> => {
  const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data() as UserDocument) : null;
};

export const adjustUserCounts = async (userId: string, newPickupCount: number, newNoShowCount: number): Promise<void> => {
  if (newPickupCount < 0 || newNoShowCount < 0) {
    throw new Error("횟수는 0 이상이어야 합니다.");
  }
  const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
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
  const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
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

export const getAllUsersForQuickCheck = async (): Promise<UserDocument[]> => {
  try {
    const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(query(usersRef));
    const users = querySnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    })) as UserDocument[];
    return users;
  } catch (error) {
    console.error("Error fetching all users:", error);
    throw new Error("전체 사용자 목록을 가져오는데 실패했습니다.");
  }
};

export const runDataReaggregation = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { functions } = await getFirebaseServices(); // ✅ 함수 내에서 functions 호출
    const reaggregate = httpsCallable<void, { success: boolean; message: string }>(functions, 'reaggregateAllUserData');
    const result = await reaggregate();
    return result.data;
  } catch (error: any) {
    console.error("Callable function 'reaggregateAllUserData' failed:", error);
    if (error.code && error.message) {
      const message = (error.details as any)?.message || error.message;
      throw new Error(message);
    }
    throw new Error('데이터 보정 스크립트 실행 중 예상치 못한 오류가 발생했습니다.');
  }
};

export const runGrant100PointsToAll = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { functions } = await getFirebaseServices(); // ✅ 함수 내에서 functions 호출
    const grant = httpsCallable<void, { success: boolean; message: string }>(functions, 'grant100PointsToAllUsers');
    const result = await grant();
    return result.data;
  } catch (error: any) {
    // ... (에러 처리 부분은 기존과 동일)
    throw new Error((error.details as any)?.message || '포인트 지급 스크립트 실행 중 오류가 발생했습니다.');
  }
};

/**
 * @description 사용자 ID로 단일 사용자 문서를 가져옵니다.
 */
export const getUserById = async (userId: string): Promise<UserDocument | null> => {
  if (!userId) return null;
  try {
    const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // 문서 데이터와 함께 문서 ID(uid)를 포함하여 반환합니다.
      return { uid: userSnap.id, ...userSnap.data() } as UserDocument;
    }

    // 사용자를 찾지 못한 경우 null을 반환합니다.
    return null;

  } catch (error) {
    console.error("Error fetching user by ID:", error);
    // 오류 발생 시 예외를 던져 상위 컴포넌트에서 처리하도록 합니다.
    throw new Error("사용자 정보를 불러오는 데 실패했습니다.");
  }
};