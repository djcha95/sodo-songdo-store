// src/pages/customer/CartPage.tsx

import React, { useState, useMemo, useRef, useEffect, useCallback, startTransition } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, Order, OrderItem } from '@/types'; // OrderItem 임포트
import { submitOrder, getLiveStockForItems, getReservedQuantitiesMap } from '@/firebase';
import { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Plus, Minus, CalendarDays, Hourglass, Info, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import './CartPage.css';

// ✅ [FIX] 다양한 날짜 형식을 안전하게 Date 객체로 변환하는 헬퍼 함수
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
  console.warn("Unsupported date format in CartPage:", date);
  return null;
};

// 수동으로 토스트를 끄는 헬퍼 함수
const showToast = (type: 'success' | 'error' | 'info' | 'blank', message: string | React.ReactNode, duration: number = 4000) => {
  const toastId = toast[type](message, {
    duration: Infinity,
  });

  setTimeout(() => {
    toast.dismiss(toastId);
  }, duration);
};

// --- CartItemCard 컴포넌트 ---
interface CartItemCardProps {
  item: CartItem;
  isSelected: boolean;
  onSelect: (itemKey: string) => void;
  onImageClick: (e: React.MouseEvent, productId: string) => void;
  isStockExceeded?: boolean;
}

const CartItemCard: React.FC<CartItemCardProps> = ({ item, isSelected, onSelect, onImageClick, isStockExceeded = false }) => {
  const { updateCartItemQuantity } = useCart();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(item.quantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  const stockLimit = useMemo(() => item.stock === null || item.stock === -1 ? 999 : item.stock, [item.stock]);

  useEffect(() => {
    if (!isEditing) setInputValue(item.quantity.toString());
  }, [item.quantity, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const handleQuantityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleQuantityUpdate = useCallback(() => {
    const newQuantity = parseInt(inputValue, 10);
    const finalQuantity = !isNaN(newQuantity) && newQuantity > 0 ? Math.min(newQuantity, stockLimit) : 1;

    if (finalQuantity !== item.quantity) {
      updateCartItemQuantity(item.id, finalQuantity); // item.id만 전달
      if (newQuantity > stockLimit) {
        showToast('error', `최대 ${stockLimit}개까지만 구매 가능합니다.`);
      } else if (newQuantity < 1) {
        showToast('error', '최소 1개 이상 구매해야 합니다.');
      }
    }
    setIsEditing(false);
  }, [inputValue, item, stockLimit, updateCartItemQuantity]);

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleQuantityUpdate();
    }
  };

  const createQuantityHandlers = useCallback((change: number) => {
    const performUpdate = () => {
      const newQuantity = item.quantity + change;
      if (newQuantity < 1 || newQuantity > stockLimit) return;
      updateCartItemQuantity(item.id, newQuantity); // item.id만 전달
    };
    return useLongPress(performUpdate, performUpdate, { delay: 100 });
  }, [item, stockLimit, updateCartItemQuantity]);

  const decreaseHandlers = createQuantityHandlers(-1);
  const increaseHandlers = createQuantityHandlers(1);

  // ✅ [FIX] safeToDate 헬퍼 함수를 사용하여 날짜를 안전하게 포맷팅
  const formatPickupDate = (dateValue: any) => {
    const date = safeToDate(dateValue);
    if (!date) return '날짜 정보 없음';
    return format(date, 'M/d(EEE)', { locale: ko }) + ' 픽업';
  }

  const itemKey = item.id; // CartItem.id는 필수로 고유하므로 그대로 사용

  return (
    <div className={`cart-item-card ${isSelected ? 'selected' : ''} ${isStockExceeded ? 'stock-exceeded' : ''}`} onClick={() => onSelect(itemKey)}>
      <div className="item-image-wrapper" onClick={(e) => onImageClick(e, item.productId)}>
        <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
      </div>
      <div className="item-details-wrapper">
        <div className="item-header">
            <div className="item-name-group">
                <span className="item-product-name">{item.variantGroupName}</span>
                <span className="item-option-name">선택: {item.itemName}</span>
            </div>
            <div className="item-pickup-info">
                <CalendarDays size={14} />
                <span>{formatPickupDate(item.pickupDate)}</span>
            </div>
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


// --- 메인 페이지 컴포넌트 ---
const CartPage: React.FC = () => {
  const { user, userDocument } = useAuth();
  const { 
    allItems, reservationItems, waitlistItems, 
    removeItems, updateCartItemQuantity,
    reservationTotal, removeReservedItems
  } = useCart();
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
        const [liveStockInfo, reservedMap] = await Promise.all([
          getLiveStockForItems(reservationItems),
          getReservedQuantitiesMap()
        ]);
        
        const adjustments = new Map<string, number>();
        const exceededKeys = new Set<string>();

        for (const item of reservationItems) {
          const itemKey = item.id; // CartItem.id는 필수로 고유하므로 그대로 사용
          const productStockInfo = liveStockInfo[`${item.productId}-${item.variantGroupId}-${item.itemId}`];
          const groupReservedKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          
          const groupTotalStock = productStockInfo?.groupStock;
          const groupReservedQuantity = reservedMap.get(groupReservedKey) || 0;
          
          let availableStock = Infinity;
          if(groupTotalStock !== null && groupTotalStock !== -1) {
            availableStock = groupTotalStock - groupReservedQuantity;
          }
          
          if (item.quantity > availableStock) {
            const adjustedQuantity = Math.max(0, Math.floor(availableStock));
            
            if (adjustedQuantity > 0) {
              adjustments.set(itemKey, adjustedQuantity);
              showToast('error', `'${item.variantGroupName}' 재고 부족으로 수량이 ${adjustedQuantity}개로 자동 조정되었습니다.`);
            } else {
               adjustments.set(itemKey, 0);
               showToast('error', `'${item.variantGroupName}' 재고가 모두 소진되어 장바구니에서 삭제됩니다.`);
            }
            exceededKeys.add(itemKey);
          }
        }

        if (adjustments.size > 0) {
          for (const [key, newQuantity] of adjustments.entries()) {
            if (newQuantity > 0) {
              updateCartItemQuantity(key, newQuantity);
            } else {
              removeItems([key]);
            }
          }
        }
        setStockExceededKeys(exceededKeys);

      } catch (error) {
        console.error("재고 확인 중 오류:", error);
        showToast('error', "재고를 확인하는 중 문제가 발생했습니다.");
      } finally {
        setIsSyncing(false);
      }
    };

    checkStockAndAdjust();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems.length]); // allItems.length를 의존성 배열에 추가하여 allItems 변경 시 재실행

  const handleItemSelect = useCallback((itemKey: string, type: 'reservation' | 'waitlist') => {
    const setter = type === 'reservation' ? setSelectedReservationKeys : setSelectedWaitlistKeys;
    setter(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  }, []);
  
  const handleBulkRemove = useCallback((type: 'reservation' | 'waitlist') => {
    const keysToRemove = type === 'reservation' ? selectedReservationKeys : selectedWaitlistKeys;
    if (keysToRemove.size === 0) {
      showToast('info', '삭제할 상품을 선택해주세요.');
      return;
    }

    toast((t) => (
      <div className="confirmation-toast-content">
        <AlertTriangle size={44} className="toast-icon" style={{ color: 'var(--danger-color)' }} />
        <h4>선택 상품 삭제</h4>
        <p>{keysToRemove.size}개의 상품을 장바구니에서 삭제하시겠습니까?</p>
        <div className="toast-buttons">
          <button
            className="common-button button-secondary button-medium"
            onClick={() => toast.dismiss(t.id)}
          >
            취소
          </button>
          <button
            className="common-button button-danger button-medium"
            onClick={() => {
              toast.dismiss(t.id);
              removeItems(Array.from(keysToRemove));
              if (type === 'reservation') setSelectedReservationKeys(new Set());
              else setSelectedWaitlistKeys(new Set());
              showToast('success', '선택된 상품이 삭제되었습니다.');
            }}
          >
            삭제
          </button>
        </div>
      </div>
    ), {
      id: 'bulk-delete-confirmation',
      style: {
        background: 'transparent',
        boxShadow: 'none',
        border: 'none',
        padding: 0,
      }
    });
  }, [selectedReservationKeys, selectedWaitlistKeys, removeItems]);

  const handleImageClick = useCallback((e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    navigate(`/product/${productId}`);
  }, [navigate]);
  
  const finalStockCheck = async (): Promise<boolean> => {
    setIsSyncing(true);
    try {
      const [liveStockInfo, reservedMap] = await Promise.all([
        getLiveStockForItems(reservationItems),
        getReservedQuantitiesMap(),
      ]);

      for (const item of reservationItems) {
        const productStockInfo = liveStockInfo[`${item.productId}-${item.variantGroupId}-${item.itemId}`];
        const groupReservedKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
        const groupTotalStock = productStockInfo?.groupStock;
        const groupReservedQuantity = reservedMap.get(groupReservedKey) || 0;
        
        let availableStock = Infinity;
        if (groupTotalStock !== null && groupTotalStock !== -1) {
          availableStock = groupTotalStock - groupReservedQuantity;
        }

        if (item.quantity > availableStock) {
          showToast('error', 
            (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontWeight: '600' }}>'{item.variantGroupName}' 재고가 부족합니다.</p>
                <p style={{ margin: '4px 0 0', fontWeight: 400, opacity: 0.8 }}>(현재 {availableStock}개 구매 가능)</p>
              </div>
            )
          );
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error("최종 재고 확인 중 오류:", error);
      showToast('error', "재고 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    } finally {
      setIsSyncing(false);
    }
  };


  const handleConfirmReservation = async () => {
    if (!user || !user.uid) {
      showToast('error', '예약을 확정하려면 로그인이 필요합니다.');
      navigate('/login', { state: { from: '/cart' }, replace: true });
      return;
    }
    if (isProcessingOrder || reservationItems.length === 0) return;

    const isStockSufficient = await finalStockCheck();
    if (!isStockSufficient) {
      return;
    }

    // reservationItems(CartItem[])를 OrderItem[] 타입으로 변환
    const orderItems: OrderItem[] = reservationItems.map(item => ({
        ...item,
        arrivalDate: null, // 주문 시점에는 알 수 없으므로 null
        pickupDeadlineDate: null, // 주문 시점에는 알 수 없으므로 null
    }));

    const orderPayload: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'> = {
        userId: user.uid,
        items: orderItems, // 변환된 orderItems 사용
        totalPrice: reservationTotal,
        customerInfo: { name: user.displayName || '미상', phone: userDocument?.phone || '' },
        pickupDate: reservationItems[0].pickupDate,
    };
    setIsProcessingOrder(true);
    const promise = submitOrder(orderPayload);

    toast.promise(promise, {
      loading: '예약을 확정하는 중입니다...',
      success: () => {
        startTransition(() => {
          removeReservedItems();
          // ✅ [FIX] 예약 확정 후 주문내역 페이지로 이동
          navigate('/mypage/history');
        });
        return '예약이 성공적으로 완료되었습니다!';
      },
      error: (err) => (err as Error).message || '예약 확정 중 오류가 발생했습니다.',
    }, {
      success: {
        duration: 3000, 
      },
      error: {
        duration: 4000,
      }
    }).finally(() => {
      setIsProcessingOrder(false);
    });
  };

  const showOrderConfirmation = () => {
    if (reservationItems.length === 0) {
      showToast('error', '예약할 상품이 없습니다.');
      return;
    }
    
    toast((t) => (
      <div className="confirmation-toast-content">
        <Info size={44} className="toast-icon" />
        <h4>예약 확정</h4>
        <p>예약 상품만 주문되며, 대기 상품은 포함되지 않습니다.</p>
        <div className="toast-buttons">
          <button
            className="common-button button-secondary button-medium"
            onClick={() => toast.dismiss(t.id)}
          >
            취소
          </button>
          <button
            className="common-button button-accent button-medium"
            onClick={() => { toast.dismiss(t.id); handleConfirmReservation(); }}
          >
            확인
          </button>
        </div>
      </div>
    ), {
      id: 'order-confirmation',
      style: {
        background: 'transparent',
        boxShadow: 'none',
        border: 'none',
        padding: 0,
      },
    });
  };

  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container cart-container">
        <div className="cart-page-layout">
          <div className="cart-items-column">
            <div className="cart-section-header">
              <h2 className="cart-section-title">
                🛒 예약 상품 ({reservationItems.length})
                {isSyncing && <RefreshCw size={18} className="spin-icon" />}
              </h2>
              {selectedReservationKeys.size > 0 && (
                <button className="bulk-remove-btn" onClick={() => handleBulkRemove('reservation')}>
                  <XCircle size={16} /> 선택 삭제 ({selectedReservationKeys.size})
                </button>
              )}
            </div>
            {reservationItems.length > 0 ? (
              <div className="cart-items-list">
                {reservationItems.map(item => {
                  const itemKey = item.id; // CartItem.id는 필수로 고유하므로 그대로 사용
                  return (
                    <CartItemCard
                      key={itemKey}
                      item={item}
                      isSelected={selectedReservationKeys.has(itemKey)}
                      onSelect={(key) => handleItemSelect(key, 'reservation')}
                      onImageClick={handleImageClick}
                      isStockExceeded={stockExceededKeys.has(itemKey)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="info-box"><p>장바구니에 담긴 예약 상품이 없습니다.</p></div>
            )}

            <div className="waitlist-section">
              <div className="cart-section-header waitlist-header">
                <h2 className="cart-section-title">
                  <Hourglass size={18}/> 대기 상품 ({waitlistItems.length})
                </h2>
                {selectedWaitlistKeys.size > 0 && (
                  <button className="bulk-remove-btn" onClick={() => handleBulkRemove('waitlist')}>
                    <XCircle size={16} /> 선택 삭제 ({selectedWaitlistKeys.size})
                  </button>
                )}
              </div>
              {waitlistItems.length > 0 ? (
                <div className="cart-items-list">
                  {waitlistItems.map(item => {
                    const itemKey = item.id; // CartItem.id는 필수로 고유하므로 그대로 사용
                    return (
                      <CartItemCard
                        key={itemKey}
                        item={item}
                        isSelected={selectedWaitlistKeys.has(itemKey)}
                        onSelect={(key) => handleItemSelect(key, 'waitlist')}
                        onImageClick={handleImageClick}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="info-box"><p>품절 상품에 '대기 신청'을 하면 여기에 표시됩니다.</p></div>
              )}
            </div>

            {allItems.length === 0 && !isSyncing && (
              <div className="empty-cart-message">
                <CartIcon size={64} className="empty-cart-icon" />
                <p>장바구니와 대기 목록이 비어있습니다.</p>
                <Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
              </div>
            )}
          </div>

          {reservationItems.length > 0 && (
            <div className="cart-summary-column">
                <div className="cart-summary-card">
                  <button className="checkout-btn" onClick={showOrderConfirmation} disabled={isProcessingOrder || isSyncing}>
                    {isProcessingOrder ? '처리 중...' : `예약 확정하기`}
                    {!isProcessingOrder && !isSyncing && <ArrowRight size={20} />}
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