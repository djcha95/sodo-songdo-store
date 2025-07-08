// src/pages/customer/CartPage.tsx

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, OrderStatus } from '@/types'; // 💡 [수정] 사용하지 않는 OrderItem 타입 임포트 제거
import { submitOrder } from '@/firebase/orderService';
import { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Trash2, Plus, Minus, CalendarDays, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import './CartPage.css';

const CartPage: React.FC = () => {
  const { user } = useAuth();
  const { cartItems, clearCart, cartTotal, removeFromCart, updateCartItemQuantity } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  useEffect(() => {
    if (!user) {
      toast.error('로그인하시면 장바구니를 확인하고 예약할 수 있습니다.');
      navigate('/login');
    }
  }, [user, navigate]);

  const handleRemoveItem = (item: CartItem) => {
    toast((t) => (
      <div className="removal-toast">
        <div className="removal-toast-header">
          <AlertTriangle size={20} className="removal-icon" />
          <h4>상품을 삭제하시겠습니까?</h4>
        </div>
        <p className="removal-toast-body">
          {item.productName} - {item.selectedUnit}
        </p>
        <div className="toast-buttons">
          <button className="toast-cancel-btn" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button
            className="toast-confirm-btn"
            onClick={() => {
              removeFromCart(item.productId, item.variantGroupId, item.itemId);
              toast.dismiss(t.id);
              toast.success('상품이 삭제되었습니다.', { id: 'item-removed-success' });
            }}
          >
            삭제
          </button>
        </div>
      </div>
    ), { duration: 6000 });
  };

  const handleConfirmReservation = async () => {
    if (!user) { toast.error('로그인 정보가 유효하지 않습니다.'); navigate('/login'); return; }
    if (isProcessingOrder) return;
    setIsProcessingOrder(true);

    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        // 💡 [수정] cartItems를 OrderItem[] 타입으로 변환하는 로직 추가
        const orderItems = cartItems.map(item => ({
          ...item, // CartItem의 모든 속성을 복사
          name: item.productName, // `name` 속성 추가
          unit: item.selectedUnit, // `unit` 속성 추가
          price: item.unitPrice,  // `price` 속성 추가
        }));

        await submitOrder({
          userId: user.uid,
          customerName: user.displayName || '미상',
          customerPhoneLast4: '0000',
          items: orderItems, // 변환된 orderItems 사용
          totalPrice: cartTotal,
          orderDate: Timestamp.now(),
          pickupDate: cartItems[0].pickupDate,
          pickupDeadlineDate: cartItems[0].pickupDate,
          status: 'pending' as OrderStatus,
        });
        clearCart(); navigate('/mypage/history'); resolve();
      } catch (error) { console.error('예약 확정 중 오류:', error); reject(error); }
    });

    toast.promise(promise, {
      loading: '예약을 확정하는 중입니다...', success: '예약이 성공적으로 확정되었습니다!', error: '예약 확정 중 오류가 발생했습니다.',
    }).finally(() => setIsProcessingOrder(false));
  };

  const showOrderConfirmation = () => {
    toast((t) => (
      <div className="confirmation-toast">
        <h3>예약을 확정하시겠습니까?</h3>
        <p className="modal-warning-text">픽업 마감 시간을 넘기면 노쇼로 처리될 수 있습니다.</p>
        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="modal-confirm-btn" onClick={() => { toast.dismiss(t.id); handleConfirmReservation(); }}>확정</button>
        </div>
      </div>
    ), { duration: 6000 });
  };
  
  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '미정';
    return format(timestamp.toDate(), 'M/d(EEE) HH:mm', { locale: ko });
  };

  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container cart-page-container">
        {cartItems.length === 0 ? (
          <div className="empty-cart-message">
            <CartIcon size={64} className="empty-cart-icon" />
            <p>장바구니에 담긴 상품이 없습니다.</p>
            <Link to="/" className="continue-shopping-btn">쇼핑 계속하기</Link>
          </div>
        ) : (
          <div className="cart-items-list">
            {cartItems.map((item) => (
              <div key={`${item.productId}-${item.variantGroupId}-${item.itemId}`} className="cart-item-card">
                <div className="item-image-wrapper" onClick={() => navigate(`/products/${item.productId}`, { state: { background: location } })}>
                  <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.productName} className="item-image" loading="lazy" />
                </div>
                <div className="item-content-wrapper">
                  <div className="item-info-row">
                    <span className="item-name" onClick={() => navigate(`/products/${item.productId}`, { state: { background: location } })}>{item.productName}</span>
                    <button className="item-remove-btn" onClick={() => handleRemoveItem(item)} disabled={isProcessingOrder}><Trash2 size={18} /></button>
                  </div>
                  <div className="item-unit-row"><p className="item-unit">{item.variantGroupName} - {item.selectedUnit}</p></div>
                  <div className="item-pickup-row"><CalendarDays size={14} /><p>{formatDate(item.pickupDate)} 픽업</p></div>
                  <div className="item-actions-row">
                    <div className="item-quantity-controls">
                      <button onClick={() => updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, item.quantity - 1)} disabled={item.quantity <= 1 || isProcessingOrder}><Minus size={16} /></button>
                      <span className="quantity-display">{item.quantity}</span>
                      <button onClick={() => updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, item.quantity + 1)} disabled={isProcessingOrder}><Plus size={16} /></button>
                    </div>
                    <span className="item-price">{(item.unitPrice * item.quantity).toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {cartItems.length > 0 && (
        <div className="cart-summary-sticky-footer">
          <div className="summary-row total-amount">
            <span>총 예약 금액</span>
            <span className="total-price-value">{cartTotal.toLocaleString()}원</span>
          </div>
          <button className="checkout-btn" onClick={showOrderConfirmation} disabled={isProcessingOrder}>
            {isProcessingOrder ? '예약 처리 중...' : `예약 확정하기`}
            <ArrowRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CartPage;