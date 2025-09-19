/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore/lite";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// --- 1. 환경 변수 로딩 확인 ---

const FALLBACK = {
  apiKey: "AIzaSyBLN5zX4RT8AHIuNQjvPCdz2qXRJpjzWCs",
  authDomain: "sso-do.firebaseapp.com",
  projectId: "sso-do",
  storageBucket: "sso-do.appspot.com",
  messagingSenderId: "891505365318",
  appId: "1:891505365318:web:32a1ba57ca360f288c9547",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || FALLBACK.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || FALLBACK.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FALLBACK.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || FALLBACK.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || FALLBACK.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FALLBACK.appId,
};

// --- 2. 설정 객체 생성 확인 ---

// Firebase 앱 초기화
let app;
try {
  app = initializeApp(firebaseConfig);
  // --- 3. Firebase 앱 초기화 확인 ---
} catch (error) {
  console.error("3. Firebase 앱 초기화 실패!", error);
}

// --- 4. Firestore 인스턴스 생성 확인 ---
let db;
try {
  db = getFirestore(app);
} catch (error) {
  console.error("4. Firestore (db) 인스턴스 생성 실패!", error);
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-northeast3");
export { db }; // db를 명시적으로 export

export default app;