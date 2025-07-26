// ✅ 이렇게 수정해주세요 (상단 부분을 교체)
import 'dotenv/config';
import admin from 'firebase-admin';
import { getFirestore, DocumentData } from 'firebase-admin/firestore';
import type { Product, SalesRound } from '../src/types';

// 1. 서비스 계정 키 파일을 불러옵니다.
// require를 사용해야 json 파일을 바로 가져올 수 있습니다.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('../serviceAccountKey.json');

// 2. Firebase Admin 앱을 초기화합니다.
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// 3. Admin SDK를 통해 Firestore 인스턴스를 가져옵니다.
const db = getFirestore();

const migrateProductParticipationTiers = async (): Promise<{
  totalProducts: number;
  updatedProducts: number;
}> => {
  console.log('Firestore에서 모든 상품 정보를 가져오는 중...');
const productsRef = db.collection('products');
const snapshot = await productsRef.get();
  const totalProducts = snapshot.size;
  let updatedProducts = 0;
  let batchCount = 0;
let batch = db.batch();

  console.log(`총 ${totalProducts}개의 상품을 확인합니다.`);

  if (totalProducts === 0) {
    return { totalProducts: 0, updatedProducts: 0 };
  }

  snapshot.forEach((doc: DocumentData) => {
    const product = { id: doc.id, ...doc.data() } as Product;
    let needsUpdate = false;

    if (!product.salesHistory || !Array.isArray(product.salesHistory)) {
      return; // salesHistory가 없거나 배열이 아니면 건너뜁니다.
    }

    const newSalesHistory = product.salesHistory.map((round: SalesRound) => {
      if (!Object.prototype.hasOwnProperty.call(round, 'allowedTiers')) {
        needsUpdate = true;
        return {
          ...round,
          allowedTiers: [], // '모두 참여 가능' 상태로 설정
        };
      }
      return round;
    });

    if (needsUpdate) {
      batch.update(doc.ref, { salesHistory: newSalesHistory });
      updatedProducts++;
      batchCount++;

      // Firestore의 batch 쓰기 제한은 500개이므로, 400개마다 커밋합니다.
      if (batchCount === 400) {
        batch.commit();
batch = db.batch();
        batchCount = 0;
        console.log('중간 커밋: 400개 상품 업데이트 완료.');
      }
    }
  });

  if (batchCount > 0) {
    console.log(`남은 ${batchCount}개의 상품을 최종 커밋합니다.`);
    await batch.commit();
  }

  return { totalProducts, updatedProducts };
};

/**
 * 스크립트 실행 함수
 */
const runMigration = async () => {
  console.log('🚀 데이터 마이그레이션을 시작합니다...');
  
  try {
    const { totalProducts, updatedProducts } = await migrateProductParticipationTiers();
    console.log('\n========================================');
    console.log('✅ 마이그레이션 성공!');
    console.log(`- 총 ${totalProducts}개의 상품을 확인했습니다.`);
    console.log(`- ${updatedProducts}개의 상품 구조를 업데이트했습니다.`);
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ 마이그레이션 중 오류가 발생했습니다:', error);
    process.exit(1); // 오류 발생 시 스크립트 종료
  }
};

// 스크립트 실행
runMigration().then(() => {
    // 성공적으로 완료되면 process.exit()을 호출하여 명시적으로 종료합니다.
    // Firestore 연결이 활성 상태로 남아 스크립트가 끝나지 않는 것을 방지합니다.
    process.exit(0);
});