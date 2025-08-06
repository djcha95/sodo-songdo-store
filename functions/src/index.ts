// functions/src/index.ts

// ✅ [수정] 모든 초기화 코드를 제거합니다.

// Callable Functions
export * from "./callable/products.js";
export * from "./callable/orders.js";
export * from "./callable/referrals.js";
export * from "./callable/waitlist.js";
export * from "./callable/stock.js";
export * from "./callable/points.js"; // ✅ 이 줄을 추가해주세요

// HTTP Functions
export * from "./http/auth.js"; 

// Scheduled Functions
export * from "./scheduled/notifications.js";
export * from "./scheduled/points.js";

// Firestore Trigger Functions
export * from "./triggers/orders.js";
export * from "./triggers/points.js";