// src/components/customer/ModernProductCard.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Check, CheckCircle2, Plus, Minus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  Product as OriginalProduct,
  SalesRound as OriginalSalesRound,
  OrderItem,
  VariantGroup as OriginalVariantGroup,
} from '@/shared/types';
import {
  getStockInfo,
  getMaxPurchasableQuantity,
  safeToDate,
  getDeadlines,
} from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import { showToast } from '@/utils/toastUtils';
import PrepaymentModal from '@/components/common/PrepaymentModal';
import { getUserOrders } from '@/firebase/orderService';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import '@/styles/ModernProduct.css';

type Product = OriginalProduct & {
  displayRound: OriginalSalesRound;
};

interface ModernProductCardProps {
  product: Product;
  actionState: ProductActionState;
  phase: 'primary' | 'secondary' | 'onsite';
}

const ModernProductCard: React.FC<ModernProductCardProps> = ({
  product,
  actionState,
  phase,
}) => {
  const navigate = useNavigate();
  const { user, userDocument } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [isPrepaymentModalOpen, setPrepaymentModalOpen] = useState(false);
  const [prepaymentPrice, setPrepaymentPrice] = useState(0);
  const [reservationStatus, setReservationStatus] =
    useState<'idle' | 'processing' | 'success'>('idle');
  const [myPurchasedCount, setMyPurchasedCount] = useState(0);

  const functions = useMemo(
    () => getFunctions(getApp(), 'asia-northeast3'),
    []
  );
  const submitOrderCallable = useMemo(
    () => httpsCallable<any, any>(functions, 'submitOrder'),
    [functions]
  );

  const cardData = useMemo(() => {
    const { displayRound } = product;
    if (!displayRound) return null;

    const isMultiOption =
      (displayRound.variantGroups?.length ?? 0) > 1 ||
      (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;

    const singleOptionVg = !isMultiOption
      ? displayRound.variantGroups?.[0]
      : undefined;
    const singleOptionItem = singleOptionVg?.items?.[0] || null;

    return {
      displayRound: displayRound as OriginalSalesRound & {
        variantGroups: OriginalVariantGroup[];
      },
      isMultiOption,
      singleOptionItem,
      singleOptionVg,
      price:
        singleOptionItem?.price ??
        displayRound.variantGroups?.[0]?.items?.[0]?.price ??
        0,
    };
  }, [product]);

  // ✅ 이벤트 타입에 따른 라벨 (COSMETICS, CHRISTMAS 포함)
  const eventLabel = useMemo(() => {
    const type = (product.displayRound as any)?.eventType as
      | 'NONE'
      | 'ANNIVERSARY'
      | 'CHUSEOK'
      | 'CHRISTMAS'
      | 'COSMETICS'
      | string
      | undefined;

    switch (type) {
      case 'ANNIVERSARY':
        return '🎉 1주년 기념';
      case 'CHUSEOK':
        return '🍂 추석 특집';
      case 'CHRISTMAS':
        return '🎄 크리스마스 특가';
      case 'COSMETICS':
        return '💄 뷰티 특가';
      default:
        return null;
    }
  }, [product.displayRound]);

  useEffect(() => {
    const checkMyHistory = async () => {
      if (!user || !cardData?.singleOptionItem || !cardData?.displayRound)
        return;
      try {
        const myOrders = await getUserOrders(user.uid);
        const currentRoundId = cardData.displayRound.roundId;
        const currentItemId = cardData.singleOptionItem.id;
        const totalBought = myOrders
          .filter(
            (o) => o.status !== 'CANCELED' && o.status !== 'LATE_CANCELED'
          )
          .flatMap((o) => o.items)
          .filter(
            (i) => i.roundId === currentRoundId && i.itemId === currentItemId
          )
          .reduce((sum, i) => sum + i.quantity, 0);

        setMyPurchasedCount(totalBought);
      } catch (error) {
        console.error(error);
      }
    };

    checkMyHistory();
  }, [user, cardData]);

  const handleImmediateOrder = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (phase === 'onsite') {
      showToast('info', '매장에서 직접 구매해주세요!');
      return;
    }

    if (!user || !userDocument) {
      showToast('error', '로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    if (cardData?.isMultiOption) {
      navigate(`/product/${product.id}`);
      return;
    }

    const finalVariant = cardData?.singleOptionItem;
    const vg = cardData?.singleOptionVg;
    if (!finalVariant || !vg) return;

    const limitSetting = finalVariant?.limitQuantity ?? Infinity;
    const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);
    if (quantity > myRemainingLimit) {
      showToast('error', '구매 한도 초과!');
      return;
    }

    const stockMax = getMaxPurchasableQuantity(vg, finalVariant);
    const finalMaxQty = Math.min(stockMax, myRemainingLimit);
    if (quantity > finalMaxQty) {
      showToast('error', '재고 부족!');
      return;
    }

    setReservationStatus('processing');

    try {
      const prepaymentRequired = cardData.displayRound.isPrepaymentRequired;
      const totalPrice = finalVariant.price * quantity;

      const orderItem: OrderItem = {
        id: `order-item-${finalVariant.id}-${Date.now()}`,
        productId: product.id,
        productName: product.groupName,
        imageUrl: product.imageUrls?.[0] || '',
        roundId: cardData.displayRound.roundId,
        roundName: cardData.displayRound.roundName,
        variantGroupId: vg.id,
        variantGroupName: vg.groupName,
        itemId: finalVariant.id,
        itemName: finalVariant.name,
        quantity,
        unitPrice: finalVariant.price,
        stock: finalVariant.stock,
        stockDeductionAmount: finalVariant.stockDeductionAmount,
        arrivalDate: cardData.displayRound.arrivalDate || null,
        pickupDate: cardData.displayRound.pickupDate,
        deadlineDate: cardData.displayRound.deadlineDate,
        isPrepaymentRequired:
          cardData.displayRound.isPrepaymentRequired ?? false,
      };

      const orderPayload = {
        userId: user.uid,
        items: [orderItem],
        totalPrice,
        customerInfo: {
          name: user.displayName || '미상',
          phone: userDocument?.phone || '',
        },
        pickupDate: cardData.displayRound.pickupDate,
        wasPrepaymentRequired: prepaymentRequired,
        notes: '빠른 구매',
      };

      const result = await submitOrderCallable(orderPayload);
      const data = result.data as any;

      if (data.updatedOrderIds || data.orderIds) {
        showToast('success', '예약이 완료되었습니다.');
        setReservationStatus('success');
        setQuantity(1);
        setTimeout(() => setReservationStatus('idle'), 1500);

        if (data.orderIds && prepaymentRequired) {
          setPrepaymentPrice(totalPrice);
          setPrepaymentModalOpen(true);
        }
      } else {
        throw new Error(data.message || '실패');
      }
    } catch (error: any) {
      showToast('error', error.message || '오류 발생');
      setReservationStatus('idle');
    }
  };

  if (!cardData) return null;

  // 마감/픽업 텍스트
  const { primaryEnd, secondaryEnd } = getDeadlines(cardData.displayRound);
  const pickupDate = safeToDate(cardData.displayRound.pickupDate);
  const pickupText = pickupDate
    ? dayjs(pickupDate).locale('ko').format('M/D(ddd) 픽업')
    : '';

  let deadlineText = '';
  let isUrgent = false;

  if (phase === 'primary' && primaryEnd) {
    const isToday = primaryEnd.isSame(dayjs(), 'day');
    deadlineText = `${isToday ? '오늘' : '내일'} ${primaryEnd.format(
      'HH:mm'
    )} 마감`;
    isUrgent = primaryEnd.diff(dayjs(), 'hour') < 6;
  } else if (phase === 'secondary' && secondaryEnd) {
    deadlineText = `${secondaryEnd.locale('ko').format('M/D(ddd) HH:mm')} 마감`;
  }

  const stockInfo = cardData.singleOptionVg
    ? getStockInfo(cardData.singleOptionVg)
    : null;
  const isUnlimited = !stockInfo?.isLimited;
  const currentStock = stockInfo?.remainingUnits ?? 0;
  const maxStock = 50;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((maxStock - currentStock) / maxStock) * 100)
  );

  let priceLabel = '';
  if (phase === 'primary') priceLabel = '공구가';
  else if (phase === 'secondary') priceLabel = '공구가';
  else if (phase === 'onsite') priceLabel = '매장가';

  const limitSetting = cardData.singleOptionItem?.limitQuantity ?? Infinity;
  const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);
  const finalMaxQty = Math.min(
    stockInfo?.remainingUnits ?? Infinity,
    myRemainingLimit
  );

  const isControlsDisabled =
    reservationStatus === 'processing' || finalMaxQty <= 0;

  return (
    <>
      <div
        className={`songdo-card ${phase}`}
        onClick={() => navigate(`/product/${product.id}`)}
      >
        {/* 상단: 썸네일 + 정보 + 가격까지 */}
        <div className="songdo-card-header">
          <div className="songdo-card-thumb">
            <OptimizedImage
              originalUrl={product.imageUrls?.[0]}
              size="200x200"
              alt={product.groupName}
              className="songdo-img"
            />
          </div>

          <div className="songdo-card-info-text">
            <div className="songdo-tags">
              {phase === 'primary' && (
                <span className="tag primary">🔥 오늘의 공구</span>
              )}
              {phase === 'secondary' && (
                <span className="tag secondary">🔁 추가예약</span>
              )}
              {phase === 'onsite' && (
                <span className="tag onsite">매장구매</span>
              )}
              {eventLabel && <span className="tag event">{eventLabel}</span>}
              {phase !== 'onsite' && (
                <span className={`deadline-text ${isUrgent ? 'urgent' : ''}`}>
                  {deadlineText}
                </span>
              )}
            </div>

            <h3 className="songdo-title">{product.groupName}</h3>

            {pickupText && phase !== 'onsite' && (
              <div className="pickup-info-text">📦 {pickupText}</div>
            )}

            {phase !== 'onsite' && (
              <div className="stock-status-area">
                {!isUnlimited ? (
                  <>
                    <div className="stock-bar-bg">
                      <div
                        className={`stock-bar-fill ${phase}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className={`stock-text ${phase}`}>
                      {currentStock}개 남음
                    </span>
                  </>
                ) : (
                  phase === 'secondary' && (
                    <div className="stock-unlimited">
                      <CheckCircle2 size={14} /> <span>예약 가능</span>
                    </div>
                  )
                )}
              </div>
            )}

            {/* 가격 블럭 */}
            <div className="price-area">
              <span className={`price-label ${phase}`}>{priceLabel}</span>
              <span className="price">
                {cardData.price.toLocaleString()}
              </span>
              <span className="unit">원</span>
            </div>
          </div>
        </div>

        {/* 하단: 수량조절 + 예약 버튼 한 줄 */}
        <div
          className="songdo-card-bottom-row controls-only"
          onClick={(e) => e.stopPropagation()}
        >
          {phase === 'onsite' ? (
            <button className="btn-onsite-simple" disabled>
              매장 구매 상품
            </button>
          ) : (
            <div className="qty-control-group">
              <div className="qty-stepper">
                <button
                  className="qty-btn"
                  onClick={() =>
                    setQuantity((q) => Math.max(1, q - 1))
                  }
                  disabled={isControlsDisabled || quantity <= 1}
                >
                  <Minus size={16} />
                </button>
                <div className="qty-val">{quantity}</div>
                <button
                  className="qty-btn"
                  onClick={() =>
                    setQuantity((q) =>
                      Math.min(finalMaxQty || 1, q + 1)
                    )
                  }
                  disabled={
                    isControlsDisabled || quantity >= finalMaxQty
                  }
                >
                  <Plus size={16} />
                </button>
              </div>

              <button
                className={`btn-cart ${
                  reservationStatus === 'success' ? 'success' : ''
                }`}
                onClick={handleImmediateOrder}
                disabled={reservationStatus === 'processing'}
              >
                {reservationStatus === 'processing'
                  ? '...'
                  : reservationStatus === 'success'
                  ? <Check size={20} />
                  : <ShoppingCart size={20} />}
              </button>
            </div>
          )}
        </div>
      </div>

      <PrepaymentModal
        isOpen={isPrepaymentModalOpen}
        totalPrice={prepaymentPrice}
        onClose={() => setPrepaymentModalOpen(false)}
      />
    </>
  );
};

export default React.memo(ModernProductCard);