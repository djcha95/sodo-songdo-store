// src/firebase/index.ts

// ✅ [수정] db, auth 등을 내보내던 코드를 모두 삭제합니다.
// 이 파일은 이제 순수하게 서비스 함수들만 내보냅니다.

export * from './productService';
export * from './orderService';
export * from './generalService';
export * from './userService';
export * from './bannerService';
export * from './pointService';
export * from './notificationService';