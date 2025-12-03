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
    // 1. 이미지 다운로드
    const r = await fetch(src);
    if (!r.ok) throw new Error("fetch failed");
    
    const arrayBuffer = await r.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // 2. Sharp 리사이징 (이게 있어야 카톡 설명이 나옵니다!)
    const sharp = (await import("sharp")).default;

    const outputBuffer = await sharp(buf)
      .resize(1200, 630, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // 흰 배경
        position: 'center'
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(outputBuffer);

  } catch (e) {
    console.error("Image Error:", e);
    // 에러 나면(용량 초과 등) -> 기본 이미지로 돌려서 설명이라도 나오게 함
    res.redirect(302, "https://www.songdopick.store/songdopick_og.png");
  }
}