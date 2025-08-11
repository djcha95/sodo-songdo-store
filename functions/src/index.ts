// functions/src/index.ts

// =================================================================
// 1. Callable Functions (클라이언트 호출 가능 함수)
// =================================================================
export * from "./callable/products.js";
export * from "./callable/orders.js";
export * from "./callable/referrals.js";
export * from "./callable/stock.js";
export * from "./callable/waitlist.js";
export * from "./callable/missions.js";
export * from "./callable/users.js";


// =================================================================
// 2. HTTP Functions (HTTP 요청 함수)
// =================================================================
export * from "./http/auth.js";

// ✅ 기존 엔드포인트 호환 유지: testAlimtalk 를 testSendAlimtalk 별칭으로도 export
export { testAlimtalk, testAlimtalk as testSendAlimtalk } from "./callable/testAlimtalk.js";

// 선입금 안내 즉시 실행 테스트 함수
export * from "./http/testNotifications.js";

// =================================================================
// 3. Scheduled Functions (스케줄링 함수)
// =================================================================
export * from "./scheduled/notifications.js";
export * from "./scheduled/points.js";

// =================================================================
// 4. Firestore Trigger Functions (데이터베이스 트리거 함수)
// =================================================================
export * from "./triggers/orders.js";
export * from "./triggers/points.js";
export * from "./triggers/products.js";
export * from "./triggers/users.js";

// ❌ 아래 라인은 위에서 처리했으므로 삭제하거나, 위 방식으로 변경합니다.
// export { grantSnackPackToEligibleUsers } from './grantSnackPack';

// ✅ [추가] 일회용 설정 함수를 export 목록에 추가합니다.
export * from "./setup.js";

// ✅ [추가] 사용자 phoneLast4 필드 채우기 스크립트
export * from "./backfillUsers.js"; 