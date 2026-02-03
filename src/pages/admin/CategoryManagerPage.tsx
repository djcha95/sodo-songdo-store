import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Folder } from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { getApp } from 'firebase/app';

import AdminPageHeader from '@/components/admin/AdminPageHeader';
import CategoryList from '@/components/admin/category-manager/CategoryList';
import CategoryDetail from '@/components/admin/category-manager/CategoryDetail';
import ProductPool from '@/components/admin/category-manager/ProductPool';
import AdminBlockedPage from '@/components/admin/AdminBlockedPage';
import SodomallLoader from '@/components/common/SodomallLoader';

import useCategories from '@/hooks/useCategories';
import useProducts, { type ProductDoc } from '@/hooks/useProducts';
import { useAuth } from '@/context/AuthContext';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { reportError } from '@/utils/logger';
import { db } from '@/firebase/firebaseConfig';
import { batchMoveProductsToCategory, batchUpdateCategoryOrders } from '@/utils/batchUpdateProducts';
import { resetAllProductCategories } from '@/utils/resetAllProductCategories';
import { bootstrapCategoriesFromProducts } from '@/utils/bootstrapCategoriesFromProducts';
import { getCategoryProductIds, getContainerId, reorderIds } from '@/utils/dndHelpers';

import './CategoryManagerPage.css';

const CATEGORY_ORDER_STEP = 10;

const CategoryManagerPage: React.FC = () => {
  useDocumentTitle('상품 카테고리 매핑');
  const { isAdmin, user } = useAuth();
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialKeyword = searchParams.get('q') ?? '';
  const [searchKeyword, setSearchKeyword] = useState(initialKeyword);
  const [appliedKeyword, setAppliedKeyword] = useState(initialKeyword);
  const lastSyncedQueryRef = useRef(initialKeyword);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalProductsCount, setTotalProductsCount] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isBootstrappingCategories, setIsBootstrappingCategories] = useState(false);
  const isDev = import.meta.env.DEV;

  const poolQueryCategoryId = undefined;
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[CategoryManagerPage] mounted', { isAdmin });
  }, [isAdmin]);
  const {
    products: poolProducts,
    loading: poolLoading,
    error: poolError,
    hasMore: poolHasMore,
    loadingMore: poolLoadingMore,
    loadMore: loadMorePool,
  } = useProducts({
    mode: 'server',
    keyword: appliedKeyword,
    categoryId: poolQueryCategoryId,
    status: undefined,
    pageSize: 50,
    enabled: isAdmin,
    refreshKey,
  });

  const {
    products: categoryProducts,
    loading: categoryLoading,
    error: categoryError,
    hasMore: categoryHasMore,
    loadingMore: categoryLoadingMore,
    loadMore: loadMoreCategory,
  } = useProducts({
    mode: 'server',
    keyword: '',
    categoryId: activeCategoryId ?? undefined,
    status: undefined,
    pageSize: 50,
    enabled: isAdmin && Boolean(activeCategoryId),
    refreshKey,
  });

  const [poolItems, setPoolItems] = useState<ProductDoc[]>([]);
  const [categoryItems, setCategoryItems] = useState<ProductDoc[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setPoolItems(poolProducts);
  }, [poolProducts]);

  useEffect(() => {
    if (!activeCategoryId && categories.length > 0) {
      setActiveCategoryId(categories[0].id);
    }
  }, [activeCategoryId, categories]);

  useEffect(() => {
    setCategoryItems(categoryProducts);
  }, [categoryProducts]);

  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    if (q !== lastSyncedQueryRef.current) {
      setSearchKeyword(q);
      setAppliedKeyword(q);
      lastSyncedQueryRef.current = q;
    }
  }, [searchParams]);

  const applySearch = useCallback(() => {
    const nextValue = searchKeyword.trim();
    setAppliedKeyword(nextValue);
    const next = new URLSearchParams(searchParams);
    if (nextValue) next.set('q', nextValue);
    else next.delete('q');
    lastSyncedQueryRef.current = nextValue;
    setSearchParams(next, { replace: true });
  }, [searchKeyword, searchParams, setSearchParams]);

  const clearSearch = useCallback(() => {
    setSearchKeyword('');
    setAppliedKeyword('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    lastSyncedQueryRef.current = '';
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!categories.length) return;
    let cancelled = false;
    const run = async () => {
      try {
        const entries = await Promise.all(
          categories.map(async (category) => {
            const q = query(
              collection(db, 'products'),
              where('categoryId', '==', category.id)
            );
            const snap = await getCountFromServer(q);
            return [category.id, snap.data().count] as const;
          })
        );
        if (!cancelled) setCategoryCounts(Object.fromEntries(entries));
      } catch (error) {
        console.error('카테고리 카운트 로드 실패:', error);
        reportError('CategoryManagerPage.counts', error);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [categories]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const snap = await getCountFromServer(query(collection(db, 'products')));
        if (!cancelled) setTotalProductsCount(snap.data().count);
      } catch (error) {
        console.error('전체 상품 카운트 로드 실패:', error);
        reportError('CategoryManagerPage.totalCount', error);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCategory = useMemo(
    () => categories.find((cat) => cat.id === activeCategoryId) ?? null,
    [categories, activeCategoryId]
  );

  const categoryProductIds = useMemo(() => {
    if (!activeCategoryId) return [];
    return getCategoryProductIds(activeCategoryId, categoryItems);
  }, [activeCategoryId, categoryItems]);

  const poolProductIds = useMemo(() => {
    const base = appliedKeyword.trim()
      ? poolItems
      : poolItems.filter((p) => !p.categoryId);

    const toMs = (value: unknown): number => {
      if (!value) return 0;
      if (value instanceof Date) return value.getTime();
      if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate().getTime();
      }
      if (typeof value === 'object' && value && 'seconds' in value) {
        const seconds = (value as { seconds?: number }).seconds ?? 0;
        return seconds * 1000;
      }
      const date = new Date(value as string);
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };

    return base
      .slice()
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .map((p) => p.id);
  }, [appliedKeyword, poolItems]);

  const poolTitle = appliedKeyword.trim()
    ? `검색결과 ${poolProductIds.length}개`
    : `미분류 ${poolProductIds.length}개`;

  const productMap = useMemo(() => {
    const merged = [...poolItems, ...categoryItems];
    return merged.reduce<Record<string, ProductDoc>>((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});
  }, [categoryItems, poolItems]);

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const handleToggleSelect = useCallback((productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleResetAllCategories = useCallback(async () => {
    try {
      setIsResettingAll(true);
      toast.loading('전체 카테고리 초기화 중...', { id: 'reset-all' });
      await resetAllProductCategories(user?.uid);
      setCategoryItems([]);
      setPoolItems([]);
      setCategoryCounts(
        categories.reduce<Record<string, number>>((acc, cat) => {
          acc[cat.id] = 0;
          return acc;
        }, {})
      );
      clearSelection();
      setRefreshKey((prev) => prev + 1);
      toast.success('전체 카테고리 초기화 완료', { id: 'reset-all' });
    } catch (error) {
      console.error('전체 카테고리 초기화 실패:', error);
      reportError('CategoryManagerPage.resetAll', error);
      toast.error('전체 카테고리 초기화 실패', { id: 'reset-all' });
    } finally {
      setIsResettingAll(false);
    }
  }, [categories, clearSelection, user?.uid]);

  const handleBootstrapCategories = useCallback(async () => {
    try {
      setIsBootstrappingCategories(true);
      toast.loading('카테고리 자동 생성 중...', { id: 'bootstrap-categories' });
      await bootstrapCategoriesFromProducts();
      toast.success('카테고리 자동 생성 완료', { id: 'bootstrap-categories' });
    } catch (error) {
      console.error('카테고리 자동 생성 실패:', error);
      reportError('CategoryManagerPage.bootstrapCategories', error);
      toast.error('카테고리 자동 생성 실패', { id: 'bootstrap-categories' });
    } finally {
      setIsBootstrappingCategories(false);
    }
  }, []);

  const adjustCategoryCount = useCallback((categoryId: string, delta: number) => {
    setCategoryCounts((prev) => ({
      ...prev,
      [categoryId]: Math.max(0, (prev[categoryId] ?? 0) + delta),
    }));
  }, []);

  const matchesKeyword = useCallback(
    (product: ProductDoc, keyword: string) => {
      const trimmed = keyword.trim().toLowerCase();
      if (!trimmed) return false;
      const tokens = [product.name, product.brand, ...(product.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.includes(trimmed);
    },
    []
  );

  const moveSelectedToCategory = useCallback(async (targetCategoryId: string) => {
    if (!targetCategoryId || selectedArray.length === 0) return;
    try {
      const maxOrder = categoryItems.reduce((max, item) => Math.max(max, item.categoryOrder ?? 0), 0);
      const startOrder = Math.floor(maxOrder / CATEGORY_ORDER_STEP) * CATEGORY_ORDER_STEP + CATEGORY_ORDER_STEP;

      await batchMoveProductsToCategory(selectedArray, targetCategoryId, user?.uid, startOrder);

      setCategoryItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const moved = selectedArray
          .map((id) => productMap[id])
          .filter(Boolean)
          .map((product, idx) => ({
            ...product,
            categoryId: targetCategoryId,
            categoryOrder: startOrder + idx * CATEGORY_ORDER_STEP,
          }));
        return [...prev, ...moved.filter((item) => !existingIds.has(item.id))];
      });

      if (!appliedKeyword) {
        setPoolItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      }

      const sourceCounts: Record<string, number> = {};
      selectedArray.forEach((id) => {
        const sourceCategory = productMap[id]?.categoryId;
        if (sourceCategory && sourceCategory !== targetCategoryId) {
          sourceCounts[sourceCategory] = (sourceCounts[sourceCategory] ?? 0) + 1;
        }
      });

      Object.entries(sourceCounts).forEach(([categoryId, count]) => {
        adjustCategoryCount(categoryId, -count);
      });
      adjustCategoryCount(targetCategoryId, selectedArray.length);

      clearSelection();
      toast.success('선택 상품을 카테고리에 이동했습니다.');
    } catch (error) {
      console.error('선택 상품 이동 실패:', error);
      reportError('CategoryManagerPage.bulkMove', error);
      toast.error('선택 상품 이동에 실패했습니다.');
    }
  }, [
    selectedArray,
    user?.uid,
    categoryItems,
    productMap,
    appliedKeyword,
    selectedIds,
    clearSelection,
    adjustCategoryCount,
  ]);

  const handleMoveSelectedToActive = useCallback(async () => {
    if (!activeCategoryId) return;
    await moveSelectedToCategory(activeCategoryId);
  }, [activeCategoryId, moveSelectedToCategory]);

  const handleMoveSelectedToCategory = useCallback(
    async (categoryId: string) => {
      await moveSelectedToCategory(categoryId);
    },
    [moveSelectedToCategory]
  );

  const handleMoveSelectedToPool = useCallback(async () => {
    if (selectedArray.length === 0) return;
    try {
      await batchMoveProductsToCategory(selectedArray, null, user?.uid, 0);

      setCategoryItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setPoolItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const moved = selectedArray
          .map((id) => productMap[id])
          .filter(Boolean)
          .map((product) => ({
            ...product,
            categoryId: null,
            categoryOrder: 0,
          }))
          .filter((product) => {
            if (appliedKeyword) return matchesKeyword(product, appliedKeyword);
            return true;
          });
        return [...prev, ...moved.filter((item) => !existingIds.has(item.id))];
      });

      const sourceCounts: Record<string, number> = {};
      selectedArray.forEach((id) => {
        const sourceCategory = productMap[id]?.categoryId;
        if (sourceCategory) sourceCounts[sourceCategory] = (sourceCounts[sourceCategory] ?? 0) + 1;
      });
      Object.entries(sourceCounts).forEach(([categoryId, count]) => {
        adjustCategoryCount(categoryId, -count);
      });

      clearSelection();
      toast.success('선택 상품을 미분류로 이동했습니다.');
    } catch (error) {
      console.error('선택 상품 이동 실패:', error);
      reportError('CategoryManagerPage.bulkMovePool', error);
      toast.error('선택 상품 이동에 실패했습니다.');
    }
  }, [
    selectedArray,
    user?.uid,
    selectedIds,
    productMap,
    appliedKeyword,
    matchesKeyword,
    clearSelection,
    activeCategoryId,
    adjustCategoryCount,
  ]);

  const handleDragStart = useCallback((event: { active: { id: string } }) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(async (event: { active: { id: string }; over?: { id: string } }) => {
    setActiveDragId(null);
    const activeId = String(event.active.id);
    if (!event.over) return;
    const overId = String(event.over.id);

    const activeContainer = getContainerId(activeId, categories, productMap);
    const overContainer = getContainerId(overId, categories, productMap);
    const isOverCategory = categories.some((cat) => cat.id === overId);

    if (!activeContainer || !overContainer) return;
    if (activeContainer === 'pool' && overContainer === 'pool') return;

    const prevPool = poolItems;
    const prevCategory = categoryItems;

    try {
      if (isOverCategory) {
        const destinationCategoryId = overId;
        const startOrder =
          ((categoryCounts[destinationCategoryId] ?? 0) + 1) * CATEGORY_ORDER_STEP;

        await batchMoveProductsToCategory([activeId], destinationCategoryId, user?.uid, startOrder);

        if (activeContainer === activeCategoryId) {
          setCategoryItems((prev) => prev.filter((item) => item.id !== activeId));
        }

        if (destinationCategoryId === activeCategoryId) {
          setCategoryItems((prev) => {
            const exists = prev.some((item) => item.id === activeId);
            if (exists) return prev;
            const product = productMap[activeId];
            if (!product) return prev;
            return [
              ...prev,
              { ...product, categoryId: destinationCategoryId, categoryOrder: startOrder },
            ];
          });
        }

        if (!appliedKeyword) {
          setPoolItems((prev) => prev.filter((item) => item.id !== activeId));
        }

        if (activeContainer !== 'pool' && activeContainer !== destinationCategoryId) {
          adjustCategoryCount(activeContainer, -1);
        }
        adjustCategoryCount(destinationCategoryId, 1);

        toast.success('카테고리에 배정되었습니다.');
        return;
      }

      if (activeContainer === overContainer) {
        if (activeContainer === 'pool') return;

        const ids = getCategoryProductIds(activeContainer, categoryItems);
        const reordered = reorderIds(ids, activeId, overId);
        if (reordered === ids) return;

        setCategoryItems((prev) =>
          prev.map((product) => {
            if (product.categoryId !== activeContainer) return product;
            const idx = reordered.indexOf(product.id);
            if (idx < 0) return product;
            return {
              ...product,
              categoryOrder: (idx + 1) * CATEGORY_ORDER_STEP,
            };
          })
        );
        await batchUpdateCategoryOrders(activeContainer, reordered, user?.uid);
        toast.success('카테고리 순서가 저장되었습니다.');
        return;
      }

      if (overContainer === 'pool') {
        await batchMoveProductsToCategory([activeId], null, user?.uid, 0);

        setCategoryItems((prev) => prev.filter((item) => item.id !== activeId));
        setPoolItems((prev) => {
          const exists = prev.some((item) => item.id === activeId);
          if (exists) return prev;
          const product = productMap[activeId];
          if (!product) return prev;
          if (appliedKeyword && !matchesKeyword(product, appliedKeyword)) return prev;
          return [...prev, { ...product, categoryId: null, categoryOrder: 0 }];
        });

        if (activeContainer !== 'pool') {
          const remaining = getCategoryProductIds(activeContainer, categoryItems.filter((p) => p.id !== activeId));
          setCategoryItems((prev) =>
            prev.map((product) => {
              if (product.categoryId !== activeContainer) return product;
              const idx = remaining.indexOf(product.id);
              if (idx < 0) return product;
              return { ...product, categoryOrder: (idx + 1) * CATEGORY_ORDER_STEP };
            })
          );
          await batchUpdateCategoryOrders(activeContainer, remaining, user?.uid);
        }
        if (activeContainer !== 'pool') {
          adjustCategoryCount(activeContainer, -1);
        }
        toast.success('미분류로 이동했습니다.');
        return;
      }

      const destinationIds = getCategoryProductIds(overContainer, categoryItems).filter(
        (id) => id !== activeId
      );
      const targetIndex = destinationIds.indexOf(overId);
      if (targetIndex >= 0) destinationIds.splice(targetIndex, 0, activeId);
      else destinationIds.push(activeId);

      setCategoryItems((prev) => {
        const next = prev.filter((item) => item.id !== activeId);
        const product = productMap[activeId];
        if (!product) return next;
        const merged = [...next, { ...product, categoryId: overContainer }];
        return merged.map((item) => {
          if (item.categoryId !== overContainer) return item;
          const idx = destinationIds.indexOf(item.id);
          if (idx < 0) return item;
          return { ...item, categoryOrder: (idx + 1) * CATEGORY_ORDER_STEP };
        });
      });
      await batchUpdateCategoryOrders(overContainer, destinationIds, user?.uid);

      if (activeContainer !== 'pool') {
        const remaining = getCategoryProductIds(
          activeContainer,
          categoryItems.filter((p) => p.id !== activeId)
        );
        setCategoryItems((prev) =>
          prev.map((product) => {
            if (product.categoryId !== activeContainer) return product;
            const idx = remaining.indexOf(product.id);
            if (idx < 0) return product;
            return { ...product, categoryOrder: (idx + 1) * CATEGORY_ORDER_STEP };
          })
        );
        await batchUpdateCategoryOrders(activeContainer, remaining, user?.uid);
      }

      if (activeContainer === 'pool' && !appliedKeyword) {
        setPoolItems((prev) => prev.filter((item) => item.id !== activeId));
      }

      if (activeContainer !== overContainer) {
        if (activeContainer !== 'pool') adjustCategoryCount(activeContainer, -1);
        adjustCategoryCount(overContainer, 1);
      }

      toast.success('카테고리에 배정되었습니다.');
    } catch (error) {
      console.error('카테고리 저장 실패:', error);
      reportError('CategoryManagerPage.save', error);
      toast.error('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setPoolItems(prevPool);
      setCategoryItems(prevCategory);
    }
  }, [
    categories,
    categoryCounts,
    activeCategoryId,
    productMap,
    poolItems,
    categoryItems,
    appliedKeyword,
    matchesKeyword,
    adjustCategoryCount,
    user?.uid,
  ]);

  if (!isAdmin) {
    return (
      <AdminBlockedPage
        title="관리자 전용 페이지"
        message="관리자 권한이 없어서 이 페이지를 사용할 수 없습니다."
        reason="disabled"
      />
    );
  }

  if (categoriesLoading || poolLoading || categoryLoading) {
    return <SodomallLoader message="카테고리/상품을 불러오는 중..." />;
  }

  if (categoriesError || poolError || categoryError) {
    return (
      <div className="admin-page-container category-manager-page">
        <AdminPageHeader
          title="상품 카테고리 매핑"
          subtitle="카테고리 배정/정렬 도구"
          icon={<Folder size={24} />}
          priority="normal"
        />
        <div className="cm-error">{categoriesError ?? poolError ?? categoryError}</div>
      </div>
    );
  }

  return (
    <div className="admin-page-container category-manager-page">
      <AdminPageHeader
        title="상품 카테고리 매핑"
        subtitle="드래그앤드롭으로 카테고리 배정/순서 변경"
        icon={<Folder size={24} />}
        priority="normal"
      />

      {isDev && (
        <div className="cm-debug-banner">
          <span>프로젝트: {getApp().options.projectId ?? 'unknown'}</span>
          <span>전체 상품: {totalProductsCount ?? '-'}</span>
          <span>검색어: {appliedKeyword || '-'}</span>
          <span>Pool: {poolItems.length}</span>
          <span>Category: {categoryItems.length}</span>
        </div>
      )}

      {selectedArray.length > 0 && (
        <div className="cm-bulk-actions">
          <div>선택된 상품 {selectedArray.length}개</div>
          <div className="cm-bulk-buttons">
            <button type="button" onClick={handleMoveSelectedToActive} disabled={!activeCategoryId}>
              선택 상품 → 현재 카테고리
            </button>
            <button type="button" onClick={handleMoveSelectedToPool}>
              선택 상품 → 미분류
            </button>
            <button type="button" className="ghost" onClick={clearSelection}>
              선택 해제
            </button>
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div className="cm-utility-actions">
          <div className="cm-utility-text">
            상품의 categoryId를 기준으로 카테고리 목록을 자동 생성합니다.
          </div>
          <button
            type="button"
            className="cm-empty-action"
            onClick={handleBootstrapCategories}
            disabled={isBootstrappingCategories}
          >
            {isBootstrappingCategories ? '생성 중...' : '상품에서 카테고리 자동 생성'}
          </button>
        </div>
      )}

      <div className="cm-danger-actions">
        <div className="cm-danger-text">
          모든 상품의 카테고리를 초기화합니다. (미분류로 이동)
        </div>
        <button
          type="button"
          className="cm-danger-button"
          onClick={handleResetAllCategories}
          disabled={isResettingAll}
        >
          {isResettingAll ? '초기화 중...' : '전체 카테고리 초기화'}
        </button>
      </div>

      <div className="cm-guides">
        <div>1) 왼쪽에서 카테고리를 선택합니다.</div>
        <div>2) 가운데(미분류/검색) → 오른쪽(선택 카테고리)로 드래그해서 배정합니다.</div>
        <div>3) 순서는 자동으로 저장됩니다. (10, 20, 30…)</div>
        <div className="cm-note">
          현재는 하위카테고리 분류는 지원하지 않습니다. 필요하면 바로 추가할 수 있어요.
        </div>
      </div>

      {categories.length === 0 && (
        <div className="cm-empty-categories">
          <div className="cm-empty-title">카테고리가 없습니다</div>
          <div className="cm-empty-desc">
            상품에 있는 기존 카테고리 값을 읽어 임시 카테고리를 생성할 수 있습니다.
          </div>
          <button
            type="button"
            className="cm-empty-action"
            onClick={handleBootstrapCategories}
            disabled={isBootstrappingCategories}
          >
            {isBootstrappingCategories ? '생성 중...' : '상품에서 카테고리 자동 생성'}
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="cm-grid">
          <CategoryList
            categories={categories}
            activeCategoryId={activeCategoryId}
            productCounts={categoryCounts}
            onSelectCategory={setActiveCategoryId}
            selectedCount={selectedArray.length}
            onMoveSelectedToCategory={handleMoveSelectedToCategory}
          />
          <ProductPool
            poolTitle={poolTitle}
            searchKeyword={searchKeyword}
            onChangeSearch={setSearchKeyword}
            onSubmitSearch={applySearch}
            onClearSearch={clearSearch}
            productIds={poolProductIds}
            productMap={productMap}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            hasMore={poolHasMore}
            loadingMore={poolLoadingMore}
            onLoadMore={loadMorePool}
          />
          <CategoryDetail
            category={activeCategory}
            productIds={categoryProductIds}
            productMap={productMap}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            hasMore={categoryHasMore}
            loadingMore={categoryLoadingMore}
            onLoadMore={loadMoreCategory}
          />
        </div>

        <DragOverlay>
          {activeDragId && productMap[activeDragId] ? (
            <div className="cm-product-card dragging">
              <div className="cm-product-title">{productMap[activeDragId].name}</div>
              <div className="cm-product-meta">
                <span className={`cm-product-status status-${productMap[activeDragId].status ?? 'active'}`}>
                  {productMap[activeDragId].status === 'hidden'
                    ? '숨김'
                    : productMap[activeDragId].status === 'soldout'
                    ? '품절'
                    : '판매중'}
                </span>
                {productMap[activeDragId].brand && (
                  <span className="cm-product-brand">{productMap[activeDragId].brand}</span>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 확장 방향:
        - ElasticSearch/Algolia 연동으로 한글 형태소 기반 검색 개선
        - 10,000개 이상이면 서버 캐싱 + 페이지네이션 조합으로 비용/속도 최적화
        - Cloud Functions에서 인덱싱/캐싱 레이어를 두고 클라이언트는 검색 결과만 소비
      */}
    </div>
  );
};

export default CategoryManagerPage;
