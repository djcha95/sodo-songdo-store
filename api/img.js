// /api/img.js
import { URL } from 'url';

function normalizeFirebaseUrl(u) {
  try {
    const url = new URL(u);
    if (
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname.endsWith(".firebasestorage.app")
    ) {
      if (!url.searchParams.has("alt")) url.searchParams.set("alt", "media");
      return url.toString();
    }
  } catch {}
  return u;
}

export default async function handler(req, res) {
  const srcRaw = req.query?.src;
  
  if (!srcRaw) {
    res.status(400).send("missing src");
    return;
  }

  const src = normalizeFirebaseUrl(String(srcRaw));

  try {
    // 1. 원본 이미지 가져오기
    const r = await fetch(src);
    if (!r.ok) throw new Error("upstream fetch failed");
    
    const arrayBuffer = await r.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // ✅ 핵심: Sharp 로드 (주석 해제됨!)
    const sharp = (await import("sharp")).default;

    // ✅ 1200x630 강제 리사이즈 + 흰 배경
    const outputBuffer = await sharp(buf)
      .resize(1200, 630, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        position: 'center'
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    // 캐시를 길게 잡아서 다음번엔 빠르게 뜨도록 함
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(outputBuffer);

  } catch (e) {
    console.error("Sharp Failed:", e);
    // 🚨 에러 발생 시(이미지가 너무 크거나 등등) -> 그냥 기본 썸네일로 리다이렉트
    // 이렇게 하면 설명글은 무조건 나옵니다.
    res.redirect(302, "https://www.songdopick.store/sodomall-preview.png");
  }
}