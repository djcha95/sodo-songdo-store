// /api/img.js  (ESM)
import sharp from 'sharp';

// 사용법: /api/img?src=<원본이미지URL>
// 동작: 1200x630, contain(비율 유지 축소) + 흰 배경으로 패딩 → JPEG 반환
export default async function handler(req, res) {
  try {
    const src = req.query?.src;
    if (!src || typeof src !== 'string') {
      res.status(400).send('missing src');
      return;
    }

    const upstream = await fetch(src);
    if (!upstream.ok) {
      res.status(502).send('bad upstream');
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());

    const out = await sharp(buf)
      .resize(1200, 630, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
    res.status(200).send(out);
  } catch {
    // 문제 시 원본으로 폴백 (썸네일 실패해도 빈 미리보기 방지)
    const src = req.query?.src;
    if (src) {
      res.status(302).setHeader('Location', src).send('');
    } else {
      res.status(500).send('error');
    }
  }
}
