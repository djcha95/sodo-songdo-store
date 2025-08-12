// /api/og.js  (ESM)

const ABS_BASE = 'https://www.sodo-songdo.store';
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;

// 너희 상품 단건 조회 API (Vercel ↔ Firebase 프록시 경유)
// 실제로 존재하는 엔드포인트에 맞게 필요하면 쿼리 키만 바꿔주세요.
// 예: /api/product?id=...  또는 /api/products?id=... /api/products/:id 등
const PRODUCT_API = (id) => `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

// fetch helpers
const fetchJson = async (url) => {
  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const truncate = (s, n) => (s || '').length <= n ? (s || '') : (s || '').slice(0, n - 1) + '…';

const toAbsHttps = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  return `${ABS_BASE}${path}`;
};

const renderOgHtml = ({ url, title, description, image, siteName = '소도몰', type = 'product' }) => `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />

<!-- Open Graph -->
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:secure_url" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:site_name" content="${esc(siteName)}" />
<meta property="og:type" content="${esc(type)}" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head><body>미리보기 전용</body></html>`;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');

  try {
    const id = req.query?.id ? String(req.query.id) : '';
    const url = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

    // 기본값
    let title = id ? '상품 미리보기 - 소도몰' : '소도몰';
    let description = '소도몰에서 특별한 상품을 만나보세요!';
    let image = FALLBACK_IMG;

    // 1) 백엔드 상품 API에서 자동 조회
    if (id) {
      const data = await fetchJson(PRODUCT_API(id));
      if (data) {
        // 너희 API 응답에서 필드명만 맞춰주면 됩니다.
        // (가능한 후보들을 모두 시도)
        const apiTitle = data.title || data.groupName || data.name;
        const apiDesc  = data.description || data.summary || data.caption || '';
        let   apiImage = data.mainImage ||
                         (Array.isArray(data.imageUrls) ? data.imageUrls[0] : '') ||
                         data.thumbnail;

        if (apiTitle) title = `${apiTitle} - 소도몰`;
        if (apiDesc)  description = truncate(stripHtml(apiDesc), 120);

        if (apiImage) {
          // 상대경로면 절대경로로 보정
          apiImage = toAbsHttps(apiImage);
          image = apiImage;
        }
      }
    }

    // 2) 최종 렌더 (항상 200)
    const html = renderOgHtml({ url, title, description, image, siteName: '소도몰', type: 'product' });
    res.status(200).send(html);
  } catch {
    const html = renderOgHtml({
      url: ABS_BASE,
      title: '소도몰',
      description: '소비자도 도매가로!',
      image: FALLBACK_IMG,
      siteName: '소도몰',
      type: 'website'
    });
    res.status(200).send(html);
  }
}
