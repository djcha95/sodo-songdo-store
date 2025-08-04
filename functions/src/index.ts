// functions/src/index.ts
// 이 파일은 프로젝트의 모든 함수를 찾아서 Firebase에 알려주는 최종 관문입니다.
// 아래 목록에 모든 함수 파일이 포함되어 있는지 확인하세요.

// Callable Functions
export * from "./callable/products.js";
export * from "./callable/orders.js";
// export * from "./callable/waitlist.js"; // 파일이 없으므로 이 라인을 주석 처리합니다.

// HTTP Functions
export * from "./http/auth.js"; 

// Scheduled Functions
export * from "./scheduled/notifications.js";
export * from "./scheduled/points.js";

// Firestore Trigger Functions
export * from "./triggers/orders.js";
export * from "./triggers/points.js";
// export * from "./triggers/users.js"; // 파일이 없으므로 이 라인을 주석 처리합니다.