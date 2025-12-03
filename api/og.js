// /api/og.js  (ESM, Node 18+)
const ABS_BASE = 'https://www.songdopick.kr';               // ✅ 도메인
const FALLBACK_IMG = `${ABS_BASE}/songdopick_og.png`;       // ✅ 기본 배너 이미지
const PRODUCT_API = (id) => `${ABS_BASE}/api/product?id=${encodeURIComponent(id)}`;

// ✅ [1] 12월인지 확인하는 함수 (서버 시간 기준)
const isDecember = () => {
  const now = new Date();
  return (now.getMonth() + 1) === 12;
};

// ✅ [2] 시기에 따른 말머리 설정
const PICK_PREFIX = isDecember()
  ? '🎄 오늘의 PICK | '
  : '오늘의 PICK | ';

// 텍스트 가공 유틸
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

  // ✅ [3] 기본값 설정 (홈 공유 시)
  let title;
  let description;
  let image = FALLBACK_IMG;

  if (!id) {
    // 🏠 메인 홈페이지 공유일 때
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
    // 📦 상품 공유일 때 (기본값)
    title = '상품 미리보기';
    description = '송도픽에서 특별한 상품을 만나보세요!';
  }

  // ✅ 상품 데이터가 있으면 덮어쓰기
  if (id) {
    const data = await fetchJson(PRODUCT_API(id));
    if (data) {
      // 1) 제목: "🎄 오늘의 PICK | 상품명" 패턴 적용
      const rawBaseTitle = data.groupName || data.title || title;
      const decoratedTitle = `${PICK_PREFIX}${rawBaseTitle}`; // 접두사 붙이기
      title = composeTitle(decoratedTitle, data.hashtags);

      // 2) 설명: 데이터가 없으면 '추천 문구' Fallback 사용
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

      // 3) 이미지
      const picked = pickImageFromData(data);
      if (picked) image = picked;
    }
  }

  // OG 이미지는 /api/img로 래핑
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
<meta property="og:site_name" content="SONGDOPICK" />
<meta property="og:type" content="${id ? 'product' : 'website'}" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(wrapped)}" />
</head>
<body>미리보기 전용</body>
</html>`;

  // ✅ 여기서 Content-Type을 반드시 지정해주자!
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=60, stale-while-revalidate=60'
  );
  res.status(200).send(html);
}
