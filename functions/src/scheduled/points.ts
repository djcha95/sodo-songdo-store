// functions/src/scheduled/points.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
// ✅ [수정] dbAdmin을 db라는 별칭으로 가져옵니다.
import { dbAdmin as db } from "../firebase/admin.js";
// ✅ [수정] Firestore 타입을 import 합니다.
import { Timestamp, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { calculateTier } from "../utils/helpers.js";
import type { UserDocument, PointLog } from "../types.js";

// ✅ [추가] UserDocument에 대한 Firestore 데이터 변환기(Converter)를 정의합니다.
const userConverter = {
  toFirestore(user: UserDocument): DocumentData { return user; },
  fromFirestore(snapshot: QueryDocumentSnapshot): UserDocument {
    return snapshot.data() as UserDocument;
  }
};

export const expirePointsScheduled = onSchedule(
  {
    schedule: "0 0 * * *", // 매일 자정에 실행
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (event) => {
    logger.log("Starting point expiration process.");
    const now = new Date();
    // ✅ [수정] 타입 변환기를 사용하여 쿼리합니다.
    const usersRef = db.collection("users").withConverter(userConverter);
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      logger.log("No users to process.");
      return;
    }

    const batch = db.batch();
    let updatedUserCount = 0;

    // ✅ [수정] 이제 'doc' 파라미터에 타입을 명시하지 않아도 됩니다.
    snapshot.forEach((doc) => {
      const user = doc.data();
      const pointHistory = user.pointHistory || [];
      let totalExpiredAmount = 0;

      const newPointHistory = pointHistory.filter((log: PointLog) => {
        // 만료된 포인트를 계산하면서, 이미 만료 처리된 로그는 제외합니다.
        if (
          log.amount > 0 &&
          log.expiresAt &&
          !log.isExpired && // isExpired 필드가 false이거나 없는 경우만
          log.expiresAt.toDate() <= now
        ) {
          totalExpiredAmount += log.amount;
          return false; // 만료된 포인트는 새 기록에서 제외
        }
        return true;
      });

      if (totalExpiredAmount > 0) {
        updatedUserCount++;
        const currentPoints = user.points || 0;
        const newPoints = Math.max(0, currentPoints - totalExpiredAmount);

        // 사용자의 등급은 포인트와 무관하게 픽업률로만 계산됩니다.
        const newTier = calculateTier(user.pickupCount || 0, user.noShowCount || 0);

        // 만료 기록을 PointLog에 추가합니다.
        const expirationLog: Omit<PointLog, "id"> = {
          amount: -totalExpiredAmount,
          reason: "포인트 유효기간 만료",
          createdAt: Timestamp.now(),
          expiresAt: null,
        };
        newPointHistory.push(expirationLog as PointLog);

        const userDocRef = usersRef.doc(doc.id);
        batch.update(userDocRef, {
          points: newPoints,
          loyaltyTier: newTier,
          pointHistory: newPointHistory,
        });

        logger.log(`User ${doc.id}: Expired ${totalExpiredAmount} points. New total: ${newPoints}`);
      }
    });

    if (updatedUserCount > 0) {
      await batch.commit();
      logger.log(
        `Point expiration process completed for a total of ${updatedUserCount} users.`
      );
    } else {
      logger.log("No points to expire today.");
    }
  }
);