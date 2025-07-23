// src/firebase/firebaseConfig.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
// ✨ [수정] 에뮬레이터 연결 함수 import 제거
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { FirebaseStorage } from 'firebase/storage';

// .env 파일에서 실제 운영 서버의 설정 값을 읽어옵니다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY as string,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_APP_ID as string,
};

// Firebase 앱을 초기화합니다.
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 각 Firebase 서비스의 인스턴스를 가져옵니다.
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);
const functions = getFunctions(app, 'asia-northeast3');

/*
// ======================================================================
// ✨ [비활성화] 개발 환경일 때 로컬 에뮬레이터에 접속하는 코드
// 실제 운영 서버에 접속하기 위해 이 블록 전체를 주석 처리합니다.
// ======================================================================
if (import.meta.env.DEV) {
  try {
    // Auth 에뮬레이터
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    // Firestore 에뮬레이터
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    // Functions 에뮬레이터
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    // Storage 에뮬레이터 (필요시 주석 해제)
    // connectStorageEmulator(storage, '127.0.0.1', 9199);
    
    console.log("✅ Firebase Emulators connected.");

  } catch (e) {
    console.error("❗️ Error connecting to Firebase Emulators:", e);
  }
}
*/

// 다른 파일에서 사용할 수 있도록 내보냅니다.
export { app, auth, db, storage, functions };