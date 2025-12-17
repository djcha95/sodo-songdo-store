import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

import type { Product as OriginalProduct, SalesRound as OriginalSalesRound, VariantGroup as OriginalVariantGroup } from '../../shared/types';
import OptimizedImage from '../../components/common/OptimizedImage';
import { safeToDate } from '../../utils/productUtils';
import './ModernProductThumbCard.css';

type Product = OriginalProduct & {
  displayRound: OriginalSalesRound;
  isPreorder?: boolean;
};

type Props = {
  product: Product;
  variant?: 'row' | 'grid';
  index?: number;
};

const ModernProductThumbCard: React.FC<Props> = ({ product, variant = 'row', index }) => {
  const navigate = useNavigate();

  const cardData = useMemo(() => {
    const r = product.displayRound;
    const vg = (r?.variantGroups?.[0] as OriginalVariantGroup | undefined);
    const item = vg?.items?.[0];
    const price = item?.price ?? 0;

    const arrival = safeToDate((r as any)?.arrivalDate);
    const pickup = safeToDate((r as any)?.pickupDate);

    const displayDate = arrival ?? pickup;
    const dateText = displayDate ? dayjs(displayDate).locale('ko').format('M/D(ddd)') : '';

    return { price, dateText };
  }, [product]);

  return (
    <button
      type="button"
      className={`sp-thumb-card ${variant}`}
      onClick={() => navigate(`/product/${product.id}`)}
      aria-label={`${product.groupName} 상세보기`}
    >
      {/* ✅ 순번 뱃지를 이미지 래퍼 밖으로 이동 (카드 좌측 상단 외부) */}
      {index !== undefined && (
        <div className="sp-thumb-index">{index + 1}</div>
      )}

      <div className="sp-thumb-imgWrap">
        <OptimizedImage
          originalUrl={product.imageUrls?.[0]}
          size="200x200"
          alt={product.groupName}
          className="sp-thumb-img"
        />
      </div>

      <div className="sp-thumb-meta">
        <div className="sp-thumb-title">{product.groupName}</div>
        <div className="sp-thumb-sub">
          {cardData.dateText ? (
            <span className="sp-thumb-date">입고 {cardData.dateText}</span>
          ) : (
            <span />
          )}
          <span className="sp-thumb-price">
            {cardData.price.toLocaleString()}<span className="currency-unit">원</span>
          </span>
        </div>
      </div>
    </button>
  );
};

export default React.memo(ModernProductThumbCard);