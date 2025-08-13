// /api/og.js  (ESM, Node 18+)
const ABS_BASE = 'https://www.sodo-songdo.store';           // 배포 도메인
const FALLBACK_IMG = `${ABS_BASE}/sodomall-preview.png`;     // 이미지 없을 때 대체 이미지
const PRODUCT_API = (id) => `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

// --- 텍스트 가공 유틸 (설명 깔끔하게) ---
const stripTags = (html = '') => String(html).replace(/<[^>]*>/g, '');
const normalizeSpaces = (s = '') => s.replace(/\s+/g, ' ').trim();
const limitChars = (s = '', max = 180) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

// --- 안전 이스케이프 (HTML 속성에 넣을 때) ---
const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

// --- JSON 가져오기 ---
async function fetchJson(url) {
  try {
    const r = await fetch(url, { next: { revalidate: 60 } }); // 60초 캐시
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// --- 대표 이미지 고르기 ---
function pickImageFromData(data) {
  const pick =
    data?.image ||
    data?.mainImage ||
    (Array.isArray(data?.imageUrls) ? data.imageUrls[0] : '') ||
    data?.thumbnail ||
    '';

  if (!pick) return '';
  // 절대경로가 아니면 사이트 기준으로 붙여줌
  if (!/^https?:\/\//i.test(pick)) {
    return `${ABS_BASE}${pick.startsWith('/') ? '' : '/'}${pick}`;
  }
  return pick;
}

// --- 해시태그 3개까지 제목에 붙이기 ---
function composeTitle(base, hashtags) {
  const list = Array.isArray(hashtags) ? hashtags : [];
  const normalized = list
    .map(String)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  const top3 = normalized.slice(0, 3).join(' ');
  const composed = top3 ? `${base} · ${top3}` : base;
  // 제목이 너무 길면 살짝 자름(보기 좋게)
  return composed.length > 80 ? composed.slice(0, 79) + '…' : composed;
}

// --- 메인 핸들러 ---
export default async function handler(req, res) {
  // 상품 id (예: /api/og?id=XXXX) — 실제 공유는 상세페이지 URL로 하지만,
  // 이 함수는 봇(카카오)이 메타를 읽을 때 내부적으로 사용됩니다.
  const id = req.query?.id ? String(req.query.id) : '';
  const pageUrl = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

  // 기본값
  let title = id ? '상품 미리보기' : '소도몰';
  let description = '소도몰에서 특별한 상품을 만나보세요!';
  let image = FALLBACK_IMG;

  // 1) 상품 API에서 정보 가져오기
  if (id) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      // 제목: groupName(또는 title) + 해시태그(최대 3개)
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

  // 2) 이미지 리사이즈 프록시로 감싸서(1200x630) 링크 미리보기에 안정적으로 노출
  const wrapped = `${ABS_BASE}/api/img?src=${encodeURIComponent(image)}`;

  // 3) OG 메타 작성
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

  // 캐시 헤더(선택): 너무 자주 바뀌지 않으면 켜두면 좋아요
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=60');
  res.status(200).send(html);
}
