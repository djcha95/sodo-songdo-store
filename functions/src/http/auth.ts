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
    cors: allowedOrigins,
  },
  async (request: Request, response: Response) => {
    // ✅ [수정] CORS 사전 요청(Preflight)을 수동으로 처리하는 로직 추가
    // 브라우저가 보내는 OPTIONS 요청에 204 No Content로 응답하여
    // 후속 POST 요청을 안전하게 보낼 수 있도록 허용합니다.
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
    // ✅ [수정] 여기에도 동일하게 OPTIONS 사전 요청 처리 로직을 추가합니다.
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

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