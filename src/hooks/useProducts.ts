import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  limit,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';

export type ProductStatus = 'active' | 'hidden' | 'soldout';

export interface ProductDoc {
  id: string;
  name: string;
  brand?: string;
  status: ProductStatus;
  categoryId: string | null;
  categoryOrder: number;
  tags?: string[];
  groupName?: string;
  displayStatus?: string;
  displayStatusKey?: 'active' | 'hidden' | 'soldout' | 'scheduled' | 'ended' | 'unknown';
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: string;
}

export type ProductsMode = 'client' | 'server';

interface UseProductsOptions {
  mode?: ProductsMode;
  keyword?: string;
  categoryId?: string | null;
  status?: ProductStatus;
  pageSize?: number;
  enabled?: boolean;
  refreshKey?: number;
}

interface UseProductsResult {
  products: ProductDoc[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 40;

const useProducts = (options: UseProductsOptions = {}): UseProductsResult => {
  const {
    mode = 'client',
    keyword = '',
    categoryId,
    status = 'active',
    pageSize = DEFAULT_PAGE_SIZE,
    enabled = true,
    refreshKey = 0,
  } = options;

  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [searchField, setSearchField] = useState<'groupName' | 'name'>('groupName');

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (mode !== 'client') return;

    setLoading(true);
    setError(null);

    const q = query(collection(db, 'products'), orderBy('groupName', 'asc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const firstRound = (data.salesHistory as any[])?.[0];
          const roundStatus = firstRound?.status as string | undefined;
          const isOnsite = Boolean(data.isOnsite) || Boolean(firstRound?.isManuallyOnsite);
          const isArchived = Boolean(data.isArchived);
          const rawStatus = (data.status as ProductStatus) ?? 'active';
          const displayStatus = isArchived
            ? '숨김'
            : isOnsite
            ? '현장판매'
            : roundStatus === 'scheduled'
            ? '판매예정'
            : roundStatus === 'selling'
            ? '예약중'
            : roundStatus === 'sold_out'
            ? '품절'
            : roundStatus === 'ended'
            ? '판매종료'
            : rawStatus === 'hidden'
            ? '숨김'
            : rawStatus === 'soldout'
            ? '품절'
            : rawStatus === 'active'
            ? '예약중'
            : '상태없음';
          const displayStatusKey =
            isArchived || rawStatus === 'hidden'
              ? 'hidden'
              : isOnsite
              ? 'onsite'
              : roundStatus === 'sold_out' || rawStatus === 'soldout'
              ? 'soldout'
              : roundStatus === 'scheduled'
              ? 'scheduled'
              : roundStatus === 'ended'
              ? 'ended'
              : roundStatus === 'selling' || rawStatus === 'active'
              ? 'reserving'
              : 'unknown';
          return {
            id: docSnap.id,
            name: (data.name as string) ?? (data.groupName as string) ?? '',
            groupName: data.groupName as string | undefined,
            brand: (data.brand as string) ?? (data.brandName as string) ?? undefined,
            status: rawStatus,
            categoryId: (data.categoryId as string) ?? null,
            categoryOrder: (data.categoryOrder as number) ?? 0,
            tags:
              (data.tags as string[] | undefined) ??
              (data.hashtags as string[] | undefined) ??
              undefined,
            displayStatus,
            displayStatusKey,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy as string | undefined,
          };
        });
        setProducts(next);
        setLoading(false);
        setHasMore(false);
        setLastDoc(null);
      },
      (err) => {
        console.error('상품 로드 실패:', err);
        setError('상품을 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [enabled, mode, refreshKey]);

  const buildConstraints = useCallback(
    (field: 'groupName' | 'name') => {
      const constraints: QueryConstraint[] = [];
      if (status) constraints.push(where('status', '==', status));
      if (typeof categoryId !== 'undefined') constraints.push(where('categoryId', '==', categoryId));

      const trimmed = keyword.trim();
      if (trimmed) {
        constraints.push(where(field, '>=', trimmed));
        constraints.push(where(field, '<=', `${trimmed}\uf8ff`));
        constraints.push(orderBy(field, 'asc'));
      } else {
        constraints.push(orderBy('createdAt', 'desc'));
      }
      constraints.push(limit(pageSize));
      return constraints;
    },
    [categoryId, keyword, pageSize, status]
  );

  const fetchServerPage = useCallback(
    async (field: 'groupName' | 'name', cursor?: QueryDocumentSnapshot<DocumentData> | null) => {
      const constraints = buildConstraints(field);
      if (cursor) constraints.push(startAfter(cursor));
      const q = query(collection(db, 'products'), ...constraints);
      const snapshot = await getDocs(q);
      const next = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const firstRound = (data.salesHistory as any[])?.[0];
        const roundStatus = firstRound?.status as string | undefined;
        const isOnsite = Boolean(data.isOnsite) || Boolean(firstRound?.isManuallyOnsite);
        const isArchived = Boolean(data.isArchived);
        const rawStatus = (data.status as ProductStatus) ?? 'active';
        const displayStatus = isArchived
          ? '숨김'
          : isOnsite
          ? '현장판매'
          : roundStatus === 'scheduled'
          ? '판매예정'
          : roundStatus === 'selling'
          ? '예약중'
          : roundStatus === 'sold_out'
          ? '품절'
          : roundStatus === 'ended'
          ? '판매종료'
          : rawStatus === 'hidden'
          ? '숨김'
          : rawStatus === 'soldout'
          ? '품절'
          : rawStatus === 'active'
          ? '예약중'
          : '상태없음';
        const displayStatusKey =
          isArchived || rawStatus === 'hidden'
            ? 'hidden'
            : isOnsite
            ? 'onsite'
            : roundStatus === 'sold_out' || rawStatus === 'soldout'
            ? 'soldout'
            : roundStatus === 'scheduled'
            ? 'scheduled'
            : roundStatus === 'ended'
            ? 'ended'
            : roundStatus === 'selling' || rawStatus === 'active'
            ? 'reserving'
            : 'unknown';
        return {
          id: docSnap.id,
          name: (data.name as string) ?? (data.groupName as string) ?? '',
          groupName: data.groupName as string | undefined,
          brand: (data.brand as string) ?? (data.brandName as string) ?? undefined,
          status: rawStatus,
          categoryId: (data.categoryId as string) ?? null,
          categoryOrder: (data.categoryOrder as number) ?? 0,
          tags:
            (data.tags as string[] | undefined) ??
            (data.hashtags as string[] | undefined) ??
            undefined,
          displayStatus,
          displayStatusKey,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy as string | undefined,
        };
      });
      const nextLast = snapshot.docs[snapshot.docs.length - 1] ?? null;
      const nextHasMore = snapshot.docs.length === pageSize;
      return { next, nextLast, nextHasMore };
    },
    [buildConstraints, pageSize]
  );

  useEffect(() => {
    if (!enabled || mode !== 'server') {
      if (!enabled) {
        setProducts([]);
        setHasMore(false);
        setLastDoc(null);
        setLoading(false);
      }
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        setHasMore(false);
        setLastDoc(null);

        const trimmed = keyword.trim();
        if (!trimmed) {
          setSearchField('groupName');
          const result = await fetchServerPage('groupName', null);
          if (result.next.length > 0) {
            setProducts(result.next);
            setLastDoc(result.nextLast);
            setHasMore(result.nextHasMore);
            return;
          }

          // ✅ fallback: createdAt/groupName 없는 문서 대응 (정렬 없이 일부 조회)
          const fallbackSnap = await getDocs(query(collection(db, 'products'), limit(pageSize)));
          const fallback = fallbackSnap.docs.map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            return {
              id: docSnap.id,
              name: (data.name as string) ?? (data.groupName as string) ?? '',
              groupName: data.groupName as string | undefined,
              brand: (data.brand as string) ?? (data.brandName as string) ?? undefined,
              status: (data.status as ProductStatus) ?? 'active',
              categoryId: (data.categoryId as string) ?? null,
              categoryOrder: (data.categoryOrder as number) ?? 0,
              tags:
                (data.tags as string[] | undefined) ??
                (data.hashtags as string[] | undefined) ??
                undefined,
              updatedAt: data.updatedAt,
              updatedBy: data.updatedBy as string | undefined,
            createdAt: data.createdAt,
            };
          });
          setProducts(fallback);
          setHasMore(false);
          setLastDoc(null);
          return;
        }

        setSearchField('groupName');
        let { next, nextLast, nextHasMore } = await fetchServerPage('groupName', null);

        if (next.length === 0) {
          const fallback = await fetchServerPage('name', null);
          if (fallback.next.length > 0) {
            setSearchField('name');
            ({ next, nextLast, nextHasMore } = fallback);
          }
        }

        setProducts(next);
        setLastDoc(nextLast);
        setHasMore(nextHasMore);
      } catch (err) {
        console.error('상품 로드 실패:', err);
        setError('상품을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [enabled, fetchServerPage, mode, buildConstraints, refreshKey]);

  const loadMore = useCallback(async () => {
    if (!enabled || mode !== 'server' || loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const { next, nextLast, nextHasMore } = await fetchServerPage(searchField, lastDoc);
      setProducts((prev) => [...prev, ...next]);
      setLastDoc(nextLast);
      setHasMore(nextHasMore);
    } catch (err) {
      console.error('상품 추가 로드 실패:', err);
      setError('상품을 추가로 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, mode, loadingMore, hasMore, fetchServerPage, lastDoc, searchField]);

  return { products, loading, error, hasMore, loadingMore, loadMore };
};

export default useProducts;
