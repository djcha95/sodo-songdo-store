// src/pages/customer/CartPage.tsx

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, Order } from '@/types';
import { submitOrder } from '@/firebase/orderService';
import type { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Trash2, Plus, Minus, CalendarDays, Hourglass, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import './CartPage.css'; // ✅✅✅ 이 한 줄이 모든 문제의 해결책입니다!

const CartPage: React.FC = () => {
  const { user } = useAuth();
  const { cartItems, clearCart, cartTotal, removeFromCart, updateCartItemQuantity, addToCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  // 직접 수량 입력을 위한 상태
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 픽업 날짜가 빠른 순서대로 장바구니 아이템을 정렬
  const sortedItems = useMemo(() => {
    return [...cartItems].sort((a, b) => a.pickupDate.toMillis() - b.pickupDate.toMillis());
  }, [cartItems]);

  const handleRemoveItem = (item: CartItem) => {
    const { productId, variantGroupId, itemId } = item;
    
    removeFromCart(productId, variantGroupId, itemId);

    toast.success(
      (t) => (
        <div className="undo-toast">
          <span>상품이 삭제되었습니다.</span>
          <button onClick={() => { addToCart(item); toast.dismiss(t.id); }}>
            <Undo2 size={16} /> 실행 취소
          </button>
        </div>
      ), { 
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
    if (isProcessingOrder || sortedItems.length === 0) return;
    
    const orderPayload: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'> = {
        userId: user.uid,
        items: sortedItems.map(item => ({
          productId: item.productId, roundId: item.roundId, roundName: item.roundName,
          variantGroupId: item.variantGroupId, itemId: item.itemId, productName: item.productName,
          variantGroupName: item.variantGroupName, itemName: item.itemName, imageUrl: item.imageUrl,
          unitPrice: item.unitPrice, quantity: item.quantity,
        })),
        totalPrice: cartTotal,
        customerInfo: { name: user.displayName || '미상', phone: user.phoneNumber || '' },
        pickupDate: sortedItems[0].pickupDate,
    };

    setIsProcessingOrder(true);
    const loadingToastId = toast.loading('예약을 확정하는 중입니다...');
    
    try {
        await submitOrder(orderPayload);
        toast.success('예약이 성공적으로 완료되었습니다!', { 
            id: loadingToastId,
            iconTheme: { primary: 'var(--accent-color)', secondary: '#fff' }
        });
        clearCart();
        navigate('/mypage/history');
    } catch (error: any) {
        console.error("Order submission failed:", error);
        toast.error(error.message || '예약 확정 중 오류가 발생했습니다.', { id: loadingToastId });
    } finally {
        setIsProcessingOrder(false);
    }
  };

  const showOrderConfirmation = () => {
    toast((t) => (
      <div className="confirmation-toast-simple">
        <h4>예약을 확정하시겠습니까?</h4>
        <p>픽업 마감 시간을 넘기면 노쇼로 처리될 수 있습니다.</p>
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
  
  const createLongPressHandlers = useCallback((item: CartItem, change: number) => {
    const callback = () => {
        const currentItem = cartItems.find(ci => ci.productId === item.productId && ci.variantGroupId === item.variantGroupId && ci.itemId === item.itemId);
        if (!currentItem) return;

        const newQuantity = currentItem.quantity + change;
        if (newQuantity < 1) return;
        
        updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, newQuantity);
    };
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useLongPress(callback);
  }, [cartItems, updateCartItemQuantity]);
  
  useEffect(() => {
    if (editingQuantityId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingQuantityId]);

  const formatPickupDate = (timestamp: Timestamp) => format(timestamp.toDate(), 'M/d(EEE)', { locale: ko });

  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container cart-page-container">
        {sortedItems.length === 0 ? (
          <div className="empty-cart-message">
            <CartIcon size={64} className="empty-cart-icon" />
            <p>장바구니에 담긴 상품이 없습니다.</p>
            <Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
          </div>
        ) : (
          <>
            <div className="cart-section-title">🛒 예약 상품 ({sortedItems.length})</div>
            <div className="cart-items-list">
              {sortedItems.map((item) => {
                const isEditing = editingQuantityId === `${item.productId}-${item.variantGroupId}-${item.itemId}`;
                const decreaseHandlers = createLongPressHandlers(item, -1);
                const increaseHandlers = createLongPressHandlers(item, 1);
                
                return (
                  <div key={`${item.productId}-${item.variantGroupId}-${item.itemId}`} className="cart-item-card-final">
                    <div className="item-image-wrapper" onClick={() => navigate(`/product/${item.productId}`)}>
                      <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
                    </div>
                    <div className="item-content-wrapper">
                      <div className="item-info-row">
                        <span className="item-main-name">{item.variantGroupName}</span>
                        <button className="item-remove-btn" onClick={() => handleRemoveItem(item)} disabled={isProcessingOrder}><Trash2 size={18} /></button>
                      </div>
                      
                      <div className="item-details-row">
                        <span className="item-option-name">선택: {item.itemName}</span>
                        <span className="item-pickup-date">
                          <CalendarDays size={14} />
                          {formatPickupDate(item.pickupDate)}
                        </span>
                      </div>
                      
                      <div className="item-actions-row">
                        <div className="item-quantity-controls">
                           <button {...decreaseHandlers} disabled={item.quantity <= 1 || isProcessingOrder}><Minus size={16} /></button>
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
                           <button {...increaseHandlers} disabled={isProcessingOrder}><Plus size={16} /></button>
                        </div>
                        <div className="item-price-box">
                          <span>{(item.unitPrice * item.quantity).toLocaleString()}</span>원
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="cart-section-title waitlist-title"><Hourglass size={18}/> 대기 상품 (0)</div>
            <div className="waitlist-info-box">
              <p>품절된 상품의 '대기 신청'을 누르면 이곳에 표시됩니다.</p>
              <span>재고가 추가되거나 예약이 취소되면, 선착순으로 자동 예약 처리 후 알림을 보내드려요!</span>
            </div>
          </>
        )}
      </div>
      {cartItems.length > 0 && (
        <div className="cart-summary-sticky-footer">
          <div className="summary-row total-amount">
            <span className="total-label">총 예약 금액</span>
            <span className="total-price-value">{cartTotal.toLocaleString()}원</span>
          </div>
          <button className="checkout-btn" onClick={showOrderConfirmation} disabled={isProcessingOrder}>
            {isProcessingOrder ? '예약 처리 중...' : `${cartItems.length}개 상품 예약 확정하기`}
            <ArrowRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CartPage;