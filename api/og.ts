// /api/og.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---- Optional: Firebase Admin (서비스계정이 있을 때만 사용) ----
let admin: typeof import('firebase-admin') | undefined;

try {
  // require 실패 가능 → try/catch
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admin = require('firebase-admin');
  if (admin && admin.apps.length === 0) {
    admin.initializeApp({
      // GOOGLE_APPLICATION_CREDENTIALS 환경변수 사용
    });
  }
} catch {
  admin = undefined; // 설정 미완 등일 때도 안전하게 동작
}


// ---- 유틸: 안전한 텍스트/이미지 가공 ----
const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const safeText = (v: any, fallback = '') =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;

const truncate = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n - 1) + '…';

const ABS_BASE = 'https://www.sodo-songdo.store'; // 배포 도메인
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`; // 공개 접근 가능 이미지

// ---- 크롤러 전용 OG HTML 템플릿 ----
function renderOgHtml({
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
}) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="content-type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    
    <!-- Open Graph -->
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:site_name" content="${esc(siteName)}" />
    <meta property="og:type" content="${type}" />

    <!-- Twitter (일부 메신저가 참고) -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(image)}" />

    <!-- 안전: 아무 스크립트도 없음 (크롤러 친화) -->
  </head>
  <body>
    미리보기 전용 페이지입니다.
  </body>
</html>`;
}

// ---- 상품 로드 (Admin 우선, 실패 시 기본 OG) ----
async function fetchProduct(productId: string): Promise<{
  id: string;
  groupName: string;
  description: string;
  imageUrls: string[];
} | null> {
  if (admin) {
    try {
      const db = admin.firestore();
      const snap = await db.collection('products').doc(productId).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return {
        id: productId,
        groupName: safeText(data.groupName, '상품'),
        description: safeText(data.description, ''),
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls.filter(Boolean) : []
      };
    } catch {
      // fall through to null
    }
  }
  return null;
}


// ---- 메인 핸들러 ----
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = safeText((req.query.id as string) || '');
  const url = `${ABS_BASE}/product/${encodeURIComponent(id || '')}`;

  // 기본값(상품을 못 찾았을 때)
  let title = id ? `상품 미리보기 - 소도몰` : `소도몰`;
  let description = `소도몰에서 특별한 상품을 만나보세요!`;
  let image = FALLBACK_IMG;

  if (id) {
    const product = await fetchProduct(id);
    if (product) {
      title = `${product.groupName} - 소도몰`;
      // description: 마크다운/HTML 혼용 가능 → HTML 제거 후 120자 제한
      const plain = stripHtml(product.description || '');
      description = truncate(plain || '소도몰에서 특별한 상품을 만나보세요!', 120);
      image = product.imageUrls?.[0] || FALLBACK_IMG;
      // 절대 URL 보정
      if (!/^https?:\/\//i.test(image)) {
        image = `${ABS_BASE}${image.startsWith('/') ? '' : '/'}${image}`;
      }
    }
  }

  // 크롤러 캐시 성능 개선 (카톡/페북이 캐시함)
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=600');

  const html = renderOgHtml({
    url,
    title,
    description,
    image,
    siteName: '소도몰',
    type: 'product'
  });

  res.status(200).send(html);
}
