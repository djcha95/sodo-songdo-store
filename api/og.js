// /api/og.js  (ESM, Node 18+)

// 이 도메인 하나로 통일 (프론트 + API + 이미지)
const ABS_BASE = 'https://www.songdopick.store';
const FALLBACK_IMG = `${ABS_BASE}/songdopick_og.png`;
const PRODUCT_API = (id) =>
  `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

// ✅ 12월인지 확인 (서버 기준)
const isDecember = () => {
  const now = new Date();
  return (now.getMonth() + 1) === 12;
};

// ✅ 시기에 따른 말머리 설정
const PICK_PREFIX = isDecember()
  ? '🎄 오늘의 PICK | '
  : '오늘의 PICK | ';

// 텍스트 가공 유틸: HTML 제거 → 공백 정리 → 180자 자르기
const stripTags = (html = '') => String(html).replace(/<[^>]*>/g, '');
const normalizeSpaces = (s = '') => s.replace(/\s+/g, ' ').trim();
const limitChars = (s = '', max = 180) =>
  (s.length > max ? s.slice(0, max - 1) + '…' : s);

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
  // 절대경로가 아니면 사이트 기준으로 보정 (songdopick.store)
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
  const pageUrl = id
    ? `${ABS_BASE}/product/${encodeURIComponent(id)}`
    : ABS_BASE;

  // ✅ 기본값: 홈 / 상품 공통 폴백
  let title;
  let description;
  let image = FALLBACK_IMG;

  if (!id) {
    // 🏠 메인 페이지 공유
    if (isDecember()) {
      title = '🎄 [송도픽] 12월 오늘의 PICK & 크리스마스 특가';
      description =
        '송도 이웃들이 직접 선택한 12월의 추천 공구상품! 크리스마스 시즌 한정 특가를 지금 만나보세요.';
    } else {
      title = 'SONGDOPICK - 송도주민의 똑똑한 쇼핑생활';
      description =
        '송도 이웃과 함께 즐기는 프리미엄 공동구매 플랫폼, SONGDOPICK.';
    }
  } else {
    // 📦 상품 공유 (데이터 불러오기 전 기본값)
    title = '상품 미리보기';
    description = '송도픽에서 특별한 상품을 만나보세요!';
  }

  // 상품 데이터 불러오기
  if (id) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      // 1) 제목: "🎄 오늘의 PICK | 상품명" + 해시태그(최대3)
      const rawBaseTitle = data.groupName || data.title || title;
      const decoratedTitle = `${PICK_PREFIX}${rawBaseTitle}`;
      title = composeTitle(decoratedTitle, data.hashtags);

      // 2) 설명: HTML 제거 → 공백 정리 → 180자 제한
      const rawDesc = data.description || '';
      const cooked = limitChars(
        normalizeSpaces(stripTags(rawDesc)),
        180
      );

      if (cooked) {
        description = cooked;
      } else if (isDecember()) {
        description =
          '송도 이웃들이 선택한 12월의 추천 상품! 오늘의 PICK을 지금 바로 만나보세요.';
      } else {
        description =
          '송도 이웃들이 선택한 오늘의 추천 상품! 한정 수량으로 진행되는 공구입니다.';
      }

      // 3) 대표 이미지 선택
      const picked = pickImageFromData(data);
      if (picked) image = picked;
    }
  }

// ✅ 1200x630 캔버스 생성기(고급 방식)로 교체: /api/img 대신 /api/thumbnail 사용
  const wrapped = `${ABS_BASE}/api/thumbnail?src=${encodeURIComponent(image)}`;

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
<meta property="og:type" content="${id ? 'product' : 'website'}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(wrapped)}" />
</head>
<body>미리보기 전용</body>
</html>`;

  // ✅ Content-Type 명시 + 캐시
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=60, stale-while-revalidate=60'
  );
  res.status(200).send(html);
}