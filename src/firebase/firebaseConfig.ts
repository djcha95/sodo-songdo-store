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
 * 🔒 보안: 환경변수 필수화
 * FALLBACK 제거 - 모든 Firebase 설정은 환경변수에서 가져와야 합니다.
 * 표준화된 키 이름 사용: VITE_FIREBASE_MESSAGING_SENDER_ID (Firebase 공식 문서와 일치)
 */
const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  region: import.meta.env.VITE_FIREBASE_REGION,
};

// 필수 환경변수 검증
const envVarNames: Record<keyof typeof requiredEnvVars, string> = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  region: 'VITE_FIREBASE_REGION',
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => envVarNames[key as keyof typeof requiredEnvVars]);

if (missingVars.length > 0) {
  const envFileHint = import.meta.env.DEV 
    ? '.env.local 파일 (또는 .env 파일)'
    : '.env 파일';
  
  throw new Error(
    `❌ 필수 환경변수가 누락되었습니다: ${missingVars.join(', ')}\n\n` +
    `📝 해결 방법:\n` +
    `1. 프로젝트 루트에 ${envFileHint}을 생성하세요.\n` +
    `2. ENV_SETUP_GUIDE.md를 참고하여 필요한 환경변수를 설정하세요.\n` +
    `3. 자세한 내용은 README.md의 "시크릿 & 환경 변수" 섹션을 참고하세요.\n\n` +
    `💡 파일 경로: 프로젝트 루트/${envFileHint}`
  );
}

/**
 * Storage Bucket 보정: 환경변수 값이 올바른 형식인지 확인
 */
const candidateBucket = requiredEnvVars.storageBucket;
const storageBucket =
  candidateBucket && candidateBucket.endsWith(".firebasestorage.app")
    ? candidateBucket
    : CORRECT_BUCKET;

const firebaseConfig = {
  apiKey: requiredEnvVars.apiKey!,
  authDomain: requiredEnvVars.authDomain!,
  projectId: requiredEnvVars.projectId!,
  storageBucket,
  messagingSenderId: requiredEnvVars.messagingSenderId!,
  appId: requiredEnvVars.appId!,
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
  requiredEnvVars.region!
);

export default app;
