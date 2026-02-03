import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';

export type CategorySection = 'food' | 'health_beauty' | 'living' | 'etc';

export interface CategoryDoc {
  id: string;
  section: CategorySection;
  name: string;
  order: number;
  isActive: boolean;
}

interface UseCategoriesResult {
  categories: CategoryDoc[];
  loading: boolean;
  error: string | null;
}

const useCategories = (): UseCategoriesResult => {
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'categories'),
      orderBy('section', 'asc'),
      orderBy('order', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<CategoryDoc, 'id'>),
        }));
        setCategories(next);
        setLoading(false);
      },
      (err) => {
        console.error('카테고리 로드 실패:', err);
        setError('카테고리를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { categories, loading, error };
};

export default useCategories;
