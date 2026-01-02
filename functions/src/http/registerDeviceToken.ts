// functions/src/http/registerDeviceToken.ts
/**
 * 공폰(카카오 자동화 단말) FCM 토큰 등록/갱신 엔드포인트
 *
 * 보안(운영 권장):
 * - 1순위: Authorization: Bearer <Firebase ID Token> (role=admin/master)
 * - 2순위(운영 편의): x-bot-key: <KAKAO_BOT_REGISTRATION_KEY> (Functions Secret)
 *
 * 저장 위치: system/deviceTokens/kakaoBot
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { admin, dbAdmin as db } from "../firebase/admin.js";

const REGION = "asia-northeast3";
const DEVICE_TOKEN_PATH = "system/deviceTokens/kakaoBot";

function getBearerToken(req: any): string | null {
  const h = req?.headers?.authorization;
  if (!h || typeof h !== "string") return null;
  if (!h.startsWith("Bearer ")) return null;
  return h.split("Bearer ")[1]?.trim() || null;
}

async function isAdmin(req: any): Promise<boolean> {
  const token = getBearerToken(req);
  if (!token) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const role = (decoded as any).role;
    return role === "admin" || role === "master";
  } catch (e) {
    logger.warn("Admin token verification failed:", { error: (e as Error)?.message ?? String(e) });
    return false;
  }
}

function hasBotKey(req: any): boolean {
  // Secrets는 런타임에서 process.env로 주입됨
  const expected = (process.env.KAKAO_BOT_REGISTRATION_KEY || "").toString().trim();
  if (!expected) return false;
  const actual = (req?.headers?.["x-bot-key"] || req?.headers?.["X-Bot-Key"] || "").toString().trim();
  return actual && actual === expected;
}

export const registerKakaoBotDeviceToken = onRequest(
  {
    region: REGION,
    secrets: ["KAKAO_BOT_REGISTRATION_KEY"],
  },
  async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-bot-key");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send({ ok: false, error: "Method Not Allowed" });
      return;
    }

    const allowed = (await isAdmin(req)) || hasBotKey(req);
    if (!allowed) {
      res.status(403).send({ ok: false, error: "Permission denied" });
      return;
    }

    try {
      const token = (req.body?.token || "").toString().trim();
      const platform = (req.body?.platform || "android").toString().trim();
      if (!token) {
        res.status(400).send({ ok: false, error: "Missing token" });
        return;
      }

      await db.doc(DEVICE_TOKEN_PATH).set(
        {
          token,
          platform,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("Device token updated", { deviceTokenPath: DEVICE_TOKEN_PATH, platform });
      res.status(200).send({ ok: true });
    } catch (e) {
      logger.error("registerKakaoBotDeviceToken failed", {
        error: (e as Error)?.message ?? String(e),
        stack: (e as Error)?.stack,
      });
      res.status(500).send({ ok: false, error: "Internal error" });
    }
  }
);


