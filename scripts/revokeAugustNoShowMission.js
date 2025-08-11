// revokeAugustNoShowMission.js

const admin = require('firebase-admin');

// 1. 다운로드한 서비스 계정 키 파일 경로
const serviceAccount = require('./serviceAccountKey.json');

// 2. 스크립트 실행 모드 설정 (true: 테스트 실행, false: 실제 데이터 변경)
const isDryRun = false; 

// Firebase Admin SDK 초기화
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// ===============================================
// 8월 노쇼 미션 조기 지급 회수 로직
// ===============================================
async function revokeAugustNoShowMission() {
  console.log(`스크립트를 ${isDryRun ? '✅ 테스트 모드(Dry Run)' : '🔥 실제 실행 모드'}로 시작합니다.`);

  // --- 초기화 대상 미션 정보 ---
  const uniquePeriodId = 'no-show-free-2025-08';
  const pointsToRevoke = 50;
  const correctionReason = "(포인트 조정) 8월 노쇼 방지 미션 조기 지급 회수";

  console.log(`\n[회수 대상]: '${uniquePeriodId}' 미션을 완료했다고 기록된 모든 사용자`);
  
  // 1. 8월 미션을 완료했다고 기록된 모든 사용자를 조회
  const usersRef = db.collection('users').where(`completedMissions.${uniquePeriodId}`, '==', true);
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log('포인트를 회수할 대상 사용자가 없습니다. 스크립트를 종료합니다.');
    return;
  }
  
  const batch = db.batch();
  let usersToCorrectCount = 0;

  console.log('\n포인트 회수 대상 사용자 목록:');

  for (const userDoc of snapshot.docs) {
    usersToCorrectCount++;
    const user = userDoc.data();
    const userId = userDoc.id;
    const currentPoints = user.points || 0;
    const correctedPoints = currentPoints - pointsToRevoke;
    
    console.log('--------------------------------------------------');
    console.log(`[회수 대상 발견] 사용자: ${user.displayName}(${userId})`);
    console.log(`  - 회수될 포인트: ${pointsToRevoke}P (현재 ${currentPoints}P -> ${correctedPoints}P)`);
    console.log(`  - 삭제될 미션 기록: ${uniquePeriodId}`);
    
    if (!isDryRun) {
      const userRef = db.collection('users').doc(userId);
      const correctionLog = {
        amount: -pointsToRevoke,
        reason: correctionReason,
        createdAt: admin.firestore.Timestamp.now(),
        expiresAt: null
      };
      const completedMissionPath = `completedMissions.${uniquePeriodId}`;

      // 포인트 차감, 로그 추가, 미션 완료 기록 삭제
      batch.update(userRef, {
          points: correctedPoints,
          pointHistory: admin.firestore.FieldValue.arrayUnion(correctionLog),
          [completedMissionPath]: admin.firestore.FieldValue.delete()
      });
    }
  }

  console.log('--------------------------------------------------');
  console.log(`\n분석 완료. 총 ${usersToCorrectCount}명의 사용자가 포인트 회수 대상으로 확인되었습니다.`);

  if (isDryRun) {
    console.log('\n테스트 모드(Dry Run)이므로 실제 데이터는 변경되지 않았습니다.');
    console.log('실제로 변경하려면 스크립트 상단의 isDryRun을 false로 변경 후 다시 실행하세요.');
  } else {
    try {
      console.log('\n일괄 업데이트를 시작합니다...');
      await batch.commit();
      console.log(`✅ 성공! ${usersToCorrectCount}명의 사용자에 대한 포인트 회수가 완료되었습니다.`);
    } catch (error) {
      console.error('🔥 오류! 일괄 업데이트에 실패했습니다:', error);
    }
  }
}

// 스크립트 실행
revokeAugustNoShowMission().catch(console.error);