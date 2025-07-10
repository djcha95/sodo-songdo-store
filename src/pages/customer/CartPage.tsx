// src/pages/customer/CartPage.tsx

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, Order } from '@/types';
import { submitOrder } from '@/firebase/orderService';
import type { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Trash2, Plus, Minus, CalendarDays, Hourglass, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import './CartPage.css';

const CartPage: React.FC = () => {
  const { user } = useAuth();
  const { cartItems, cartTotal: originalCartTotal, cartItemCount: originalCartItemCount, removeFromCart, updateCartItemQuantity, removeReservedItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>([]);
  const removalTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const visibleCartItems = useMemo(() =>
    cartItems.filter(item => {
      const uniqueId = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      return !pendingRemovalIds.includes(uniqueId);
    }),
    [cartItems, pendingRemovalIds]
  );
  
  const reservationItems = useMemo(() => 
    visibleCartItems.filter(item => item.status === 'RESERVATION').sort((a, b) => a.pickupDate.toMillis() - b.pickupDate.toMillis()),
    [visibleCartItems]
  );
  const waitlistItems = useMemo(() =>
    visibleCartItems.filter(item => item.status === 'WAITLIST').sort((a, b) => a.pickupDate.toMillis() - b.pickupDate.toMillis()),
    [visibleCartItems]
  );

  const { cartTotal, cartItemCount } = useMemo(() => {
    if (pendingRemovalIds.length === 0) {
      return { cartTotal: originalCartTotal, cartItemCount: originalCartItemCount };
    }
    const pendingItems = cartItems.filter(item => {
      const uniqueId = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      return pendingRemovalIds.includes(uniqueId) && item.status === 'RESERVATION';
    });
    
    const pendingTotal = pendingItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const pendingCount = pendingItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      cartTotal: originalCartTotal - pendingTotal,
      cartItemCount: originalCartItemCount - pendingCount,
    };
  }, [cartItems, pendingRemovalIds, originalCartTotal, originalCartItemCount]);

  const handleRemoveItem = (item: CartItem) => {
    const { productId, variantGroupId, itemId } = item;
    const uniqueId = `${productId}-${variantGroupId}-${itemId}`;

    setPendingRemovalIds(prev => [...prev, uniqueId]);

    const timerId = setTimeout(() => {
      removeFromCart(productId, variantGroupId, itemId);
      setPendingRemovalIds(prev => prev.filter(id => id !== uniqueId));
      delete removalTimers.current[uniqueId];
      toast.success(`${item.productName}이(가) 완전히 삭제되었습니다.`);
    }, 4000);

    removalTimers.current[uniqueId] = timerId;

    toast.custom((t) => (
      <div className="undo-toast">
        <span>{`${item.productName} 삭제됨`}</span>
        <button onClick={() => {
          clearTimeout(removalTimers.current[uniqueId]);
          delete removalTimers.current[uniqueId];
          setPendingRemovalIds(prev => prev.filter(id => id !== uniqueId));
          toast.dismiss(t.id);
          toast.error('삭제가 취소되었습니다.');
        }}>
          실행 취소
        </button>
      </div>
    ), {
      id: `undo-${uniqueId}`,
      duration: 4000,
      className: 'toast-style-primary',
    });
  };

  const handleConfirmReservation = async () => {
    if (!user || !user.uid) { 
      toast.error('로그인 정보가 유효하지 않습니다.'); 
      navigate('/login', { state: { from: location }, replace: true }); 
      return; 
    }
    if (isProcessingOrder || reservationItems.length === 0) return;
    
    const orderPayload: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'> = {
        userId: user.uid,
        items: reservationItems,
        totalPrice: cartTotal,
        customerInfo: { name: user.displayName || '미상', phone: user.phoneNumber || '' },
        pickupDate: reservationItems[0].pickupDate,
    };

    setIsProcessingOrder(true);

    const promise = submitOrder(orderPayload);

    toast.promise(promise, {
      loading: '예약을 확정하는 중입니다...',
      success: (result) => {
        removeReservedItems();
        navigate('/mypage/history');
        return result.reservedCount > 0 
          ? '예약이 성공적으로 완료되었습니다!'
          : '예약된 상품 없이 대기만 신청되었습니다.';
      },
      error: (err) => err.message || '예약 확정 중 오류가 발생했습니다.',
    }).finally(() => {
      setIsProcessingOrder(false);
    });
  };

  const showOrderConfirmation = () => {
    toast((t) => (
      <div className="confirmation-toast-simple">
        <h4>예약을 확정하시겠습니까?</h4>
        <p>예약 상품만 주문되며, 대기 상품은 포함되지 않습니다.</p>
        <div className="toast-buttons-simple">
          <button className="toast-cancel-btn-simple" onClick={() => toast.dismiss(t.id)}>
            취소
          </button>
          <button className="toast-confirm-btn-simple" onClick={() => { 
              toast.dismiss(t.id); 
              handleConfirmReservation(); 
            }}>
            확인
          </button>
        </div>
      </div>
    ), { 
      duration: 6000,
      className: 'toast-style-light',
    });
  };

  const handleQuantityClick = (item: CartItem) => {
    setEditingQuantityId(`${item.productId}-${item.variantGroupId}-${item.itemId}`);
    setInputValue(item.quantity.toString());
  };

  const handleQuantityBlur = (item: CartItem) => {
    const newQuantity = parseInt(inputValue, 10);
    if (!isNaN(newQuantity) && newQuantity > 0) {
      updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, newQuantity);
    }
    setEditingQuantityId(null);
  };
  
  const handleInputKeyDown = (event: React.KeyboardEvent, item: CartItem) => {
    if (event.key === 'Enter') {
      handleQuantityBlur(item);
    }
  };
  
  const createQuantityHandlers = useCallback((item: CartItem, change: number) => {
    const performUpdate = () => {
        const currentItem = cartItems.find(ci => 
            ci.productId === item.productId && 
            ci.variantGroupId === item.variantGroupId && 
            ci.itemId === item.itemId
        );
        if (!currentItem) return;

        const newQuantity = currentItem.quantity + change;
        if (newQuantity < 1) return;
        
        updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, newQuantity);
    };
    return useLongPress(performUpdate, performUpdate);
  }, [cartItems, updateCartItemQuantity]);
  
  useEffect(() => {
    if (editingQuantityId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingQuantityId]);

  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const formatPickupDate = (timestamp: Timestamp) => format(timestamp.toDate(), 'M/d(EEE)', { locale: ko });
  
  const renderCartItemCard = (item: CartItem) => {
    const isEditing = editingQuantityId === `${item.productId}-${item.variantGroupId}-${item.itemId}`;
    const decreaseHandlers = createQuantityHandlers(item, -1);
    const increaseHandlers = createQuantityHandlers(item, 1);
    
    return (
      <div key={`${item.productId}-${item.variantGroupId}-${item.itemId}`} className={`cart-item-card ${item.status === 'WAITLIST' ? 'waitlist-item' : ''}`}>
        <div className="item-image-wrapper" onClick={() => navigate(`/product/${item.productId}`)}>
          <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
        </div>

        <div className="item-details-wrapper">
          <div className="item-header">
            <div className="item-name-group">
              <span className="item-product-name">{item.variantGroupName}</span>
              <span className="item-option-name">선택: {item.itemName}</span>
            </div>
            <button className="item-remove-btn" onClick={() => handleRemoveItem(item)} disabled={isProcessingOrder}>
              <Trash2 size={18} />
            </button>
          </div>

          <div className="item-body">
            <div className="item-pickup-info">
              <CalendarDays size={14} />
              <span>픽업: {formatPickupDate(item.pickupDate)}</span>
            </div>
            {item.status === 'WAITLIST' && (
              <div className="waitlist-status-badge">
                <Info size={14}/>
                <span>재고 확보 시 자동 예약 전환</span>
              </div>
            )}
          </div>
          
          <div className="item-footer">
            <div className="item-quantity-controls">
              <button {...decreaseHandlers} disabled={item.quantity <= 1 || isProcessingOrder}>
                <Minus size={16} />
              </button>
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="number"
                  className="quantity-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={() => handleQuantityBlur(item)}
                  onKeyDown={(e) => handleInputKeyDown(e, item)}
                />
              ) : (
                <span className="quantity-display" onClick={() => handleQuantityClick(item)}>
                  {item.quantity}
                </span>
              )}
              <button {...increaseHandlers} disabled={isProcessingOrder}>
                <Plus size={16} />
              </button>
            </div>

            {item.status === 'RESERVATION' && (
              <div className="item-total-price">
                {(item.unitPrice * item.quantity).toLocaleString()}원
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container">
        <div className="cart-section-title">🛒 예약 상품 ({reservationItems.length})</div>
        {reservationItems.length > 0 ? (
          <div className="cart-items-list">
            {reservationItems.map(renderCartItemCard)}
          </div>
        ) : (
          <div className="info-box">
            <p>장바구니에 담긴 예약 상품이 없습니다.</p>
          </div>
        )}

        <div className="cart-section-title waitlist-title">
          <Hourglass size={18}/> 대기 상품 ({waitlistItems.length})
        </div>
        {waitlistItems.length > 0 ? (
          <div className="cart-items-list">
            {waitlistItems.map(renderCartItemCard)}
          </div>
        ) : (
          <div className="info-box">
            <p>품절 상품에 '대기 신청'을 하면 여기에 표시됩니다.</p>
          </div>
        )}
        
        {cartItems.length === 0 && (
          <div className="empty-cart-message">
            <CartIcon size={64} className="empty-cart-icon" />
            <p>장바구니와 대기 목록이 비어있습니다.</p>
            <Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
          </div>
        )}
      </div>

      {reservationItems.length > 0 && (
        <div className="cart-summary-sticky-footer">
          <div className="summary-row total-amount">
            <span className="total-label">총 예약 금액</span>
            <span className="total-price-value">{cartTotal.toLocaleString()}원</span>
          </div>
          <button className="checkout-btn" onClick={showOrderConfirmation} disabled={isProcessingOrder}>
            {isProcessingOrder ? '처리 중...' : `총 ${cartItemCount}개 예약 확정하기`}
            {!isProcessingOrder && <ArrowRight size={20} />}
          </button>
        </div>
      )}
    </div>
  );
};

export default CartPage;