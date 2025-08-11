// /api/og.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ABS_BASE = 'https://www.sodo-songdo.store';
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;

const safeText = (v: any, fallback = '') =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;

const truncate = (s: string, n: number) =>
  (s || '').length <= n ? (s || '') : (s || '').slice(0, n - 1) + '…';

const renderOgHtml = ({
  url,
  title,
  description,
  image,
  siteName = '소도몰',
  type = 'product'
}: {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName?: string;
  type?: 'website' | 'product' | 'article';
}) => {
  const esc = (x: string) =>
    (x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />

    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:secure_url" content="${esc(image)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:site_name" content="${esc(siteName)}" />
    <meta property="og:type" content="${type}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(image)}" />
  </head>
  <body>미리보기 전용</body>
</html>`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');

    const id = safeText((req.query.id as string) || '');
    const url = `${ABS_BASE}/product/${encodeURIComponent(id || '')}`;

    // V1 안정판: 우선 공통 프리뷰
    const title = id ? `상품 미리보기 - 소도몰` : `소도몰`;
    const description = truncate('소도몰에서 특별한 상품을 만나보세요!', 120);
    const image = FALLBACK_IMG;

    const html = renderOgHtml({ url, title, description, image, siteName: '소도몰', type: 'product' });
    res.status(200).send(html);
  } catch (e) {
    // 혹시 모를 예외도 마지막 방어
    const url = ABS_BASE;
    const html = renderOgHtml({
      url,
      title: '소도몰',
      description: '소비자도 도매가로!',
      image: FALLBACK_IMG,
      siteName: '소도몰',
      type: 'website'
    });
    res.status(200).send(html);
  }
}
