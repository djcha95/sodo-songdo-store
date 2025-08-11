// fixAllPointErrors.js

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
// 모든 포인트 오류를 찾아 수정하는 메인 로직
// ===============================================
async function fixAllPointErrors() {
  console.log(`스크립트를 ${isDryRun ? '✅ 테스트 모드(Dry Run)' : '🔥 실제 실행 모드'}로 시작합니다.`);

  // --- 오류 검사를 위한 정보 정의 ---
  const welcomeBonusInfo = {
    reason: '소도몰에 오신 것을 환영합니다!',
    points: 100,
    correctionReason: '(포인트 조정) 중복 지급된 가입 환영 포인트 회수'
  };
  const julyNoShowMissionInfo = {
    uniquePeriodId: 'no-show-free-2025-07',
    points: 50,
    correctionReason: "(포인트 조정) 7월 노쇼 방지 미션 기록 초기화"
  };

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log('사용자를 찾을 수 없습니다.');
    return;
  }
  
  const batch = db.batch();
  let usersToCorrectCount = 0;

  console.log('\n전체 사용자 데이터를 분석하여 오류를 찾습니다...');

  for (const userDoc of snapshot.docs) {
    const user = userDoc.data();
    const userId = userDoc.id;
    const pointHistory = user.pointHistory || [];
    
    let totalPointsToDeduct = 0;
    const correctionLogs = [];
    const updates = {};
    let needsCorrection = false;

    // --- 검사 1: 중복 지급된 가입 환영 보너스 ---
    const welcomeBonusCount = pointHistory.filter(log => log.reason === welcomeBonusInfo.reason).length;
    if (welcomeBonusCount > 1) {
      needsCorrection = true;
      const excessCount = welcomeBonusCount - 1;
      const deduction = excessCount * welcomeBonusInfo.points;
      totalPointsToDeduct += deduction;
      correctionLogs.push({
        amount: -deduction,
        reason: welcomeBonusInfo.correctionReason,
        createdAt: admin.firestore.Timestamp.now(),
        expiresAt: null,
      });
      console.log('--------------------------------------------------');
      console.log(`[오류 1 발견] 사용자: ${user.displayName}(${userId}) - 중복 환영 보너스 ${excessCount}회`);
    }

    // --- 검사 2: 존재하지 않는 7월 노쇼 미션 완료 ---
    if (user.completedMissions && user.completedMissions[julyNoShowMissionInfo.uniquePeriodId]) {
      needsCorrection = true;
      const deduction = julyNoShowMissionInfo.points;
      totalPointsToDeduct += deduction;
      correctionLogs.push({
        amount: -deduction,
        reason: julyNoShowMissionInfo.correctionReason,
        createdAt: admin.firestore.Timestamp.now(),
        expiresAt: null,
      });
      // 미션 완료 기록 삭제 경로 설정
      updates[`completedMissions.${julyNoShowMissionInfo.uniquePeriodId}`] = admin.firestore.FieldValue.delete();
      if (!welcomeBonusCount > 1) console.log('--------------------------------------------------');
      console.log(`[오류 2 발견] 사용자: ${user.displayName}(${userId}) - 7월 노쇼 미션 완료 기록`);
    }
    
    // --- 수정이 필요한 경우 작업 준비 ---
    if (needsCorrection) {
      usersToCorrectCount++;
      const currentPoints = user.points || 0;
      const correctedPoints = currentPoints - totalPointsToDeduct;

      console.log(`  - 총 차감될 포인트: ${totalPointsToDeduct}P`);
      console.log(`  - 최종 보정될 포인트: ${currentPoints}P -> ${correctedPoints}P`);

      if (!isDryRun) {
        const userRef = db.collection('users').doc(userId);
        
        // 최종 업데이트 객체 구성
        updates.points = correctedPoints;
        updates.pointHistory = admin.firestore.FieldValue.arrayUnion(...correctionLogs);

        batch.update(userRef, updates);
      }
    }
  }

  console.log('--------------------------------------------------');
  console.log(`\n분석 완료. 총 ${usersToCorrectCount}명의 사용자에게서 수정이 필요한 항목이 발견되었습니다.`);

  if (usersToCorrectCount === 0) {
    console.log('수정할 사용자가 없어 스크립트를 종료합니다.');
    return;
  }

  if (isDryRun) {
    console.log('\n테스트 모드(Dry Run)이므로 실제 데이터는 변경되지 않았습니다.');
    console.log('실제로 변경하려면 스크립트 상단의 isDryRun을 false로 변경 후 다시 실행하세요.');
  } else {
    try {
      console.log('\n일괄 업데이트를 시작합니다...');
      await batch.commit();
      console.log(`✅ 성공! ${usersToCorrectCount}명의 사용자에 대한 포인트 보정이 완료되었습니다.`);
    } catch (error) {
      console.error('🔥 오류! 일괄 업데이트에 실패했습니다:', error);
    }
  }
}

// 스크립트 실행
fixAllPointErrors().catch(console.error);