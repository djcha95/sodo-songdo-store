// functions/src/http/auth.ts
import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import * as logger from "firebase-functions/logger";
// ✅ [수정] dbAdmin을 db라는 별칭으로 가져와 Firestore를 사용합니다.
import { authAdmin as auth, dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import axios from "axios";

export const kakaoLogin = onRequest(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
  },
  async (request: Request, response: Response) => {
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    const token: string | undefined = request.body.token;
    if (!token) {
      response.status(400).json({ message: "Kakao token not provided." });
      return;
    }

    try {
      const kakaoUserResponse = await axios.get(
        "https://kapi.kakao.com/v2/user/me",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const kakaoId = kakaoUserResponse.data.id;
      if (!kakaoId) {
        throw new Error("Could not retrieve Kakao user ID.");
      }
      const uid = `kakao:${kakaoId}`;
      try {
        await auth.getUser(uid);
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "auth/user-not-found"
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
      const firebaseToken = await auth.createCustomToken(uid);
      response.status(200).json({ firebaseToken });
    } catch (error: unknown) {
      let errorMessage = "An error occurred on the server during authentication processing.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      logger.error("Error creating Firebase custom token:", error);
      if (axios.isAxiosError(error)) {
        logger.error("Axios error details:", error.response?.data);
      }
      response.status(500).json({ message: errorMessage, error: error });
    }
  }
);

export const setUserRole = onRequest(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
  },
  async (request: Request, response: Response) => {
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    // 1. 요청을 보낸 사용자가 관리자 또는 마스터인지 확인합니다.
    try {
      const idToken = request.headers.authorization?.split("Bearer ")[1];
      if (!idToken) {
        response.status(401).send("인증되지 않은 사용자입니다. (No token provided)");
        return;
      }
      
      const decodedToken = await auth.verifyIdToken(idToken);
      // ✅ [수정] 'admin'과 'master' 역할을 모두 허용하도록 변경합니다.
      const userRole = decodedToken.role;
      if (!userRole || !['admin', 'master'].includes(userRole)) {
        response.status(403).send("관리자 또는 마스터 권한이 없습니다.");
        return;
      }
    } catch (error) {
      logger.error("Error verifying admin/master token:", error);
      response.status(401).send("인증되지 않은 사용자입니다. (Invalid token)");
      return;
    }

    // 2. 권한이 확인되면, 대상 사용자에게 역할을 부여합니다.
    const { uid, role } = request.query;

    if (typeof uid !== 'string' || typeof role !== 'string') {
      response.status(400).send("uid와 role 파라미터를 정확히 입력해주세요.");
      return;
    }

    try {
      // ✅ [추가] Firestore의 사용자 문서도 함께 업데이트하여 데이터 일관성을 유지합니다.
      const userDocRef = db.collection("users").doc(uid);

      await Promise.all([
        // 커스텀 클레임 설정
        auth.setCustomUserClaims(uid, { role: role }),
        // Firestore 문서 업데이트
        userDocRef.update({ role: role })
      ]);
      
      logger.info(`Successfully set role '${role}' for user ${uid}.`);
      response.send(`성공! 사용자(${uid})에게 '${role}' 역할이 부여되었으며, 데이터베이스에 반영되었습니다.`);
    } catch (error) {
      logger.error("Error setting custom claim and updating firestore:", error);
      response.status(500).send(`역할 설정 중 오류 발생: ${error}`);
    }
  }
);