import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

import type { Product as OriginalProduct, SalesRound as OriginalSalesRound, VariantGroup as OriginalVariantGroup } from '../../shared/types';
import OptimizedImage from '../../components/common/OptimizedImage';
import { safeToDate, getStockInfo } from '../../utils/productUtils';
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
    // ✅ 정상가(originalPrice) 가져오기 추가
    const originalPrice = (item as any)?.originalPrice ?? 0;

    const arrival = safeToDate((r as any)?.arrivalDate);
    const pickup = safeToDate((r as any)?.pickupDate);

    const displayDate = arrival ?? pickup;
    const dateText = displayDate ? dayjs(displayDate).locale('ko').format('M/D(ddd)') : '';

    // ✅ 남은 재고 계산 (마지막 찬스용)
    let remainingUnits: number | null = null;
    if (vg) {
      const stockInfo = getStockInfo(vg);
      if (stockInfo.isLimited && stockInfo.remainingUnits > 0 && stockInfo.remainingUnits <= 3) {
        remainingUnits = stockInfo.remainingUnits;
      }
    }

    return { price, originalPrice, dateText, remainingUnits };
  }, [product]);

  return (
    <button
      type="button"
      className={`sp-thumb-card ${variant} ${product.displayRound?.eventType === 'PREMIUM' ? 'luxury' : ''}`}
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
        {/* 첫째 줄: 제목 / 갯수 */}
        <div className="sp-thumb-row-1">
          <div className="sp-thumb-title">{product.groupName}</div>
          {/* 마지막 찬스: 남은 수량 표시 */}
          {cardData.remainingUnits !== null && (
            <div className="sp-thumb-stock-badge">
              <span className="sp-thumb-stock-count">{cardData.remainingUnits}개</span>
            </div>
          )}
        </div>
        
        {/* 둘째 줄: 입고일 / 가격 */}
        <div className="sp-thumb-row-2">
          {cardData.dateText ? (
            <span className="sp-thumb-date">입고 {cardData.dateText}</span>
          ) : <span />}
          
          <div className="sp-thumb-price-group">
            {/* ✅ 정상가가 판매가보다 높을 때만 취소선 표시 */}
            {cardData.originalPrice > cardData.price && (
              <span className="sp-thumb-original-price">
                {cardData.originalPrice.toLocaleString()}원
              </span>
            )}
            <span className="sp-thumb-price">
              {cardData.price.toLocaleString()}<span className="currency-unit">원</span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default React.memo(ModernProductThumbCard);