// /api/og.js  (ESM)
export default async function handler(req, res) {
  try {
    const ABS_BASE = 'https://www.sodo-songdo.store';
    const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;

    const id = req.query?.id ? String(req.query.id) : '';
    const url = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

    const title = id ? `상품 미리보기 - 소도몰` : `소도몰`;
    const description = `소도몰에서 특별한 상품을 만나보세요!`;
    const image = FALLBACK_IMG;

    const esc = (s) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');

    const html = `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:secure_url" content="${esc(image)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:site_name" content="소도몰" />
<meta property="og:type" content="product" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head><body>미리보기 전용</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');
    res.status(200).send(html);
  } catch {
    // 혹시라도 예외가 나도 200으로 기본 OG 반환
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><title>소도몰</title>');
  }
}
