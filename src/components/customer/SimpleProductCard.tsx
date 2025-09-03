// src/components/customer/SimpleProductCard.tsx

import React, { useState, useMemo, useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, ShieldX, Banknote, AlertTriangle, Info, Calendar, Hourglass, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLaunch } from '@/context/LaunchContext';
import toast from 'react-hot-toast';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Product as OriginalProduct, SalesRound as OriginalSalesRound, OrderItem, VariantGroup as OriginalVariantGroup } from '@/types'; 
import { getStockInfo, getMaxPurchasableQuantity, safeToDate, getDeadlines } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import { showToast } from '@/utils/toastUtils';
import './SimpleProductCard.css';

type Product = OriginalProduct & {
  displayRound: OriginalSalesRound;
}

interface SimpleProductCardProps {
  product: Product;
  actionState: ProductActionState;
}

const SimpleProductCard: React.FC<SimpleProductCardProps> = ({ product, actionState }) => {
  const navigate = useNavigate();
  const { user, userDocument, isSuspendedUser } = useAuth();
  const { isPreLaunch, launchDate } = useLaunch();

  const [quantity, setQuantity] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const validateCartCallable = useMemo(() => httpsCallable<any, any>(functions, 'validateCart'), [functions]);
  const submitOrderCallable = useMemo(() => httpsCallable<any, any>(functions, 'submitOrder'), [functions]);
  const addWaitlistEntryCallable = useMemo(() => httpsCallable<any, any>(functions, 'addWaitlistEntry'), [functions]);

  const cardData = useMemo(() => {
    const { displayRound } = product;
    if (!displayRound) return null;
    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    const singleOptionVg = !isMultiOption ? displayRound.variantGroups?.[0] : undefined;
    const singleOptionItem = singleOptionVg?.items?.[0] || null;
    return {
      displayRound: displayRound as (OriginalSalesRound & { variantGroups: OriginalVariantGroup[] }),
      isMultiOption,
      singleOptionItem,
      singleOptionVg,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
    };
  }, [product]);

  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>, maxQty: number) => {
    e.stopPropagation();
    const value = e.target.value;
    if (value === '') { setQuantity(NaN); return; }
    const newQty = parseInt(value, 10);
    if (!isNaN(newQty)) {
        if (newQty > maxQty) setQuantity(maxQty);
        else if (newQty < 1) setQuantity(1);
        else setQuantity(newQty);
    }
  };

  const handleQuantityBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (isNaN(quantity) || quantity < 1) { setQuantity(1); }
  };

  const handleImmediateOrder = async () => {
    if (!user || !userDocument) {
      showToast('error', '로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    if (isSuspendedUser) {
      showToast('error', '반복적인 약속 불이행으로 참여가 제한됩니다.');
      return;
    }
    if (isProcessing || !cardData) return;
    
    const finalVariant = cardData.singleOptionItem;
    if (!finalVariant) {
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('예약 처리 중...');

    const vg = cardData.singleOptionVg;
    if (!vg) {
      toast.dismiss(toastId);
      showToast('error', '상품 정보를 찾을 수 없습니다.');
      setIsProcessing(false);
      return;
    }

    const itemToValidate = { ...finalVariant, productId: product.id, roundId: cardData.displayRound.roundId, quantity: quantity };
    let showPrepaymentModal = false;

    try {
      const validationResult = await validateCartCallable({ items: [itemToValidate] });
      if (!validationResult.data.summary.sufficient) {
        throw new Error(validationResult.data.summary.reason || '재고가 부족하거나 예약할 수 없는 상품입니다.');
      }
      
      const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
      const prepaymentRequired = isWarningUser || cardData.displayRound.isPrepaymentRequired;
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
        quantity: quantity,
        unitPrice: finalVariant.price, 
        stock: finalVariant.stock,
        stockDeductionAmount: finalVariant.stockDeductionAmount,
        arrivalDate: cardData.displayRound.arrivalDate || null,
        pickupDate: cardData.displayRound.pickupDate,
        deadlineDate: cardData.displayRound.deadlineDate,
        isPrepaymentRequired: cardData.displayRound.isPrepaymentRequired ?? false,
      };
      
      const orderPayload = {
        userId: user.uid,
        items: [orderItem],
        totalPrice,
        customerInfo: { name: user.displayName || '미상', phone: userDocument?.phone || '' },
        pickupDate: cardData.displayRound.pickupDate,
        wasPrepaymentRequired: prepaymentRequired,
        notes: '즉시 예약'
      };

      await submitOrderCallable(orderPayload);
      
      if (prepaymentRequired) {
        showPrepaymentModal = true;
        toast.dismiss(toastId);
        const customToastId = `prepayment-toast-${product.id}`;
        const performNavigation = () => {
          toast.dismiss(customToastId);
          startTransition(() => { navigate('/mypage/history'); });
        };
        
        toast.custom((t) => (
          <div className="prepayment-modal-overlay">
            <div className={`prepayment-modal-content ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
              <div className="toast-icon-wrapper"><Banknote size={48} /></div>
              <h4>⚠️ 선입금 후 예약이 확정됩니다</h4>
              <p>'주의 요망' 등급이시거나 해당 상품이 선입금 필수 상품입니다.<br/>마감 시간 전까지 입금 후 채널톡으로 내역을 보내주세요.</p>
              <div className="bank-info">
                <strong>카카오뱅크 3333-12-3456789 (소도몰)</strong>
                <div className="price-to-pay">입금할 금액: <strong>{totalPrice.toLocaleString()}원</strong></div>
              </div>
              <small>관리자가 확인 후 예약을 확정 처리해 드립니다.<br/>미입금 시 예약은 자동 취소될 수 있습니다.</small>
              <button className="modal-confirm-button" onClick={performNavigation}>확인 및 주문내역으로 이동</button>
            </div>
          </div>
        ), { id: customToastId, duration: Infinity });
        
      } else {
        showToast('success', `${product.groupName} 예약이 완료되었습니다!`);
        toast.dismiss(toastId);
      }

    } catch (error: any) {
      toast.dismiss(toastId);
      showToast('error', error.message || '예약 처리 중 오류가 발생했습니다.');
    } finally {
      if (!showPrepaymentModal) {
        setIsProcessing(false);
      }
      setQuantity(1);
    }
  };

  const handleWaitlistRequest = async () => {
    if (!user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
    if (isSuspendedUser) { showToast('error', '반복적인 약속 불이행으로 참여가 제한됩니다.'); return; }
    if (isProcessing || !cardData?.singleOptionItem || !cardData.singleOptionVg) return;

    setIsProcessing(true);
    const toastId = toast.loading('대기 신청 처리 중...');
    
    const waitlistPayload = {
        productId: product.id,
        roundId: cardData.displayRound.roundId,
        variantGroupId: cardData.singleOptionVg.id,
        itemId: cardData.singleOptionItem.id,
        quantity: quantity,
    };

    try {
      await addWaitlistEntryCallable(waitlistPayload);
      toast.dismiss(toastId);
      showToast('success', `${product.groupName} 대기 신청이 완료되었습니다.`);
    } catch (error: any) {
      toast.dismiss(toastId);
      showToast('error', error.message || '대기 신청 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setQuantity(1);
    }
  };

  const showConfirmation = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPreLaunch) { showToast('info', `🛍️ 상품 예약은 ${dayjs(launchDate).format('M/D')} 정식 런칭 후 가능해요!`, 2000); return; }
    if (!cardData?.singleOptionItem) return;

    const { primaryEnd } = getDeadlines(cardData.displayRound);
    const isSecondarySale = primaryEnd ? dayjs().isAfter(primaryEnd) : false;

    if (isSecondarySale) {
        toast((t) => (
            <div className="confirmation-toast-content secondary-sale-toast">
              <Info size={44} className="toast-icon" /><h4>2차 예약 확정</h4>
              <p>{`${product.groupName} (${cardData.singleOptionItem?.name}) ${quantity}개를 예약하시겠습니까?`}</p>
              <div className="toast-warning-box"><AlertTriangle size={16} /> 2차 예약 기간에는 확정 후 취소 시 페널티가 부과될 수 있습니다.</div>
              <div className="toast-buttons">
                <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
                <button className="common-button button-accent button-medium" onClick={() => { toast.dismiss(t.id); handleImmediateOrder(); }}>확인</button>
              </div>
            </div>
          ), { 
            id: `order-confirm-secondary-${product.id}`, 
            duration: Infinity,
            className: 'transparent-toast',
           });
    } else {
        toast((t) => (
            <div className="confirmation-toast-content primary-sale-toast">
              <Info size={44} className="toast-icon" /><h4>예약 확인</h4>
              <p>{`${product.groupName} (${cardData.singleOptionItem?.name}) ${quantity}개를 예약하시겠습니까?`}</p>
              <div className="toast-buttons">
                <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
                <button className="common-button button-accent button-medium" onClick={() => { toast.dismiss(t.id); handleImmediateOrder(); }}>예약하기</button>
              </div>
            </div>
        ), { 
            id: `order-confirm-primary-${product.id}`, 
            duration: Infinity,
            className: 'transparent-toast',
        });
    }
  };
  
  const showWaitlistConfirmation = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPreLaunch) { showToast('info', `🛍️ 대기 신청은 ${dayjs(launchDate).format('M/D')} 정식 런칭 후 가능해요!`, 2000); return; }
    
    const finalVariant = cardData?.singleOptionItem;
    if (!finalVariant) return;

    toast((t) => (
      <div className="confirmation-toast-content">
        <Hourglass size={44} className="toast-icon" /><h4>대기 신청</h4>
        <p>{`${product.groupName} (${finalVariant.name}) ${quantity}개에 대해 대기 신청하시겠습니까?`}</p>
        <div className="toast-warning-box"><AlertTriangle size={16} /> 재고 확보 시 알림이 발송되며, 선착순으로 예약이 진행됩니다.</div>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-accent button-medium" onClick={() => { toast.dismiss(t.id); handleWaitlistRequest(); }}>신청</button>
        </div>
      </div>
    ), { 
        id: `waitlist-confirm-${product.id}`, 
        duration: Infinity,
        className: 'transparent-toast',
    });
  };

  if (!cardData) return null;

  const renderStockBadge = () => {
    const { isMultiOption, displayRound } = cardData;

    if (displayRound.eventType === 'CHUSEOK') {
        return (
            <span className="stock-badge event-badge-chuseok">
                <Star size={12} /> 추석특가 상품
            </span>
        );
    }

    if (isMultiOption) {
        const isDisplayableState = ['PURCHASABLE', 'WAITLISTABLE', 'REQUIRE_OPTION'].includes(actionState);
        if (!isDisplayableState) return null;

        const hasAnyLimitedStock = displayRound.variantGroups.some(vg => {
            const stockInfo = getStockInfo(vg as OriginalVariantGroup & { reservedCount?: number });
            return stockInfo.isLimited;
        });

        if (hasAnyLimitedStock) {
            return (
                <span className="stock-badge">
                    <Flame size={12} /> 한정수량 공구중!
                </span>
            );
        }
        return null;
    }

    if (actionState !== 'PURCHASABLE') return null;
    
    const stockInfo = getStockInfo(displayRound.variantGroups[0] as OriginalVariantGroup & { reservedCount?: number });

    if (!stockInfo.isLimited || stockInfo.remainingUnits <= 0) return null;
    
    return (
      <span className="stock-badge">
        <Flame size={12} /> {stockInfo.remainingUnits}개 남음
      </span>
    );
  };

  const renderActionArea = () => {
    if (isSuspendedUser) {
        return <button className="simple-card-action-btn disabled" disabled><ShieldX size={16} /> 참여 제한</button>;
    }

    if (isPreLaunch) {
        return <button className="simple-card-action-btn disabled" disabled><Calendar size={16} /> {dayjs(launchDate).format('M/D')} 오픈</button>;
    }
    
    if (cardData.isMultiOption || actionState === 'REQUIRE_OPTION') {
        return <button className="simple-card-action-btn details" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>상세보기 <ChevronRight size={16} /></button>;
    }

    if (actionState === 'WAITLISTABLE') {
        const maxQty = cardData.singleOptionItem?.limitQuantity || 99;
        return (
            <div className="single-option-controls">
                <div className="quantity-controls compact">
                    <button onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.max(1, (isNaN(q) ? 2 : q) - 1))}} className="quantity-btn" disabled={!isNaN(quantity) && quantity <= 1}><Minus size={16} /></button>
                    <input 
                      type="number" 
                      className="quantity-input" 
                      value={isNaN(quantity) ? '' : quantity}
                      onChange={(e) => handleQuantityChange(e, maxQty)}
                      onBlur={handleQuantityBlur}
                      onClick={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
                    />
                    <button onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.min(maxQty, (isNaN(q) ? 0 : q) + 1))}} className="quantity-btn" disabled={!isNaN(quantity) && quantity >= maxQty}><Plus size={16} /></button>
                </div>
                <button className="simple-card-action-btn waitlist" onClick={showWaitlistConfirmation} disabled={isProcessing}>
                    {isProcessing ? '처리중...' : <><Hourglass size={16} /> 대기 신청</>}
                </button>
            </div>
        );
    }

    if (actionState === 'PURCHASABLE') {
        const maxQty = getMaxPurchasableQuantity(cardData.singleOptionVg!, cardData.singleOptionItem!);
        return (
            <div className="single-option-controls">
                <div className="quantity-controls compact">
                    <button onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.max(1, (isNaN(q) ? 2 : q) - 1))}} className="quantity-btn" disabled={!isNaN(quantity) && quantity <= 1}><Minus size={16} /></button>
                    <input
                      type="number"
                      className="quantity-input"
                      value={isNaN(quantity) ? '' : quantity}
                      onChange={(e) => handleQuantityChange(e, maxQty)}
                      onBlur={handleQuantityBlur}
                      onClick={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
                    />
                    <button onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.min(maxQty, (isNaN(q) ? 0 : q) + 1))}} className="quantity-btn" disabled={!isNaN(quantity) && quantity >= maxQty}><Plus size={16} /></button>
                </div>
                <button className="simple-card-action-btn confirm" onClick={showConfirmation} disabled={isProcessing}>
                    {isProcessing ? '처리중...' : '예약하기'}
                </button>
            </div>
        );
    }
    
    return <button className="simple-card-action-btn details" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>상세보기 <ChevronRight size={16} /></button>;
  };
  
  const pickupDateFormatted = dayjs(safeToDate(cardData.displayRound.pickupDate)).locale('ko').format('M/D(ddd) 픽업');
  
  const isEventProduct = cardData.displayRound.eventType === 'CHUSEOK';
  const cardClassName = `simple-product-card ${isEventProduct ? 'event-card-chuseok' : ''}`;

  return (
    <div className={cardClassName} onClick={handleCardClick}>
      <div className="simple-card-main-content">
        <div className="simple-card-image-wrapper">
          <OptimizedImage originalUrl={product.imageUrls?.[0]} size='150x150' alt={product.groupName} className="simple-card-image" />
        </div>
        <div className="simple-card-info">
          <div className="info-line-1">
            <h3 className="simple-card-title">{product.groupName}</h3>
            {renderStockBadge()}
          </div>
          <p className="simple-card-price">{cardData.price.toLocaleString()}원</p>
          <p className="simple-card-pickup">{pickupDateFormatted}</p>
        </div>
      </div>
      <div className="simple-card-action-area" onClick={(e) => e.stopPropagation()}>
        {renderActionArea()}
      </div>
    </div>
  );
};

export default React.memo(SimpleProductCard);