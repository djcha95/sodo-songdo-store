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
// ✅ [수정] 충돌을 해결하기 위해, testSendAlimtalk 함수를 여기서 한번만 직접 export 합니다.
export { testSendAlimtalk } from './callable/testAlimtalk.js';

// ✅ [추가] 선입금 안내 즉시 실행 테스트 함수를 등록합니다.
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