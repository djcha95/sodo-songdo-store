// og.js
import fetch from 'node-fetch';

const ABS_BASE = 'https://www.sodo-songdo.store';
const PRODUCT_API = (id) => `${ABS_BASE}/api/products/${encodeURIComponent(id)}`;
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const id = req.query?.id ? String(req.query.id) : '';
  const url = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

  // 기본값
  let title = id ? '상품 미리보기 - 소도몰' : '소도몰';
  let description = '소도몰에서 특별한 상품을 만나보세요!';
  let image = FALLBACK_IMG;

  // 1) og-map.json 우선 적용
  if (id) {
    try {
      const resp = await fetch(`${ABS_BASE}/og-map.json`, { method: 'GET' });
      if (resp.ok) {
        const txt = await resp.text();
        try {
          const map = JSON.parse(txt);
          const candidate = map[id];
          if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
            image = candidate; // 매핑된 이미지 사용
          }
        } catch {}
      }
    } catch {}
  }

  // 2) 상품 API 조회 (og-map에 없을 때만)
  if (id && image === FALLBACK_IMG) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      if (data.title) title = data.title;
      if (data.description) description = data.description;
      if (data.image) image = data.image;
    }
  }

  // HTML 응답
  res.send(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />

<!-- Open Graph -->
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:secure_url" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${url}" />
<meta property="og:site_name" content="소도몰" />
<meta property="og:type" content="product" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
</head>
<body>미리보기 전용</body>
</html>`);
}
