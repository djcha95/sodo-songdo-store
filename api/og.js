// /api/og.js  (ESM)

const ABS_BASE = 'https://www.sodo-songdo.store';
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;

// 간단 텍스트 fetch (실패 시 null)
const fetchText = async (url) => {
  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
};

// HTML escape
const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

// OG HTML 렌더
const renderOgHtml = ({ url, title, description, image, siteName = '소도몰', type = 'product' }) => {
  return `<!doctype html>
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
};

export default async function handler(req, res) {
  // 캐시: 카톡/페북이 캐시하므로 우리도 적절히 캐시 부여
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');

  try {
    const id = req.query?.id ? String(req.query.id) : '';
    const url = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

    // 기본값
    let title = id ? '상품 미리보기 - 소도몰' : '소도몰';
    let description = '소도몰에서 특별한 상품을 만나보세요!';
    let image = FALLBACK_IMG;

    // 정적 매핑에서 대표 이미지 찾기 (없으면 기본 이미지)
    if (id) {
      const mappingJson = await fetchText(`${ABS_BASE}/og-map.json`);
      if (mappingJson) {
        try {
          const map = JSON.parse(mappingJson);
          const candidate = map[id];
          if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
            image = candidate;
          }
        } catch {
          // JSON 파싱 실패 시 무시하고 폴백 유지
        }
      }
    }

    const html = renderOgHtml({ url, title, description, image, siteName: '소도몰', type: 'product' });
    res.status(200).send(html);
  } catch {
    // 어떤 에러가 나도 500 대신 기본 OG 반환
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
