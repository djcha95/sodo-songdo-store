import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
// [수정] express, cors는 default import를 사용해야 합니다.
import express, { Request, Response } from "express";
import cors from "cors";

// [수정] Gemini AI 분석 함수를 가져옵니다.
import { analyzeProductTextWithAI } from "../utils/gemini.js";

// Firebase Admin SDK 초기화
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * [추가] Firestore에서 카테고리 목록을 가져오는 함수입니다.
 * '../utils/firestore.js' 모듈을 찾을 수 없어 여기에 직접 구현했습니다.
 */
async function getCategoriesFromFirestore(): Promise<string[]> {
  const snapshot = await admin.firestore().collection("categories").orderBy("order", "asc").get();
  if (snapshot.empty) {
    console.warn("No categories found in Firestore.");
    return [];
  }
  // 각 문서의 'name' 필드를 카테고리 이름으로 사용합니다.
  return snapshot.docs.map(doc => doc.data().name as string).filter(Boolean);
}

// v2 전역 옵션 (서울 리전)
setGlobalOptions({ region: "asia-northeast3" });

// Express 앱 초기화
const app = express();

// CORS 미들웨어를 적용합니다.
app.use(cors({ origin: true }));

// =================================================================
// 1. 상품 메타정보 조회 API (기존 기능)
// =================================================================
// [수정] req, res 파라미터에 명시적으로 타입을 지정합니다.
app.get("/productMeta", async (req: Request, res: Response) => {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing product ID" });
    }

    const snap = await admin.firestore().collection("products").doc(id).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Product not found" });
    }

    const data = snap.data() || {};
    const title: string = data.title || data.groupName || data.name || "상품";
    const rawDesc: string = data.description || data.summary || data.subtitle || "";
    const description = String(rawDesc || "").slice(0, 140);
    const image: string = (Array.isArray(data.imageUrls) && data.imageUrls[0]) || data.mainImage || data.thumbnail || "";

    return res.status(200).json({ id, title, description, image });
  } catch (err) {
    console.error("Error fetching product meta:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// =================================================================
// 2. AI 상품 분석 API (신규 기능)
// =================================================================
// [수정] req, res 파라미터에 명시적으로 타입을 지정합니다.
app.post("/analyzeProduct", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text content is required" });
    }

    const categories = await getCategoriesFromFirestore();
    if (!categories || categories.length === 0) {
      // 카테고리가 없는 경우에도 분석은 계속하되, 경고를 남깁니다.
      console.warn("AI analysis is running without categories.");
    }

    const result = await analyzeProductTextWithAI(text, categories);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Error analyzing product text:", err);
    if (err.code && err.httpErrorCode) {
      return res.status(err.httpErrorCode.status).json({
        error: err.message,
        details: err.details,
      });
    }
    return res.status(500).json({ error: "An unexpected error occurred during AI analysis." });
  }
});

// Express 앱을 단일 Cloud Function으로 내보냅니다.
export const productApi = onRequest(app);