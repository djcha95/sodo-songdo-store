// scripts/addPrepaymentFlag.js

// 이 스크립트를 실행하려면 먼저 firebase-admin을 설치해야 합니다.
// 터미널에 `npm install firebase-admin`을 입력해주세요.

const admin = require('firebase-admin');
// 중요: Firebase 콘솔에서 생성한 서비스 계정 키 파일의 경로를 입력해주세요.
const serviceAccount = require('../sodomall-service-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateProducts() {
  console.log('기존 상품 데이터에 선입금 플래그(isPrepaymentRequired) 추가 작업을 시작합니다...');

  const productsRef = db.collection('products');
  const snapshot = await productsRef.get();

  if (snapshot.empty) {
    console.log('수정할 상품이 없습니다.');
    return;
  }

  const batch = db.batch();
  let updatedCount = 0;

  snapshot.forEach(doc => {
    const product = doc.data();
    let needsUpdate = false;

    if (product.salesHistory && Array.isArray(product.salesHistory)) {
      const newSalesHistory = product.salesHistory.map(round => {
        // isPrepaymentRequired 필드가 없는 경우에만 false로 초기화합니다.
        if (round.isPrepaymentRequired === undefined) {
          needsUpdate = true;
          return { ...round, isPrepaymentRequired: false };
        }
        return round;
      });

      if (needsUpdate) {
        const productRef = db.collection('products').doc(doc.id);
        batch.update(productRef, { salesHistory: newSalesHistory });
        updatedCount++;
      }
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`총 ${updatedCount}개의 상품 데이터에 선입금 플래그를 성공적으로 추가했습니다.`);
  } else {
    console.log('모든 상품에 이미 선입금 플래그가 설정되어 있습니다. 작업을 종료합니다.');
  }
}

migrateProducts().catch(console.error);