// src/firebase/index.ts

// 각 서비스 파일의 모든 함수를 가져와서 그대로 내보냅니다.
export * from './productService';
export * from './orderService';
export * from './generalService';

// 설정 파일에서 db, auth, storage 인스턴스도 함께 내보내서
// 혹시 다른 곳에서 필요할 경우 사용할 수 있게 합니다.
export * from './firebaseConfig';