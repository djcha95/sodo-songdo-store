// functions/src/http/auth.ts
import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import * as logger from "firebase-functions/logger";
import { auth, allowedOrigins } from "../utils/config.js";
import { getAuth } from "firebase-admin/auth";
import axios from "axios";

export const kakaoLogin = onRequest(
  {
    region: "asia-northeast3",
    cors: allowedOrigins, // Firebase가 CORS를 자동으로 처리하도록 설정
  },
  // ✅ [수정] 수동 OPTIONS 처리 로직을 완전히 제거하여 Firebase 자동 처리에만 의존합니다.
  async (request: Request, response: Response) => {
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
  // ✅ [수정] 여기도 동일하게 수동 OPTIONS 처리 로직을 제거합니다.
  async (request: Request, response: Response) => {
    const { uid, role } = request.query;

    if (typeof uid !== 'string' || typeof role !== 'string') {
      response.status(400).send("Please provide uid and role parameters accurately.");
      return;
    }

    try {
      await getAuth().setCustomUserClaims(uid, { role: role });
      response.send(`Success! The '${role}' role has been assigned to user (${uid}).`);
    } catch (error) {
      logger.error("Error setting custom claim:", error);
      response.status(500).send(`An error occurred while setting the custom claim: ${error}`);
    }
  }
);