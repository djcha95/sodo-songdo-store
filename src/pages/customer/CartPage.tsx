import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, OrderItem, OrderStatus } from '@/types';
import { createOrder } from '@/firebase';
import { Timestamp } from 'firebase/firestore';
import { Trash2, Minus, Plus, ShoppingCart as CartIcon, ArrowRight, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

import './CartPage.css';

const CartPage: React.FC = () => {
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const { user } = useAuth();
  const { cartItems, removeFromCart, updateCartItemQuantity, clearCart, cartTotal } = useCart();
  const navigate = useNavigate();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  useEffect(() => {
    if (!user) {
      alert('로그인하시면 장바구니를 확인하고 예약할 수 있습니다.');
      navigate('/login');
    }
  }, [user, navigate]);

  const handleQuantityChange = useCallback((item: CartItem, amount: number) => {
    const newQuantity = item.quantity + amount;
    if (newQuantity < 1) return;
    if (item.salesType === 'IN_STOCK' && item.availableStock !== -1 && newQuantity > item.availableStock) {
      alert(`선택하신 상품의 재고는 ${item.availableStock}개 입니다.`);
      return;
    }
    if (item.maxOrderPerPerson && newQuantity > item.maxOrderPerPerson) {
      alert(`1인당 최대 구매 수량은 ${item.maxOrderPerPerson}개 입니다.`);
      return;
    }
    updateCartItemQuantity(item.productId, item.selectedUnit, newQuantity);
  }, [updateCartItemQuantity]);

  const handleRemoveItem = useCallback((item: CartItem) => {
    if (window.confirm(`"${item.productName}" (${item.selectedUnit})을(를) 장바구니에서 삭제하시겠습니까?`)) {
      removeFromCart(item.productId, item.selectedUnit);
    }
  }, [removeFromCart]);

  const handleCheckoutButtonClick = () => {
    if (cartItems.length === 0) {
      alert('장바구니에 담긴 상품이 없습니다.');
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleConfirmReservation = async () => {
    setIsConfirmModalOpen(false);
    if (!user) {
      alert('로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.');
      navigate('/login');
      return;
    }
    if (isProcessingOrder) return;

    setIsProcessingOrder(true);
    try {
      const orderItems: OrderItem[] = cartItems.map((item) => ({
        id: item.productId,
        name: item.productName,
        quantity: item.quantity,
        price: item.unitPrice,
        unit: item.selectedUnit,
      }));

      const defaultPickupDate = new Date();
      defaultPickupDate.setDate(defaultPickupDate.getDate() + 1);
      const defaultPickupDeadlineDate = new Date(defaultPickupDate);
      defaultPickupDeadlineDate.setHours(23, 59, 59, 999);

      const customerName = user.displayName || '미상';
      const customerPhoneLast4 = '0000';
      const newOrderData = {
        userId: user.uid,
        customerName: customerName,
        customerPhoneLast4: customerPhoneLast4,
        items: orderItems,
        totalPrice: cartTotal,
        orderDate: Timestamp.now(),
        pickupDate: Timestamp.fromDate(defaultPickupDate),
        pickupDeadlineDate: Timestamp.fromDate(defaultPickupDeadlineDate),
        status: 'pending' as OrderStatus,
      };

      await createOrder(newOrderData);
      clearCart();
      alert('예약이 성공적으로 확정되었습니다!');
      navigate('/mypage/history');
    } catch (error) {
      console.error("예약 확정 중 오류 발생:", error);
      alert('예약 확정 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsProcessingOrder(false);
    }
  };

  const getPickupDateText = useCallback(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return format(date, 'M/d(EEE)', { locale: ko });
  }, []);

  if (!user) {
    return <div className="customer-page-container">로그인 정보 확인 중...</div>;
  }

  const renderCartItems = () => (
    <div className="cart-items-list">
      {cartItems.map((item) => (
        <div key={`${item.productId}-${item.selectedUnit}`} className="cart-item-card">
          <div className="item-image-wrapper" onClick={() => navigate(`/products/${item.productId}`)}>
            <img src={item.imageUrl} alt={item.productName} className="item-image" />
          </div>
          <div className="item-details">
            <h3 className="item-name" onClick={() => navigate(`/products/${item.productId}`)}>{item.productName}</h3>
            <p className="item-unit">{item.selectedUnit}</p>
            <p className="item-price">{item.unitPrice.toLocaleString()}원</p>
            {/* 픽업일 정보를 다시 이곳으로 이동 */}
            <div className="item-pickup-date">
              <CalendarDays size={16} />
              <span>픽업일: {getPickupDateText()}</span>
            </div>
          </div>
          <div className="item-controls-container">
            <button
              className="item-remove-btn"
              onClick={() => handleRemoveItem(item)}
              disabled={isProcessingOrder}
              aria-label="상품 삭제"
            >
              <Trash2 size={24} />
            </button>
            <div className="item-quantity-controls">
              <button
                onClick={() => handleQuantityChange(item, -1)}
                disabled={item.quantity <= 1 || isProcessingOrder}
                aria-label="수량 감소"
              >
                <Minus size={18} />
              </button>
              <span className="quantity-display">{item.quantity}</span>
              <button
                onClick={() => handleQuantityChange(item, 1)}
                disabled={isProcessingOrder}
                aria-label="수량 증가"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderCartSummary = () => (
    <div className="cart-summary-card">
      <button className="checkout-btn" onClick={handleCheckoutButtonClick} disabled={isProcessingOrder}>
        {isProcessingOrder ? '예약 처리 중...' : `예약 확정하기`}
        <ArrowRight size={20} style={{ marginLeft: '10px' }} />
      </button>
    </div>
  );

  const renderEmptyCart = () => (
    <div className="empty-cart-message">
      <CartIcon size={64} className="empty-cart-icon" />
      <p>장바구니에 담긴 상품이 없습니다.</p>
      <Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
    </div>
  );

  return (
    <>
      <Header title="장바구니" />
      <div className="customer-page-container cart-page-container">
        {cartItems.length === 0 ? (
          renderEmptyCart()
        ) : (
          <>
            {renderCartItems()}
            {renderCartSummary()}
          </>
        )}
      </div>
      {isConfirmModalOpen && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <div className="modal-content">
              <h3>예약을 확정하시겠습니까?</h3>
              <p className="modal-warning-text">
                예약 확정 후 픽업 마감 시간을 지나 취소하실 경우, 노쇼로 처리되어 서비스 이용에 제약이 있을 수 있습니다.
              </p>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setIsConfirmModalOpen(false)}>취소</button>
              <button className="modal-confirm-btn" onClick={handleConfirmReservation}>확정</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CartPage;