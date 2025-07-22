// src/pages/customer/CartPage.tsx

import React, { useState, useMemo, useRef, useEffect, useCallback, startTransition } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, Order, OrderItem } from '@/types';
import { submitOrder, getLiveStockForItems, getReservedQuantitiesMap, addWaitlistEntry } from '@/firebase';
import { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Plus, Minus, CalendarDays, Hourglass, Info, RefreshCw, XCircle, AlertTriangle, ShieldX, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import './CartPage.css';


const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  return null;
};

// ✅ [수정] 각 토스트 알림이 독립적으로 3초 후에 확실히 사라지도록 구현을 변경합니다.
const showToast = (type: 'success' | 'error' | 'info' | 'blank', message: string | React.ReactNode, duration: number = 3000) => {
  // 고유한 ID로 토스트를 생성하고, setTimeout으로 직접 해제하여 타이머 충돌을 방지합니다.
  const toastId = toast[type](message, { duration: Infinity });
  setTimeout(() => {
    toast.dismiss(toastId);
  }, duration);
};

const CartItemCard: React.FC<{ item: CartItem; isSelected: boolean; onSelect: (id: string) => void; onImageClick: (e: React.MouseEvent, id: string) => void; isStockExceeded?: boolean; }> = ({ item, isSelected, onSelect, onImageClick, isStockExceeded = false }) => {
  const { updateCartItemQuantity } = useCart();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(item.quantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const stockLimit = useMemo(() => item.stock === null || item.stock === -1 ? 999 : item.stock, [item.stock]);

  useEffect(() => { if (!isEditing) setInputValue(item.quantity.toString()); }, [item.quantity, isEditing]);
  useEffect(() => { if (isEditing && inputRef.current) inputRef.current.focus(); }, [isEditing]);
  
  const handleQuantityClick = (e: React.MouseEvent) => { e.stopPropagation(); setIsEditing(true); };
  const handleQuantityUpdate = useCallback(() => {
    const newQuantity = parseInt(inputValue, 10);
    const finalQuantity = !isNaN(newQuantity) && newQuantity > 0 ? Math.min(newQuantity, stockLimit) : 1;
    if (finalQuantity !== item.quantity) {
      updateCartItemQuantity(item.id, finalQuantity);
      if (newQuantity > stockLimit) showToast('error', `최대 ${stockLimit}개까지만 구매 가능합니다.`);
      else if (newQuantity < 1) showToast('error', '최소 1개 이상 구매해야 합니다.');
    }
    setIsEditing(false);
  }, [inputValue, item.id, item.quantity, stockLimit, updateCartItemQuantity]);
  
  const handleInputKeyDown = (event: React.KeyboardEvent) => { if (event.key === 'Enter') handleQuantityUpdate(); };

  const createQuantityHandlers = useCallback((change: number) => {
    const performUpdate = () => {
      const newQuantity = item.quantity + change;
      if (newQuantity < 1 || newQuantity > stockLimit) return;
      updateCartItemQuantity(item.id, newQuantity);
    };
    return useLongPress(performUpdate, performUpdate, { delay: 100 });
  }, [item, stockLimit, updateCartItemQuantity]);

  const decreaseHandlers = createQuantityHandlers(-1);
  const increaseHandlers = createQuantityHandlers(1);

  const formatPickupDate = (dateValue: any) => {
    const date = safeToDate(dateValue);
    if (!date) return '날짜 정보 없음';
    return format(date, 'M/d(EEE)', { locale: ko }) + ' 픽업';
  }

  return (
    <div className={`cart-item-card ${isSelected ? 'selected' : ''} ${isStockExceeded ? 'stock-exceeded' : ''}`} onClick={() => onSelect(item.id)}>
      <div className="item-image-wrapper" onClick={(e) => onImageClick(e, item.productId)}>
        <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
      </div>
      <div className="item-details-wrapper">
        <div className="item-header">
            <div className="item-name-group">
                <span className="item-product-name">{item.variantGroupName}</span>
                <span className="item-option-name">선택: {item.itemName}</span>
            </div>
            <div className="item-pickup-info"><CalendarDays size={14} /><span>{formatPickupDate(item.pickupDate)}</span></div>
        </div>
        <div className="item-footer">
            {item.status === 'WAITLIST' ? (
              <div className="waitlist-status-badge"><Info size={14}/><span>재고 확보 시 자동 예약 전환</span></div>
            ) : (
              <div className="item-total-price">{item.unitPrice.toLocaleString()}원</div>
            )}
            <div className="item-quantity-controls" onClick={(e) => e.stopPropagation()}>
              <button {...decreaseHandlers} disabled={item.quantity <= 1}><Minus size={18} /></button>
              {isEditing ? (
                <input ref={inputRef} type="number" className="quantity-input" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onBlur={handleQuantityUpdate} onKeyDown={handleInputKeyDown} />
              ) : (
                <span className="quantity-display" onClick={handleQuantityClick}>{item.quantity}</span>
              )}
              <button {...increaseHandlers} disabled={item.quantity >= stockLimit}><Plus size={18} /></button>
            </div>
        </div>
      </div>
    </div>
  );
};


const CartPage: React.FC = () => {
  const { user, userDocument, isSuspendedUser } = useAuth();
  const { allItems, reservationItems, waitlistItems, removeItems, updateCartItemQuantity, reservationTotal } = useCart();
  const navigate = useNavigate();

  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [selectedReservationKeys, setSelectedReservationKeys] = useState<Set<string>>(new Set());
  const [selectedWaitlistKeys, setSelectedWaitlistKeys] = useState<Set<string>>(new Set());
  const [stockExceededKeys, setStockExceededKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (reservationItems.length === 0) {
      setIsSyncing(false);
      return;
    }
    const checkStockAndAdjust = async () => {
      setIsSyncing(true);
      setStockExceededKeys(new Set()); 
      try {
        const [liveStockInfo, reservedMap] = await Promise.all([ getLiveStockForItems(reservationItems), getReservedQuantitiesMap() ]);
        const exceededKeys = new Set<string>();
        for (const item of reservationItems) {
          const itemKey = item.id;
          const productStockInfo = liveStockInfo[`${item.productId}-${item.variantGroupId}-${item.itemId}`];
          const groupReservedKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          const groupTotalStock = productStockInfo?.groupStock;
          const groupReservedQuantity = reservedMap.get(groupReservedKey) || 0;
          let availableStock = Infinity;
          if(groupTotalStock !== null && groupTotalStock !== -1) availableStock = groupTotalStock - groupReservedQuantity;
          if (item.quantity > availableStock) {
            const adjustedQuantity = Math.max(0, Math.floor(availableStock));
            if (adjustedQuantity > 0) {
              updateCartItemQuantity(itemKey, adjustedQuantity);
              showToast('error', `'${item.variantGroupName}' 재고 부족으로 수량이 ${adjustedQuantity}개로 자동 조정되었습니다.`);
            } else {
               removeItems([itemKey]);
               showToast('error', `'${item.variantGroupName}' 재고가 모두 소진되어 장바구니에서 삭제됩니다.`);
            }
            exceededKeys.add(itemKey);
          }
        }
        setStockExceededKeys(exceededKeys);
      } catch (error) {
        console.error("재고 확인 중 오류:", error);
        showToast('error', "재고를 확인하는 중 문제가 발생했습니다.");
      } finally { setIsSyncing(false); }
    };
    checkStockAndAdjust();
  }, [allItems.length, removeItems, reservationItems, updateCartItemQuantity]);

  const handleItemSelect = useCallback((itemKey: string, type: 'reservation' | 'waitlist') => {
    const setter = type === 'reservation' ? setSelectedReservationKeys : setSelectedWaitlistKeys;
    setter(prev => { const newSet = new Set(prev); if (newSet.has(itemKey)) newSet.delete(itemKey); else newSet.add(itemKey); return newSet; });
  }, []);
  
  const handleBulkRemove = useCallback((type: 'reservation' | 'waitlist') => {
    const keysToRemove = type === 'reservation' ? selectedReservationKeys : selectedWaitlistKeys;
    if (keysToRemove.size === 0) { showToast('info', '삭제할 상품을 선택해주세요.'); return; }
    toast((t) => (
      <div className="confirmation-toast-content">
        <AlertTriangle size={44} className="toast-icon" style={{ color: 'var(--danger-color)' }} />
        <h4>선택 상품 삭제</h4><p>{keysToRemove.size}개의 상품을 장바구니에서 삭제하시겠습니까?</p>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-danger button-medium" onClick={() => {
              toast.dismiss(t.id); removeItems(Array.from(keysToRemove));
              if (type === 'reservation') setSelectedReservationKeys(new Set()); else setSelectedWaitlistKeys(new Set());
              showToast('success', '선택된 상품이 삭제되었습니다.');
          }}>삭제</button>
        </div>
      </div>
    ), { id: 'bulk-delete-confirmation', style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  }, [selectedReservationKeys, selectedWaitlistKeys, removeItems]);

  const handleImageClick = useCallback((e: React.MouseEvent, productId: string) => { e.stopPropagation(); navigate(`/product/${productId}`); }, [navigate]);
  
  const finalStockCheck = async (): Promise<boolean> => {
    if (reservationItems.length === 0) return true; // 예약 상품 없으면 재고 체크 통과
    setIsSyncing(true);
    try {
      const [liveStockInfo, reservedMap] = await Promise.all([ getLiveStockForItems(reservationItems), getReservedQuantitiesMap() ]);
      for (const item of reservationItems) {
        const productStockInfo = liveStockInfo[`${item.productId}-${item.variantGroupId}-${item.itemId}`];
        const groupReservedKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const groupTotalStock = productStockInfo?.groupStock;
        const groupReservedQuantity = reservedMap.get(groupReservedKey) || 0;
        let availableStock = Infinity;
        if (groupTotalStock !== null && groupTotalStock !== -1) availableStock = groupTotalStock - groupReservedQuantity;
        if (item.quantity > availableStock) {
          showToast('error', (<div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontWeight: '600' }}>'{item.variantGroupName}' 재고가 부족합니다.</p><p style={{ margin: '4px 0 0', fontWeight: 400, opacity: 0.8 }}>(현재 ${availableStock}개 구매 가능)</p></div>));
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error("최종 재고 확인 중 오류:", error);
      showToast('error', "재고 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    } finally { setIsSyncing(false); }
  };

  const doesCartRequirePrepayment = useMemo(() => {
    return reservationItems.some(item => item.isPrepaymentRequired);
  }, [reservationItems]);

  const handleConfirmReservation = async () => {
    if (!user || !user.uid) {
      showToast('error', '요청을 확정하려면 로그인이 필요합니다.');
      navigate('/login', { state: { from: '/cart' }, replace: true });
      return;
    }
    if (isSuspendedUser) {
      showToast('error', '반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    if (isProcessingOrder || allItems.length === 0) return;

    const isStockSufficient = await finalStockCheck();
    if (!isStockSufficient) return;

    setIsProcessingOrder(true);

    const orderPayload = reservationItems.length > 0 ? (() => {
      const orderItems: OrderItem[] = reservationItems.map(item => ({ ...item, arrivalDate: null, pickupDeadlineDate: null }));
      const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
      const prepaymentRequired = isWarningUser || doesCartRequirePrepayment;
      return {
        userId: user!.uid,
        items: orderItems,
        totalPrice: reservationTotal,
        customerInfo: { name: user!.displayName || '미상', phone: userDocument?.phone || '' },
        pickupDate: reservationItems[0].pickupDate,
        wasPrepaymentRequired: prepaymentRequired,
      } as Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'>;
    })() : null;

    const allPromises: Promise<any>[] = [];
    if (orderPayload) {
      allPromises.push(submitOrder(orderPayload));
    }
    waitlistItems.forEach(item => {
      allPromises.push(addWaitlistEntry(item.productId, item.roundId, user.uid, item.quantity, item.variantGroupId, item.itemId));
    });

    toast.promise(Promise.all(allPromises), {
      loading: '요청을 처리하는 중입니다...',
      success: () => {
        const prepaymentRequired = orderPayload?.wasPrepaymentRequired ?? false;
        if (prepaymentRequired) {
          toast.custom((t) => (
            <div className="prepayment-modal-overlay">
              <div className={`prepayment-modal-content ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
                <div className="toast-icon-wrapper">
                  <Banknote size={48} />
                </div>
                <h4>⚠️ 선입금 후 예약이 확정됩니다</h4>
                <p>
                  '주의 요망' 등급이거나 선입금 필수 상품이 포함되어 있습니다. <br/>
                  아래 계좌로 입금 후 채널톡으로 내역을 보내주세요.
                </p>
                <div className="bank-info">
                  <strong>카카오뱅크 3333-12-3456789 (소도몰)</strong>
                  <div className="price-to-pay">입금할 금액: <strong>{reservationTotal.toLocaleString()}원</strong></div>
                </div>
                <small>관리자가 확인 후 예약을 확정 처리해 드립니다.</small>
                <button 
                  className="modal-confirm-button" 
                  onClick={() => {
                    toast.dismiss(t.id);
                    startTransition(() => {
                      removeItems(allItems.map(i => i.id));
                      navigate('/mypage/history');
                    });
                  }}
                >
                  확인 및 주문내역으로 이동
                </button>
              </div>
            </div>
          ), { id: 'prepayment-toast', duration: Infinity });
          return '';
        } else {
          startTransition(() => {
            removeItems(allItems.map(i => i.id));
            navigate('/mypage/history');
          });
          const message = reservationItems.length > 0 && waitlistItems.length > 0
            ? '예약 및 대기 신청이 모두 완료되었습니다!'
            : reservationItems.length > 0
            ? '예약이 성공적으로 완료되었습니다!'
            : '대기 신청이 성공적으로 완료되었습니다!';
          return message;
        }
      },
      error: (err) => (err as Error).message || '요청 처리 중 오류가 발생했습니다.',
    }, {
      success: { duration: 3000 },
      error: { duration: 3000 }
    }).finally(() => {
      setIsProcessingOrder(false);
    });
  };

  const showOrderConfirmation = () => {
    if (allItems.length === 0) {
      showToast('error', '장바구니가 비어있습니다.');
      return;
    }
    if (isSuspendedUser) {
      showToast('error', '반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    
    const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
    const needsPrepayment = isWarningUser || doesCartRequirePrepayment;
    
    const title = needsPrepayment ? '선입금 안내' : '요청 확정';
    
    let message = '';
    if(reservationItems.length > 0 && waitlistItems.length > 0) message = '예약 상품과 대기 상품에 대한 요청을 함께 확정하시겠습니까?';
    else if(reservationItems.length > 0) message = '예약 상품에 대한 주문을 확정하시겠습니까?';
    else message = '대기 상품에 대한 신청을 확정하시겠습니까?';
    
    if (needsPrepayment && reservationItems.length > 0) {
        message += "\n선택하신 상품은 예약 후 선입금이 필요합니다.";
    }

    toast((t) => (
      <div className="confirmation-toast-content">
        <Info size={44} className="toast-icon" />
        <h4>{title}</h4>
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-accent button-medium" onClick={() => { toast.dismiss(t.id); handleConfirmReservation(); }}>확인</button>
        </div>
      </div>
    ), { id: 'order-confirmation', style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  };
  
  const getButtonInfo = () => {
    if (isSuspendedUser) return { text: <><ShieldX size={20} /> 참여 제한</>, disabled: true };
    if (isProcessingOrder || isSyncing) return { text: '처리 중...', disabled: true };
    if (reservationItems.length > 0) return { text: <>예약 확정하기 <ArrowRight size={20} /></>, disabled: false };
    if (waitlistItems.length > 0) return { text: <>대기 신청 확정하기 <ArrowRight size={20} /></>, disabled: false };
    return { text: '예약 확정하기', disabled: true };
  };

  const buttonInfo = getButtonInfo();

  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container cart-container">
        <div className="cart-page-layout">
          <div className="cart-items-column">
            <div className="cart-section-header">
              <h2 className="cart-section-title">🛒 예약 상품 ({reservationItems.length}) {isSyncing && <RefreshCw size={18} className="spin-icon" />}</h2>
              {selectedReservationKeys.size > 0 && (<button className="bulk-remove-btn" onClick={() => handleBulkRemove('reservation')}><XCircle size={16} /> 선택 삭제 ({selectedReservationKeys.size})</button>)}
            </div>
            {reservationItems.length > 0 ? (
              <div className="cart-items-list">{reservationItems.map(item => <CartItemCard key={item.id} item={item} isSelected={selectedReservationKeys.has(item.id)} onSelect={(key) => handleItemSelect(key, 'reservation')} onImageClick={handleImageClick} isStockExceeded={stockExceededKeys.has(item.id)} />)}</div>
            ) : (<div className="info-box"><p>장바구니에 담긴 예약 상품이 없습니다.</p></div>)}

            <div className="waitlist-section">
              <div className="cart-section-header waitlist-header">
                <h2 className="cart-section-title"><Hourglass size={18}/> 대기 상품 ({waitlistItems.length})</h2>
                {selectedWaitlistKeys.size > 0 && (<button className="bulk-remove-btn" onClick={() => handleBulkRemove('waitlist')}><XCircle size={16} /> 선택 삭제 ({selectedWaitlistKeys.size})</button>)}
              </div>
              {waitlistItems.length > 0 ? (
                <div className="cart-items-list">{waitlistItems.map(item => <CartItemCard key={item.id} item={item} isSelected={selectedWaitlistKeys.has(item.id)} onSelect={(key) => handleItemSelect(key, 'waitlist')} onImageClick={handleImageClick} />)}</div>
              ) : (<div className="info-box"><p>품절 상품에 '대기 신청'을 하면 여기에 표시됩니다.</p></div>)}
            </div>

            {allItems.length === 0 && !isSyncing && (
              <div className="empty-cart-message">
                <CartIcon size={64} className="empty-cart-icon" /><p>장바구니와 대기 목록이 비어있습니다.</p><Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
              </div>
            )}
          </div>

          {allItems.length > 0 && (
            <div className="cart-summary-column">
                <div className="cart-summary-card">
                  <button 
                    className="checkout-btn" 
                    onClick={showOrderConfirmation} 
                    disabled={buttonInfo.disabled}
                  >
                   {buttonInfo.text}
                  </button>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartPage;