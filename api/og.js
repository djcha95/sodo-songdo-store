// /api/og.js  (ESM, Node 18+)
const ABS_BASE = 'https://www.songdopick.store';           // ← 배포 도메인
const FALLBACK_IMG = `${ABS_BASE}/songdopick-logo.png`;     // ← 이미지 없을 때 대체 이미지
const PRODUCT_API = (id) => `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

// 텍스트 가공 유틸: HTML 제거 → 공백 정리 → 180자 자르기
const stripTags = (html = '') => String(html).replace(/<[^>]*>/g, '');
const normalizeSpaces = (s = '') => s.replace(/\s+/g, ' ').trim();
const limitChars = (s = '', max = 180) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

// HTML 속성 이스케이프
const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

// JSON 가져오기(에러에 강하게)
async function fetchJson(url) {
  try {
    const r = await fetch(url, { next: { revalidate: 60 } }); // 60초 캐시
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// 대표 이미지 고르기: image → mainImage → imageUrls[0] → thumbnail
function pickImageFromData(data) {
  const pick =
    data?.image ||
    data?.mainImage ||
    (Array.isArray(data?.imageUrls) ? data.imageUrls[0] : '') ||
    data?.thumbnail ||
    '';

  if (!pick) return '';
  // 절대경로가 아니면 사이트 기준으로 보정
  if (!/^https?:\/\//i.test(pick)) {
    return `${ABS_BASE}${pick.startsWith('/') ? '' : '/'}${pick}`;
  }
  return pick;
}

// 해시태그 3개까지 제목에 붙이기
function composeTitle(base, hashtags) {
  const list = Array.isArray(hashtags) ? hashtags : [];
  const normalized = list
    .map(String)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  const top3 = normalized.slice(0, 3).join(' ');
  const composed = top3 ? `${base} · ${top3}` : base;
  // 너무 길면 살짝 자르기
  return composed.length > 80 ? composed.slice(0, 79) + '…' : composed;
}

export default async function handler(req, res) {
  const id = req.query?.id ? String(req.query.id) : '';
  const pageUrl = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

  // 기본값(폴백)
  let title = id ? '상품 미리보기' : '소도몰';
  let description = '소도몰에서 특별한 상품을 만나보세요!';
  let image = FALLBACK_IMG;

  // 상품 데이터 불러오기
  if (id) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      // 제목: 상품명 + 해시태그(최대3)
      const baseTitle = data.groupName || data.title || title;
      title = composeTitle(baseTitle, data.hashtags);

      // 설명: HTML 제거 → 공백 정리 → 180자 제한
      const rawDesc = data.description || '';
      const cooked = limitChars(normalizeSpaces(stripTags(rawDesc)), 180);
      if (cooked) description = cooked;

      // 대표 이미지 선택
      const picked = pickImageFromData(data);
      if (picked) image = picked;
    }
  }

  // 1200x630 리사이즈 프록시로 래핑(봇 친화적)
  const wrapped = `${ABS_BASE}/api/img?src=${encodeURIComponent(image)}`;

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>

<!-- Open Graph -->
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(wrapped)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:site_name" content="소도몰" />
<meta property="og:type" content="product" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(wrapped)}" />
</head>
<body>미리보기 전용</body>
</html>`;

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=60');
  res.status(200).send(html);
}
