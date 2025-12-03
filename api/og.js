// /api/og.js

// ✅ 1. 도메인 수정 완료
const ABS_BASE = 'https://www.songdopick.store';
// ✅ 2. 기본 이미지 파일명 확인 (songdopick_og.png가 없다면 기존 sodomall-preview.png로 쓰세요)
const FALLBACK_IMG = `${ABS_BASE}/songdopick_og.png`; 
const PRODUCT_API = (id) => `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

const stripTags = (html = '') => String(html).replace(/<[^>]*>/g, '');
const normalizeSpaces = (s = '') => s.replace(/\s+/g, ' ').trim();
const limitChars = (s = '', max = 180) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

async function fetchJson(url) {
  try {
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function pickImageFromData(data) {
  const pick =
    data?.image ||
    data?.mainImage ||
    (Array.isArray(data?.imageUrls) ? data.imageUrls[0] : '') ||
    data?.thumbnail ||
    '';

  if (!pick) return '';
  if (!/^https?:\/\//i.test(pick)) {
    return `${ABS_BASE}${pick.startsWith('/') ? '' : '/'}${pick}`;
  }
  return pick;
}

function composeTitle(base, hashtags) {
  const list = Array.isArray(hashtags) ? hashtags : [];
  const normalized = list
    .map(String)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  const top3 = normalized.slice(0, 3).join(' ');
  const composed = top3 ? `${base} · ${top3}` : base;
  return composed.length > 80 ? composed.slice(0, 79) + '…' : composed;
}

export default async function handler(req, res) {
  const id = req.query?.id ? String(req.query.id) : '';
  const pageUrl = id ? `${ABS_BASE}/product/${encodeURIComponent(id)}` : ABS_BASE;

  // ✅ 3. 기본 텍스트 브랜드명 변경 (소도몰 -> SONGDOPICK)
  let title = id ? '상품 미리보기' : 'SONGDOPICK';
  let description = '송도픽에서 특별한 상품을 만나보세요!';
  let image = FALLBACK_IMG;

  if (id) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      const baseTitle = data.groupName || data.title || title;
      title = composeTitle(baseTitle, data.hashtags);

      const rawDesc = data.description || '';
      const cooked = limitChars(normalizeSpaces(stripTags(rawDesc)), 180);
      if (cooked) description = cooked;

      const picked = pickImageFromData(data);
      if (picked) image = picked;
    }
  }

  const wrapped = `${ABS_BASE}/api/img?src=${encodeURIComponent(image)}`;

  // ✅ 4. og:site_name 및 type 수정
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>

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
<body>미리보기 전용</body>
</html>`;

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=60');
  res.status(200).send(html);
}