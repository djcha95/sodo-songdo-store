// src/components/customer/SimpleProductCard.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, AlertTriangle, Info, Hourglass, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast'; // react-hot-toast는 여전히 confirmation에 사용되므로 유지
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Product as OriginalProduct, SalesRound as OriginalSalesRound, OrderItem, VariantGroup as OriginalVariantGroup } from '@/shared/types';
import { getStockInfo, getMaxPurchasableQuantity, getDeadlines } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import { showToast } from '@/utils/toastUtils';
import PrepaymentModal from '@/components/common/PrepaymentModal';
import './SimpleProductCard.css';

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date; // 이미 Date 객체이면 그대로 반환
  if (typeof date.toDate === 'function') return date.toDate(); // Timestamp 객체이면 변환
  return null;
};

type Product = OriginalProduct & {
    displayRound: OriginalSalesRound;
}

interface SimpleProductCardProps {
    product: Product;
    actionState: ProductActionState;
}

const SimpleProductCard: React.FC<SimpleProductCardProps> = ({ product, actionState }) => {
    const navigate = useNavigate();
    const { user, userDocument } = useAuth();

    const [quantity, setQuantity] = useState(1);
    const [isPrepaymentModalOpen, setPrepaymentModalOpen] = useState(false);
    const [prepaymentPrice, setPrepaymentPrice] = useState(0);

    // ✅ 예약 상태를 관리하기 위한 새 state
    const [reservationStatus, setReservationStatus] = useState<'idle' | 'processing' | 'success'>('idle');

    const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    // ❌ validateCartCallable 제거
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

    // ✅ 예약 성공 후 버튼 상태를 되돌리기 위한 useEffect
    useEffect(() => {
        if (reservationStatus === 'success') {
            const timer = setTimeout(() => {
                setReservationStatus('idle');
                setQuantity(1); // 수량을 1로 리셋
            }, 2000); // 2초 후 '예약하기'로 복귀
            return () => clearTimeout(timer);
        }
    }, [reservationStatus]);

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
    
    // ✅ handleImmediateOrder 함수 로직 수정
    const handleImmediateOrder = async () => {
        if (!user || !userDocument) {
            showToast('error', '로그인이 필요합니다.');
            navigate('/login');
            return;
        }
        if (reservationStatus !== 'idle' || !cardData) return;

        const finalVariant = cardData.singleOptionItem;
        const vg = cardData.singleOptionVg;
        if (!finalVariant || !vg) {
            showToast('error', '상품 정보를 찾을 수 없습니다.');
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

            const result = await submitOrderCallable(orderPayload);

            // 백엔드 응답에서 'orderIds'를 확인합니다.
            if (!result.data.orderIds || result.data.orderIds.length === 0) {
                // 이 에러는 클라우드 함수 내부 검증 오류일 가능성이 높음
                throw new Error(result.data.message || '예약 생성에 실패했습니다. (재고 부족 또는 유효성 검사 실패)');
            }

            setReservationStatus('success');

            if (prepaymentRequired) {
                setPrepaymentPrice(totalPrice);
                setPrepaymentModalOpen(true);
            } else {
                // 예약 완료 메시지는 success 상태 후 2초 뒤에 자연스럽게 사라지므로,
                // 별도의 success toast는 필요하지 않음.
            }

        } catch (error: any) {
            showToast('error', error.message || '예약 처리 중 오류가 발생했습니다.');
            setReservationStatus('idle');
            setQuantity(1);
        }
    };

    const handleWaitlistRequest = async () => {
        if (!user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
        if (reservationStatus !== 'idle' || !cardData?.singleOptionItem || !cardData.singleOptionVg) return;

        setReservationStatus('processing');
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
            setReservationStatus('success');
            // 대기 신청은 예약 완료 버튼 대신 success 토스트 후 바로 idle로 복귀
        } catch (error: any) {
            toast.dismiss(toastId);
            showToast('error', error.message || '대기 신청 중 오류가 발생했습니다.');
            setReservationStatus('idle');
        } finally {
            // 대기 신청은 성공/실패 여부와 관계없이 항상 상태를 초기화합니다.
            setReservationStatus('idle');
            setQuantity(1);
        }
    };

    const showConfirmation = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!cardData?.singleOptionItem || reservationStatus !== 'idle') return;

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
        const finalVariant = cardData?.singleOptionItem;
        if (!finalVariant || reservationStatus !== 'idle') return;

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
                    <button 
                        className="simple-card-action-btn waitlist" 
                        onClick={showWaitlistConfirmation} 
                        disabled={reservationStatus !== 'idle'}
                    >
                        {reservationStatus === 'processing' ? '처리중...' : <><Hourglass size={16} /> 대기 신청</>}
                    </button>
                </div>
            );
        }

        if (actionState === 'PURCHASABLE') {
            const maxQty = getMaxPurchasableQuantity(cardData.singleOptionVg!, cardData.singleOptionItem!);
            
            const getButtonContent = () => {
                switch (reservationStatus) {
                    case 'processing': return '처리 중...';
                    case 'success': return <><CheckCircle size={16} /> 예약 완료</>;
                    default: return '예약하기';
                }
            };
            
            return (
                <div className="single-option-controls">
                    <div className="quantity-controls compact">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.max(1, (isNaN(q) ? 2 : q) - 1))}} 
                            className="quantity-btn" 
                            disabled={reservationStatus !== 'idle' || (!isNaN(quantity) && quantity <= 1)}
                        ><Minus size={16} /></button>
                        <input
                            type="number"
                            className="quantity-input"
                            value={isNaN(quantity) ? '' : quantity}
                            onChange={(e) => handleQuantityChange(e, maxQty)}
                            onBlur={handleQuantityBlur}
                            onClick={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
                            disabled={reservationStatus !== 'idle'}
                        />
                        <button 
                            onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.min(maxQty, (isNaN(q) ? 0 : q) + 1))}} 
                            className="quantity-btn" 
                            disabled={reservationStatus !== 'idle' || (!isNaN(quantity) && quantity >= maxQty)}
                        ><Plus size={16} /></button>
                    </div>
                    <button 
                        className={`simple-card-action-btn confirm ${reservationStatus !== 'idle' ? 'processing' : ''}`} 
                        onClick={showConfirmation} 
                        disabled={reservationStatus !== 'idle'}
                    >
                        {getButtonContent()}
                    </button>
                </div>
            );
        }

        if (actionState === 'ENDED') {
            return <button className="simple-card-action-btn sold-out" disabled>품절</button>;
        }
        
        return <button className="simple-card-action-btn details" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>상세보기 <ChevronRight size={16} /></button>;
    };

    const pickupDateFormatted = dayjs(safeToDate(cardData.displayRound.pickupDate)).locale('ko').format('M/D(ddd) 픽업');

    return (
        <>
            <div className="simple-product-card" onClick={handleCardClick}>
                <div className="simple-card-main-content">
                    <div className="simple-card-image-wrapper">
                        <OptimizedImage originalUrl={product.imageUrls?.[0]} size='150x150' alt={product.groupName} className="simple-card-image" />
                    </div>
                    <div className="simple-card-info">
                        <div className="info-line-1">
                            <h3 className="simple-card-title">{product.groupName}</h3>
                            {renderStockBadge()}
                        </div>
                        <p className="simple-card-price">{`${cardData.price.toLocaleString()}원`}</p>
                        <p className="simple-card-pickup">{pickupDateFormatted}</p>
                    </div>
                </div>
                <div className="simple-card-action-area" onClick={(e) => e.stopPropagation()}>
                    {renderActionArea()}
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

export default React.memo(SimpleProductCard);