// /api/img.js  (ESM, Node 18+ on Vercel)
// 역할: ?src=원본이미지주소 를 받아서 그대로 프록시 (필요시 Firebase URL 보정)

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
  const srcRaw = typeof req.query?.src === "string" ? req.query.src : "";

  if (!srcRaw) {
    res.status(400).send("missing src");
    return;
  }

  const src = normalizeFirebaseUrl(srcRaw);

  try {
    const r = await fetch(src);

    if (!r.ok) {
      res.status(502).send("upstream image fetch failed");
      return;
    }

    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());

    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send("image error");
  }
}
