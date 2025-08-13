// /api/product.js  (ESM, Node 18+ on Vercel)
//
// 목적: Cloud Functions 의 productApi 내부 경로가 /product, /v1/product, / 중 무엇이든
//       차례대로 시도하여 첫 성공 응답을 그대로 프록시한다.

const CF_BASE = 'https://asia-northeast3-sso-do.cloudfunctions.net/productApi';

export default async function handler(req, res) {
  try {
    const id = typeof req.query?.id === 'string' ? req.query.id : '';
    if (!id) {
      res.status(400).json({ error: 'missing id' });
      return;
    }

    const candidates = [
      `${CF_BASE}/product?id=${encodeURIComponent(id)}`,
      `${CF_BASE}/v1/product?id=${encodeURIComponent(id)}`,
      `${CF_BASE}?id=${encodeURIComponent(id)}`,
    ];

    let lastErr = null;
    for (const url of candidates) {
      try {
        const r = await fetch(url, { method: 'GET' });
        if (r.ok) {
          const ct = r.headers.get('content-type') || 'application/json; charset=utf-8';
          res.setHeader('Content-Type', ct);
          res.setHeader('Cache-Control', 'no-store');
          const buf = Buffer.from(await r.arrayBuffer());
          res.status(200).send(buf);
          return;
        } else {
          lastErr = new Error(`Upstream ${url} -> ${r.status}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }

    res.status(502).json({ error: 'product upstream not found', detail: String(lastErr) });
  } catch (e) {
    res.status(500).json({ error: 'product proxy error', detail: String(e) });
  }
}
