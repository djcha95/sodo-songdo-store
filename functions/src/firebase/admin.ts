// functions/src/firebase/admin.ts

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
// ✅ [최종 수정] admin 라이브러리를 불러오는 방식을 변경합니다.
// 'import * as admin' 대신 default export를 가져옵니다.
import admin from "firebase-admin";

// 앱 초기화 (반드시 한 번만 실행)
if (admin.apps.length === 0) {
  initializeApp();
}

// 다른 파일에서 사용할 Firebase 서비스들을 export
export const authAdmin = getAuth();
export const dbAdmin = getFirestore();

// CORS 설정도 이 파일에서 함께 관리
export const allowedOrigins = [
  "http://localhost:5173",
  "https://sodomall.vercel.app",
  "https://sodo-songdo.store",
  "https://www.sodo-songdo.store"
];

// ✅ [수정] 다른 파일에서 FieldValue 등을 사용하기 위해 admin 객체를 export합니다.
export { admin };