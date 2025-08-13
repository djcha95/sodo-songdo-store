// /api/img.js  (ESM, Node 18+)
// - src 쿼리로 원본 이미지 받아서 1200x630으로 맞춰주는 프록시(프로젝트에 있는 기존 로직 유지)
// - 아래 함수로 Firebase Storage URL에 alt=media 자동 부착 → 봇/카톡이 확실히 이미지를 읽을 수 있음

function normalizeFirebaseUrl(u) {
  try {
    const url = new URL(u);
    if (url.hostname === 'firebasestorage.googleapis.com') {
      if (!url.searchParams.has('alt')) {
        url.searchParams.set('alt', 'media');
      }
      return url.toString();
    }
  } catch {}
  return u;
}

export default async function handler(req, res) {
  const srcRaw = typeof req.query?.src === 'string' ? req.query.src : '';
  const src = normalizeFirebaseUrl(srcRaw);

  if (!src) {
    res.status(400).send('missing src');
    return;
  }

  try {
    // ▼ 여기부터는 프로젝트에 쓰던 리사이즈 로직 그대로 사용
    // 예: fetch(src) → 버퍼 → sharp().resize(1200, 630, { fit: 'contain', background: '#fff' }) → image/jpeg 반환
    const r = await fetch(src);
    if (!r.ok) {
      res.status(502).send('bad upstream');
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());

    // sharp 사용 예시 (이미 sharp 설치/구성 돼 있다면)
    // const sharp = (await import('sharp')).default;
    // const out = await sharp(buf)
    //   .resize(1200, 630, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    //   .jpeg({ quality: 85 })
    //   .toBuffer();
    // res.setHeader('Content-Type', 'image/jpeg');
    // res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // res.status(200).send(out);

    // 만약 sharp 없이 프록시만 하신다면:
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send('image error');
  }
}
