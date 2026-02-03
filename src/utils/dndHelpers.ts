import { arrayMove } from '@dnd-kit/sortable';
import type { CategoryDoc } from '@/hooks/useCategories';
import type { ProductDoc } from '@/hooks/useProducts';

export const getContainerId = (
  id: string,
  categories: CategoryDoc[],
  productMap: Record<string, ProductDoc>
) => {
  if (id === 'pool') return 'pool';
  if (categories.some((c) => c.id === id)) return id;
  return productMap[id]?.categoryId ?? 'pool';
};

export const getCategoryProductIds = (categoryId: string, products: ProductDoc[]) => {
  return products
    .filter((p) => p.categoryId === categoryId)
    .slice()
    .sort((a, b) => {
      const orderDiff = (a.categoryOrder ?? 0) - (b.categoryOrder ?? 0);
      return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name);
    })
    .map((p) => p.id);
};

export const reorderIds = (ids: string[], activeId: string, overId: string) => {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return ids;
  return arrayMove(ids, oldIndex, newIndex);
};
