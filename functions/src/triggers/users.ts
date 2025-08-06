// functions/src/triggers/users.ts

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
// ✅ [수정] 사용하지 않는 getFirestore 제거
import { FieldValue, Timestamp } from 'firebase-admin/firestore'; 
import { MISSION_REWARDS } from '../pointService.js';
import type { UserDocument } from '../types.js';

// 사용자가 처음 생성되었을 때 실행되는 트리거
export const onUserCreate = onDocumentCreated("users/{userId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No data associated with the event");
        return;
    }
    const newUser = snapshot.data() as UserDocument;

    // --- 1. 가입 환영 보너스 지급 ---
    const missionId = 'signup-bonus';
    const reward = MISSION_REWARDS[missionId];

    if (reward) {
        console.log(`[Welcome Bonus] Awarding ${reward.points} points to new user ${newUser.uid}.`);

        const now = new Date();
        const expirationDate = new Date(now.setFullYear(now.getFullYear() + 1));

        const pointLog = {
            amount: reward.points,
            reason: reward.reason,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(expirationDate),
        };

        // 트랜잭션 없이 바로 업데이트 (문서 생성 시점에는 충돌 우려가 적음)
        await snapshot.ref.update({
            points: FieldValue.increment(reward.points),
            pointHistory: FieldValue.arrayUnion(pointLog),
        });
    }

    return;
});