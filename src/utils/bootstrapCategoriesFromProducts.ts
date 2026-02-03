import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';

const BATCH_LIMIT = 400;

const normalizeId = (name: string) =>
  name
    .trim()
    .replace(/[\/\\?#%]/g, '-')
    .replace(/\s+/g, '');

/** 자동 분류 스크립트에서 쓰는 categoryId → 표시 이름 (카테고리 매니저 좌측에 보일 이름) */
export const CATEGORY_ID_DISPLAY_NAMES: Record<string, string> = {
  fresh_meat_seafood: '수산/정육',
  ready_meal: '간편식/밀키트',
  snack_dessert: '간식/디저트',
  beverage: '음료',
  health_food: '건강식품',
  beauty_personal: '뷰티/생활',
  living_home: '생활용품/리빙',
  alcohol: '주류/기타',
  uncategorized: '미분류',
  '신선식품-정육-수산': '신선식품 / 정육 / 수산',
  '간편식-밀키트-국·탕': '간편식 / 밀키트 / 국·탕',
  '간식-디저트-베이커리': '간식 / 디저트 / 베이커리',
  '음료-커피-차': '음료 / 커피 / 차',
  '건강식품-영양제': '건강식품 / 영양제',
  '뷰티-화장품-퍼스널케어': '뷰티 / 화장품 / 퍼스널케어',
  '생활·청소·주방': '생활·청소·주방',
  '소형가전-생활기기': '소형가전 / 생활기기',
  '주류-와인-하이볼': '주류 / 와인 / 하이볼',
};

export const bootstrapCategoriesFromProducts = async () => {
  const snapshot = await getDocs(collection(db, 'products'));
  const nameSet = new Set<string>();
  const categoryIdSet = new Set<string>();

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const category = data.category;
    if (typeof category === 'string' && category.trim()) nameSet.add(category.trim());
    const categories = data.categories;
    if (Array.isArray(categories)) {
      categories.forEach((value) => {
        if (typeof value === 'string' && value.trim()) nameSet.add(value.trim());
      });
    }
    const categoryId = data.categoryId;
    if (typeof categoryId === 'string' && categoryId.trim()) categoryIdSet.add(categoryId.trim());
  });

  const idToName = new Map<string, string>();
  const idMap = new Map<string, number>();

  for (const name of Array.from(nameSet).sort((a, b) => a.localeCompare(b))) {
    const baseId = normalizeId(name) || 'category';
    const count = (idMap.get(baseId) ?? 0) + 1;
    idMap.set(baseId, count);
    const id = count === 1 ? baseId : `${baseId}-${count}`;
    idToName.set(id, name);
  }

  for (const categoryId of Array.from(categoryIdSet).sort()) {
    const name = CATEGORY_ID_DISPLAY_NAMES[categoryId] ?? categoryId;
    idToName.set(categoryId, name);
  }

  const entries = Array.from(idToName.entries());
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = entries.slice(i, i + BATCH_LIMIT);
    chunk.forEach(([id, name], idx) => {
      const ref = doc(collection(db, 'categories'), id);
      batch.set(ref, {
        id,
        section: 'etc',
        name,
        order: (i + idx + 1) * 10,
        isActive: true,
      });
    });
    await batch.commit();
  }
};
