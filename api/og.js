// /api/og.js
const ABS_BASE = 'https://www.songdopick.store';
const FALLBACK_IMG = `${ABS_BASE}/songdopick_og.png`; // 기본 이미지
const PRODUCT_API = (id) => `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

// HTML 태그 제거 및 글자수 제한 유틸
const stripTags = (html = '') => String(html).replace(/<[^>]*>/g, '');
const normalizeSpaces = (s = '') => s.replace(/\s+/g, ' ').trim();
const limitChars = (s = '', max = 180) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

async function fetchJson(url) {
  try {
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function pickImageFromData(data) {
  const pick = data?.image || data?.mainImage || (Array.isArray(data?.imageUrls) ? data.imageUrls[0] : '') || data?.thumbnail || '';
  if (!pick) return '';
  if (!/^https?:\/\//i.test(pick)) return `${ABS_BASE}${pick.startsWith('/') ? '' : '/'}${pick}`;
  return pick;
}

export default async function handler(req, res) {
  const id = req.query?.id ? String(req.query.id) : '';
  const pageUrl = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

  // 1. 기본값 설정 (상품 없을 때)
  let title = 'SONGDOPICK';
  let description = '오늘의 픽 상품을 바로 확인해보세요!';
  let image = FALLBACK_IMG;

  if (id) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      // 2. 제목: "오늘의 PICK | 상품명" (해시태그 제거함)
      const productName = data.groupName || data.title || '추천 상품';
      title = `오늘의 PICK | ${productName}`;

      // 3. 설명: 상품 설명이 있으면 쓰고, 없으면 기본 문구 사용
      const rawDesc = data.description || '';
      const cleanDesc = limitChars(normalizeSpaces(stripTags(rawDesc)), 180);
      
      if (cleanDesc && cleanDesc.length > 5) {
        description = cleanDesc;
      } else {
        description = '오늘의 픽 상품을 바로 확인해보세요!';
      }

      // 4. 이미지 선택
      const picked = pickImageFromData(data);
      if (picked) image = picked;
    }
  }

  // 5. 이미지 비율 고정 (1200x630) - 이게 설명 나오게 하는 핵심
  const wrapped = `${ABS_BASE}/api/img?src=${encodeURIComponent(image)}`;

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />

<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(wrapped)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:site_name" content="SONGDOPICK" />
<meta property="og:type" content="website" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(wrapped)}" />
</head>
<body>미리보기</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=60');
  res.status(200).send(html);
}