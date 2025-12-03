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
    const r = await fetch(src);
    if (!r.ok) throw new Error("upstream fetch failed");
    
    const arrayBuffer = await r.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    const sharp = (await import("sharp")).default;

    const outputBuffer = await sharp(buf)
      .resize(1200, 630, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        position: 'center'
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(outputBuffer);

  } catch (e) {
    console.error("Sharp Failed:", e);
    // ✅ 도메인이 songdopick.store 인지 확인 (올려주신 코드엔 이미 적용되어 있음)
    res.redirect(302, "https://www.songdopick.store/songdopick_og.png");
  }
}