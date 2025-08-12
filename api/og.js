// /api/og.js  (ESM, Node 18+의 global fetch 사용)

const ABS_BASE = 'https://www.sodo-songdo.store';
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;

// 필요 시 실제 상품 API로 교체하세요 (지금은 예시 경로)
const PRODUCT_API = (id) => `${ABS_BASE}/api/products/${encodeURIComponent(id)}`;

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');

  const id = req.query?.id ? String(req.query.id) : '';
  const url = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

  // 기본값
  let title = id ? '상품 미리보기 - 소도몰' : '소도몰';
  let description = '소도몰에서 특별한 상품을 만나보세요!';
  let image = FALLBACK_IMG;

  // 1) og-map.json 우선 적용
  if (id) {
    try {
      const resp = await fetch(`${ABS_BASE}/og-map.json`);
      if (resp.ok) {
        const txt = await resp.text();
        try {
          const map = JSON.parse(txt);
          const candidate = map[id];
          if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
            image = candidate;
          }
        } catch {}
      }
    } catch {}
  }

  // 2) 백엔드 상품 API 조회 (og-map에서 못 찾았을 때만)
  if (id && image === FALLBACK_IMG) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      if (data.title) title = data.title;
      if (data.description) description = data.description;
      // 대표 이미지 후보들
      const apiImage =
        data.image ||
        data.mainImage ||
        (Array.isArray(data.imageUrls) ? data.imageUrls[0] : '') ||
        data.thumbnail ||
        '';
      if (apiImage && /^https?:\/\//i.test(apiImage)) image = apiImage;
    }
  }

  // 3) 자동 리사이즈 프록시로 감싸기 (1200x630, 비율 유지 + 흰 배경)
  const wrapped = `${ABS_BASE}/api/img?src=${encodeURIComponent(image)}`;

  const html = `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />

<!-- Open Graph -->
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(wrapped)}" />
<meta property="og:image:secure_url" content="${esc(wrapped)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:site_name" content="소도몰" />
<meta property="og:type" content="product" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(wrapped)}" />
</head><body>미리보기 전용</body></html>`;

  res.status(200).send(html);
}
