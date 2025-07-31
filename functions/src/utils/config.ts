// functions/src/utils/config.ts
import { initializeApp, applicationDefault, AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import cors from "cors";

// Firebase Admin SDK 초기화
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}
const appOptions: AppOptions = { projectId: "sso-do" };
if (!process.env.FUNCTIONS_EMULATOR) {
  appOptions.credential = applicationDefault();
}
initializeApp(appOptions);

export const auth = getAuth();
export const db = getFirestore();

// CORS 설정
export const allowedOrigins = [
  "http://localhost:5173", // ✅ 이 줄이 반드시 포함되어 있어야 합니다.
  "https://sodomall.vercel.app",
  "http://sodo-songdo.store",
  "https://sodo-songdo.store",
  "https://www.sodo-songdo.store"
];

export const corsHandler = cors({
  origin: allowedOrigins,
});