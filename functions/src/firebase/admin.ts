// functions/src/firebase/admin.ts
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";
import admin from "firebase-admin";

// 중복 초기화 방지
if (admin.apps.length === 0) {
  initializeApp();
}

export const authAdmin = getAuth();
export const dbAdmin = getFirestore();

export const allowedOrigins = [
  "http://localhost:5173",
  "https://sodomall.vercel.app",
  "https://sodo-songdo.store",
  "https://www.sodo-songdo.store",
  "https://songdopick.store",      // 새 도메인
  "https://www.songdopick.store",  // 새 도메인 www
];

// onRequest 핸들러에서 App Check 검증이 필요할 때 사용
export async function verifyAppCheckFromRequest(req: { header(name: string): string | undefined }) {
  const token = req.header("X-Firebase-AppCheck");
  if (!token) {
    const err = new Error("NO_APPCHECK");
    (err as any).status = 401;
    throw err;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch {
    const err = new Error("INVALID_APPCHECK");
    (err as any).status = 401;
    throw err;
  }
}

export { admin };
