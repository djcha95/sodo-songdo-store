// functions/src/scripts/runDataFix.ts

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// ✅ [수정] tsconfig-paths를 사용하므로, @/ 경로의 원본 타입을 그대로 사용합니다.
import type { Product, SalesRound, VariantGroup } from "@/shared/types";

// -------- 설정 --------
const DRY_RUN = process.env.DRY_RUN === "1"; // "1"이면 미커밋 점검만
const BATCH_LIMIT = 450; // 500보다 살짝 여유
const BUILD_TAG = "fix-v3.0-chunked-safe-types";
// ----------------------

// 1. 보안 키 파일 (functions/serviceAccountKey.json)
try {
  // ✅ [수정] ChatGPT의 안전한 초기화 로직 적용
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
 * Firestore 컬렉션을 안전하게 순회하는 제너레이터
 * (대용량 컬렉션도 메모리 문제 없이 처리)
 */
async function* iterateCollection(
  collRef: FirebaseFirestore.CollectionReference,
  pageSize = 1000
) {
  let query: FirebaseFirestore.Query = collRef.limit(pageSize);
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  for (;;) {
    const snap = await (last ? query.startAfter(last).get() : query.get());
    if (snap.empty) break;
    for (const doc of snap.docs) yield doc;
    last = snap.docs[snap.docs.length - 1];
    if (!last || snap.size < pageSize) break;
  }
}

/**
 * 손상된 (객체) 데이터를 (배열)로 안전하게 변환
 */
function toArrayIfMap<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") return Object.values(v) as T[];
  return [];
}

/**
 * ✅ [수정] 손상된 round 객체를 복구하되, 살아남은 필드를 모두 보존하는 함수
 */
function fixRoundSkeleton(round: any, idxKey: string): SalesRound {
  const vgAny = round?.variantGroups;
  const fixedVg: VariantGroup[] = toArrayIfMap<VariantGroup>(vgAny);

  // 이 로직은 살아남은 필드(totalPhysicalStock 등)를 보존하고,
  // 삭제된 필드(roundId 등)만 기본값으로 채웁니다.
  return {
    // --- 삭제된 필드 기본값 ---
    roundId: `recovered-${idxKey}`,
    roundName: "복구된 회차 (이름 없음)",
    status: "draft",
    createdAt: Timestamp.now(),
    publishAt: null,
    deadlineDate: null,
    arrivalDate: null,
    pickupDate: null,
    pickupDeadlineDate: null,
    manualStatus: null,
    isManuallyOnsite: false,
    isPrepaymentRequired: false,
    allowedTiers: null,
    waitlist: [],
    waitlistCount: 0,
    
    // --- 덮어쓰기: "하리보"처럼 살아남은 기존 필드 (totalPhysicalStock 등) ---
    ...round,

    // --- 덮어쓰기: 복구된 배열 ---
    variantGroups: fixedVg,
  };
}

/**
 * 메인 복구 로직
 */
async function fixDataStructure() {
  console.log(`🚀 데이터 구조 복구 시작: ${BUILD_TAG} (DRY_RUN=${DRY_RUN ? "ON" : "OFF"})`);

  let scanned = 0;
  let corrupt = 0;
  let willUpdate = 0;

  // ✅ [수정] 배치(Chunk) 처리를 위한 변수
  let batch = db.batch();
  let batchCount = 0;

  for await (const doc of iterateCollection(db.collection("products"), 1000)) {
    scanned++;
    const product = doc.data() as Product; // 원본 Product 타입 사용
    const salesHistoryRaw = product?.salesHistory;

    // 정상: 배열(null/undefined 포함)은 스킵
    if (!salesHistoryRaw || Array.isArray(salesHistoryRaw)) continue;

    // 손상 의심: object(Map) → 배열로 전개
    if (salesHistoryRaw && typeof salesHistoryRaw === "object") {
      corrupt++;
      const arr = Object.values(salesHistoryRaw) as any[];

      const fixedRounds: SalesRound[] = arr.map((r, i) => {
        const idxKey = `${doc.id}-${Date.now()}-${i}`;
        return fixRoundSkeleton(r, idxKey);
      });

      // 변경 반영
      if (fixedRounds.length > 0) {
        willUpdate++;
        console.log(`  · 복구 예정: ${product?.groupName ?? doc.id} (rounds=${fixedRounds.length})`);

        if (!DRY_RUN) {
          batch.update(doc.ref, { salesHistory: fixedRounds });
          batchCount++;

          // ✅ [수정] 배치 한도 초과 방지 (500개 제한)
          if (batchCount >= BATCH_LIMIT) {
            await batch.commit();
            console.log(`  ↳ 배치 커밋 완료 (${batchCount}문서)`);
            batch = db.batch(); // 새 배치 시작
            batchCount = 0;
          }
        }
      }
    }
  }

  // ✅ [수정] 남은 배치 커밋
  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
    console.log(`  ↳ 마지막 배치 커밋 완료 (${batchCount}문서)`);
  }

  console.log("\n===== 결과 요약 =====");
  console.log(`검사 상품 수     : ${scanned}`);
  console.log(`손상 의심 상품   : ${corrupt}`);
  console.log(`실제 복구 대상   : ${willUpdate}`);
  console.log(`실행 모드        : ${DRY_RUN ? "DRY-RUN (미커밋)" : "적용 완료"}`);
}

// 스크립트 실행
fixDataStructure().catch((e) => {
  console.error("❌ 스크립트 실패:", e?.message || e);
  process.exit(1);
});