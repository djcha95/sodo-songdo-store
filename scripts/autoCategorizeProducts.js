// scripts/autoCategorizeProducts.js
// Firestore products 컬렉션의 상품명(name/groupName) 기준 키워드 매칭으로 categoryId 자동 분류
// 실행: node scripts/autoCategorizeProducts.js (프로젝트 루트에서)
// 필요: firebase-admin-sdk-key.json 또는 serviceAccountKey.json (프로젝트 루트)

const admin = require('firebase-admin');

const normalizeId = (name) =>
  name
    .trim()
    .replace(/[\/\\?#%]/g, '-')
    .replace(/\s+/g, '');

// -------- 카테고리 매핑 (우선순위 순: 위에서 먼저 매칭) --------
const CATEGORY_RULES = [
  {
    name: '신선식품 / 정육 / 수산',
    keywords: [
      '삼겹살', '목살', '항정', '갈비', '한우', '소고기', '돼지고기', '닭', '막창',
      '대하', '장어', '생선', '오징어',
    ],
  },
  {
    name: '간편식 / 밀키트 / 국·탕',
    keywords: [
      '만두', '국', '탕', '찌개', '밀키트', '볶음밥', '떡볶이', '피자', '핫도그', '우동', '냉면',
    ],
  },
  {
    name: '간식 / 디저트 / 베이커리',
    keywords: [
      '과자', '초콜릿', '젤리', '쿠키', '케이크', '떡', '약과', '아이스크림',
    ],
  },
  {
    name: '음료 / 커피 / 차',
    keywords: [
      '콜라', '사이다', '커피', '차', '콤부차', '주스', '음료',
    ],
  },
  {
    name: '건강식품 / 영양제',
    keywords: [
      '루테인', '오메가', '홍삼', '유산균', '비타민', '단백질', '밀크씨슬', '알부민',
    ],
  },
  {
    name: '뷰티 / 화장품 / 퍼스널케어',
    keywords: [
      '샴푸', '바디워시', '화장품', '크림', '앰플', '마스크팩', '선크림', '향수',
    ],
  },
  {
    name: '생활·청소·주방',
    keywords: [
      '세제', '휴지', '키친타올', '수세미', '탈취', '방향제', '곰팡이', '청소',
    ],
  },
  {
    name: '소형가전 / 생활기기',
    keywords: [
      '가전', '에어프라이어', '전자레인지', '믹서', '블렌더', '청소기', '선풍기', '가습기',
    ],
  },
  {
    name: '주류 / 와인 / 하이볼',
    keywords: [
      '와인', '위스키', '하이볼', '맥주', '소주',
    ],
  },
].map((rule) => ({
  ...rule,
  categoryId: normalizeId(rule.name),
  label: rule.name,
}));

const UNCATEGORIZED_ID = null;
const BATCH_SIZE = 500; // Firestore batch write 제한
const UPDATED_BY = 'auto-categorize-script';

function getProductDisplayName(data) {
  const name = data?.name ?? data?.groupName ?? '';
  return typeof name === 'string' ? name : '';
}

function resolveCategoryId(displayName) {
  const lower = displayName.trim().toLowerCase();
  if (!lower) return { categoryId: UNCATEGORIZED_ID, label: '미분류' };

  for (const rule of CATEGORY_RULES) {
    const matched = rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (matched) {
      return { categoryId: rule.categoryId, label: rule.label };
    }
  }
  return { categoryId: UNCATEGORIZED_ID, label: '미분류' };
}

function shouldUpdateCategory(data) {
  const id = data?.categoryId;
  if (id === undefined || id === null) return true;
  if (typeof id === 'string' && id.trim() === '') return true;
  return false;
}

async function main() {
  let serviceAccount;
  try {
    serviceAccount = require('../firebase-admin-sdk-key.json');
  } catch {
    try {
      serviceAccount = require('../serviceAccountKey.json');
    } catch (e) {
      console.error(
        '서비스 계정 키를 찾을 수 없습니다. 프로젝트 루트에 firebase-admin-sdk-key.json 또는 serviceAccountKey.json을 두세요.',
        e.message
      );
      process.exit(1);
    }
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const db = admin.firestore();
  const productsRef = db.collection('products');
  const snapshot = await productsRef.get();

  const toUpdate = [];
  const skipped = [];
  const results = [];

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;
    const displayName = getProductDisplayName(data);

    if (!shouldUpdateCategory(data)) {
      skipped.push({ id, name: displayName || id });
      return;
    }

    const { categoryId, label } = resolveCategoryId(displayName);
    toUpdate.push({
      ref: docSnap.ref,
      id,
      displayName: displayName || '(이름 없음)',
      categoryId,
      label,
    });
    results.push({ id, displayName: displayName || '(이름 없음)', categoryId, label });
  });

  console.log('---------- 자동 카테고리 분류 결과 ----------');
  console.log(`전체 상품 수: ${snapshot.size}`);
  console.log(`카테고리 없음 → 업데이트 대상: ${toUpdate.length}`);
  console.log(`이미 카테고리 있음 → 스킵: ${skipped.length}`);
  console.log('');

  if (toUpdate.length === 0) {
    console.log('업데이트할 상품이 없습니다.');
    process.exit(0);
    return;
  }

  results.forEach((r) => {
    console.log(`${r.displayName} → ${r.label} (${r.categoryId})`);
  });
  console.log('');

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    chunk.forEach(({ ref, categoryId }) => {
      batch.update(ref, {
        categoryId,
        categoryOrder: 0,
        updatedAt: now,
        updatedBy: UPDATED_BY,
      });
    });
    await batch.commit();
    console.log(`배치 커밋: ${chunk.length}건 (${i + 1} ~ ${i + chunk.length})`);
  }

  console.log('');
  console.log(`총 ${toUpdate.length}건 업데이트 완료.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('실행 오류:', err);
  process.exit(1);
});
