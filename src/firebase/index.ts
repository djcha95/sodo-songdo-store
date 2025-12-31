// src/firebase/index.ts

// 각 서비스 파일의 모든 함수를 가져와서 그대로 내보냅니다.
export * from './productService';
export * from './orderService'; // ✅ [추가] 누락되었던 orderService를 export 목록에 추가
export * from './generalService';
export * from './userService';
// ✅ [추가] bannerService를 export 목록에 추가합니다.
export * from './bannerService';
export * from './pointService'; // ✅ [추가] pointService의 함수들을 내보냅니다.
export * from './notificationService'; // ✅ [추가] notificationService export
export * from './reviewService'; // ✅ [추가] reviewService export

// 설정 파일에서 db, auth, storage 인스턴스도 함께 내보내서
// 혹시 다른 곳에서 필요할 경우 사용할 수 있게 합니다.
export * from './firebaseConfig';
