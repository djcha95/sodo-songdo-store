/// <reference types="vite/client" />
import { initializeApp, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

/**
 * ✅ 이 프로젝트의 '정확한' 기본 버킷 이름 (gsutil ls 에서 확인됨)
 *    환경변수에 appspot.com이 남아있어도 이 값으로 강제합니다.
 */
const CORRECT_BUCKET = "sso-do.firebasestorage.app";

/**
 * 프로덕션에서 환경변수 누락 시 대비한 Fallback
 */
const FALLBACK = {
  apiKey: "AIzaSyBLN5zX4RT8AHIuNQjvPCdz2qXRJpjzWCs",
  authDomain: "sso-do.firebaseapp.com",
  projectId: "sso-do",
  storageBucket: CORRECT_BUCKET,
  messagingSenderId: "891505365318",
  appId: "1:891505365318:web:32a1ba57ca360f288c9547",
  region: "asia-northeast3",
};

/**
 * 1) 환경변수에서 후보값을 읽고, 없으면 FALLBACK 사용
 */
const candidateBucket =
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? FALLBACK.storageBucket;

/**
 * 2) 후보값이 틀렸으면(예: appspot.com) 무조건 올바른 값으로 교체
 */
const storageBucket =
  candidateBucket && candidateBucket.endsWith(".firebasestorage.app")
    ? candidateBucket
    : CORRECT_BUCKET;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? FALLBACK.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? FALLBACK.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? FALLBACK.projectId,
  storageBucket, // ⬅️ 여기서 항상 CORRECT_BUCKET으로 보정됨
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_SENDER_ID ?? FALLBACK.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? FALLBACK.appId,
};

export const app = initializeApp(firebaseConfig);

/**
 * 런타임 점검 로그 (개발시에만 참고)
 * - 콘솔에 "sso-do.firebasestorage.app" 가 찍혀야 정상입니다.
 */
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log("[Firebase] storageBucket @runtime =", getApp().options.storageBucket);
}

/**
 * App Check 초기화
 */
if (typeof window !== "undefined") {
  const w = window as unknown as { __appCheckInited?: boolean };
  if (!w.__appCheckInited) {
    const siteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY;
    if (!siteKey) {
      console.warn("[AppCheck] VITE_APP_CHECK_SITE_KEY is missing.");
    } else {
     // initializeAppCheck(app, {
     //   provider: new ReCaptchaV3Provider(siteKey),
      //  isTokenAutoRefreshEnabled: true,
      //});
      w.__appCheckInited = true;
    }
  }
}

// Firebase 서비스 export
export const auth = getAuth(app);
export const db = getFirestore(app);
/**
 * ⛔️ getStorage(app, "gs://...") 같은 2번째 인자 강제는 절대 쓰지 마세요.
 *    여기처럼 getStorage(app)만 호출하면 위 storageBucket 설정을 그대로 사용합니다.
 */
export const storage = getStorage(app);
export const functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_REGION ?? FALLBACK.region
);

export default app;
