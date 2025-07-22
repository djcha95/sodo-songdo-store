// src/components/customer/ProductCard.tsx

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, Calendar, Check, ShieldX, Clock, ShoppingCart, Hourglass } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import toast from 'react-hot-toast';
import type { Product as OriginalProduct, CartItem, VariantGroup } from '@/types'; 
import useLongPress from '@/hooks/useLongPress';
import { safeToDate } from '@/utils/productUtils';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import './ProductCard.css';

type Product = OriginalProduct & {
  phase?: 'primary' | 'secondary' | 'past';
  deadlines?: {
    primaryEnd: Date | null;
    secondaryEnd: Date | null;
  }
}

type ProductActionState = 'PURCHASABLE' | 'REQUIRE_OPTION' | 'ENDED' | 'SCHEDULED' | 'WAITLIST_AVAILABLE' | 'ENCORE_REQUEST_AVAILABLE' | 'AWAITING_STOCK';

const QuantityInput: React.FC<{
  quantity: number;
  onUpdate: (newQuantity: number) => void;
  max: number;
}> = ({ quantity, onUpdate, max }) => {
  const [inputValue, setInputValue] = useState(quantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setInputValue(quantity.toString()); }, [quantity]);

  const handleUpdate = useCallback(() => {
    const numValue = parseInt(inputValue, 10);
    const finalQuantity = !isNaN(numValue) && numValue > 0 ? Math.min(numValue, max) : 1;
    if (finalQuantity !== quantity) {
      onUpdate(finalQuantity);
    }
  }, [inputValue, quantity, max, onUpdate]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUpdate();
      inputRef.current?.blur();
    }
  };

  const createQuantityHandlers = (delta: number) => {
    const performUpdate = () => {
      const newQuantity = quantity + delta;
      if (newQuantity >= 1 && newQuantity <= max) {
        onUpdate(newQuantity);
      }
    };
    return useLongPress(performUpdate, performUpdate, { delay: 100 });
  };

  const decreaseHandlers = createQuantityHandlers(-1);
  const increaseHandlers = createQuantityHandlers(1);

  return (
    <div className="quantity-controls">
      <button {...decreaseHandlers} className="quantity-btn" disabled={quantity <= 1}><Minus size={16} /></button>
      <input
        ref={inputRef}
        type="number"
        className="quantity-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleUpdate}
        onKeyDown={handleKeyDown}
      />
      <button {...increaseHandlers} className="quantity-btn" disabled={quantity >= max}><Plus size={16} /></button>
    </div>
  );
};


// ✅ [수정] reservedQuantitiesMap prop을 제거
interface ProductCardProps {
  product: Product;
}

// ✅ [수정] prop 구조분해 할당에서 reservedQuantitiesMap을 제거
const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart } = useCart();
  const { isSuspendedUser, userDocument } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [isJustAdded, setIsJustAdded] = useState(false);
  const addedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current); };
  }, []);

  const cardData = useMemo(() => {
    const displayRound = product.salesHistory?.[0];
    if (!displayRound) return null;

    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    const singleOptionVg: VariantGroup | undefined = !isMultiOption ? displayRound.variantGroups?.[0] : undefined;
    const singleOptionItem = singleOptionVg?.items?.[0] || null;

    const now = dayjs();
    const publishAt = safeToDate(displayRound.publishAt);
    const preOrderEndDate = safeToDate(displayRound.preOrderEndDate);
    const userTier = userDocument?.loyaltyTier;
    const isPreOrder = !!(publishAt && now.isBefore(publishAt) && preOrderEndDate && now.isBefore(preOrderEndDate) && userTier && displayRound.preOrderTiers?.includes(userTier));

    return {
      displayRound,
      isMultiOption,
      singleOptionItem,
      singleOptionVg,
      isPreOrder,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(safeToDate(displayRound.pickupDate)).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product, userDocument]);
  
  // ✅ [수정] reservedQuantitiesMap의 의존성을 제거하고, product 자체의 의존성으로 변경
  const actionState = useMemo<ProductActionState>(() => {
    if (!cardData) return 'ENDED';
    const { displayRound, isMultiOption, singleOptionVg, singleOptionItem } = cardData;

    if (!displayRound) return 'ENDED';
    
    if (!product.phase) {
      if (displayRound.status === 'ended' || displayRound.status === 'sold_out') return 'ENCORE_REQUEST_AVAILABLE';
      if (displayRound.status === 'scheduled') return 'SCHEDULED';
      return isMultiOption ? 'REQUIRE_OPTION' : 'PURCHASABLE';
    }

    if (product.phase === 'past') {
      return 'ENCORE_REQUEST_AVAILABLE';
    }
    
    if (product.phase === 'secondary') {
      let isAwaitingStock = false;
      if (isMultiOption) {
        isAwaitingStock = displayRound.variantGroups.some(
          vg => vg.totalPhysicalStock === null || vg.totalPhysicalStock === -1 || vg.totalPhysicalStock === 0
        );
      } else {
        const totalStock = singleOptionVg?.totalPhysicalStock;
        isAwaitingStock = totalStock === null || totalStock === -1 || totalStock === 0;
      }
      if (isAwaitingStock) {
        return 'AWAITING_STOCK';
      }
    }
    
    if (isMultiOption) {
      return 'REQUIRE_OPTION';
    }
        
    const reservedKey = `${product.id}-${displayRound.roundId}-${singleOptionVg?.id}`;
    // ✅ [수정] product.reservedQuantities 에서 직접 값을 읽도록 변경
    const reserved = product.reservedQuantities?.[reservedKey] || 0;
    const totalStock = singleOptionVg?.totalPhysicalStock;
    if (totalStock !== null && totalStock !== -1) {
      const remainingStock = (totalStock || 0) - reserved;
      if (remainingStock < (singleOptionItem?.stockDeductionAmount || 1)) {
        return product.phase === 'primary' ? 'WAITLIST_AVAILABLE' : 'ENCORE_REQUEST_AVAILABLE';
      }
    }

    return 'PURCHASABLE';
  }, [cardData, product]); // 의존성 배열 수정

  const handleCardClick = useCallback(() => { 
    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    if (product.id) {
        navigate(`/product/${product.id}`, { state: { background: location } }); 
    }
  }, [navigate, product.id, location, isSuspendedUser]); 
  
  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.singleOptionItem || isJustAdded) return;
    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    const { displayRound, singleOptionItem, singleOptionVg } = cardData;
    
    const reservedKey = `${product.id}-${displayRound.roundId}-${singleOptionVg?.id}`;
    // ✅ [수정] product.reservedQuantities 에서 직접 값을 읽도록 변경
    const reserved = product.reservedQuantities?.[reservedKey] || 0;
    const totalStock = singleOptionVg?.totalPhysicalStock;
    const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : (totalStock || 0) - reserved;

    if (quantity * (singleOptionItem.stockDeductionAmount || 1) > remainingStock) {
        toast.error('재고가 부족합니다.');
        return;
    }

    const cartItem: CartItem = {
      id: `reservation-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount || 1,
      productId: product.id, productName: product.groupName, imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId, roundName: displayRound.roundName,
      variantGroupId: singleOptionVg?.id || '', variantGroupName: singleOptionVg?.groupName || '',
      itemId: singleOptionItem.id || '', itemName: singleOptionItem.name,
      quantity, unitPrice: singleOptionItem.price, stock: singleOptionItem.stock,
      pickupDate: displayRound.pickupDate, status: 'RESERVATION',
      deadlineDate: displayRound.deadlineDate, isPrepaymentRequired: displayRound.isPrepaymentRequired ?? false,
    };
    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 담았어요!`);
    setQuantity(1);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);
  }, [product, quantity, cardData, addToCart, isJustAdded, isSuspendedUser]); // 의존성 배열 수정

  const handleAddToWaitlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.singleOptionItem || isJustAdded) return;
    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    const { displayRound, singleOptionItem, singleOptionVg } = cardData;
    const cartItem: CartItem = {
      id: `waitlist-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount || 1,
      productId: product.id, productName: product.groupName, imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId, roundName: displayRound.roundName,
      variantGroupId: singleOptionVg?.id || '', variantGroupName: singleOptionVg?.groupName || '',
      itemId: singleOptionItem.id || '', itemName: singleOptionItem.name,
      quantity, unitPrice: singleOptionItem.price, stock: -1,
      pickupDate: displayRound.pickupDate, status: 'WAITLIST',
      deadlineDate: displayRound.deadlineDate, isPrepaymentRequired: false,
    };
    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 대기 목록에 추가했습니다.`);
    setQuantity(1);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);
  }, [product, quantity, cardData, addToCart, isJustAdded, isSuspendedUser]);


  if (!cardData) return null;

  const { pickupDateFormatted, storageType, isPreOrder } = cardData;

  const getStorageTypeInfo = (type: typeof product.storageType) => {
    switch (type) {
      case 'FROZEN': return { label: '냉동', style: { backgroundColor: '#5c7cfa', color: '#fff' } };
      case 'COLD': return { label: '냉장', style: { backgroundColor: '#e63946', color: '#fff' } };
      case 'ROOM': return { label: '실온', style: { backgroundColor: '#212529', color: '#fff' } };
      default: return null;
    }
  };
  const storageInfo = getStorageTypeInfo(storageType);
  
  const renderActionControls = () => {
    if (isSuspendedUser) {
      return <div className="options-btn disabled"><ShieldX size={16} /> 참여 제한</div>;
    }

    switch (actionState) {
      case 'PURCHASABLE':
        const reservedKey = `${product.id}-${cardData.displayRound.roundId}-${cardData.singleOptionVg?.id}`;
        // ✅ [수정] product.reservedQuantities 에서 직접 값을 읽도록 변경
        const reserved = product.reservedQuantities?.[reservedKey] || 0;
        const totalStock = cardData.singleOptionVg?.totalPhysicalStock;
        const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : (totalStock || 0) - reserved;
        const maxStockForUI = Math.floor(remainingStock / (cardData.singleOptionItem?.stockDeductionAmount || 1));
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxStockForUI} />
            {isJustAdded ? <button className="add-to-cart-btn just-added" disabled><Check size={18} /> 담았어요</button>
                         : <button className="add-to-cart-btn" onClick={handleAddToCart}><ShoppingCart size={16} /> 담기</button>}
          </div>);
      case 'WAITLIST_AVAILABLE':
        const maxWaitlistQuantity = cardData.singleOptionItem?.limitQuantity || 99;
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxWaitlistQuantity} />
            {isJustAdded ? <button className="waitlist-action-btn just-added" disabled><Check size={18} /> 신청됨</button>
                         : <button className="waitlist-action-btn" onClick={handleAddToWaitlist}><Hourglass size={16} /> 대기</button>}
          </div>);
      case 'REQUIRE_OPTION':
        return <button className="options-btn" onClick={handleCardClick}>옵션 선택하기 <ChevronRight size={16} /></button>;
      case 'ENDED':
        return <div className="options-btn disabled">예약 종료</div>;
      case 'SCHEDULED':
        return <div className="options-btn disabled">판매 예정</div>;
      case 'ENCORE_REQUEST_AVAILABLE':
        return <button className="options-btn encore" onClick={handleCardClick}><Flame size={16} /> 앵콜 요청</button>;
      case 'AWAITING_STOCK':
        return <div className="options-btn disabled"><Hourglass size={16} /> 재고 준비중</div>;
      default: return null;
    }
  };

  const TopBadge = () => {
    if (actionState !== 'PURCHASABLE' && actionState !== 'REQUIRE_OPTION') return null;

    const { isMultiOption, singleOptionVg, displayRound } = cardData;
    let isLimited = false;
    let stockText = '한정수량';

    if (isMultiOption) {
      isLimited = displayRound.variantGroups.some(vg => vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1);
    } else if (singleOptionVg) {
      const totalStock = singleOptionVg.totalPhysicalStock;
      isLimited = totalStock !== null && totalStock !== -1;
      if (isLimited) {
        const reservedKey = `${product.id}-${displayRound.roundId}-${singleOptionVg.id}`;
        // ✅ [수정] product.reservedQuantities 에서 직접 값을 읽도록 변경
        const reserved = product.reservedQuantities?.[reservedKey] || 0;
        const remaining = (totalStock || 0) - reserved;
        stockText = `${remaining}개 한정`;
      }
    }
    
    if (!isLimited) return null;

    return (
      <div className="card-top-badge">
        <Flame size={14} /> {stockText}
      </div>
    );
  };


  return (
    <div className="product-card-wrapper">
      <div className="product-card-final" onClick={handleCardClick}>
        {isPreOrder && actionState !== 'ENDED' && actionState !== 'SCHEDULED' && product.phase !== 'past' &&(
          <div className="preorder-badge"><Clock size={12} /> 선주문</div>
        )}
        <TopBadge />
        <div className="card-image-container">
          <img src={getOptimizedImageUrl(product.imageUrls?.[0], '200x200')} alt={product.groupName} loading="lazy" />
          {(product.phase === 'past' || actionState === 'ENCORE_REQUEST_AVAILABLE') && <div className="card-overlay-badge">예약 마감</div>}
          {actionState === 'AWAITING_STOCK' && <div className="card-overlay-badge">재고 준비중</div>}
          {isSuspendedUser && product.phase !== 'past' && (
            <div className="card-overlay-restricted"><ShieldX size={32} /><p>참여 제한</p></div>
          )}
        </div>
        <div className="card-content-container">
          <div className="content-row"><h3 className="content-title">{product.groupName}</h3>{storageInfo && <span className="content-badge" style={storageInfo.style}>{storageInfo.label}</span>}</div>
          <div className="content-row meta-row"><span className="content-price">{cardData.price.toLocaleString()}원</span><span className="content-pickup"><Calendar size={14} /> {pickupDateFormatted}</span></div>
          <div className="content-action-row">{renderActionControls()}</div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductCard);