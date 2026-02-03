import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';

const BATCH_LIMIT = 400;

export const resetAllProductCategories = async (userId?: string) => {
  const snapshot = await getDocs(collection(db, 'products'));
  const ids = snapshot.docs.map((docSnap) => docSnap.id);

  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = ids.slice(i, i + BATCH_LIMIT);
    chunk.forEach((productId) => {
      const ref = doc(db, 'products', productId);
      batch.update(ref, {
        categoryId: null,
        categoryOrder: 0,
        updatedAt: serverTimestamp(),
        updatedBy: userId ?? 'system',
      });
    });
    await batch.commit();
  }
};
