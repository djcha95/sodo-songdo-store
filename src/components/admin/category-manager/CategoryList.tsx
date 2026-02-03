import React, { memo, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { CategoryDoc, CategorySection } from '@/hooks/useCategories';
import './CategoryManagerLayout.css';

const SECTION_LABELS: Record<CategorySection, string> = {
  food: '식품',
  health_beauty: '헬스/뷰티',
  living: '리빙',
  etc: '기타',
};

interface CategoryListProps {
  categories: CategoryDoc[];
  activeCategoryId: string | null;
  productCounts: Record<string, number>;
  onSelectCategory: (categoryId: string) => void;
  selectedCount: number;
  onMoveSelectedToCategory: (categoryId: string) => void;
}

interface CategoryItemProps {
  category: CategoryDoc;
  isActive: boolean;
  count: number;
  onSelectCategory: (categoryId: string) => void;
  selectedCount: number;
  onMoveSelectedToCategory: (categoryId: string) => void;
}

const CategoryListItem: React.FC<CategoryItemProps> = ({
  category,
  isActive,
  count,
  onSelectCategory,
  selectedCount,
  onMoveSelectedToCategory,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: category.id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`cm-category-item ${isActive ? 'active' : ''} ${isOver ? 'is-over' : ''}`}
      onClick={() => onSelectCategory(category.id)}
    >
      <div className="cm-category-name">
        {category.name}
        {!category.isActive && <span className="cm-category-badge">비활성</span>}
      </div>
      <div className="cm-category-actions">
        <span className="cm-category-count">{count}</span>
        {selectedCount > 0 && (
          <span
            role="button"
            className="cm-category-move"
            onClick={(event) => {
              event.stopPropagation();
              onMoveSelectedToCategory(category.id);
            }}
          >
            선택 이동
          </span>
        )}
      </div>
    </button>
  );
};

const CategoryList: React.FC<CategoryListProps> = ({
  categories,
  activeCategoryId,
  productCounts,
  onSelectCategory,
  selectedCount,
  onMoveSelectedToCategory,
}) => {
  const grouped = useMemo(() => {
    return categories.reduce<Record<CategorySection, CategoryDoc[]>>(
      (acc, category) => {
        acc[category.section] = acc[category.section] ?? [];
        acc[category.section].push(category);
        return acc;
      },
      { food: [], health_beauty: [], living: [], etc: [] }
    );
  }, [categories]);

  return (
    <div className="cm-panel cm-category-list">
      <div className="cm-panel-title">카테고리</div>
      {Object.entries(grouped).map(([section, items]) => (
        <div key={section} className="cm-category-section">
          <div className="cm-section-title">{SECTION_LABELS[section as CategorySection]}</div>
          <div className="cm-category-items">
            {items.map((category) => (
              <CategoryListItem
                key={category.id}
                category={category}
                isActive={category.id === activeCategoryId}
                count={productCounts[category.id] ?? 0}
                onSelectCategory={onSelectCategory}
                selectedCount={selectedCount}
                onMoveSelectedToCategory={onMoveSelectedToCategory}
              />
            ))}
            {items.length === 0 && <div className="cm-empty">카테고리가 없습니다.</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default memo(CategoryList);
