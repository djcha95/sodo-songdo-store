/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// ⚡ 임시 핫픽스: 프로덕션에서 값이 비면 하드코드로 대체
const FALLBACK = {
  apiKey: "AIzaSyBLN5zX4RT8AHIuNQjvPCdz2qXRJpjzWCs",
  authDomain: "sso-do.firebaseapp.com",
  projectId: "sso-do",
  storageBucket: "sso-do.appspot.com",
  messagingSenderId: "891505365318",
  appId: "1:891505365318:web:32a1ba57ca360f288c9547",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (import.meta.env.PROD ? FALLBACK.apiKey : ""),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (import.meta.env.PROD ? FALLBACK.authDomain : ""),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (import.meta.env.PROD ? FALLBACK.projectId : ""),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (import.meta.env.PROD ? FALLBACK.storageBucket : ""),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (import.meta.env.PROD ? FALLBACK.messagingSenderId : ""),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (import.meta.env.PROD ? FALLBACK.appId : ""),
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-northeast3");
export default app;
