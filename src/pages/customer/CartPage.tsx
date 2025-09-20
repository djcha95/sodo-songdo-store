// src/pages/customer/CartPage.tsx

import React, { useState, useMemo, useRef, useEffect, useCallback, startTransition } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useTutorial } from '@/context/TutorialContext';
import { useLaunch } from '@/context/LaunchContext';
import { cartPageTourSteps } from '@/components/customer/AppTour';
import type { CartItem, OrderItem  } from '@/types';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Timestamp } from 'firebase/firestore/lite';
import { ShoppingCart as CartIcon,  Plus, Minus, CalendarDays, Hourglass, Info, RefreshCw, XCircle, AlertTriangle, ShieldX, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import useLongPress from '@/hooks/useLongPress';
import './CartPage.css';
import OptimizedImage from '@/components/common/OptimizedImage';

// =================================================================
// 📌 헬퍼 함수 및 하위 컴포넌트
// =================================================================
const safeToDate = (date: any): Date | null => {
    if (!date) return null; if (date instanceof Date) return date;
    if (typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && (date.seconds !== undefined || date._seconds !== undefined)) {
      const seconds = date.seconds ?? date._seconds; const nanoseconds = date.nanoseconds ?? date._nanoseconds ?? 0;
      return new Timestamp(seconds, nanoseconds).toDate();
    }
    if (typeof date === 'string') { const parsedDate = new Date(date); if (!isNaN(parsedDate.getTime())) return parsedDate; }
    return null;
};
  
const CartItemCard: React.FC<{ 
    item: CartItem; isSelected: boolean; isEligible: boolean; onSelect: (id: string) => void; onImageClick: (e: React.MouseEvent, id: string) => void; 
}> = ({ item, isSelected, isEligible, onSelect, onImageClick }) => {
    const { updateCartItemQuantity } = useCart();
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(item.quantity.toString());
    const inputRef = useRef<HTMLInputElement>(null);
    const stockLimit = useMemo(() => item.stock === null || item.stock === -1 ? 999 : item.stock, [item.stock]);
    useEffect(() => { if (!isEditing) setInputValue(item.quantity.toString()); }, [item.quantity, isEditing]);
    useEffect(() => { if (isEditing && inputRef.current) inputRef.current.focus(); }, [isEditing]);
    
    const handleQuantityUpdate = useCallback(() => {
      const newQuantity = parseInt(inputValue, 10);
      const finalQuantity = !isNaN(newQuantity) && newQuantity > 0 ? Math.min(newQuantity, stockLimit) : 1;
      if (finalQuantity !== item.quantity) {
        updateCartItemQuantity(item.id, finalQuantity);
        if (newQuantity > stockLimit) toast.error(`최대 ${stockLimit}개까지만 구매 가능합니다.`, { duration: 2000 });
        else if (newQuantity < 1) toast.error('최소 1개 이상 구매해야 합니다.', { duration: 2000 });
      }
      setIsEditing(false);
    }, [inputValue, item.id, item.quantity, stockLimit, updateCartItemQuantity]);
    const handleInputKeyDown = (event: React.KeyboardEvent) => { if (event.key === 'Enter') handleQuantityUpdate(); };
    const createQuantityHandlers = useCallback((change: number) => {
      const performUpdate = () => { if (!isEligible) return; const newQuantity = item.quantity + change; if (newQuantity < 1 || newQuantity > stockLimit) return; updateCartItemQuantity(item.id, newQuantity); };
      return useLongPress(performUpdate, performUpdate, { delay: 100 });
    }, [item, stockLimit, updateCartItemQuantity, isEligible]);
    const decreaseHandlers = createQuantityHandlers(-1);
    const increaseHandlers = createQuantityHandlers(1);
    const formatPickupDate = (dateValue: any) => { const date = safeToDate(dateValue); if (!date) return '픽업일 정보 없음'; return format(date, 'M/d(EEE)', { locale: ko }) + ' 픽업'; }
  
    return (
      <div className={`cart-item-card ${isSelected ? 'selected' : ''} ${!isEligible ? 'ineligible' : ''}`} onClick={() => onSelect(item.id)}>
        {!isEligible && (<div className="ineligible-overlay"><ShieldX size={24} /><span>현재 등급으로<br/>예약 불가</span></div>)}
        <div className="item-image-wrapper" onClick={(e) => onImageClick(e, item.productId)}>
             {item.imageUrl ? (<OptimizedImage originalUrl={item.imageUrl} size="200x200" alt={item.productName} className="item-image" />) : (<div className="item-image no-image-placeholder"><span>No Image</span></div>)}
        </div>
        <div className="item-details-wrapper">
          <div className="item-header">
              <div className="item-name-group"><span className="item-product-name">{item.variantGroupName}</span><span className="item-option-name">선택: {item.itemName}</span></div>
              <div className="item-pickup-info"><CalendarDays size={14} /><span>{formatPickupDate(item.pickupDate)}</span></div>
          </div>
          <div className="item-footer">
              {item.status === 'WAITLIST' ? (<div className="waitlist-status-badge"><Info size={14}/><span>재고 확보 시 자동 예약 전환</span></div>) : (<div className="item-total-price">{(item.unitPrice * item.quantity).toLocaleString()}원</div>)}
              <div className="item-quantity-controls" onClick={(e) => e.stopPropagation()}>
                <button {...decreaseHandlers} disabled={item.quantity <= 1 || !isEligible}><Minus size={18} /></button>
                {isEditing ? (<input ref={inputRef} type="number" className="quantity-input" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onBlur={handleQuantityUpdate} onKeyDown={handleInputKeyDown} />) : (<span className="quantity-display" onClick={(e) => { e.stopPropagation(); if (isEligible) setIsEditing(true); }}>{item.quantity}</span>)}
                <button {...increaseHandlers} disabled={item.quantity >= stockLimit || !isEligible}><Plus size={18} /></button>
              </div>
          </div>
        </div>
      </div>
    );
};

// =================================================================
// 📌 메인 컴포넌트
// =================================================================
const CartPage: React.FC = () => {
  const { user, userDocument, isSuspendedUser } = useAuth();
  const { reservationItems, waitlistItems, removeItems, updateCartItemQuantity } = useCart();
  const navigate = useNavigate();
  const { runPageTourIfFirstTime } = useTutorial();
  const { isPreLaunch, launchDate } = useLaunch();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [selectedReservationKeys, setSelectedReservationKeys] = useState<Set<string>>(new Set());
  const [selectedWaitlistKeys, setSelectedWaitlistKeys] = useState<Set<string>>(new Set());
  const [ineligibleItemIds, setIneligibleItemIds] = useState<Set<string>>(new Set());
  
  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  // ✅ [수정] 신규 validateCart 함수 사용
  const validateCartCallable = useMemo(() => httpsCallable<any, any>(functions, 'validateCart'), [functions]);
  const submitOrderCallable = useMemo(() => httpsCallable<any, any>(functions, 'submitOrder'), [functions]);
  const addWaitlistEntryCallable = useMemo(() => httpsCallable<any, any>(functions, 'addWaitlistEntry'), [functions]);

  useEffect(() => { if (userDocument?.hasCompletedTutorial) runPageTourIfFirstTime('hasSeenCartPage', cartPageTourSteps); }, [userDocument, runPageTourIfFirstTime]);

  const { eligibleReservationItems, eligibleReservationTotal } = useMemo(() => {
    const eligibleItems = reservationItems.filter(item => !ineligibleItemIds.has(item.id));
    const total = eligibleItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
    return { eligibleReservationItems: eligibleItems, eligibleReservationTotal: total };
  }, [reservationItems, ineligibleItemIds]);

  // ✅ [수정] syncCartWithServerStock 함수를 validateCart 로직에 맞춰 전면 수정
  const syncCartWithServerStock = useCallback(async (itemsToCheck: CartItem[]): Promise<boolean> => {
    if (!user) {
        setIsSyncing(false);
        return true; 
    }
    if (itemsToCheck.length === 0) {
      setIsSyncing(false);
      return true;
    }
    
    setIsSyncing(true);
    try {
      const { data } = await validateCartCallable({ items: itemsToCheck });
      
      const itemsToUpdate: { id: string, newQuantity: number }[] = [];
      const itemsToRemove: string[] = [];
      const ineligibleIds = new Set<string>();
      const removalReasons = new Set<string>();

      data.validatedItems.forEach((item: any) => {
          switch (item.status) {
              case 'REMOVED':
                  itemsToRemove.push(item.id);
                  removalReasons.add(item.reason);
                  break;
              case 'UPDATED':
                  itemsToUpdate.push({ id: item.id, newQuantity: item.newQuantity });
                  removalReasons.add(item.reason);
                  break;
              case 'INELIGIBLE':
                  ineligibleIds.add(item.id);
                  break;
              default:
                  break;
          }
      });
      
      setIneligibleItemIds(ineligibleIds);

      if (itemsToRemove.length > 0 || itemsToUpdate.length > 0) {
        startTransition(() => {
          if (itemsToUpdate.length > 0) {
            itemsToUpdate.forEach(item => updateCartItemQuantity(item.id, item.newQuantity));
          }
          if (itemsToRemove.length > 0) {
            removeItems(itemsToRemove);
          }
        });
        const reasonText = Array.from(removalReasons).join(', ');
        toast.error(`일부 상품이 변경되었습니다. (${reasonText})`, { id: 'cart-sync-toast', duration: 3000 });
      }

      return data.summary.sufficient;

    } catch (error: any) {
      console.error("Cloud Function 'validateCart' 호출 중 오류:", error);
      toast.error(error.message || "장바구니 정보를 동기화하는 중 오류가 발생했습니다.", { duration: 2000 });
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [validateCartCallable, removeItems, updateCartItemQuantity, user]);
  
  const reservationItemIds = useMemo(() => reservationItems.map(item => item.id).join(','), [reservationItems]);
  useEffect(() => { syncCartWithServerStock(reservationItems); }, [reservationItemIds]); // 의존성 배열에서 syncCartWithServerStock 제거

  const handleItemSelect = useCallback((itemKey: string, type: 'reservation' | 'waitlist') => {
    const setter = type === 'reservation' ? setSelectedReservationKeys : setSelectedWaitlistKeys;
    setter(prev => { const newSet = new Set(prev); if (newSet.has(itemKey)) newSet.delete(itemKey); else newSet.add(itemKey); return newSet; });
  }, []);
  
  const handleBulkRemove = useCallback((type: 'reservation' | 'waitlist') => {
    const keysToRemove = type === 'reservation' ? selectedReservationKeys : selectedWaitlistKeys;
    if (keysToRemove.size === 0) { toast('삭제할 상품을 선택해주세요.', { icon: 'ℹ️', duration: 2000 }); return; }
    toast((t) => (
      <div className="confirmation-toast-content">
        <AlertTriangle size={44} className="toast-icon" style={{ color: 'var(--danger-color)' }} />
        <h4>선택 상품 삭제</h4><p>{keysToRemove.size}개의 상품을 장바구니에서 삭제하시겠습니까?</p>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-danger button-medium" onClick={() => {
              toast.dismiss(t.id); removeItems(Array.from(keysToRemove));
              if (type === 'reservation') setSelectedReservationKeys(new Set()); else setSelectedWaitlistKeys(new Set());
              toast.success('선택된 상품이 삭제되었습니다.', { duration: 2000 });
          }}>삭제</button>
        </div>
      </div>
    ), { id: 'bulk-delete-confirmation', duration: Infinity, style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  }, [selectedReservationKeys, selectedWaitlistKeys, removeItems]);

  const handleImageClick = useCallback((e: React.MouseEvent, productId: string) => { e.stopPropagation(); navigate(`/product/${productId}`); }, [navigate]);
  const doesCartRequirePrepayment = useMemo(() => eligibleReservationItems.some(item => item.isPrepaymentRequired || (item.stock !== null && item.stock !== -1)), [eligibleReservationItems]);
  
  const handleConfirmReservation = async () => {
    if (!user || !user.uid || !userDocument) { toast.error('요청을 확정하려면 로그인이 필요합니다.', { duration: 2000 }); navigate('/login', { state: { from: '/cart' }, replace: true }); return; }
    if (isSuspendedUser) { toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.', { duration: 2000 }); return; }
    if (isProcessingOrder || (eligibleReservationItems.length === 0 && waitlistItems.length === 0)) return;

    // ✅ [수정] 주문 직전 최종 유효성 검사
    const isStockSufficient = await syncCartWithServerStock(eligibleReservationItems);
    if (!isStockSufficient) {
        toast.error('주문 가능한 상품이 없어 요청을 진행할 수 없습니다.');
        return;
    }

    setIsProcessingOrder(true);
    
    // 서버 검증 후 최신화된 eligibleReservationItems를 다시 가져와서 페이로드 생성
    // (주의: state 업데이트는 비동기이므로, 이 시점의 eligibleReservationItems는 최신이 아닐 수 있음.
    // 여기서는 낙관적 업데이트를 신뢰하고 그대로 진행하되, 백엔드에서 최종 검증하므로 안전함)
    const orderPayload = eligibleReservationItems.length > 0 ? (() => {
      const orderItems: OrderItem[] = eligibleReservationItems.map(item => ({ id: item.id, productId: item.productId, productName: item.productName, imageUrl: item.imageUrl, roundId: item.roundId, roundName: item.roundName, variantGroupId: item.variantGroupId, variantGroupName: item.variantGroupName, itemId: item.itemId, itemName: item.itemName, quantity: item.quantity, unitPrice: item.unitPrice, stock: item.stock, stockDeductionAmount: item.stockDeductionAmount, arrivalDate: (item as any).arrivalDate ?? null, pickupDate: item.pickupDate, deadlineDate: item.deadlineDate, isPrepaymentRequired: item.isPrepaymentRequired }));
      const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
      const prepaymentRequired = isWarningUser || doesCartRequirePrepayment;
      return { userId: user.uid, items: orderItems, totalPrice: eligibleReservationTotal, customerInfo: { name: user.displayName || '미상', phone: userDocument?.phone || '' }, pickupDate: eligibleReservationItems[0].pickupDate, wasPrepaymentRequired: prepaymentRequired, notes: '' };
    })() : null;

    const allPromises: Promise<any>[] = [];
    if (orderPayload) allPromises.push(submitOrderCallable(orderPayload));
    waitlistItems.forEach(item => {
      const waitlistPayload = { productId: item.productId, roundId: item.roundId, quantity: item.quantity, variantGroupId: item.variantGroupId, itemId: item.itemId };
      allPromises.push(addWaitlistEntryCallable(waitlistPayload));
    });
    
    const toastId = toast.loading('요청을 처리하는 중입니다...');

    Promise.all(allPromises).then((results) => {
        if (orderPayload && results.length > 0) { const orderResult = results[0]; if (orderResult && orderResult.data && orderResult.data.success === false) throw new Error(orderResult.data.message || '서버에서 주문 처리에 실패했습니다.'); }
        const processedItemIds = [...eligibleReservationItems.map(i => i.id), ...waitlistItems.map(i => i.id)];
        const prepaymentRequired = orderPayload?.wasPrepaymentRequired ?? false;
        
        if (prepaymentRequired) {
          toast.dismiss(toastId);
          const customToastId = 'prepayment-toast';
          const performNavigation = () => { toast.dismiss(customToastId); startTransition(() => { removeItems(processedItemIds); navigate('/mypage/history'); }); };
          toast.custom((t) => (
            <div className="prepayment-modal-overlay">
              <div className={`prepayment-modal-content ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
                <div className="toast-icon-wrapper"><Banknote size={48} /></div>
                <h4>⚠️ 선입금 후 예약이 확정됩니다</h4>
                <p>'주의 요망' 등급이거나 <strong style={{color: 'var(--danger-color)'}}>한정 수량 상품</strong>이 포함되어 있습니다. <br/>마감 시간 전까지 입금 후 채널톡으로 내역을 보내주세요.</p>
                <div className="bank-info"><strong>카카오뱅크 3333-12-3456789 (소도몰)</strong><div className="price-to-pay">입금할 금액: <strong>{eligibleReservationTotal.toLocaleString()}원</strong></div></div>
                <small>관리자가 확인 후 예약을 확정 처리해 드립니다.<br/>미입금 시 예약은 자동 취소될 수 있습니다.</small>
                <button className="modal-confirm-button" onClick={performNavigation}>확인 및 주문내역으로 이동</button>
              </div>
            </div>
          ), { id: customToastId, duration: Infinity });
        } else {
          const message = eligibleReservationItems.length > 0 && waitlistItems.length > 0 ? '예약 및 대기 신청이 모두 완료되었습니다!' : eligibleReservationItems.length > 0 ? '예약이 성공적으로 완료되었습니다!' : '대기 신청이 성공적으로 완료되었습니다!';
          toast.success(message, { id: toastId, duration: 2000 });
          setTimeout(() => { startTransition(() => { removeItems(processedItemIds); navigate('/mypage/history'); }); }, 50);
        }
    }).catch((err) => {
        toast.error(err.message || '요청 처리 중 오류가 발생했습니다.', { id: toastId, duration: 2000 });
    }).finally(() => {
        setIsProcessingOrder(false);
    });
  };

  const showOrderConfirmation = () => {
    if (isPreLaunch) { toast(`🛍️ 상품 예약은 ${dayjs(launchDate).format('M/D')} 정식 런칭 후 가능해요!`, { icon: '🗓️', position: "top-center", duration: 2000 }); return; }
    const now = new Date();
    const isAnyItemInPhase2 = eligibleReservationItems.some(item => { const deadline = safeToDate(item.deadlineDate); return deadline && now > deadline; });
    const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
    const needsPrepayment = isWarningUser || doesCartRequirePrepayment;
    const title = needsPrepayment ? '선입금 안내' : '요청 확정';
    let message = '';
    if(eligibleReservationItems.length > 0 && waitlistItems.length > 0) message = '예약 상품과 대기 상품에 대한 요청을 함께 확정하시겠습니까?';
    else if(eligibleReservationItems.length > 0) message = '예약 상품에 대한 주문을 확정하시겠습니까?';
    else message = '대기 상품에 대한 신청을 확정하시겠습니까?';
    let finalWarning = "";
    const isLimitedItemInCart = eligibleReservationItems.some(item => item.stock !== null && item.stock !== -1);
    if (isAnyItemInPhase2) finalWarning = "지금은 2차 예약 기간입니다. 확정 후 취소는 가능하지만, 약속 불이행(노쇼) 시 페널티가 부과될 수 있습니다.";
    else if (isLimitedItemInCart) finalWarning = "한정 수량 상품은 선입금 및 1:1 채팅 확인 후에만 최종 확정됩니다. 단순 예약은 재고를 확보하지 않습니다.";
    else if (needsPrepayment) finalWarning = "선택하신 상품은 예약 후 선입금이 필요합니다. '주의 요망' 등급의 경우 선입금이 필수입니다.";
    else finalWarning = "예약 확정 후 1차 마감일 이후 취소 시 페널티가 부과될 수 있습니다.";
    toast((t) => (
      <div className="confirmation-toast-content">
        <Info size={44} className="toast-icon" /><h4>{title}</h4><p style={{ whiteSpace: 'pre-line' }}>{message}</p>
        <div className="toast-warning-box"><AlertTriangle size={16} /> {finalWarning}</div>
        <div className="toast-buttons">
          <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-accent button-medium" onClick={() => { toast.dismiss(t.id); handleConfirmReservation(); }}>확인</button>
        </div>
      </div>
    ), { id: 'order-confirmation', duration: Infinity, style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
  };
  
  const getButtonInfo = () => {
      if (isPreLaunch) return { text: <><CalendarDays size={20} /> {dayjs(launchDate).format('M/D')} 정식 오픈!</>, disabled: true };
      if (isSuspendedUser) return { text: <><ShieldX size={20} /> 참여 제한</>, disabled: true };
      if (isProcessingOrder || isSyncing) return { text: '처리 중...', disabled: true };
      const hasReservation = eligibleReservationItems.length > 0;
      const hasWaitlist = waitlistItems.length > 0;
      if (hasReservation && hasWaitlist) return { text: '예약 및 대기 확정하기', disabled: false };
      if (hasReservation) return { text: '예약 확정하기', disabled: false };
      if (hasWaitlist) return { text: '대기 신청 확정하기', disabled: false };
      return { text: '예약/대기 상품 없음', disabled: true };
  };
  
  const buttonInfo = getButtonInfo();
  const allItems = useMemo(() => [...reservationItems, ...waitlistItems], [reservationItems, waitlistItems]);

  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container cart-container">
        <div className="cart-page-layout">
          <div className="cart-items-column">
            <div className="cart-section-header">
              <h2 className="cart-section-title">🛒 예약 상품 ({reservationItems.length}) {isSyncing && <RefreshCw size={18} className="spin-icon" />}</h2>
              {selectedReservationKeys.size > 0 && (<button className="bulk-remove-btn" onClick={() => handleBulkRemove('reservation')}><XCircle size={16} /> 선택 삭제 ({selectedReservationKeys.size})</button>)}
            </div>
            <div data-tutorial-id="cart-reservation-list">
              {reservationItems.length > 0 ? (
                <div className="cart-items-list">{reservationItems.map(item => <CartItemCard key={item.id} item={item} isSelected={selectedReservationKeys.has(item.id)} isEligible={!ineligibleItemIds.has(item.id)} onSelect={(key) => handleItemSelect(key, 'reservation')} onImageClick={handleImageClick} />)}</div>
              ) : (<div className="info-box"><p>장바구니에 담긴 예약 상품이 없습니다.</p></div>)}
            </div>
            <div className="waitlist-section">
              <div className="cart-section-header waitlist-header">
                <h2 className="cart-section-title"><Hourglass size={18}/> 대기 상품 ({waitlistItems.length})</h2>
                {selectedWaitlistKeys.size > 0 && (<button className="bulk-remove-btn" onClick={() => handleBulkRemove('waitlist')}><XCircle size={16} /> 선택 삭제 ({selectedWaitlistKeys.size})</button>)}
              </div>
              <div data-tutorial-id="cart-waitlist-list">
                {waitlistItems.length > 0 ? (
                  <div className="cart-items-list">{waitlistItems.map(item => <CartItemCard key={item.id} item={item} isSelected={selectedWaitlistKeys.has(item.id)} isEligible={true} onSelect={(key) => handleItemSelect(key, 'waitlist')} onImageClick={handleImageClick} />)}</div>
                ) : (<div className="info-box"><p>품절 상품에 '대기 신청'을 하면 여기에 표시됩니다.</p></div>)}
              </div>
            </div>
            {allItems.length === 0 && !isSyncing && (
              <div className="empty-cart-message">
                <CartIcon size={64} className="empty-cart-icon" /><p>장바구니와 대기 목록이 비어있습니다.</p><Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
              </div>
            )}
          </div>
          <div className="cart-summary-column">
            <div className="cart-summary-card" data-tutorial-id="cart-checkout-button">
              <button className="checkout-btn" onClick={showOrderConfirmation} disabled={buttonInfo.disabled}>{buttonInfo.text}</button>
              <div className="cart-summary-details">
                  {eligibleReservationTotal !== reservationItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0) && (<div className="summary-row warning-text"><span>(등급 제한 제외)</span><span></span></div>)}
              </div>
              {ineligibleItemIds.size > 0 && (
                  <div className="ineligible-notice-box"><AlertTriangle size={16} /><span>현재 등급으로 참여할 수 없는 상품({ineligibleItemIds.size}개)은<br />자동으로 제외되었습니다.</span></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;