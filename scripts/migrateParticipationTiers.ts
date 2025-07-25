// scripts/migrateParticipationTiers.ts

import { db } from '../src/firebase/firebaseConfig';
import { collection, getDocs, writeBatch, DocumentData } from 'firebase/firestore';
import type { Product, SalesRound } from '../src/types';

/**
 * @description [일회성 마이그레이션 함수]
 * 모든 상품의 모든 판매 회차에 'allowedTiers' 필드가 없으면 빈 배열로 추가합니다.
 * 이를 통해 기존 상품들이 새로운 '참여 조건' 시스템과 호환되도록 합니다.
 */
const migrateProductParticipationTiers = async (): Promise<{
  totalProducts: number;
  updatedProducts: number;
}> => {
  console.log('Firestore에서 모든 상품 정보를 가져오는 중...');
  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);
  const totalProducts = snapshot.size;
  let updatedProducts = 0;
  let batchCount = 0;
  let batch = writeBatch(db);

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
        batch = writeBatch(db);
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