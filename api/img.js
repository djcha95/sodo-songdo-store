// /api/img.js  (ESM, Node 18+ on Vercel)
function normalizeFirebaseUrl(u) {
  try {
    const url = new URL(u);
    if (url.hostname === "firebasestorage.googleapis.com" || url.hostname.endsWith(".firebasestorage.app")) {
      if (!url.searchParams.has("alt")) url.searchParams.set("alt", "media");
      return url.toString();
    }
  } catch {}
  return u;
}

export default async function handler(req, res) {
  try {
    const srcRaw = typeof req.query?.src === "string" ? req.query.src : "";
    if (!srcRaw) {
      res.status(400).send("missing src");
      return;
    }
    const src = normalizeFirebaseUrl(srcRaw);

    // 원본 가져오기
    const r = await fetch(src, { method: "GET" });
    if (!r.ok) {
      res.status(502).send("bad upstream");
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());

    // sharp 동적 로드 (Vercel Node 런타임에서 동작)
    const sharp = (await import("sharp")).default;

    // 핵심: 1200x630, contain, 중앙 배치, 흰 배경(여백)
    const out = await sharp(buf)
      .resize(1200, 630, {
        fit: "contain",                 // 비율 유지, 여백 생김
        position: "centre",             // 중앙 정렬(영/영)
        background: { r: 255, g: 255, b: 255 }, // 흰색 배경
        withoutEnlargement: false       // 작은 이미지는 키워서 맞춤
      })
      .jpeg({ quality: 85, progressive: true })  // 표준 JPEG로 출력(카톡 호환)
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    // OG 이미지는 꽤 오래 캐시해도 OK (버전 바꾸면 쿼리스트링으로 무효화)
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(out);
  } catch (e) {
    // 혹시 sharp가 설치 안돼 있거나 실패한 경우: 프록시로 폴백
    try {
      const srcRaw = typeof req.query?.src === "string" ? req.query.src : "";
      const src = normalizeFirebaseUrl(srcRaw);
      const r2 = await fetch(src);
      const ct = r2.headers.get("content-type") || "image/jpeg";
      const b2 = Buffer.from(await r2.arrayBuffer());
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.status(200).send(b2);
    } catch {
      res.status(500).send("image error");
    }
  }
}
