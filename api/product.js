// /api/product.js  (ESM, Node 18+ on Vercel)
// 목적: Cloud Functions 함수명(productApi|product) × 내부 경로(/, /product, /v1/product) 조합을
//       차례대로 시도하여 첫 번째 2xx 응답을 그대로 전달.

const REGION = "asia-northeast3";
const PROJECT = "sso-do"; // GCP 프로젝트 아이디
const FN_NAMES = ["productApi", "product"];        // 함수명이 productApi 또는 product일 가능성
const PATHS = ["", "/product", "/v1/product"];     // 내부 express 경로 조합(루트/ /product /v1/product)

function buildCandidates(id) {
  const base = (fn) => `https://${REGION}-${PROJECT}.cloudfunctions.net/${fn}`;
  const qs = `?id=${encodeURIComponent(id)}`;
  const urls = [];
  for (const fn of FN_NAMES) {
    for (const p of PATHS) {
      urls.push(`${base(fn)}${p}${qs}`);
    }
  }
  return urls;
}

export default async function handler(req, res) {
  const id = typeof req.query?.id === "string" ? req.query.id : "";

  if (!id) {
    res.status(400).json({ error: "missing id" });
    return;
  }

  const candidates = buildCandidates(id);
  let lastErr = null;

  try {
    for (const url of candidates) {
      try {
        const r = await fetch(url);

        if (r.ok) {
          const ct = r.headers.get("content-type") || "application/json";
          const bodyText = await r.text();

          res.setHeader("Content-Type", ct);
          res.setHeader(
            "Cache-Control",
            "public, max-age=30, s-maxage=30, stale-while-revalidate=30"
          );
          res.status(r.status).send(bodyText);
          return;
        } else {
          lastErr = new Error(`Upstream ${url} -> ${r.status}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }

    // 여기까지 왔다는 건 후보 URL 전부 실패
    res.status(502).json({
      error: "product upstream not found",
      detail: String(lastErr),
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: "product proxy error", detail: String(e) });
  }
}
