// functions/src/scripts/fixVariantGroupsTimestamp.ts
// ✅ variantGroups의 items 배열 내부 expirationDate Timestamp 복구 스크립트

import * as admin from "firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { Product, SalesRound, VariantGroup, ProductItem } from "@/shared/types";

// -------- 설정 --------
const DRY_RUN = process.env.DRY_RUN === "1"; // "1"이면 미커밋 점검만
const BATCH_LIMIT = 450; // 500보다 살짝 여유
// ----------------------

// 1. 보안 키 파일 (functions/serviceAccountKey.json)
try {
  if (!admin.apps.length) {
    const serviceAccount = require("../../serviceAccountKey.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (e: any) {
  console.error("Firebase Admin SDK 초기화 실패. serviceAccountKey.json 파일이 functions 폴더에 있는지 확인하세요.", e.message);
  process.exit(1);
}

const db = admin.firestore();

/**
 * Timestamp 객체를 Firestore Timestamp로 변환
 */
function convertToFirestoreTimestamp(value: any): Timestamp | null {
  if (!value) return null;
  
  // 이미 Firestore Timestamp인 경우
  if (value instanceof Timestamp) return value;
  
  // 클라이언트 Timestamp 객체 형태 ({seconds, nanoseconds})
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof value.seconds === 'number') {
    return Timestamp.fromMillis(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
  }
  
  // 레거시 형식 ({_seconds, _nanoseconds})
  if (typeof value === 'object' && value !== null && '_seconds' in value && typeof value._seconds === 'number') {
    return Timestamp.fromMillis(value._seconds * 1000 + (value._nanoseconds || 0) / 1000000);
  }
  
  // Date 객체
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  
  // 숫자 (milliseconds)
  if (typeof value === 'number' && !isNaN(value)) {
    return Timestamp.fromMillis(value);
  }
  
  // 문자열
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return Timestamp.fromDate(date);
    }
  }
  
  return null;
}

/**
 * variantGroups의 items 배열 내부 expirationDate 복구
 */
function fixVariantGroupsItems(variantGroups: any[]): VariantGroup[] {
  return variantGroups.map((vg: any) => {
    if (!vg || !Array.isArray(vg.items)) return vg;
    
    const fixedItems: ProductItem[] = vg.items.map((item: any) => {
      if (!item || !item.expirationDate) return item;
      
      const fixedTimestamp = convertToFirestoreTimestamp(item.expirationDate);
      if (fixedTimestamp) {
        return { ...item, expirationDate: fixedTimestamp };
      }
      
      // 변환 실패 시 원본 유지 (로그만 남김)
      console.warn(`[fixVariantGroupsTimestamp] expirationDate 변환 실패:`, item.expirationDate);
      return item;
    });
    
    return { ...vg, items: fixedItems };
  });
}

/**
 * 메인 복구 로직
 */
async function fixVariantGroupsTimestamps() {
  console.log(`🚀 variantGroups Timestamp 복구 시작 (DRY_RUN=${DRY_RUN ? "ON" : "OFF"})`);
  
  let scanned = 0;
  let fixed = 0;
  let errors = 0;
  
  try {
    const productsRef = db.collection("products");
    const snapshot = await productsRef.get();
    
    console.log(`📦 총 ${snapshot.size}개 상품 스캔 시작...`);
    
    let currentBatch = db.batch();
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
      scanned++;
      const productId = doc.id;
      const productData = doc.data() as Product;
      
      try {
        const salesHistory = Array.isArray(productData.salesHistory) ? productData.salesHistory : [];
        let hasChanges = false;
        
        const fixedSalesHistory = salesHistory.map((round: any) => {
          if (!round || !Array.isArray(round.variantGroups)) return round;
          
          const fixedVariantGroups = fixVariantGroupsItems(round.variantGroups);
          
          // 변경사항이 있는지 확인
          const hasRoundChanges = fixedVariantGroups.some((fixedVg, idx) => {
            const originalVg = round.variantGroups[idx];
            if (!originalVg || !Array.isArray(originalVg.items)) return false;
            
            return fixedVariantGroups[idx].items.some((fixedItem, itemIdx) => {
              const originalItem = originalVg.items[itemIdx];
              if (!originalItem) return false;
              
              const originalExp = originalItem.expirationDate;
              const fixedExp = fixedItem.expirationDate;
              
              // Timestamp 객체 비교
              if (originalExp instanceof Timestamp && fixedExp instanceof Timestamp) {
                return originalExp.seconds !== fixedExp.seconds || originalExp.nanoseconds !== fixedExp.nanoseconds;
              }
              
              // 다른 형식이면 변경된 것으로 간주
              return originalExp !== fixedExp;
            });
          });
          
          if (hasRoundChanges) {
            hasChanges = true;
            return { ...round, variantGroups: fixedVariantGroups };
          }
          
          return round;
        });
        
        if (hasChanges) {
          fixed++;
          const productRef = productsRef.doc(productId);
          
          if (!DRY_RUN) {
            currentBatch.update(productRef, {
              salesHistory: fixedSalesHistory,
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;
            
            if (batchCount >= BATCH_LIMIT) {
              await currentBatch.commit();
              console.log(`✅ 배치 커밋 완료 (${batchCount}개)`);
              currentBatch = db.batch();
              batchCount = 0;
            }
          } else {
            console.log(`[DRY_RUN] ${productId} (${productData.groupName}) - 복구 필요`);
          }
        }
      } catch (error: any) {
        errors++;
        console.error(`❌ ${productId} 처리 실패:`, error.message);
      }
      
      if (scanned % 100 === 0) {
        console.log(`진행: ${scanned}/${snapshot.size} (복구: ${fixed}, 에러: ${errors})`);
      }
    }
    
    // 남은 배치 커밋
    if (!DRY_RUN && batchCount > 0) {
      await currentBatch.commit();
      console.log(`✅ 최종 배치 커밋 완료 (${batchCount}개)`);
    }
    
    console.log(`\n📊 완료 통계:`);
    console.log(`  - 스캔: ${scanned}개`);
    console.log(`  - 복구: ${fixed}개`);
    console.log(`  - 에러: ${errors}개`);
    
    if (DRY_RUN) {
      console.log(`\n⚠️  DRY_RUN 모드였습니다. 실제 복구를 실행하려면 DRY_RUN=0으로 설정하세요.`);
    }
    
  } catch (error: any) {
    console.error("❌ 전체 프로세스 실패:", error);
    process.exit(1);
  }
}

// 실행
fixVariantGroupsTimestamps()
  .then(() => {
    console.log("✅ 스크립트 완료");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 스크립트 실패:", error);
    process.exit(1);
  });

