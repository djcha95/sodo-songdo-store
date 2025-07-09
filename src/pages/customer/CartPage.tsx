// src/pages/customer/CartPage.tsx

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, Order } from '@/types';
import { submitOrder } from '@/firebase/orderService';
import { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Trash2, Plus, Minus, CalendarDays, Hourglass, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import './CartPage.css';

const CartPage: React.FC = () => {
  const { user } = useAuth();
  const { cartItems, clearCart, cartTotal, removeFromCart, updateCartItemQuantity, addToCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  useEffect(() => {
    if (!user) {
      toast.error('로그인하시면 장바구니를 확인하고 예약할 수 있습니다.');
      navigate('/login', { state: { from: location }, replace: true });
    }
  }, [user, navigate, location]);

  const handleRemoveItem = (item: CartItem) => {
    const { productId, variantGroupId, itemId } = item;
    
    removeFromCart(productId, variantGroupId, itemId);

    toast.success(
      (t) => (
        <div className="undo-toast">
          <span>상품이 삭제되었습니다.</span>
          <button onClick={() => {
            addToCart(item);
            toast.dismiss(t.id);
          }}>
            <Undo2 size={16} />
            실행 취소
          </button>
        </div>
      ), { 
        duration: 4000,
        className: 'toast-style-primary',
    });
  };

  const handleConfirmReservation = async () => {
    if (!user || !user.uid) { toast.error('로그인 정보가 유효하지 않습니다.'); navigate('/login'); return; }
    if (isProcessingOrder) return;
    
    const orderPayload: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'> = {
        userId: user.uid,
        items: cartItems.map(item => ({
          productId: item.productId, roundId: item.roundId, roundName: item.roundName,
          variantGroupId: item.variantGroupId, itemId: item.itemId, productName: item.productName,
          variantGroupName: item.variantGroupName, itemName: item.itemName, imageUrl: item.imageUrl,
          unitPrice: item.unitPrice, quantity: item.quantity,
        })),
        totalPrice: cartTotal,
        customerInfo: { name: user.displayName || '미상', phone: user.phoneNumber || '' },
        pickupDate: cartItems[0].pickupDate,
    };

    setIsProcessingOrder(true);
    const loadingToastId = toast.loading('예약을 확정하는 중입니다...');
    try {
        await submitOrder(orderPayload);
        toast.success('예약이 성공적으로 확정되었습니다!', { id: loadingToastId });
        clearCart();
        navigate('/mypage/history');
    } catch (error: any) {
        toast.error(error.message || '예약 확정 중 오류가 발생했습니다.', { id: loadingToastId });
    } finally {
        setIsProcessingOrder(false);
    }
  };

  const showOrderConfirmation = () => {
    toast((t) => (
      <div className="confirmation-toast-final">
        <h4>예약을 확정할까요?</h4>
        <p>픽업 마감 시간을 넘기면 노쇼로 처리될 수 있어요.</p>
        <div className="toast-buttons-final">
          <button className="toast-cancel-btn-final" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="modal-confirm-btn" onClick={() => { toast.dismiss(t.id); handleConfirmReservation(); }}>확정하기</button>
        </div>
      </div>
    ), { 
      duration: 6000,
      // ✅ 흰색 배경 토스트를 위한 클래스 추가
      className: 'toast-style-light',
    });
  };
  
  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '미정';
    return format(timestamp.toDate(), 'M/d(EEE)', { locale: ko });
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
          <>
            <div className="cart-section-title">🛒 예약 상품 ({cartItems.length})</div>
            <div className="cart-items-list">
              {cartItems.map((item) => (
                <div key={`${item.productId}-${item.variantGroupId}-${item.itemId}`} className="cart-item-card-final">
                  <div className="item-image-wrapper" onClick={() => navigate(`/product/${item.productId}`, { state: { background: location } })}>
                    <img src={getOptimizedImageUrl(item.imageUrl, '200x200')} alt={item.itemName} className="item-image" loading="lazy" />
                  </div>
                  <div className="item-content-wrapper">
                    <div className="item-info-row">
                      {/* ✅ 하위 상품명(itemName)을 메인으로 표시 */}
                      <span className="item-name">{item.itemName}</span>
                      <button className="item-remove-btn" onClick={() => handleRemoveItem(item)} disabled={isProcessingOrder}><Trash2 size={18} /></button>
                    </div>
                    {/* ✅ 대표 상품명(productName)은 보조 정보로 표시 */}
                    <p className="item-group-name">{item.productName}</p>
                    <div className="item-pickup-row"><CalendarDays size={14} /><p>픽업일: {formatDate(item.pickupDate)}</p></div>
                    <div className="item-actions-row">
                      <div className="item-quantity-controls">
                        <button onClick={() => updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, item.quantity - 1)} disabled={item.quantity <= 1 || isProcessingOrder}><Minus size={16} /></button>
                        <span className="quantity-display">{item.quantity}</span>
                        <button onClick={() => updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, item.quantity + 1)} disabled={isProcessingOrder}><Plus size={16} /></button>
                      </div>
                      {/* ✅ 가격 UI 개선을 위해 div로 감싸고 클래스 부여 */}
                      <div className="item-price-box">
                          <span>{(item.unitPrice * item.quantity).toLocaleString()}</span>원
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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