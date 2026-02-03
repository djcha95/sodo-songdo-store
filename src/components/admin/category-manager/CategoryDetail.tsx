import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CategoryDoc } from '@/hooks/useCategories';
import type { ProductDoc } from '@/hooks/useProducts';
import SortableProductCard from './SortableProductCard';
import './CategoryManagerLayout.css';

interface CategoryDetailProps {
  category: CategoryDoc | null;
  productIds: string[];
  productMap: Record<string, ProductDoc>;
  selectedIds: Set<string>;
  onToggleSelect: (productId: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const CategoryDetail: React.FC<CategoryDetailProps> = ({
  category,
  productIds,
  productMap,
  selectedIds,
  onToggleSelect,
  hasMore,
  loadingMore,
  onLoadMore,
}) => {
  if (!category) {
    return (
      <div className="cm-panel cm-category-detail">
        <div className="cm-panel-title">카테고리 상세</div>
        <div className="cm-empty">카테고리를 선택해주세요.</div>
      </div>
    );
  }

  const { setNodeRef, isOver } = useDroppable({ id: category.id });

  return (
    <div className="cm-panel cm-category-detail">
      <div className="cm-panel-title">카테고리 상세</div>
      <div className="cm-detail-header">
        <div className="cm-detail-title">{category.name}</div>
        {!category.isActive && <span className="cm-category-badge">비활성</span>}
      </div>
      <div
        className={`cm-list cm-category-list-panel ${isOver ? 'is-over' : ''}`}
        ref={setNodeRef}
      >
        <SortableContext items={productIds} strategy={verticalListSortingStrategy}>
          {productIds.map((id) => {
            const product = productMap[id];
            if (!product) return null;
            return (
              <SortableProductCard
                key={id}
                product={product}
                containerId={category.id}
                isSelected={selectedIds.has(id)}
                onToggleSelect={onToggleSelect}
              />
            );
          })}
        </SortableContext>
        {productIds.length === 0 && <div className="cm-empty">이 카테고리에 상품이 없습니다.</div>}
      </div>
      {hasMore && (
        <button type="button" className="cm-load-more" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? '불러오는 중...' : '더 보기'}
        </button>
      )}
    </div>
  );
};

export default memo(CategoryDetail);
