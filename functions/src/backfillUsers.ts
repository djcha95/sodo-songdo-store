// functions/src/backfillUsers.ts

import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import type { UserDocument } from './types.js';

// Firebase Admin SDK 초기화 (이미 되어있지 않은 경우)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 모든 사용자 문서를 순회하며 'phone' 필드가 있지만 'phoneLast4' 필드가 없는 경우,
 * 'phone' 필드의 마지막 4자리를 추출하여 'phoneLast4' 필드를 생성하고 채워줍니다.
 * 이 함수는 일회성으로 실행하기 위한 관리자용 도구입니다.
 */
export const backfillUserPhoneLast4 = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 540, memory: '1GiB' },
  async (req) => {
    
    // 관리자 또는 인증된 사용자만 실행 가능하게 하려면 아래 주석을 해제하고 로직을 추가하세요.
    // if (!req.auth || !req.auth.token.isAdmin) { // 'isAdmin'은 커스텀 클레임 예시
    //   throw new HttpsError('permission-denied', '이 작업을 수행할 권한이 없습니다.');
    // }

    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();

    if (usersSnapshot.empty) {
      console.log('[Backfill] 처리할 사용자가 없습니다.');
      return { updatedCount: 0, skippedCount: 0, errorCount: 0 };
    }

    const bulk = db.bulkWriter();
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    console.log(`[Backfill] 총 ${usersSnapshot.size}명의 사용자를 대상으로 phoneLast4 채우기 작업을 시작합니다.`);

    for (const doc of usersSnapshot.docs) {
      try {
        const userData = doc.data() as UserDocument;

        // 1. phoneLast4 필드가 이미 존재하는 경우 건너뛰기
        if (userData.phoneLast4 && userData.phoneLast4.length === 4) {
          skippedCount++;
          continue;
        }

        // 2. phone 필드가 없거나 비어있는 경우 건너뛰기
        if (!userData.phone || typeof userData.phone !== 'string' || userData.phone.length < 4) {
          skippedCount++;
          continue;
        }

        // 3. phone 필드에서 마지막 4자리 추출하여 업데이트 예약
        const last4 = userData.phone.slice(-4);
        bulk.update(doc.ref, { phoneLast4: last4 });
        updatedCount++;

      } catch (error) {
        console.error(`[Backfill] 문서 ID ${doc.id} 처리 중 오류 발생:`, error);
        errorCount++;
      }
    }

    // BulkWriter 작업 완료
    await bulk.close();

    const resultMessage = `[Backfill] 작업 완료. 업데이트: ${updatedCount}명, 건너뜀: ${skippedCount}명, 오류: ${errorCount}명`;
    console.log(resultMessage);

    return { updatedCount, skippedCount, errorCount };
  }
);