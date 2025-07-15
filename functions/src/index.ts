// functions/src/index.ts
import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import * as logger from "firebase-functions/logger";

import { initializeApp, applicationDefault, AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import axios from "axios";
import cors from "cors";

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
//              이것이 모든 문제를 해결할 최종 코드입니다.
// 에뮬레이터 환경에서 Auth 에뮬레이터 주소 변수가 누락되는 문제를 해결하기 위해
// 코드 내에서 직접 환경 변수를 설정합니다.
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
if (process.env.FUNCTIONS_EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}


/** ──────────────────────────────────────────────────────────────
 * Firebase Admin 초기화 (v12+ 모듈식)
 * ────────────────────────────────────────────────────────────── */
const appOptions: AppOptions = {
  projectId: "sso-do",
};

// 에뮬레이터가 아닐 때(실제 배포 환경)만 기본 인증 정보 사용
if (!process.env.FUNCTIONS_EMULATOR) {
  appOptions.credential = applicationDefault();
}

initializeApp(appOptions);

const auth = getAuth();

/** ──────────────────────────────────────────────────────────────
 * CORS 설정
 * ────────────────────────────────────────────────────────────── */
const corsHandler = cors({
  origin: [
    "http://localhost:5173",
    "http://sodo-songdo.store",
  ],
});

/** ──────────────────────────────────────────────────────────────
 * 카카오 소셜 로그인 Cloud Function
 * ────────────────────────────────────────────────────────────── */
export const kakaoLogin = onRequest(
  { region: "asia-northeast3" },
  (request: Request, response: Response) => {
    corsHandler(request, response, async () => {
      // 디버깅 로그는 이제 제거해도 됩니다.
      /* 1. 메서드 체크 */
      if (request.method !== "POST") {
        response.status(405).send("Method Not Allowed");
        return;
      }

      /* 2. 토큰 유무 확인 */
      const token: string | undefined = request.body.token;
      if (!token) {
        response
          .status(400)
          .json({ message: "카카오 토큰이 제공되지 않았습니다." });
        return;
      }

      try {
        /* 3. 카카오 사용자 정보 조회 */
        const kakaoUserResponse = await axios.get(
          "https://kapi.kakao.com/v2/user/me",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const kakaoId = kakaoUserResponse.data.id;
        if (!kakaoId) {
          throw new Error("카카오 사용자 ID를 가져올 수 없습니다.");
        }

        /* 4. Firebase Auth 사용자 확인/생성 */
        const uid = `kakao:${kakaoId}`;

        try {
          await auth.getUser(uid);
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            // @ts-ignore 타입 가드
            error.code === "auth/user-not-found"
          ) {
            await auth.createUser({
              uid,
              email: kakaoUserResponse.data.kakao_account?.email,
              displayName: kakaoUserResponse.data.properties?.nickname,
            });
          } else {
            throw error;
          }
        }

        /* 5. 커스텀 토큰 발급 */
        const firebaseToken = await auth.createCustomToken(uid);
        response.status(200).json({ firebaseToken });
      } catch (error: unknown) {
        let errorMessage = "인증 처리 중 서버에서 오류가 발생했습니다.";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        logger.error("Firebase 커스텀 토큰 생성 중 오류:", error);
        if (axios.isAxiosError(error)) {
          logger.error("Axios error details:", error.response?.data);
        }

        response
          .status(500)
          .json({ message: errorMessage, error: errorMessage });
      }
    });
  }
);