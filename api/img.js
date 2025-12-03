// /api/img.js
import { URL } from 'url';

// Firebase URL 보정 함수
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

    // 2. Sharp로 1200x630 강제 리사이즈 (흰 배경 + 중앙 정렬)
    // Vercel Serverless Function 용량 최적화를 위해 동적 임포트 권장
    const sharp = (await import("sharp")).default;

    const outputBuffer = await sharp(buf)
      .resize(1200, 630, {
        fit: "contain",             // 비율 유지하며 박스 안에 넣기
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // 흰색 배경
        position: 'center'
      })
      .jpeg({ quality: 80, mozjpeg: true }) // 용량 줄이기 위해 JPEG 압축
      .toBuffer();

    // 3. 응답 전송
    res.setHeader("Content-Type", "image/jpeg");
    // 이미지는 변할 일이 거의 없으므로 길게 캐싱
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(outputBuffer);

  } catch (e) {
    console.error("Image processing error:", e);
    // Sharp 실패 시 원본이라도 보내주는 폴백 (혹은 500)
    res.status(500).send("Image processing failed");
  }
}