import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SortableProductCard from './SortableProductCard';
import type { ProductDoc } from '@/hooks/useProducts';
import './CategoryManagerLayout.css';

interface ProductPoolProps {
  poolTitle: string;
  searchKeyword: string;
  onChangeSearch: (value: string) => void;
  onSubmitSearch: () => void;
  onClearSearch: () => void;
  productIds: string[];
  productMap: Record<string, ProductDoc>;
  selectedIds: Set<string>;
  onToggleSelect: (productId: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const ProductPool: React.FC<ProductPoolProps> = ({
  poolTitle,
  searchKeyword,
  onChangeSearch,
  onSubmitSearch,
  onClearSearch,
  productIds,
  productMap,
  selectedIds,
  onToggleSelect,
  hasMore,
  loadingMore,
  onLoadMore,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' });

  return (
    <div className="cm-panel cm-product-pool">
      <div className="cm-panel-title">미분류/검색결과</div>
      <form
        className="cm-search-box"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitSearch();
        }}
      >
        <input
          type="search"
          placeholder="상품명을 검색하세요"
          value={searchKeyword}
          onChange={(e) => onChangeSearch(e.target.value)}
        />
        <button type="submit" className="cm-search-button">
          검색
        </button>
        <button type="button" className="cm-search-clear" onClick={onClearSearch}>
          초기화
        </button>
      </form>
      <div className="cm-pool-title">{poolTitle}</div>
      <div
        className={`cm-list cm-pool-list ${isOver ? 'is-over' : ''}`}
        id="pool-list"
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
                containerId="pool"
                isSelected={selectedIds.has(id)}
                onToggleSelect={onToggleSelect}
              />
            );
          })}
        </SortableContext>
        {productIds.length === 0 && <div className="cm-empty">표시할 상품이 없습니다.</div>}
      </div>
      {hasMore && (
        <button type="button" className="cm-load-more" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? '불러오는 중...' : '더 보기'}
        </button>
      )}
    </div>
  );
};

export default memo(ProductPool);
