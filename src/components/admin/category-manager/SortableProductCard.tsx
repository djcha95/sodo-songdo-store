import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProductDoc } from '@/hooks/useProducts';
import './CategoryManagerCards.css';

interface SortableProductCardProps {
  product: ProductDoc;
  containerId: string;
  isSelected?: boolean;
  onToggleSelect?: (productId: string) => void;
}

const toMs = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === 'object' && value && 'seconds' in value) {
    const seconds = (value as { seconds?: number }).seconds ?? 0;
    return seconds * 1000;
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const SortableProductCard: React.FC<SortableProductCardProps> = ({
  product,
  containerId,
  isSelected,
  onToggleSelect,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    data: { containerId },
  });

  const updatedMs = toMs(product.updatedAt);
  const isRecent = updatedMs ? Date.now() - updatedMs <= 5 * 60 * 1000 : false;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className={`cm-product-card ${isDragging ? 'dragging' : ''} ${isRecent ? 'recent' : ''}`}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="cm-product-top">
        <div className="cm-product-title">{product.name}</div>
        {onToggleSelect && (
          <label className="cm-product-checkbox" onPointerDown={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={Boolean(isSelected)}
              onChange={() => onToggleSelect(product.id)}
            />
            <span />
          </label>
        )}
      </div>
      {isRecent && <span className="cm-recent-badge">최근 이동</span>}
      <div className="cm-product-meta">
        <span
          className={`cm-product-status status-${product.displayStatusKey ?? (product.status === 'hidden' ? 'hidden' : product.status === 'soldout' ? 'soldout' : 'reserving')}`}
        >
          {product.displayStatus ??
            (product.status === 'hidden' ? '숨김' : product.status === 'soldout' ? '품절' : '예약중')}
        </span>
        {product.brand && <span className="cm-product-brand">{product.brand}</span>}
      </div>
      {product.tags && product.tags.length > 0 && (
        <div className="cm-product-tags">
          {product.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="cm-product-tag">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(SortableProductCard);
