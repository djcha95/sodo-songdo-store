// src/components/customer/SimpleProductCard.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, AlertTriangle, Info, Hourglass, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast'; 
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Product as OriginalProduct, SalesRound as OriginalSalesRound, OrderItem, VariantGroup as OriginalVariantGroup } from '@/shared/types';
import { getStockInfo, getMaxPurchasableQuantity, getDeadlines, safeToDate } from '@/utils/productUtils'; // ✅ safeToDate import
import type { ProductActionState } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import { showToast } from '@/utils/toastUtils';
import PrepaymentModal from '@/components/common/PrepaymentModal';
import './SimpleProductCard.css';
import { getUserOrders } from '@/firebase/orderService'; // 👈 [1. 추가] 주문 내역 가져오기 함수 import

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
    
    // 👇 [2. 추가] 사용자가 이미 구매한 수량을 저장할 State
    const [myPurchasedCount, setMyPurchasedCount] = useState(0);

    const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    const submitOrderCallable = useMemo(() => httpsCallable<any, any>(functions, 'submitOrder'), [functions]);

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

    // ✅ [추가] 1주년 기념 이벤트 상품인지 확인
    const isAnniversary = product.displayRound.eventType === 'ANNIVERSARY';

    // 👇 [3. 추가] 컴포넌트가 로딩될 때 내 주문 내역을 확인하는 로직 (CCTV 같은 역할)
    useEffect(() => {
        const checkMyHistory = async () => {
            // cardData가 준비되어 있고, 사용자 로그인이 되어 있을 때만 실행
            if (!user || !cardData?.singleOptionItem || !cardData?.displayRound) return;

            try {
                // 내 모든 주문 내역을 가져옴
                const myOrders = await getUserOrders(user.uid);
                
                const currentRoundId = cardData.displayRound.roundId;
                const currentItemId = cardData.singleOptionItem.id;

                // '취소되지 않은' 주문 중에서, '지금 보고 있는 상품'의 수량을 다 더함
                const totalBought = myOrders
                    .filter(o => o.status !== 'CANCELED' && o.status !== 'LATE_CANCELED') // 취소된 건 제외
                    .flatMap(o => o.items)
                    .filter(i => i.roundId === currentRoundId && i.itemId === currentItemId)
                    .reduce((sum, i) => sum + i.quantity, 0);

                setMyPurchasedCount(totalBought);
            } catch (error) {
                console.error("내 주문 내역 확인 중 오류:", error);
            }
        };

        checkMyHistory();
    }, [user, cardData]); // 유저나 상품 데이터가 바뀌면 다시 체크

    // ✅ 예약 성공 후 버튼 상태를 되돌리기 위한 useEffect
    useEffect(() => {
        if (reservationStatus === 'success') {
            // 예약 성공 후, myPurchasedCount를 업데이트 해야 정확한 한도 계산이 가능합니다.
            // 하지만 카드 컴포넌트가 재마운트 되는 경우를 대비하여 단순 리셋만 수행합니다.
            const timer = setTimeout(() => {
                setReservationStatus('idle');
                setQuantity(1); // 수량을 1로 리셋
            }, 2000); 
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
    
    // ✅ handleImmediateOrder 함수 로직 수정 (보안 강화)
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

        // 👇 [추가] 마지막으로 한 번 더 검사 (보안 철저히!)
        const limitSetting = finalVariant?.limitQuantity ?? Infinity;
        const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);

        if (quantity > myRemainingLimit) {
             showToast('error', `구매 한도 초과! 회원님은 최대 ${myRemainingLimit}개만 더 구매 가능합니다.`);
             return; // 여기서 강제로 멈춤
        }
        
        // 🚨 [주의] 재고 체크는 서버에서 한 번 더 하지만, 클라이언트 측에서도 최종 가능 수량을 계산해서 체크합니다.
        const stockMax = getMaxPurchasableQuantity(vg, finalVariant);
        const finalMaxQty = Math.min(stockMax, myRemainingLimit);

        if (quantity > finalMaxQty) {
            showToast('error', `재고 또는 구매 한도 제한으로 인해 최대 ${finalMaxQty}개까지만 구매 가능합니다.`);
            return;
        }

        setReservationStatus('processing'); // '처리 중...'으로 변경

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
            
            // ✅ [수정] 백엔드 응답을 확인하여 분기 처리
            const data = result.data as { orderIds?: string[], updatedOrderIds?: string[], message?: string };
            
            if (data.updatedOrderIds && data.updatedOrderIds.length > 0) {
                // --- (A) 수량 추가 성공 ---
                showToast('success', '기존 예약에 수량이 추가되었습니다.');
                setReservationStatus('success'); // '예약 완료' 버튼을 잠시 보여줌

            } else if (data.orderIds && data.orderIds.length > 0) {
                // --- (B) 신규 예약 성공 ---
                showToast('success', '예약이 완료되었습니다!'); // ✅ [수정] 성공 토스트 추가
                setReservationStatus('success'); // '예약 완료' 버튼
                if (prepaymentRequired) {
                    setPrepaymentPrice(totalPrice);
                    setPrepaymentModalOpen(true);
                }
                
            } else {
                 // --- (C) 실패 (재고 부족 등) ---
                throw new Error(data.message || '예약 생성에 실패했습니다. (재고 부족 또는 유효성 검사 실패)');
            }

        } catch (error: any) {
            showToast('error', error.message || '예약 처리 중 오류가 발생했습니다.');
            setReservationStatus('idle'); // 에러 발생 시 idle로 복귀
            setQuantity(1);
        }
    };
    
    // ❌ [제거] handleWaitlistRequest 함수 제거

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

    // ❌ [제거] showWaitlistConfirmation 함수 제거

    if (!cardData) return null;

    const renderStockBadge = () => {
        const { isMultiOption, displayRound } = cardData;

        if (isMultiOption) {
            // ✅ [수정] 'WAITLISTABLE' 제거
            const isDisplayableState = ['PURCHASABLE', 'REQUIRE_OPTION', 'AWAITING_STOCK'].includes(actionState); // ✅ AWAITING_STOCK 추가
            if (!isDisplayableState) return null;

            // ✅ [추가] 1차 공구 품절 상태 배지
            if (actionState === 'AWAITING_STOCK') {
                return (
                    <span className="stock-badge sold-out">
                        <Hourglass size={12} /> 1차 품절
                    </span>
                );
            }

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

        // ✅ [추가] 1차 공구 품절 상태 배지
        if (actionState === 'AWAITING_STOCK') {
            return (
                <span className="stock-badge sold-out">
                    <Hourglass size={12} /> 1차 품절
                </span>
            );
        }
        
        // ✨ 구매 가능 상태일 때만 재고/한정수량 배지를 보여줍니다.
        if (actionState !== 'PURCHASABLE') return null;

        const stockInfo = getStockInfo(displayRound.variantGroups[0] as OriginalVariantGroup & { reservedCount?: number });
        if (!stockInfo.isLimited || stockInfo.remainingUnits <= 0) return null;
        
        if (stockInfo.remainingUnits <= 10) {
            // 10개 이하: 남은 수량 표시 (로우 스톡 강조)
            return (
                <span className="stock-badge">
                    <Flame size={12} /> {stockInfo.remainingUnits}개 남음
                </span>
            );
        } else {
            // 11개 이상: '한정수량' 텍스트 표시
            return (
                <span className="stock-badge">
                    <Flame size={12} /> 한정수량
                </span>
            );
        }
    };

    const renderActionArea = () => {
        if (cardData.isMultiOption || actionState === 'REQUIRE_OPTION') {
            return <button className="simple-card-action-btn details" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>상세보기 <ChevronRight size={16} /></button>;
        }

        // ❌ [제거] 'WAITLISTABLE' 상태 블록 제거

        if (actionState === 'PURCHASABLE') {
            // 1. 재고 기준 최대 수량
            const stockMax = getMaxPurchasableQuantity(cardData.singleOptionVg!, cardData.singleOptionItem!);
            
            // 👇 [수정] 관리자가 설정한 1인당 제한 수량 (설정 안 했으면 무제한)
            const limitSetting = cardData.singleOptionItem?.limitQuantity ?? Infinity;
            
            // 👇 [수정] 내가 앞으로 더 살 수 있는 수량 = (제한 - 이미 산 거)
            const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);

            // 👇 [수정] 최종적으로 입력 가능한 최대값 (재고랑 내 남은 한도 중 더 작은 거)
            const finalMaxQty = Math.min(stockMax, myRemainingLimit);

            // ✨ [핵심] 한도가 있고(무제한 아니고), 남은 게 0개 이하면 -> '구매 완료' 버튼 보여주기
            if (limitSetting !== Infinity && myRemainingLimit <= 0) {
                return (
                    <button className="simple-card-action-btn disabled" disabled>
                        <CheckCircle size={16} /> 예약 완료! ({limitSetting}개 구매함)
                    </button>
                );
            }
            
            // 구매 가능할 때 버튼 내용
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
                            // 👇 [수정] quantity가 1보다 작거나 finalMaxQty보다 크면 1로 리셋
                            onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.max(1, (isNaN(q) ? 2 : q) - 1))}} 
                            className="quantity-btn" 
                            disabled={reservationStatus !== 'idle' || (!isNaN(quantity) && quantity <= 1)}
                        ><Minus size={16} /></button>
                        
                        <input
                            type="number"
                            className="quantity-input"
                            value={isNaN(quantity) ? '' : quantity}
                            // 👇 [수정] 직접 입력할 때도 finalMaxQty 못 넘기게 막음
                            onChange={(e) => handleQuantityChange(e, finalMaxQty)} 
                            onBlur={handleQuantityBlur}
                            onClick={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
                            disabled={reservationStatus !== 'idle'}
                        />

                        <button 
                            // 👇 [수정] finalMaxQty를 넘지 않도록 제한
                            onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.min(finalMaxQty, (isNaN(q) ? 0 : q) + 1))}} 
                            className="quantity-btn" 
                            disabled={reservationStatus !== 'idle' || (!isNaN(quantity) && quantity >= finalMaxQty)}
                        ><Plus size={16} /></button>
                    </div>
                    
                    <button 
                        className={`simple-card-action-btn confirm ${reservationStatus !== 'idle' ? 'processing' : ''}`} 
                        onClick={showConfirmation} 
                        // 👇 [수정] 더 살 수 있는 게 없으면 버튼 비활성화
                        disabled={reservationStatus !== 'idle' || finalMaxQty === 0} 
                    >
                        {finalMaxQty === 0 ? '재고 없음' : getButtonContent()}
                    </button>
                </div>
            );
        }

        // ✅ [추가] 1차 공구 품절 (AWAITING_STOCK) 시 '품절 (상세보기)' 버튼
        if (actionState === 'AWAITING_STOCK') {
             return <button className="simple-card-action-btn details sold-out" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>품절 (상세보기) <ChevronRight size={16} /></button>;
        }

        if (actionState === 'ENDED') {
            // ✅ [수정] '품절' -> '전량 마감'
            return <button className="simple-card-action-btn sold-out" disabled>전량 마감</button>;
        }
        
        return <button className="simple-card-action-btn details" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>상세보기 <ChevronRight size={16} /></button>;
    };

    const pickupDateFormatted = dayjs(safeToDate(cardData.displayRound.pickupDate)).locale('ko').format('M/D(ddd) 픽업');

    return (
        <>
            <div 
                className={`simple-product-card ${isAnniversary ? 'anniversary-glow' : ''}`} // ✅ [수정] 1주년 효과 클래스 추가
                onClick={handleCardClick}
            >
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