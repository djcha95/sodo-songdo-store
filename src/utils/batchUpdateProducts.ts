import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';

const CATEGORY_ORDER_STEP = 10;

export const batchUpdateCategoryOrders = async (
  categoryId: string,
  orderedIds: string[],
  userId?: string
) => {
  const batch = writeBatch(db);
  orderedIds.forEach((productId, idx) => {
    const ref = doc(db, 'products', productId);
    batch.update(ref, {
      categoryId,
      categoryOrder: (idx + 1) * CATEGORY_ORDER_STEP,
      updatedAt: serverTimestamp(),
      updatedBy: userId ?? 'system',
    });
  });
  await batch.commit();
};

export const batchMoveProductsToCategory = async (
  productIds: string[],
  categoryId: string | null,
  userId?: string,
  startOrder = CATEGORY_ORDER_STEP
) => {
  const batch = writeBatch(db);
  productIds.forEach((productId, idx) => {
    const ref = doc(db, 'products', productId);
    batch.update(ref, {
      categoryId,
      categoryOrder: categoryId ? startOrder + idx * CATEGORY_ORDER_STEP : 0,
      updatedAt: serverTimestamp(),
      updatedBy: userId ?? 'system',
    });
  });
  await batch.commit();
};
