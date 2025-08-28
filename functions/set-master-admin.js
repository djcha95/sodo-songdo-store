// functions/set-master-admin.js

// Admin SDK 모듈 가져오기
const admin = require("firebase-admin");

// 서비스 계정 키 파일로 Admin SDK 초기화
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 터미널에서 전달받을 사용자 UID
const uid = process.argv[2];

if (!uid) {
  console.error("오류: 사용자 UID를 입력해야 합니다.");
  console.log("사용 예시: node set-master-admin.js [사용자UID]");
  process.exit(1);
}

// 해당 사용자에게 'master' 역할을 Custom Claim으로 설정
admin.auth().setCustomUserClaims(uid, { role: 'master' })
  .then(() => {
    console.log(`✅ 성공! 사용자(UID: ${uid})에게 'master' 역할이 부여되었습니다.`);
    console.log("이제 이 사용자로 로그인하면 모든 관리자 기능을 사용할 수 있습니다.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 역할 설정 중 오류 발생:", error);
    process.exit(1);
  });