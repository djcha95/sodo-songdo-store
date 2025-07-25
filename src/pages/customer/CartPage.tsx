// src/pages/customer/CartPage.tsx

import React, { useState, useMemo, useRef, useEffect, useCallback, startTransition } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, OrderItem } from '@/types';
import { addWaitlistEntry } from '@/firebase';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
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

// ✨ [수정] showToast 헬퍼 함수를 라이브러리 기본 동작을 사용하도록 간결하게 변경합니다.
// ✨ [수정] showToast 헬퍼 함수를 타입 오류에 안전하게 변경합니다.
// ✨ [수정] showToast 헬퍼 함수를 타입 오류에 안전하게 변경합니다.
const showToast = (type: 'success' | 'error' | 'info', message: string | React.ReactNode, duration: number = 3000) => {
  // message가 null 또는 undefined일 경우 빈 문자열을 사용하도록 하여 오류를 방지합니다.
  const content = message ?? '';
  // message를 JSX Fragment(<></>)로 감싸서 라이브러리가 허용하는 타입으로 전달합니다.
  const toastContent = <>{content}</>;

  switch (type) {
    case 'success':
      toast.success(toastContent, { duration });
      break;
    case 'error':
      toast.error(toastContent, { duration });
      break;
    case 'info':
      toast(toastContent, { duration, icon: 'ℹ️' });
      break;
    default:
      toast(toastContent, { duration });
      break;
  }
};
const CartItemCard: React.FC<{ item: CartItem; isSelected: boolean; onSelect: (id: string) => void; onImageClick: (e: React.MouseEvent, id: string) => void; }> = ({ item, isSelected, onSelect, onImageClick }) => {
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
    <div className={`cart-item-card ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(item.id)}>
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
  
  const functions = getFunctions(getApp(), 'asia-northeast3');
  const checkCartStockCallable = httpsCallable<{ items: CartItem[] }, { updatedItems: { id: string, newQuantity: number }[], removedItemIds: string[], isSufficient: boolean }>(functions, 'checkCartStock');
  const submitOrderCallable = httpsCallable<any, { success: boolean, orderId: string }>(functions, 'submitOrder');


  const syncCartWithServerStock = useCallback(async (itemsToCheck: CartItem[]): Promise<boolean> => {
    if (itemsToCheck.length === 0) {
      setIsSyncing(false);
      return true;
    }
    
    setIsSyncing(true);
    try {
      const { data } = await checkCartStockCallable({ items: itemsToCheck });
      
      if (data.updatedItems.length > 0 || data.removedItemIds.length > 0) {
        startTransition(() => {
          data.updatedItems.forEach(item => {
            updateCartItemQuantity(item.id, item.newQuantity);
            const originalItem = itemsToCheck.find(i => i.id === item.id);
            if (originalItem) {
                showToast('error', `'${originalItem.variantGroupName}' 재고 부족으로 수량이 ${item.newQuantity}개로 자동 조정되었습니다.`);
            }
          });
          if (data.removedItemIds.length > 0) {
            removeItems(data.removedItemIds);
            showToast('error', `재고가 모두 소진된 ${data.removedItemIds.length}개 상품이 장바구니에서 삭제됩니다.`);
          }
        });
      }
      
      if (!data.isSufficient) {
        toast.error('일부 상품의 재고가 부족하여 주문을 진행할 수 없습니다.');
      }

      return data.isSufficient;

    } catch (error: any) {
      console.error("Cloud Function 호출 중 오류:", error);
      toast.error(error.message || "재고를 확인하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [checkCartStockCallable, removeItems, updateCartItemQuantity]);
  

  useEffect(() => {
    if (reservationItems.length > 0) {
      syncCartWithServerStock(reservationItems);
    } else {
      setIsSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


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

    const isStockSufficient = await syncCartWithServerStock(reservationItems);
    if (!isStockSufficient) return;

    setIsProcessingOrder(true);

    const orderPayload = reservationItems.length > 0 ? (() => {
      const orderItems: OrderItem[] = reservationItems.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        imageUrl: item.imageUrl,
        roundId: item.roundId,
        roundName: item.roundName,
        variantGroupId: item.variantGroupId,
        variantGroupName: item.variantGroupName,
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        stock: item.stock,
        stockDeductionAmount: item.stockDeductionAmount,
        arrivalDate: (item as any).arrivalDate ?? null,
        pickupDate: item.pickupDate,
        deadlineDate: item.deadlineDate,
        isPrepaymentRequired: item.isPrepaymentRequired,
      }));

      const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
      const prepaymentRequired = isWarningUser || doesCartRequirePrepayment;
      
      return {
        userId: user.uid,
        items: orderItems,
        totalPrice: reservationTotal,
        customerInfo: { name: user.displayName || '미상', phone: userDocument?.phone || '' },
        pickupDate: reservationItems[0].pickupDate,
        wasPrepaymentRequired: prepaymentRequired,
        notes: ''
      };
    })() : null;

    const allPromises: Promise<any>[] = [];
    if (orderPayload) {
      allPromises.push(submitOrderCallable(orderPayload));
    }
    waitlistItems.forEach(item => {
      allPromises.push(addWaitlistEntry(item.productId, item.roundId, user.uid, item.quantity, item.variantGroupId, item.itemId));
    });

    toast.promise(Promise.all(allPromises), {
      loading: '요청을 처리하는 중입니다...',
      success: (results) => {
        const orderResult = results[0];
        if (orderResult && orderResult.data && !orderResult.data.success) {
            throw new Error('서버에서 주문 처리에 실패했습니다.');
        }

        const prepaymentRequired = orderPayload?.wasPrepaymentRequired ?? false;
        if (prepaymentRequired) {
          toast.custom((t) => (
            <div className="prepayment-modal-overlay">
              <div className={`prepayment-modal-content ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
                <div className="toast-icon-wrapper"><Banknote size={48} /></div>
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
      error: (err) => {
          return err.message || '요청 처리 중 오류가 발생했습니다.';
      },
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
              <div className="cart-items-list">{reservationItems.map(item => <CartItemCard key={item.id} item={item} isSelected={selectedReservationKeys.has(item.id)} onSelect={(key) => handleItemSelect(key, 'reservation')} onImageClick={handleImageClick} />)}</div>
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