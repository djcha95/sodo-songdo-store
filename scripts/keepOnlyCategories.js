// scripts/keepOnlyCategories.js
// 지정한 카테고리만 남기고 나머지 카테고리는 삭제(및 상품 카테고리 제거)
// 실행: node scripts/keepOnlyCategories.js
// 옵션:
//   DRY_RUN=1       실제 반영 없이 로그만 출력
//   DELETE_OTHERS=1 (기본값) 목록 외 카테고리 문서 삭제
//   CLEAR_PRODUCTS=1 (기본값) 목록 외 카테고리에 속한 상품의 categoryId를 null로 처리

const admin = require('firebase-admin');

const DRY_RUN = process.env.DRY_RUN === '1';
const DELETE_OTHERS = process.env.DELETE_OTHERS !== '0';
const CLEAR_PRODUCTS = process.env.CLEAR_PRODUCTS !== '0';
const BATCH_LIMIT = 450;
const UPDATED_BY = 'keep-only-categories';

const KEEP_CATEGORIES = [
  // 🍖 먹거리 / 간편식
  { name: '신선식품 / 정육 / 수산', section: 'food', order: 10 },
  { name: '간편식 / 밀키트 / 국·탕', section: 'food', order: 20 },
  { name: '간식 / 디저트 / 베이커리', section: 'food', order: 30 },
  { name: '음료 / 커피 / 차', section: 'food', order: 40 },

  // 💊 건강 / 뷰티
  { name: '건강식품 / 영양제', section: 'health_beauty', order: 10 },
  { name: '뷰티 / 화장품 / 퍼스널케어', section: 'health_beauty', order: 20 },

  // 🏠 생활 / 주방 / 가전
  { name: '생활·청소·주방', section: 'living', order: 10 },
  { name: '소형가전 / 생활기기', section: 'living', order: 20 },

  // 🍷 기타
  { name: '주류 / 와인 / 하이볼', section: 'etc', order: 10 },
  { name: '패션 / 잡화', section: 'etc', order: 20 },
  { name: '선물세트 / 명절 / 기획전', section: 'etc', order: 30 },
  { name: '시즌 특가 / 추천관 (마케팅용)', section: 'etc', order: 40 },
];

const normalizeId = (name) =>
  name
    .trim()
    .replace(/[\/\\?#%]/g, '-')
    .replace(/\s+/g, '');

async function initAdmin() {
  let serviceAccount;
  try {
    serviceAccount = require('../firebase-admin-sdk-key.json');
  } catch {
    try {
      serviceAccount = require('../serviceAccountKey.json');
    } catch (e) {
      console.error(
        '서비스 계정 키를 찾을 수 없습니다. firebase-admin-sdk-key.json 또는 serviceAccountKey.json을 루트에 두세요.',
        e.message
      );
      process.exit(1);
    }
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

async function batchUpdateProducts(db, productIds) {
  let updated = 0;
  let batch = db.batch();
  let count = 0;
  for (const id of productIds) {
    const ref = db.collection('products').doc(id);
    batch.update(ref, {
      categoryId: null,
      categoryOrder: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: UPDATED_BY,
    });
    updated += 1;
    count += 1;
    if (count >= BATCH_LIMIT) {
      if (!DRY_RUN) await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0 && !DRY_RUN) await batch.commit();
  return updated;
}

async function main() {
  const db = await initAdmin();
  const keepNameSet = new Set(KEEP_CATEGORIES.map((c) => c.name));
  const keepByName = new Map(KEEP_CATEGORIES.map((c) => [c.name, c]));

  const categoriesSnap = await db.collection('categories').get();
  const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const byName = new Map();
  categories.forEach((c) => {
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(c);
  });

  // 1) 유지 목록 카테고리 생성/정리
  let created = 0;
  let updated = 0;
  for (const keep of KEEP_CATEGORIES) {
    const list = byName.get(keep.name) ?? [];
    let canonical = list.find((c) => c.id === normalizeId(keep.name)) || list[0];
    if (!canonical) {
      const id = normalizeId(keep.name);
      if (!DRY_RUN) {
        await db.collection('categories').doc(id).set({
          id,
          name: keep.name,
          section: keep.section,
          order: keep.order,
          isActive: true,
        });
      }
      created += 1;
      continue;
    }

    if (!DRY_RUN) {
      await db.collection('categories').doc(canonical.id).update({
        name: keep.name,
        section: keep.section,
        order: keep.order,
        isActive: true,
      });
    }
    updated += 1;

    // 동일 이름 중복 문서 삭제
    for (const dup of list) {
      if (dup.id === canonical.id) continue;
      if (!DRY_RUN) await db.collection('categories').doc(dup.id).delete();
    }
  }

  // 2) 목록 외 카테고리 정리
  let deleted = 0;
  let cleared = 0;
  for (const c of categories) {
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (keepNameSet.has(name)) continue;

    if (CLEAR_PRODUCTS) {
      const snap = await db.collection('products').where('categoryId', '==', c.id).get();
      if (!snap.empty) {
        const ids = snap.docs.map((d) => d.id);
        const n = await batchUpdateProducts(db, ids);
        cleared += n;
        console.log(`[상품 해제] ${c.name} (${c.id}) → ${n}건 categoryId=null`);
      }
    }

    if (DELETE_OTHERS) {
      if (!DRY_RUN) await db.collection('categories').doc(c.id).delete();
      deleted += 1;
    } else if (!DRY_RUN) {
      await db.collection('categories').doc(c.id).update({ isActive: false });
    }
  }

  console.log('정리 완료');
  console.log(`생성: ${created}`);
  console.log(`업데이트: ${updated}`);
  console.log(`삭제: ${deleted}`);
  console.log(`상품 categoryId 해제: ${cleared}`);
  if (DRY_RUN) console.log('DRY_RUN=1 이므로 실제 반영하지 않았습니다.');
}

main().catch((err) => {
  console.error('실행 오류:', err);
  process.exit(1);
});
