import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

import type { Product as OriginalProduct, SalesRound as OriginalSalesRound, VariantGroup as OriginalVariantGroup } from '../../shared/types';
import OptimizedImage from '../../components/common/OptimizedImage';
import { safeToDate, getRemainingPurchasableCount } from '../../utils/productUtils';
import { getMarketingBadges, getPopularityScore, getTotalReservedCount } from '../../utils/productBadges';
import './ModernProductThumbCard.css';

type Product = OriginalProduct & {
  displayRound: OriginalSalesRound;
  isPreorder?: boolean;
};

type Props = {
  product: Product;
  variant?: 'row' | 'grid';
  index?: number;
  bestsellerRank?: number;
  badgeSeed?: string; // YYYY-MM-DD (일일 추천 고정용)
};

const ModernProductThumbCard: React.FC<Props> = ({ product, variant = 'row', index, bestsellerRank, badgeSeed }) => {
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
      // ✅ “구매 가능 개수” 기준으로 표시 (stockDeductionAmount 반영)
      const purchasable = getRemainingPurchasableCount(vg as any);
      if (Number.isFinite(purchasable) && purchasable > 0 && purchasable <= 3) {
        remainingUnits = purchasable;
      }
    }

    const badges = getMarketingBadges({
      product: product as any,
      round: r as any,
      selectedItem: (item as any) ?? null,
      bestsellerRank,
      seed: badgeSeed,
      maxBadges: 2,
    });
    // ✅ 카드에서는 "인기상품"이 있으면 인기상품만, 없으면 "신상품"만 표시 (초특가/추천 등은 생략)
    const hasBest = badges.some((b) => b.key === 'BEST');
    const displayBadges = hasBest 
      ? badges.filter((b) => b.key === 'BEST')
      : badges.filter((b) => b.key === 'NEW');

    const reservedCount = getTotalReservedCount(r as any);
    const popularityScore = getPopularityScore({
      reservedCount,
      productId: product.id,
      seed: badgeSeed,
    });

    return { price, originalPrice, dateText, remainingUnits, badges: displayBadges, reservedCount, popularityScore };
  }, [product, bestsellerRank, badgeSeed]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // 드래그 스크롤과 충돌 방지: 실제 클릭만 처리
    e.stopPropagation();
    navigate(`/product/${product.id}`);
  }, [navigate, product.id]);

  return (
    <button
      type="button"
      className={`sp-thumb-card ${variant} ${product.displayRound?.eventType === 'PREMIUM' ? 'luxury' : ''}`}
      onClick={handleCardClick}
      aria-label={`${product.groupName} 상세보기`}
    >
      {/* ✅ 순번 뱃지를 이미지 래퍼 밖으로 이동 (카드 좌측 상단 외부) */}
      {index !== undefined && (
        <div className="sp-thumb-index">{index + 1}</div>
      )}

      {/* ✅ 뱃지는 이미지 위가 아니라, 카드 상단의 별도 영역에 표시 */}
      <div className="sp-thumb-topRow" aria-hidden="true">
        <div className="sp-thumb-topLeft">
          {cardData.badges.length > 0 && (
            <div className="sp-thumb-badgeRow">
              {cardData.badges.map((b) => (
                <span key={b.key} className={`sp-thumb-badge key-${b.key} tone-${b.tone}`}>
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="sp-thumb-topRight">
          <span className="sp-thumb-orderCount">
            인기지수 {cardData.popularityScore.toLocaleString()}
          </span>
        </div>
      </div>

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