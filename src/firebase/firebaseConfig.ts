// src/firebase/firebaseConfig.ts
/// <reference types="vite/client" />

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// ⚠️ Vite는 빌드타임에 import.meta.env.VITE_* 를 문자열로 치환합니다.
//    런타임 검사(must)로 throw하지 말고, 정적 접근만 유지하세요.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 리전 나눠 쓸 때만 유지하세요. (없으면 지워도 됨)
export const functions = getFunctions(app, "asia-northeast3");
export const functionsUS = getFunctions(app, "us-central1");

// 에뮬레이터 옵션 (원하면 .env에 VITE_USE_FUNCTIONS_EMULATOR=true)
if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export default app;
