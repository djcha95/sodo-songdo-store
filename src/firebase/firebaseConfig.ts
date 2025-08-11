// src/firebase/firebaseConfig.ts
/// <reference types="vite/client" />

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ======== DEBUG: env 주입 확인 ========
if (typeof import.meta !== "undefined") {
  const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || "");
  const report = {
    PROD: import.meta.env.PROD,
    MODE: import.meta.env.MODE,
    apiKeyPrefix: apiKey.slice(0, 6),         // 정상이면 "AIzaSy"
    hasAuthDomain: !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    hasProjectId: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
    hasBucket: !!import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    hasMsgSender: !!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    hasAppId: !!import.meta.env.VITE_FIREBASE_APP_ID,
  };
  // 프로덕션에서도 한 번만 찍히게
  if (!(window as any).__ENV_REPORTED__) {
    (window as any).__ENV_REPORTED__ = true;
    console.log("[env-check]", report);
    if (!apiKey) {
      console.warn("[env-check] VITE_FIREBASE_API_KEY is EMPTY in runtime bundle.");
    }
  }
}
// =====================================

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 리전 분리 안 쓰면 아래 2줄 제거 가능
export const functions = getFunctions(app, "asia-northeast3");
export const functionsUS = getFunctions(app, "us-central1");

// 로컬 에뮬레이터 옵션
if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export default app;
