// normalizeNegativePoints.js

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
// 포인트가 0 이하인 사용자를 120점으로 복구하는 로직
// ===============================================
async function normalizeNegativePoints() {
  console.log(`스크립트를 ${isDryRun ? '✅ 테스트 모드(Dry Run)' : '🔥 실제 실행 모드'}로 시작합니다.`);

  // --- 복구 정보 정의 ---
  const targetPoints = 120;
  const correctionReason = "(포인트 조정) 신규 가입자 포인트 정상화";

  // ✅ [수정] where 조건을 제거하고 모든 사용자를 불러옵니다.
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log('사용자가 없습니다. 스크립트를 종료합니다.');
    return;
  }
  
  const batch = db.batch();
  let usersToCorrectCount = 0;

  console.log('\n전체 사용자를 대상으로 포인트 복구 대상을 검색합니다...');

  for (const userDoc of snapshot.docs) {
    const user = userDoc.data();
    const userId = userDoc.id;
    // ✅ [수정] points 필드가 없으면 0으로 간주합니다 (|| 0).
    const currentPoints = user.points || 0;
    
    // ✅ [수정] 코드 내에서 직접 조건(0 이하)을 확인합니다.
    if (currentPoints <= 0) {
        usersToCorrectCount++;
        
        // 복구 로그에 기록할 실제 지급 포인트 계산
        const pointsToAdd = targetPoints - currentPoints;

        console.log('--------------------------------------------------');
        console.log(`[복구 대상 발견] 사용자: ${user.displayName}(${userId})`);
        console.log(`  - 현재 포인트: ${currentPoints}P`);
        console.log(`  - 복구 후 포인트: ${targetPoints}P (실제 지급될 포인트: ${pointsToAdd}P)`);
        
        if (!isDryRun) {
          const userRef = db.collection('users').doc(userId);
          const correctionLog = {
            amount: pointsToAdd,
            reason: correctionReason,
            createdAt: admin.firestore.Timestamp.now(),
            expiresAt: null
          };

          batch.update(userRef, {
              points: targetPoints,
              pointHistory: admin.firestore.FieldValue.arrayUnion(correctionLog),
          });
        }
    }
  }

  console.log('--------------------------------------------------');
  
  if (usersToCorrectCount === 0) {
      console.log('\n분석 완료. 포인트 복구 대상 사용자가 없습니다.');
      return;
  }

  console.log(`\n분석 완료. 총 ${usersToCorrectCount}명의 사용자가 포인트 복구 대상으로 확인되었습니다.`);

  if (isDryRun) {
    console.log('\n테스트 모드(Dry Run)이므로 실제 데이터는 변경되지 않았습니다.');
    console.log('실제로 변경하려면 스크립트 상단의 isDryRun을 false로 변경 후 다시 실행하세요.');
  } else {
    try {
      console.log('\n일괄 업데이트를 시작합니다...');
      await batch.commit();
      console.log(`✅ 성공! ${usersToCorrectCount}명의 사용자에 대한 포인트 복구가 완료되었습니다.`);
    } catch (error) {
      console.error('🔥 오류! 일괄 업데이트에 실패했습니다:', error);
    }
  }
}

// 스크립트 실행
normalizeNegativePoints().catch(console.error);