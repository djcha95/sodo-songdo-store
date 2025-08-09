// functions/src/callable/referrals.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, admin } from "../firebase/admin.js"; // ★ 공용 초기화 사용

export const processReferralCode = onCall({ region: "asia-northeast3" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "인증 필요");

  const code = String((request.data?.code ?? "")).trim();
  if (!code) throw new HttpsError("invalid-argument", "초대 코드가 필요합니다.");

  const refereeUid = request.auth.uid;
  const usersRef = db.collection("users");

  const referrerSnapshot = await usersRef.where("referralCode","==",code).limit(1).get();
  if (referrerSnapshot.empty) throw new HttpsError("not-found","유효하지 않은 초대 코드입니다.");

  const referrerUid = referrerSnapshot.docs[0].id;
  if (referrerUid === refereeUid) throw new HttpsError("invalid-argument","자기 코드는 사용할 수 없습니다.");

  await db.runTransaction(async (tx) => {
    const refereeRef = usersRef.doc(refereeUid);
    const referrerRef = usersRef.doc(referrerUid);
    const refereeSnap = await tx.get(refereeRef);
    if (!refereeSnap.exists) throw new HttpsError("not-found","사용자 정보를 찾을 수 없습니다.");

    const refereeData = refereeSnap.data()!;
    if (refereeData.referredBy ?? null) throw new HttpsError("already-exists","이미 초대 코드를 입력했습니다.");

    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 365*24*60*60*1000);

    const refereeLog = { amount: 30, reason: "추천인 코드 입력", createdAt: now, expiresAt };
    const referrerLog = { amount: 100, reason: "친구 초대 성공", createdAt: now, expiresAt };

    tx.update(refereeRef, {
      points: admin.firestore.FieldValue.increment(30),
      referredBy: referrerUid,
      pointHistory: admin.firestore.FieldValue.arrayUnion(refereeLog),
    });

    tx.update(referrerRef, {
      points: admin.firestore.FieldValue.increment(100),
      pointHistory: admin.firestore.FieldValue.arrayUnion(referrerLog),
    });
  });

  return { message: "코드 적용 완료! 포인트가 지급되었습니다." };
});
