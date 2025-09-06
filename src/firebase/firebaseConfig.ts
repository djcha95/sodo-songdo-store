/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
// ✅ [추가] App Check 관련 모듈 import
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';


/**
 * 프로덕션 배포 환경에서 .env 변수를 불러오지 못했을 경우를 대비한 안전장치(Fallback) 데이터입니다.
 */
const FALLBACK = {
  apiKey: "AIzaSyBLN5zX4RT8AHIuNQjvPCdz2qXRJpjzWCs",
  authDomain: "sso-do.firebaseapp.com",
  projectId: "sso-do",
  storageBucket: "sso-do.firebasestorage.app",
  messagingSenderId: "891505365318",
  appId: "1:891505365318:web:32a1ba57ca360f288c9547",
};

/**
 * Firebase 설정 객체입니다.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (import.meta.env.PROD ? FALLBACK.apiKey : ""),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (import.meta.env.PROD ? FALLBACK.authDomain : ""),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (import.meta.env.PROD ? FALLBACK.projectId : ""),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (import.meta.env.PROD ? FALLBACK.storageBucket : ""),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (import.meta.env.PROD ? FALLBACK.messagingSenderId : ""),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (import.meta.env.PROD ? FALLBACK.appId : ""),
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// ✅ [추가] App Check 초기화 코드
// 중요: 이 코드는 다른 Firebase 서비스(auth, firestore 등)를 초기화하기 전에 위치하는 것이 좋습니다.
if (typeof window !== 'undefined') {
  // 2단계에서 발급받은 '사이트 키'를 여기에 붙여넣으세요.
  // 키는 따옴표 안에 문자열로 넣어야 합니다.
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('여기에_reCAPTCHA_사이트_키를_붙여넣으세요'),
    isTokenAutoRefreshEnabled: true
  });
}


// 다른 파일에서 사용할 수 있도록 Firebase 서비스들을 내보냅니다.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-northeast3");

export default app;