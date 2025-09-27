/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

/**
 * 프로덕션에서 환경변수 누락 시 대비한 Fallback
 * (가능하면 모든 값은 .env로 제공하세요)
 */
const FALLBACK = {
  apiKey: "AIzaSyBLN5zX4RT8AHIuNQjvPCdz2qXRJpjzWCs",
  authDomain: "sso-do.firebaseapp.com",
  projectId: "sso-do",
  storageBucket: "sso-do.appspot.com",
  messagingSenderId: "891505365318",
  appId: "1:891505365318:web:32a1ba57ca360f288c9547",
  region: "asia-northeast3",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? FALLBACK.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? FALLBACK.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? FALLBACK.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? FALLBACK.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_SENDER_ID ?? FALLBACK.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? FALLBACK.appId,
};

export const app = initializeApp(firebaseConfig);

/**
 * App Check 초기화 (브라우저에서 한 번만)
 * - 반드시 v3 사이트키(.env: VITE_APP_CHECK_SITE_KEY) 사용
 * - 중복 초기화 방지 플래그 추가
 */
if (typeof window !== "undefined") {
  const w = window as unknown as { __appCheckInited?: boolean };
  if (!w.__appCheckInited) {
    const siteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY;
    if (!siteKey) {
      // 개발 중 확인용 로그 (배포 후 콘솔에 남기고 싶지 않으면 제거)
      console.warn("[AppCheck] VITE_APP_CHECK_SITE_KEY is missing.");
    } else {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      w.__appCheckInited = true;
    }
  }
}

// Firebase 서비스 export
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_REGION ?? FALLBACK.region);

export default app;
