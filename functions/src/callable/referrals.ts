// functions/src/callable/referrals.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
// ✅ [수정] import 방식을 index.ts와 동일하게 맞춰 오류를 해결합니다.
import admin from "firebase-admin";

// 포인트 정책 (Cloud Function 환경에 맞게 재정의)
const POINT_POLICIES = {
  FRIEND_INVITED: { points: 100, reason: "친구 초대 성공" },
  REFERRAL_BONUS_NEW_USER: { points: 30, reason: "추천인 코드 입력" },
};

export const processReferralCode = onCall({ region: "asia-northeast3" }, async (request) => {
    // 1. 인증된 사용자인지 확인
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "인증된 사용자만 이용 가능합니다."
      );
    }

    const data = request.data as { code: string };
    const code = data.code;
    const refereeUid = request.auth.uid; // 코드를 입력한 사용자 (피추천인)

    if (!code) {
      throw new HttpsError(
        "invalid-argument",
        "초대 코드가 제공되지 않았습니다."
      );
    }

    const db = admin.firestore();
    const usersRef = db.collection("users");

    // 2. 추천인 코드와 일치하는 사용자(추천인) 찾기
    const referrerQuery = usersRef.where("referralCode", "==", code).limit(1);
    const referrerSnapshot = await referrerQuery.get();

    if (referrerSnapshot.empty) {
      throw new HttpsError(
        "not-found",
        "유효하지 않은 초대 코드입니다."
      );
    }

    const referrerDoc = referrerSnapshot.docs[0];
    const referrerUid = referrerDoc.id; // 코드를 제공한 사용자 (추천인)

    // 3. 자기 자신을 추천하는지 확인
    if (referrerUid === refereeUid) {
      throw new HttpsError(
        "invalid-argument",
        "자신의 초대 코드는 입력할 수 없습니다."
      );
    }

    try {
      // 4. 트랜잭션을 사용하여 데이터 일관성 보장
      await db.runTransaction(async (transaction) => {
        const refereeRef = usersRef.doc(refereeUid);
        const referrerRef = usersRef.doc(referrerUid);

        const refereeSnap = await transaction.get(refereeRef);

        if (!refereeSnap.exists) {
          throw new HttpsError(
            "not-found",
            "사용자 정보를 찾을 수 없습니다."
          );
        }
        const refereeData = refereeSnap.data()!;

        // 5. 이미 추천인 코드를 입력했는지 확인
        if (refereeData.referredBy && refereeData.referredBy !== null) {
          throw new HttpsError(
            "already-exists",
            "이미 초대 코드를 입력했습니다."
          );
        }
        
        const now = admin.firestore.Timestamp.now();
        const expirationDate = new admin.firestore.Timestamp(now.seconds + 31536000, now.nanoseconds); // 1년 뒤

        // --- 피추천인(코드 입력한 사람) 정보 업데이트 ---
        const refereePoints = POINT_POLICIES.REFERRAL_BONUS_NEW_USER.points;
        const refereePointLog = {
          amount: refereePoints,
          reason: POINT_POLICIES.REFERRAL_BONUS_NEW_USER.reason,
          createdAt: now,
          expiresAt: expirationDate,
        };
        transaction.update(refereeRef, {
          points: admin.firestore.FieldValue.increment(refereePoints),
          referredBy: referrerUid, // 추천인의 UID를 기록
          pointHistory: admin.firestore.FieldValue.arrayUnion(refereePointLog),
        });

        // --- 추천인(코드 제공한 사람) 정보 업데이트 ---
        const referrerPoints = POINT_POLICIES.FRIEND_INVITED.points;
        const referrerPointLog = {
            amount: referrerPoints,
            reason: POINT_POLICIES.FRIEND_INVITED.reason,
            createdAt: now,
            expiresAt: expirationDate,
        };
        transaction.update(referrerRef, {
            points: admin.firestore.FieldValue.increment(referrerPoints),
            pointHistory: admin.firestore.FieldValue.arrayUnion(referrerPointLog)
        });
      });

      return { message: "코드 적용 완료! 포인트가 지급되었습니다." };

    } catch (error: any) {
      console.error("Referral transaction failed:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "코드 적용 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  });