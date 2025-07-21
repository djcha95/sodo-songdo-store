// src/components/customer/ProductCard.tsx

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, Calendar, Check, ShieldX, Clock, ShoppingCart, Hourglass } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import toast from 'react-hot-toast';
import type { Product, CartItem, SalesRound, VariantGroup } from '@/types'; 
import useLongPress from '@/hooks/useLongPress';
import { safeToDate, getDisplayRound } from '@/utils/productUtils';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import './ProductCard.css';

type ProductActionState = 'PURCHASABLE' | 'REQUIRE_OPTION' | 'ENDED' | 'SCHEDULED' | 'WAITLIST_AVAILABLE' | 'ENCORE_REQUEST_AVAILABLE';

// --- Quantity Controls Component ---
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


// --- Main Product Card Component ---
interface ProductCardProps {
  product: Product;
  reservedQuantitiesMap: Map<string, number>;
  isPastProduct?: boolean;
  isPreOrder?: boolean;
  isTodaySoldOut?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, reservedQuantitiesMap, isPastProduct = false, isPreOrder = false, isTodaySoldOut = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart } = useCart();
  const { isSuspendedUser } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [isJustAdded, setIsJustAdded] = useState(false);
  const addedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current); };
  }, []);

  const cardData = useMemo(() => {
    const displayRound = getDisplayRound(product);
    if (!displayRound) return null;

    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    const singleOptionVg: VariantGroup | undefined = !isMultiOption ? displayRound.variantGroups?.[0] : undefined;
    const singleOptionItem = singleOptionVg?.items?.[0] || null;

    const reservedKey = `${product.id}-${displayRound.roundId}-${singleOptionVg?.id}`;
    const reserved = reservedQuantitiesMap.get(reservedKey) || 0;
    
    const totalStock = singleOptionVg?.totalPhysicalStock; 
    const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : (totalStock || 0) - reserved;

    const isMultiOptionLimitedStock = isMultiOption && (displayRound.variantGroups || []).some(vg => vg.totalPhysicalStock !== null && vg.totalPhysicalStock !== -1);
    const isSingleOptionLimitedStock = !isMultiOption && remainingStock > 0 && remainingStock !== Infinity;


    return {
      displayRound, isMultiOption, singleOptionItem, singleOptionVg, remainingStock, isMultiOptionLimitedStock, isSingleOptionLimitedStock,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(safeToDate(displayRound.pickupDate)).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product, reservedQuantitiesMap]);

  const actionState = useMemo<ProductActionState>(() => {
    if (!cardData || !cardData.displayRound) return 'ENDED';
    const { displayRound, isMultiOption, remainingStock, singleOptionItem } = cardData;
    const now = dayjs();
    
    const pickupDeadline = safeToDate(displayRound.pickupDate) ? dayjs(safeToDate(displayRound.pickupDate)).hour(13).minute(0).second(0) : null;

    const publishAtDate = safeToDate(displayRound.publishAt);
    if (displayRound.status === 'scheduled' && publishAtDate && now.isBefore(publishAtDate)) {
        return 'SCHEDULED';
    }

    if (isTodaySoldOut && !isPastProduct) {
        return 'WAITLIST_AVAILABLE';
    }

    if (isPastProduct || displayRound.status === 'ended' || displayRound.status === 'sold_out' || (pickupDeadline && now.isAfter(pickupDeadline))) {
      return 'ENCORE_REQUEST_AVAILABLE';
    }

if (isMultiOption) {
      // 옵션이 여러 개인 경우, 상세 페이지로 유도하는 것이 카드의 역할이므로
      // 항상 '옵션 선택하기'를 반환하도록 로직을 단순화합니다.
      // 개별 옵션의 품절 여부는 상세 페이지에서 처리합니다.
      return 'REQUIRE_OPTION';
    }
        
    if (remainingStock < (singleOptionItem?.stockDeductionAmount || 1)) {
        return 'ENCORE_REQUEST_AVAILABLE';
    }

    return 'PURCHASABLE';
  }, [cardData, isPastProduct, isTodaySoldOut]);

  // ✨ [수정] 404 오류 해결: navigate 경로에서 roundId를 제거합니다.
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
    if (!cardData || !cardData.displayRound || !cardData.singleOptionItem || isJustAdded) return;

    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }

    const { displayRound, singleOptionItem, singleOptionVg, remainingStock } = cardData;
    
    if (quantity * (singleOptionItem.stockDeductionAmount || 1) > remainingStock) {
        toast.error('재고가 부족합니다.');
        return;
    }

    const cartItem: CartItem = {
      id: `reservation-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount || 1,
      productId: product.id,
      productName: product.groupName,
      imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId,
      roundName: displayRound.roundName,
      variantGroupId: singleOptionVg?.id || '',
      variantGroupName: singleOptionVg?.groupName || '',
      itemId: singleOptionItem.id || '',
      itemName: singleOptionItem.name,
      quantity,
      unitPrice: singleOptionItem.price,
      stock: singleOptionItem.stock,
      pickupDate: displayRound.pickupDate,
      status: 'RESERVATION',
      deadlineDate: displayRound.deadlineDate,
      isPrepaymentRequired: displayRound.isPrepaymentRequired ?? false,
    };

    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 담았어요!`);
    setQuantity(1);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);
  }, [product, quantity, cardData, addToCart, isJustAdded, isSuspendedUser]);

  const handleAddToWaitlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !cardData.singleOptionItem || isJustAdded) return;

    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }

    const { displayRound, singleOptionItem, singleOptionVg } = cardData;

    const cartItem: CartItem = {
      id: `waitlist-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount || 1,
      productId: product.id,
      productName: product.groupName,
      imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId,
      roundName: displayRound.roundName,
      variantGroupId: singleOptionVg?.id || '',
      variantGroupName: singleOptionVg?.groupName || '',
      itemId: singleOptionItem.id || '',
      itemName: singleOptionItem.name,
      quantity,
      unitPrice: singleOptionItem.price,
      stock: -1,
      pickupDate: displayRound.pickupDate,
      status: 'WAITLIST',
      deadlineDate: displayRound.deadlineDate,
      isPrepaymentRequired: false,
    };

    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 대기 목록에 추가했습니다.`);
    setQuantity(1);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);
  }, [product, quantity, cardData, addToCart, isJustAdded, isSuspendedUser]);


  if (!cardData) return null;

  const { pickupDateFormatted, storageType, remainingStock, isMultiOptionLimitedStock, isSingleOptionLimitedStock } = cardData;

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
        const maxStockForUI = Math.floor(remainingStock / (cardData.singleOptionItem?.stockDeductionAmount || 1));
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxStockForUI} />
            {isJustAdded ? (
              <button className="add-to-cart-btn just-added" disabled><Check size={18} /> 담았어요</button>
            ) : (
              <button className="add-to-cart-btn" onClick={handleAddToCart}><ShoppingCart size={16} /> 담기</button>
            )}
          </div>
        );
      case 'WAITLIST_AVAILABLE':
        const maxWaitlistQuantity = cardData.singleOptionItem?.limitQuantity || 99;
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxWaitlistQuantity} />
            {isJustAdded ? (
              <button className="waitlist-action-btn just-added" disabled><Check size={18} /> 신청됨</button>
            ) : (
              <button className="waitlist-action-btn" onClick={handleAddToWaitlist}><Hourglass size={16} /> 대기</button>
            )}
          </div>
        );
      case 'REQUIRE_OPTION':
        return <button className="options-btn" onClick={handleCardClick}>옵션 선택하기 <ChevronRight size={16} /></button>;
      case 'ENDED':
        return <div className="options-btn disabled">예약 종료</div>;
      case 'SCHEDULED':
        return <div className="options-btn disabled">판매 예정</div>;
      case 'ENCORE_REQUEST_AVAILABLE':
        return (
            <button className="options-btn encore" onClick={handleCardClick}>
                <Flame size={16} /> 앵콜 요청
            </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="product-card-wrapper">
      <div className="product-card-final" onClick={handleCardClick}>
        {isPreOrder && actionState !== 'ENDED' && actionState !== 'SCHEDULED' && !isPastProduct &&(
          <div className="preorder-badge">
            <Clock size={12} />
            선주문
          </div>
        )}
        {(isSingleOptionLimitedStock || isMultiOptionLimitedStock) && (actionState === 'PURCHASABLE' || actionState === 'REQUIRE_OPTION') && (
          <div className="card-top-badge">
            <Flame size={14} /> 
            {cardData.isMultiOption ? '한정수량' : `${remainingStock}개 한정`}
          </div>
        )}
        <div className="card-image-container">
          <img src={getOptimizedImageUrl(product.imageUrls?.[0], '200x200')} alt={product.groupName} loading="lazy" />
          {actionState === 'ENDED' && !isPastProduct && <div className="card-overlay-badge">예약 종료</div>}
          {isSuspendedUser && actionState !== 'ENDED' && actionState !== 'SCHEDULED' && !isPastProduct && (
            <div className="card-overlay-restricted">
              <ShieldX size={32} />
              <p>참여 제한</p>
            </div>
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