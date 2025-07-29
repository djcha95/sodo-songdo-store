// src/firebase/firebaseAdmin.ts

// import * as admin from 'firebase-admin'; // <-- 이 줄을 삭제했습니다.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// .env 파일의 환경 변수를 로드하기 위해 import 합니다.
// 스크립트가 이 파일을 import하면 자동으로 .env가 로드됩니다.
import 'dotenv/config';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  throw new Error(
    'GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.'
  );
}

// 이미 앱이 초기화되었는지 확인하여 중복 초기화를 방지합니다.
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccountPath),
  });
}

// 초기화된 Admin SDK의 Firestore 인스턴스를 export 합니다.
export const adminDb = getFirestore();