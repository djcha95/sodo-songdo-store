// scripts/updateUserTiers.ts

// ✅ 1. 방금 만든 adminDb를 import 합니다.
import { adminDb } from '../src/firebase/firebaseAdmin'; 
import { calculateTier } from '../src/utils/loyaltyUtils';
import type { UserDocument } from '../src/types';

// ✅ 2. 기존의 복잡한 초기화 코드는 모두 제거되었습니다.

/**
 * @description Firestore의 모든 사용자의 loyaltyTier를 최신 기준으로 업데이트합니다.
 */
const updateAllUserTiers = async (): Promise<void> => {
  console.log('🔥 사용자 등급 마이그레이션을 시작합니다 (Admin SDK 사용)...');

  // ✅ 3. adminDb를 사용하여 Firestore에 접근합니다.
  const usersRef = adminDb.collection('users');
  const querySnapshot = await usersRef.get();

  if (querySnapshot.empty) {
    console.log('🤔 업데이트할 사용자가 없습니다.');
    return;
  }

  const totalUsers = querySnapshot.size;
  let updatedUsersCount = 0;
  let batch = adminDb.batch();
  let operationCount = 0;

  console.log(`✅ 총 ${totalUsers}명의 사용자를 확인합니다.`);

  for (const userDoc of querySnapshot.docs) {
    const userData = userDoc.data() as UserDocument;

    const pickupCount = userData.pickupCount || 0;
    const noShowCount = userData.noShowCount || 0;

    const newTier = calculateTier(pickupCount, noShowCount);
    
    if (userData.loyaltyTier !== newTier) {
      const userRef = adminDb.collection('users').doc(userDoc.id);
      batch.update(userRef, { loyaltyTier: newTier });
      updatedUsersCount++;
      operationCount++;
      console.log(`  - ${userData.displayName || userDoc.id} 등급 변경: ${userData.loyaltyTier || '없음'} -> ${newTier}`);
    }

    if (operationCount === 450) {
      await batch.commit();
      console.log('🔄 중간 배치 커밋 완료...');
      batch = adminDb.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  console.log('🎉 마이그레이션 완료!');
  console.log(`✨ 총 ${updatedUsersCount}명의 사용자 등급이 업데이트되었습니다.`);
};

// 스크립트 실행
updateAllUserTiers()
  .catch(error => {
    console.error('❌ 마이그레이션 중 심각한 오류가 발생했습니다:', error);
  });