// src/components/customer/ModernProductCard.tsx

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Check, CheckCircle2, Plus, Minus, Gift } from 'lucide-react';
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
// ✅ [추가] ConfirmModal import
import ConfirmModal from '@/components/common/ConfirmModal'; // 경로에 맞게 수정
// ✅ [Refactor] getUserOrders 제거
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import '@/styles/ModernProduct.css';

// 타입 확장
type Product = OriginalProduct & {
  displayRound: OriginalSalesRound;
  isPreorder?: boolean;
};

interface ModernProductCardProps {
  product: Product;
  actionState: ProductActionState;
  phase: 'primary' | 'secondary' | 'onsite';
  isPreorder?: boolean;
  // ✅ [Refactor] props 추가
  myPurchasedCount?: number;
  onPurchaseComplete?: () => void;
}

const ModernProductCard: React.FC<ModernProductCardProps> = ({
  product,
  actionState,
  phase,
  isPreorder: propIsPreorder = false,
  myPurchasedCount = 0, // ✅ [Refactor] 부모로부터 전달받음 (기본값 0)
  onPurchaseComplete,
}) => {
  const navigate = useNavigate();
  const { user, userDocument } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [isPrepaymentModalOpen, setPrepaymentModalOpen] = useState(false);
  const [prepaymentPrice, setPrepaymentPrice] = useState(0);
  const [reservationStatus, setReservationStatus] =
    useState<'idle' | 'processing' | 'success'>('idle');
  // ✅ [추가] 확인 모달 상태
  const [isConfirmOpen, setConfirmOpen] = useState(false);


  // ✅ [Refactor] 내부 상태 myPurchasedCount 및 관련 useEffect 제거됨

  const functions = useMemo(
    () => getFunctions(getApp(), 'asia-northeast3'),
    []
  );
  const submitOrderCallable = useMemo(
    () => httpsCallable<any, any>(functions, 'submitOrder'),
    [functions]
  );

  const isPreorder = product.isPreorder || propIsPreorder;

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

  const eventLabel = useMemo(() => {
    const type = (product.displayRound as any)?.eventType as string | undefined;

    if (isPreorder) return '사전예약';
    
    switch (type) {
      case 'ANNIVERSARY': return '1주년 기념';
      case 'CHUSEOK': return '추석 특집';
      case 'CHRISTMAS': return '크리스마스 특가';
      case 'COSMETICS': return '뷰티 특가';
      default: return null;
    }
  }, [product.displayRound, isPreorder]);

  // 1️⃣ [수정] 기존 handleImmediateOrder -> 버튼 클릭 시 유효성 검사 후 '모달만 켬'
  const handlePreCheck = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    // 현장판매, 로그인 체크 등 유효성 검사는 여기서 먼저 수행
    if (phase === 'onsite') { showToast('info', '매장에서 직접 구매해주세요!'); return; }
    if (!user || !userDocument) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
    if (cardData?.isMultiOption) { navigate(`/product/${product.id}`); return; }

    const finalVariant = cardData?.singleOptionItem;
    const vg = cardData?.singleOptionVg;
    if (!finalVariant || !vg) return;

    // 수량 체크
    const limitSetting = finalVariant?.limitQuantity ?? Infinity;
    // ✅ [Refactor] Prop으로 받은 myPurchasedCount 사용
    const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);
    
    if (quantity > myRemainingLimit) { showToast('error', '구매 한도 초과!'); return; }
    const stockMax = getMaxPurchasableQuantity(vg, finalVariant);
    const finalMaxQty = Math.min(stockMax, myRemainingLimit);
    if (quantity > finalMaxQty) { showToast('error', '재고 부족!'); return; }

    // ✅ 모든 검사 통과 시 모달 열기
    setConfirmOpen(true);
  };
  
  // 2️⃣ [추가] 실제 서버 통신 (모달에서 '네' 눌렀을 때 실행)
  const executeOrder = async () => {
    // 기존 handleImmediateOrder의 뒷부분 로직을 여기로 가져옴
    const finalVariant = cardData?.singleOptionItem;
    const vg = cardData?.singleOptionVg;
    if (!finalVariant || !vg) return;

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
        isPrepaymentRequired: cardData.displayRound.isPrepaymentRequired ?? false,
      };
      const orderPayload = {
        userId: user!.uid, // handlePreCheck에서 user 체크를 하므로 non-null assertion 사용
        items: [orderItem],
        totalPrice,
        customerInfo: { name: user!.displayName || '미상', phone: userDocument?.phone || '' },
        pickupDate: cardData.displayRound.pickupDate,
        wasPrepaymentRequired: prepaymentRequired,
        notes: '빠른 구매',
      };
      
      const result = await submitOrderCallable(orderPayload);
      const data = result.data as any;

      if (data.updatedOrderIds || data.orderIds) {
        // ✅ 성공 시 모달 닫기 + 성공 메시지
        setConfirmOpen(false); // 모달 닫기
        
        // 안심 문구로 변경
        showToast('success', '예약 완료! 내역에서 취소 가능해요 🙆‍♀️');
        
        setReservationStatus('success');
        setQuantity(1);
        
        // ✅ [Refactor] 구매 완료 후 부모에게 알림 (목록 갱신)
        if (onPurchaseComplete) onPurchaseComplete();

        setTimeout(() => setReservationStatus('idle'), 1500);
        
        if (data.orderIds && prepaymentRequired) {
           // 선결제 모달 로직 유지
          setPrepaymentPrice(totalPrice);
          setPrepaymentModalOpen(true);
        }
      } else { throw new Error(data.message || '실패'); }
    } catch (error: any) {
      showToast('error', error.message || '오류 발생');
      setReservationStatus('idle');
      setConfirmOpen(false); // 에러나면 모달 닫기
    }
  };

  if (!cardData) return null;

  const { primaryEnd, secondaryEnd } = getDeadlines(cardData.displayRound);
  const pickupDate = safeToDate(cardData.displayRound.pickupDate);
  const pickupText = pickupDate ? dayjs(pickupDate).locale('ko').format('M/D(ddd) 픽업') : '';
  let deadlineText = '';
  let isUrgent = false;
  if (phase === 'primary' && primaryEnd) {
    const isToday = primaryEnd.isSame(dayjs(), 'day');
    deadlineText = `${isToday ? '오늘' : '내일'} ${primaryEnd.format('HH:mm')} 마감`;
    isUrgent = primaryEnd.diff(dayjs(), 'hour') < 6;
  } else if (phase === 'secondary' && secondaryEnd) {
    deadlineText = `${secondaryEnd.locale('ko').format('M/D(ddd) HH:mm')} 마감`;
  }

  const stockInfo = cardData.singleOptionVg ? getStockInfo(cardData.singleOptionVg) : null;
  const isUnlimited = !stockInfo?.isLimited;
  const currentStock = stockInfo?.remainingUnits ?? 0;
  const maxStock = 50;
  const progressPercent = Math.min(100, Math.max(0, ((maxStock - currentStock) / maxStock) * 100));

  const limitSetting = cardData.singleOptionItem?.limitQuantity ?? Infinity;
  // ✅ [Refactor] Prop 사용
  const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);
  const finalMaxQty = Math.min(stockInfo?.remainingUnits ?? Infinity, myRemainingLimit);
  const isControlsDisabled = reservationStatus === 'processing' || finalMaxQty <= 0;

  return (
    <>
      <div
        className={`songdo-card ${phase} ${isPreorder ? 'preorder-card' : ''}`}
        onClick={() => navigate(`/product/${product.id}`)}
      >
        <div className="santa-hat-overlay" /> 

        <div className="songdo-card-header">
          <div className="songdo-card-thumb">
            <OptimizedImage
              originalUrl={product.imageUrls?.[0]}
              size="200x200"
              alt={product.groupName}
              className="songdo-img"
            />
            {isPreorder && (
               <div className="preorder-badge-overlay">🎄 CHRISTMAS PRE-ORDER</div>
            )}
          </div>

          <div className="songdo-card-info-text">
            <div className="songdo-tags">
              {eventLabel && <span className="tag event">🎅 {eventLabel}</span>}
              
              {!eventLabel && phase === 'primary' && <span className="tag primary">🔥 핫딜</span>}
              {!eventLabel && phase === 'secondary' && <span className="tag secondary">🦌 막차</span>}
              {!eventLabel && phase === 'onsite' && <span className="tag onsite">🎁 매장</span>}
              
              {phase !== 'onsite' && (
                <span className={`deadline-text ${isUrgent ? 'urgent' : ''}`}>
                  {deadlineText}
                </span>
              )}
            </div>

            <h3 className="songdo-title">{product.groupName}</h3>

            {pickupText && phase !== 'onsite' && (
              <div className="pickup-info-text" style={{color: '#165B33'}}>🦌 {pickupText}</div>
            )}

            {phase !== 'onsite' && (
              <div className="stock-status-area">
                {!isUnlimited ? (
                  <>
                    <div className="stock-bar-bg">
                      <div className={`stock-bar-fill ${phase}`} style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className={`stock-text ${phase}`}>🎁 {currentStock}개 남음</span>
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

            <div className="price-area">
              <span className={`price-label ${phase}`}>{phase === 'onsite' ? '현장특가' : '성탄특가'}</span>
              <span className="price" style={{fontWeight: 900}}>{cardData.price.toLocaleString()}</span>
              <span className="unit">원</span>
            </div>
          </div>
        </div>
        
        <hr style={{border: '0', borderTop: '1px solid #F1F5F9', margin: '0 0 4px 0'}}/>

        <div className="songdo-card-bottom-row controls-only" onClick={(e) => e.stopPropagation()}>
          {phase === 'onsite' ? (
            <button className="btn-onsite-simple" disabled>🎄 매장에서 만나요</button>
          ) : (
            <div className="qty-control-group">
              <div className="qty-stepper">
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={isControlsDisabled || quantity <= 1}
                >
                  <Minus size={16} />
                </button>
                <div className="qty-val">{quantity}</div>
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => Math.min(finalMaxQty || 1, q + 1))}
                  disabled={isControlsDisabled || quantity >= finalMaxQty}
                >
                  <Plus size={16} />
                </button>
              </div>

              <button
  className={`btn-cart ${reservationStatus === 'success' ? 'success' : ''}`}
  onClick={handlePreCheck}
  disabled={reservationStatus === 'processing'}
>
  {reservationStatus === 'processing' ? (
    '...'
  ) : reservationStatus === 'success' ? (
    <Check size={20} />
  ) : (
    <Gift size={24} strokeWidth={2.5} />
  )}
</button>
            </div>
          )}
        </div>
      </div>
      
      {/* ✅ [추가] 확인 모달 컴포넌트 삽입 */}
      {cardData?.singleOptionItem && (
        <ConfirmModal 
          isOpen={isConfirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={executeOrder}
          productName={product.groupName}
          price={cardData.price}
          quantity={quantity}
          loading={reservationStatus === 'processing'}
        />
      )}

      {/* 기존 선결제 모달 유지 */}
      <PrepaymentModal
        isOpen={isPrepaymentModalOpen}
        totalPrice={prepaymentPrice}
        onClose={() => setPrepaymentModalOpen(false)}
      />
    </>
  );
};

export default React.memo(ModernProductCard);