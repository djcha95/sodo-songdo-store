// functions/src/http/product.ts
import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp(); // Functions 환경 변수/권한으로 초기화
}

const db = getFirestore();
const app = express();

// ★ 컬렉션 이름 맞춰주세요. (보통 "products")
const PRODUCT_COL = "products";

// 공통 핸들러
async function productHandler(req: any, res: any) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");

    const id = String(req.query?.id || "");
    if (!id) {
      res.status(400).json({ error: "missing id" });
      return;
    }

    const snap = await db.collection(PRODUCT_COL).doc(id).get();
    if (!snap.exists) {
      res.status(404).json({ error: "product not found", id });
      return;
    }

    const data = snap.data() || {};

    // 대표 이미지 고르기: image → mainImage → imageUrls[0] → thumbnail
    const pickImage = () => {
      const img =
        data.image ||
        data.mainImage ||
        (Array.isArray(data.imageUrls) && data.imageUrls.length > 0 ? data.imageUrls[0] : "") ||
        data.thumbnail ||
        "";
      return img || "";
    };

    const out = {
      id,
      // 이름(둘 중 있는 것 사용)
      groupName: data.groupName || undefined,
      title: data.title || undefined,
      // 설명(HTML 가능)
      description: data.description || "",
      // 해시태그(문자열 배열)
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      // 대표 이미지 후보들
      image: data.image || undefined,
      mainImage: data.mainImage || undefined,
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : undefined,
      thumbnail: data.thumbnail || undefined,
      // 대표 이미지 1개(프론트에서 쓰진 않아도 디버그에 좋음)
      _pickedImage: pickImage(),
    };

    res.status(200).json(out);
  } catch (e: any) {
    res.status(500).json({ error: "product handler error", detail: String(e?.message || e) });
  }
}

// 어떤 경로로 와도 처리되게 3개 라우트 모두 연결
app.get("/", productHandler);
app.get("/product", productHandler);
app.get("/v1/product", productHandler);

// v2 onRequest: 함수 이름 2개를 같은 앱으로 노출(둘 다 됨)
export const product = onRequest(
  { region: "asia-northeast3", cors: true },
  (req, res) => app(req, res)
);
export const productApi = onRequest(
  { region: "asia-northeast3", cors: true },
  (req, res) => app(req, res)
);
