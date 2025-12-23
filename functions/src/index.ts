// functions/src/index.ts

/**
 * =================================================================
 * 1. Callable Functions (클라이언트 호출 가능 함수)
 * =================================================================
 */
export * from "./callable/products.js";
export * from "./callable/orders.js"; // ✅ [추가]
export * from "./callable/referrals.js";
export * from "./callable/stock.js";
export * from "./callable/waitlist.js";
export * from "./callable/missions.js";
export * from "./callable/users.js";

export { testAlimtalk, testAlimtalk as testSendAlimtalk } from "./callable/testAlimtalk.js";


/**
 * =================================================================
 * 2. HTTP Functions (HTTP 요청 함수)
 * =================================================================
 */
export * from "./http/auth.js";
export * from "./http/product.js";
export * from "./http/testNotifications.js";
export * from "./http/migration.js";
export * from "./http/manualTrigger.js";
export * from "./http/manualTriggerRecent.js";
export * from "./http/banner.js";
export * from "./http/maintenance.js";


/**
 * =================================================================
 * 3. Scheduled Functions (스케줄링 함수)
 * =================================================================
 */
export * from "./scheduled/notifications.js";
export * from "./scheduled/points.js";
export * from "./scheduled/visibility.js";
// export * from "./scheduled/orders.js"; // ✅ [추가]



/**
 * =================================================================
 * 4. Firestore Trigger Functions (데이터베이스 트리거 함수)
 * =================================================================
 */
export * from "./triggers/orders.js";
export * from "./triggers/points.js";
export * from "./triggers/products.js";
export * from "./triggers/users.js";


/**
 * =================================================================
 * 5. Utility & Setup Functions (유틸리티 및 설정 함수)
 * =================================================================
 */
export * from "./setup.js";
export * from "./backfillUsers.js";

import { convertObjectDatesToTimestampHTTP } from './scripts/convertToTimestampHTTP';
export { convertObjectDatesToTimestampHTTP };

