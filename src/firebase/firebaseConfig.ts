/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

/**
 * 프로덕션 배포 환경에서 .env 변수를 불러오지 못했을 경우를 대비한 안전장치(Fallback) 데이터입니다.
 * 이 객체의 storageBucket 값이 올바른 주소('sso-do.firebasestorage.app')로 설정되어 있습니다.
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
 * Vite의 import.meta.env를 통해 현재 환경(.env, .env.local 등)에 맞는 변수를 자동으로 불러옵니다.
 * 이전에 수정한 .env 파일들의 VITE_FIREBASE_STORAGE_BUCKET 값을 우선적으로 읽어오게 됩니다.
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

// 다른 파일에서 사용할 수 있도록 Firebase 서비스들을 내보냅니다.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-northeast3");

export default app;