// functions/src/index.ts

/**
 * =================================================================
 * 1. Callable Functions (클라이언트 호출 가능 함수)
 * =================================================================
 * 클라이언트 앱(웹/모바일)에서 직접 호출할 수 있는 함수들입니다.
 */
export * from "./callable/products.js";
export * from "./callable/orders.js";
export * from "./callable/referrals.js";
export * from "./callable/stock.js";
export * from "./callable/waitlist.js";
export * from "./callable/missions.js";
export * from "./callable/users.js";

// `testAlimtalk` 함수를 `testSendAlimtalk`라는 별칭으로도 내보내 기존 엔드포인트와 호환성을 유지합니다.
export { testAlimtalk, testAlimtalk as testSendAlimtalk } from "./callable/testAlimtalk.js";


/**
 * =================================================================
 * 2. HTTP Functions (HTTP 요청 함수)
 * =================================================================
 * 특정 URL로 HTTP 요청을 보내 실행하는 함수들입니다. (웹훅, 인증, SSR 등)
 */
export * from "./http/auth.js";
export * from "./http/product.js";
// ✅ [수정] 아래 라인을 추가하여 테스트 함수를 포함시킵니다.
export * from "./http/testNotifications.js";
export * from "./http/migration.js";



/**
 * =================================================================
 * 3. Scheduled Functions (스케줄링 함수)
 * =================================================================
 * 정해진 시간에 주기적으로 실행되는 백그라운드 함수들입니다.
 */
export * from "./scheduled/notifications.js";
export * from "./scheduled/points.js";


/**
 * =================================================================
 * 4. Firestore Trigger Functions (데이터베이스 트리거 함수)
 * =================================================================
 * Firestore 데이터베이스의 변경(생성, 수정, 삭제)에 따라 실행되는 함수들입니다.
 */
export * from "./triggers/orders.js";
export * from "./triggers/points.js";
export * from "./triggers/products.js";
export * from "./triggers/users.js";


/**
 * =================================================================
 * 5. Utility & Setup Functions (유틸리티 및 설정 함수)
 * =================================================================
 * 일회성 데이터 마이그레이션이나 초기 설정을 위해 사용하는 함수들입니다.
 */
export * from "./setup.js";
export * from "./backfillUsers.js"; // 사용자 phoneLast4 필드 채우기용 스크립트