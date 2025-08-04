// functions/src/index.ts

import admin from "firebase-admin";

// ✅ [수정] 이미 앱이 초기화되었는지 확인하는 로직을 추가하여
// 중복 초기화 오류를 방지합니다.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Callable Functions
export * from "./callable/products.js";
export * from "./callable/orders.js";
export * from "./callable/referrals.js";

// HTTP Functions
export * from "./http/auth.js"; 

// Scheduled Functions
export * from "./scheduled/notifications.js";
export * from "./scheduled/points.js";

// Firestore Trigger Functions
export * from "./triggers/orders.js";
export * from "./triggers/points.js";