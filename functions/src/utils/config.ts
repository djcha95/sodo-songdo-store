// functions/src/utils/config.ts
import { initializeApp, applicationDefault, AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// --- Firebase Admin SDK 초기화 ---
// 에뮬레이터 환경과 실제 배포 환경을 구분하여 SDK를 초기화합니다.
const appOptions: AppOptions = { projectId: "sso-do" };
if (process.env.FUNCTIONS_EMULATOR) {
  // 로컬 에뮬레이터 사용 시
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
} else {
  // 실제 배포 환경 사용 시
  appOptions.credential = applicationDefault();
}
initializeApp(appOptions);

// 다른 파일에서 사용할 Firebase 서비스를 export 합니다.
export const auth = getAuth();
export const db = getFirestore();


// --- CORS 설정 ---
// onCall 함수 등에서 사용할 허용된 출처(Origin) 목록입니다.
export const allowedOrigins = [
  // 1. 로컬 개발 환경 (가장 중요)
  "http://localhost:5173",

  // 2. Vercel 배포 환경
  "https://sodomall.vercel.app",
  
  // 3. 커스텀 도메인 환경
  "https://sodo-songdo.store",
  "https://www.sodo-songdo.store"
];