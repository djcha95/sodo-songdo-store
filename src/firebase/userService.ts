// src/firebase/userService.ts
import { db } from './firebaseConfig';
import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  arrayUnion,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { UserDocument, PointLog } from '@/types';
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
      const existing = snap.data() as UserDocument;
      const updates: Partial<UserDocument> = {};

      if (!existing.displayName && user.displayName) updates.displayName = user.displayName;
      if (!existing.phone && kakaoAccount?.phone_number) updates.phone = kakaoAccount.phone_number;
      if (!existing.gender && kakaoAccount?.gender) updates.gender = kakaoAccount.gender;
      if (!existing.ageRange && kakaoAccount?.age_range) updates.ageRange = kakaoAccount.age_range;
      if (!existing.referralCode) updates.referralCode = generateReferralCode();

      if (Object.keys(updates).length) tx.update(userRef, updates);
    } else {
      const signupPoints = POINT_POLICIES.NEW_USER_BASE.points;
      const signupReason = POINT_POLICIES.NEW_USER_BASE.reason;

      const now = new Date();
      const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

      const initialPointLog: Omit<PointLog, 'id'> = {
        amount: signupPoints,
        reason: signupReason,
        createdAt: serverTimestamp(),
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
        loyaltyTier: '공구요정', // ✨ 기획서 기준 '공구요정'으로 변경
        pickupCount: 0,
        noShowCount: 0,
        lastLoginDate: new Date().toISOString().split('T')[0],
        isSuspended: false,
        gender: kakaoAccount?.gender || null,
        ageRange: kakaoAccount?.age_range || null,
        pointHistory: [initialPointLog as PointLog],
        referralCode: generateReferralCode(),
        referredBy: null,
        // ✨ [추가] 닉네임 필드 초기화
        nickname: '',
        nicknameChanged: false,
      };
      tx.set(userRef, newDoc);
    }
  });
};


/* ------------------------------------------------------------------ */
/* 2. 추천인 코드 관련 함수                                            */
/* ------------------------------------------------------------------ */

export const submitReferralCode = async (newUserId: string, referralCode: string): Promise<void> => {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('referralCode', '==', referralCode), limit(1));
  
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    throw new Error('유효하지 않은 추천인 코드입니다.');
  }
  
  const referrerDoc = querySnapshot.docs[0];
  const referrerId = referrerDoc.id;
  const newUserRef = doc(db, 'users', newUserId);
  
  if (referrerId === newUserId) {
    throw new Error('자신의 추천인 코드는 입력할 수 없습니다.');
  }

  await runTransaction(db, async (transaction) => {
    const newUserSnap = await transaction.get(newUserRef);
    if (!newUserSnap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다.');
    const newUserDoc = newUserSnap.data() as UserDocument;

    if (newUserDoc.referredBy !== null && newUserDoc.referredBy !== '__SKIPPED__') {
        throw new Error('이미 추천인 코드를 입력했습니다.');
    }

    const bonusPoints = POINT_POLICIES.REFERRAL_BONUS_NEW_USER.points;
    const bonusReason = POINT_POLICIES.REFERRAL_BONUS_NEW_USER.reason;
    const newTotalPoints = newUserDoc.points + bonusPoints;
    const newTier = calculateTier(newTotalPoints);
    
    const now = new Date();
    const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

    const pointLog: Omit<PointLog, 'id'> = {
        amount: bonusPoints,
        reason: bonusReason,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expirationDate)
    };
    
    transaction.update(newUserRef, {
        points: newTotalPoints,
        loyaltyTier: newTier,
        referredBy: referralCode,
        pointHistory: arrayUnion(pointLog),
    });
  });
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

// ✨ [신규] 사용자 역할을 변경하는 함수 (Master 권한 필요)
export const updateUserRole = async (targetUserId: string, newRole: UserDocument['role']): Promise<void> => {
  if (!targetUserId || !newRole) {
    throw new Error("사용자 ID와 새로운 역할은 필수입니다.");
  }
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, { role: newRole });
};