// scripts/cleanupDuplicateCategories.js
// 동일 이름 카테고리 중복 정리 (중복 카테고리 → 기준 카테고리로 합치고 비활성화)
// 실행: node scripts/cleanupDuplicateCategories.js
// 옵션: DRY_RUN=1 node scripts/cleanupDuplicateCategories.js

const admin = require('firebase-admin');

// -------- 표시 이름 맵 (categoryId → name) --------
const CATEGORY_ID_DISPLAY_NAMES = {
  fresh_meat_seafood: '수산/정육',
  ready_meal: '간편식/밀키트',
  snack_dessert: '간식/디저트',
  beverage: '음료',
  health_food: '건강식품',
  beauty_personal: '뷰티/생활',
  living_home: '생활용품/리빙',
  alcohol: '주류/기타',
  uncategorized: '미분류',
};

const DRY_RUN = process.env.DRY_RUN === '1';
const BATCH_LIMIT = 450;
const UPDATED_BY = 'cleanup-duplicate-categories';

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

async function getCategoryCounts(db, categoryIds) {
  const counts = new Map();
  for (const id of categoryIds) {
    const snap = await db.collection('products').where('categoryId', '==', id).get();
    counts.set(id, snap.size);
  }
  return counts;
}

function pickCanonical(categories, counts) {
  // 1) 표준 categoryId가 있으면 그걸 우선
  const preferred = categories.find((c) => Object.prototype.hasOwnProperty.call(CATEGORY_ID_DISPLAY_NAMES, c.id));
  if (preferred) return preferred;

  // 2) 상품 수가 많은 카테고리 우선
  let best = categories[0];
  let bestCount = counts.get(best.id) ?? 0;
  for (const c of categories) {
    const cnt = counts.get(c.id) ?? 0;
    if (cnt > bestCount) {
      best = c;
      bestCount = cnt;
    }
  }
  return best;
}

async function migrateCategoryProducts(db, fromId, toId) {
  const snap = await db.collection('products').where('categoryId', '==', fromId).get();
  if (snap.empty) return 0;
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      categoryId: toId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: UPDATED_BY,
    });
    updated += 1;
    batchCount += 1;
    if (batchCount >= BATCH_LIMIT) {
      if (!DRY_RUN) await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0 && !DRY_RUN) await batch.commit();
  return updated;
}

async function disableCategory(db, categoryId) {
  if (DRY_RUN) return;
  await db.collection('categories').doc(categoryId).update({ isActive: false });
}

async function main() {
  const db = await initAdmin();
  const categoriesSnap = await db.collection('categories').get();
  const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (categories.length === 0) {
    console.log('카테고리가 없습니다.');
    return;
  }

  const ids = categories.map((c) => c.id);
  const counts = await getCategoryCounts(db, ids);

  const nameMap = new Map();
  categories.forEach((c) => {
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!name) return;
    if (!nameMap.has(name)) nameMap.set(name, []);
    nameMap.get(name).push(c);
  });

  let migratedTotal = 0;
  let disabledTotal = 0;
  let groups = 0;

  for (const [name, list] of nameMap.entries()) {
    if (list.length <= 1) continue;
    groups += 1;
    const canonical = pickCanonical(list, counts);
    console.log(`\n[중복 이름] ${name}`);
    console.log(`- 기준: ${canonical.id} (count=${counts.get(canonical.id) ?? 0})`);

    for (const c of list) {
      if (c.id === canonical.id) continue;
      const cnt = counts.get(c.id) ?? 0;
      if (cnt > 0) {
        console.log(`  · ${c.id} → ${canonical.id} 상품 ${cnt}개 이동`);
        const moved = await migrateCategoryProducts(db, c.id, canonical.id);
        migratedTotal += moved;
      } else {
        console.log(`  · ${c.id} (count=0) 비활성화`);
      }
      await disableCategory(db, c.id);
      disabledTotal += 1;
    }
  }

  console.log('\n정리 완료');
  console.log(`중복 그룹 수: ${groups}`);
  console.log(`이동된 상품 수: ${migratedTotal}`);
  console.log(`비활성화된 카테고리 수: ${disabledTotal}`);
  if (DRY_RUN) console.log('DRY_RUN=1 이므로 실제 반영하지 않았습니다.');
}

main().catch((err) => {
  console.error('실행 오류:', err);
  process.exit(1);
});
