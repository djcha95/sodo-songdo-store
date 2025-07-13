// src/pages/customer/CartPage.tsx

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { CartItem, Order } from '@/types';
import { submitOrder, getLiveStockForItems } from '@/firebase';
import type { Timestamp } from 'firebase/firestore';
import { ShoppingCart as CartIcon, ArrowRight, Plus, Minus, CalendarDays, Hourglass, Info, RefreshCw, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import './CartPage.css';

// --- CartItemCard 컴포넌트 ---
interface CartItemCardProps {
  item: CartItem;
  isSelected: boolean;
  onSelect: (itemKey: string) => void;
  onImageClick: (e: React.MouseEvent, productId: string) => void;
}

const CartItemCard: React.FC<CartItemCardProps> = ({ item, isSelected, onSelect, onImageClick }) => {
  const { updateCartItemQuantity } = useCart();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(item.quantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  // 재고가 null이거나 -1이면 무한대 (999)로 간주, 아니면 실제 재고 사용
  const stockLimit = useMemo(() => item.stock === null || item.stock === -1 ? 999 : item.stock, [item.stock]);

  useEffect(() => {
    // 수량 변경 모드가 아닐 때만 실제 수량으로 입력 값 동기화
    if (!isEditing) setInputValue(item.quantity.toString());
  }, [item.quantity, isEditing]);

  useEffect(() => {
    // 편집 모드 진입 시 입력 필드에 포커스
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const handleQuantityClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 선택 이벤트 방지
    setIsEditing(true);
  };

  const handleQuantityUpdate = useCallback(() => {
    const newQuantity = parseInt(inputValue, 10);
    // 입력된 값이 유효하지 않거나 0 이하일 경우 1로 설정, 재고 제한 초과 시 재고 제한으로 설정
    const finalQuantity = !isNaN(newQuantity) && newQuantity > 0 ? Math.min(newQuantity, stockLimit) : 1;

    // 수량이 변경될 경우에만 업데이트
    if (finalQuantity !== item.quantity) {
      updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, finalQuantity);
      if (newQuantity > stockLimit) {
        toast.error(`최대 ${stockLimit}개까지만 구매 가능합니다.`);
      } else if (newQuantity < 1) {
        toast.error('최소 1개 이상 구매해야 합니다.');
      }
    }
    setIsEditing(false); // 편집 모드 종료
  }, [inputValue, item, stockLimit, updateCartItemQuantity]);

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleQuantityUpdate(); // Enter 키 입력 시 수량 업데이트
    }
  };

  // 수량 증감 버튼을 위한 long-press 훅
  const createQuantityHandlers = useCallback((change: number) => {
    const performUpdate = () => {
      const newQuantity = item.quantity + change;
      // 수량이 1 미만이거나 재고 제한을 초과하면 업데이트하지 않음
      if (newQuantity < 1 || newQuantity > stockLimit) return;
      updateCartItemQuantity(item.productId, item.variantGroupId, item.itemId, newQuantity);
    };
    return useLongPress(performUpdate, performUpdate, { delay: 100 });
  }, [item, stockLimit, updateCartItemQuantity]);

  const decreaseHandlers = createQuantityHandlers(-1);
  const increaseHandlers = createQuantityHandlers(1);

  // 픽업 날짜 포맷 변경: 'M/d(EEE) 픽업' (예: 7/17(목) 픽업)
  const formatPickupDate = (timestamp: Timestamp) => format(timestamp.toDate(), 'M/d(EEE)', { locale: ko }) + ' 픽업';
  const itemKey = `${item.productId}-${item.variantGroupId}-${item.itemId}`;

  return (
    <div className={`cart-item-card ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(itemKey)}>
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
              // ✅ 수정: 수량에 관계없이 개당 단가를 표시
              <div className="item-total-price">{item.unitPrice.toLocaleString()}원  </div>
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
    removeItems, removeReservedItems, updateItemsStatus, 
    reservationTotal, reservationItemCount // ✅ cartTotal -> reservationTotal, cartItemCount -> reservationItemCount 로 변경
  } = useCart();
  const navigate = useNavigate();

  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [isWaitlistProcessing, setIsWaitlistProcessing] = useState(false);
  const [selectedReservationKeys, setSelectedReservationKeys] = useState<Set<string>>(new Set());
  const [selectedWaitlistKeys, setSelectedWaitlistKeys] = useState<Set<string>>(new Set());

  // 대기 상품 자동 예약 전환 및 만료 처리
  useEffect(() => {
    const waitlistItemsToCheck = allItems.filter(item => item.status === 'WAITLIST');
    if (waitlistItemsToCheck.length === 0) return;

    const processWaitlist = async () => {
      setIsWaitlistProcessing(true);
      try {
        const liveStockInfo = await getLiveStockForItems(waitlistItemsToCheck);
        const itemsToConvert: string[] = [];
        const itemsToRemove: { key: string, name: string }[] = [];
        const now = new Date();

        waitlistItemsToCheck.forEach(item => {
          const uniqueId = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
          const pickupDate = item.pickupDate.toDate();
          // 픽업일 당일 13시 마감
          const pickupDeadlineTime = new Date(pickupDate.getFullYear(), pickupDate.getMonth(), pickupDate.getDate(), 13, 0, 0);

          if (now > pickupDeadlineTime) {
            itemsToRemove.push({ key: uniqueId, name: item.productName });
          } else {
            const stock = liveStockInfo[uniqueId];
            // 재고가 충분하면 예약으로 전환
            if (stock && (stock.itemStock === -1 || stock.itemStock >= item.quantity) && (stock.groupStock === null || stock.groupStock === -1 || stock.groupStock >= item.quantity)) {
              itemsToConvert.push(uniqueId);
            }
          }
        });

        if (itemsToConvert.length > 0) {
          updateItemsStatus(itemsToConvert, 'RESERVATION');
          toast.success(`${itemsToConvert.length}개 대기 상품이 예약으로 자동 전환되었습니다!`);
        }
        if (itemsToRemove.length > 0) {
          removeItems(itemsToRemove.map(i => i.key));
          itemsToRemove.forEach(item => toast.error(`'${item.name}' 대기 상품이 마감되어 자동 삭제되었습니다.`));
        }
      } catch (error) {
        console.error("대기 목록 처리 중 오류:", error);
        toast.error("대기 목록을 업데이트하는 중 문제가 발생했습니다.");
      } finally {
        setIsWaitlistProcessing(false);
      }
    };
    processWaitlist();
  }, [allItems, removeItems, updateItemsStatus]); // ✅ 의존성 배열도 allItems로 변경

  // 아이템 선택/선택 해제 핸들러
  const handleItemSelect = useCallback((itemKey: string, type: 'reservation' | 'waitlist') => {
    if (type === 'reservation') {
      setSelectedReservationKeys(prev => {
        const newSet = new Set(prev);
        if (newSet.has(itemKey)) {
          newSet.delete(itemKey);
        } else {
          newSet.add(itemKey);
        }
        return newSet;
      });
    } else { // waitlist
      setSelectedWaitlistKeys(prev => {
        const newSet = new Set(prev);
        if (newSet.has(itemKey)) {
          newSet.delete(itemKey);
        } else {
          newSet.add(itemKey);
        }
        return newSet;
      });
    }
  }, []);

  // 선택된 아이템 일괄 삭제 핸들러
  const handleBulkRemove = useCallback((type: 'reservation' | 'waitlist') => {
    const keysToRemove = type === 'reservation' ? selectedReservationKeys : selectedWaitlistKeys;
    if (keysToRemove.size === 0) {
      toast('삭제할 상품을 선택해주세요.', { icon: 'ℹ️' });
      return;
    }

    toast((t) => (
      <div className="confirmation-toast-simple">
        <h4>선택된 상품을 삭제하시겠습니까?</h4>
        <p>{keysToRemove.size}개의 상품이 장바구니에서 삭제됩니다.</p>
        <div className="toast-buttons-simple">
          <button className="toast-cancel-btn-simple" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="toast-confirm-btn-simple" onClick={() => {
            toast.dismiss(t.id);
            removeItems(Array.from(keysToRemove));
            if (type === 'reservation') setSelectedReservationKeys(new Set());
            else setSelectedWaitlistKeys(new Set());
            toast.success('선택된 상품이 삭제되었습니다.');
          }}>삭제</button>
        </div>
      </div>
    ), { duration: 6000 });
  }, [selectedReservationKeys, selectedWaitlistKeys, removeItems]);

  // 이미지 클릭 시 상품 상세 페이지로 이동
  const handleImageClick = useCallback((e: React.MouseEvent, productId: string) => {
    e.stopPropagation(); // 카드 선택 이벤트 방지
    navigate(`/product/${productId}`);
  }, [navigate]);

  // 예약 확정 핸들러
  const handleConfirmReservation = async () => {
    if (!user || !user.uid || !userDocument?.phone) {
      toast.error('전화번호 정보가 없습니다. 다시 로그인 해주세요.');
      navigate('/login', { state: { from: '/cart' }, replace: true });
      return;
    }
    if (isProcessingOrder || reservationItems.length === 0) return;

    const orderPayload: Omit<Order, 'id' | 'createdAt' | 'orderNumber' | 'status'> = {
        userId: user.uid,
        items: reservationItems,
        totalPrice: reservationTotal, // ✅ cartTotal -> reservationTotal
        customerInfo: { name: user.displayName || '미상', phone: userDocument.phone },
        // 예약 상품들은 이미 픽업일이 같다고 가정
        pickupDate: reservationItems[0].pickupDate,
    };
    setIsProcessingOrder(true);
    const promise = submitOrder(orderPayload);
    toast.promise(promise, {
      loading: '예약을 확정하는 중입니다...',
      success: () => {
        removeReservedItems(); // 예약 확정 후 예약된 상품들을 장바구니에서 제거
        navigate('/mypage/history');
        return '예약이 성공적으로 완료되었습니다!';
      },
      error: (err) => (err as Error).message || '예약 확정 중 오류가 발생합니다.',
    }).finally(() => {
      setIsProcessingOrder(false);
    });
  };

  // 예약 확정 확인 모달 표시
  const showOrderConfirmation = () => {
    if (reservationItems.length === 0) {
      toast.error('예약할 상품이 없습니다.');
      return;
    }
    toast((t) => (
      <div className="confirmation-toast-simple">
        <h4>예약을 확정하시겠습니까?</h4>
        <p>예약 상품만 주문되며, 대기 상품은 포함되지 않습니다.</p>
        <div className="toast-buttons-simple">
          <button className="toast-cancel-btn-simple" onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="toast-confirm-btn-simple" onClick={() => { toast.dismiss(t.id); handleConfirmReservation(); }}>확인</button>
        </div>
      </div>
    ), { duration: 6000 });
  };


  return (
    <div className="cart-page-wrapper">
      <div className="customer-page-container">
        <div className="cart-page-layout">
          <div className="cart-items-column">
            <div className="cart-section-header">
              <h2 className="cart-section-title">🛒 예약 상품 ({reservationItems.length})</h2>
              {/* 선택 삭제 버튼은 선택된 아이템이 있을 때만 표시 */}
              {selectedReservationKeys.size > 0 && (
                <button className="bulk-remove-btn" onClick={() => handleBulkRemove('reservation')}>
                  <XCircle size={16} /> 선택 삭제 ({selectedReservationKeys.size})
                </button>
              )}
            </div>
            {reservationItems.length > 0 ? (
              <div className="cart-items-list">
                {reservationItems.map(item => {
                  const itemKey = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
                  return (
                    <CartItemCard
                      key={itemKey}
                      item={item}
                      isSelected={selectedReservationKeys.has(itemKey)}
                      onSelect={(key) => handleItemSelect(key, 'reservation')}
                      onImageClick={handleImageClick}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="info-box"><p>장바구니에 담긴 예약 상품이 없습니다.</p></div>
            )}

            {/* 대기 상품 섹션 */}
            <div className="waitlist-section">
              <div className="cart-section-header waitlist-header">
                <h2 className="cart-section-title">
                  <Hourglass size={18}/> 대기 상품 ({waitlistItems.length})
                  {isWaitlistProcessing && <RefreshCw size={18} className="spin-icon" />}
                </h2>
                {/* 선택 삭제 버튼은 선택된 아이템이 있을 때만 표시 */}
                {selectedWaitlistKeys.size > 0 && (
                  <button className="bulk-remove-btn" onClick={() => handleBulkRemove('waitlist')}>
                    <XCircle size={16} /> 선택 삭제 ({selectedWaitlistKeys.size})
                  </button>
                )}
              </div>
              {waitlistItems.length > 0 ? (
                <div className="cart-items-list">
                  {waitlistItems.map(item => {
                    const itemKey = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
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

            {allItems.length === 0 && (
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
                  <h3 className="summary-title">예약 정보 요약</h3>
                  <div className="summary-row total-amount">
                    <span className="total-label">총 예약 상품</span>
                    <span className="total-item-count">{reservationItemCount} 개</span> {/* ✅ cartItemCount -> reservationItemCount */}
                  </div>
                  <div className="summary-row total-amount">
                    <span className="total-label">총 예약 금액</span>
                    <span className="total-price-value">{reservationTotal.toLocaleString()}원</span> {/* ✅ cartTotal -> reservationTotal */}
                  </div>
                  <button className="checkout-btn" onClick={showOrderConfirmation} disabled={isProcessingOrder}>
                    {isProcessingOrder ? '처리 중...' : `예약 확정하기`}
                    {!isProcessingOrder && <ArrowRight size={20} />}
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