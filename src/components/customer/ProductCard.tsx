// src/components/customer/ProductCard.tsx

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, Calendar, Check, ShieldX, ShoppingCart, Hourglass } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import toast from 'react-hot-toast';
// ✅ [수정] 타입 import 경로를 정리하고 명확하게 수정했습니다.
import type { Product as OriginalProduct, CartItem, StorageType, SalesRound as OriginalSalesRound } from '@/types'; 
import useLongPress from '@/hooks/useLongPress';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import './ProductCard.css';
import { determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState, SalesRound, VariantGroup } from '@/utils/productUtils';

// ✅ [수정] ProductListPage로부터 displayRound를 받도록 타입을 재정의했습니다.
type Product = OriginalProduct & {
  reservedQuantities?: Record<string, number>;
  phase?: 'primary' | 'secondary' | 'past';
  deadlines?: {
    primaryEnd: Date | null;
    secondaryEnd: Date | null;
  };
  displayRound: OriginalSalesRound;
}

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

interface ProductCardProps {
  product: Product;
}

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
    // ✅ [개선] getDisplayRound를 다시 호출하는 대신, props로 받은 displayRound를 사용합니다.
    const { displayRound } = product;
    if (!displayRound) return null;

    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    
    // ✅ [수정] displayRound에 예약 수량을 합쳐서 확장된 타입의 SalesRound 객체를 생성합니다.
    const roundWithReserved: SalesRound = {
      ...displayRound,
      variantGroups: displayRound.variantGroups.map(vg => {
        const key = `${product.id}-${displayRound.roundId}-${vg.id}`;
        return {
          ...vg,
          reservedCount: product.reservedQuantities?.[key] || 0
        };
      })
    };

    const singleOptionVg = !isMultiOption ? (roundWithReserved.variantGroups?.[0] as VariantGroup) : undefined;
    const singleOptionItem = singleOptionVg?.items?.[0] || null;

    return {
      displayRound: roundWithReserved,
      isMultiOption,
      singleOptionItem,
      singleOptionVg,
      price: singleOptionItem?.price ?? roundWithReserved.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(safeToDate(roundWithReserved.pickupDate)).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product]);
  
  const actionState = useMemo<ProductActionState>(() => {
    if (!cardData) return 'ENDED';
    const { displayRound, isMultiOption, singleOptionVg } = cardData;
    
    const state = determineActionState(displayRound, userDocument, singleOptionVg);
    
    if (state === 'PURCHASABLE' && isMultiOption) {
      return 'REQUIRE_OPTION';
    }
    
    return state;
  }, [cardData, userDocument]);
    
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
    
    const reserved = singleOptionVg?.reservedCount || 0;
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
    toast.success(`${product.groupName} ${quantity}개를 담았어요!`, { duration: 3000 });
    setQuantity(1);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);
  }, [product, quantity, cardData, addToCart, isJustAdded, isSuspendedUser]);

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
    toast.success(`${product.groupName} ${quantity}개를 대기 목록에 추가했습니다.`, { duration: 3000 });
    setQuantity(1);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);
  }, [product, quantity, cardData, addToCart, isJustAdded, isSuspendedUser]);


  if (!cardData) return null;

  const { pickupDateFormatted, storageType } = cardData;

  const getStorageTypeInfo = (type: StorageType) => {
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
        const reserved = cardData.singleOptionVg?.reservedCount || 0;
        const totalStock = cardData.singleOptionVg?.totalPhysicalStock;
        const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : (totalStock || 0) - reserved;
        const maxStockForUI = Math.floor(remainingStock / (cardData.singleOptionItem?.stockDeductionAmount || 1));
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxStockForUI} />
            {isJustAdded ? <button className="add-to-cart-btn just-added" disabled><Check size={18} /> 담았어요</button>
                         : <button className="add-to-cart-btn" onClick={handleAddToCart}><ShoppingCart size={16} /> 담기</button>}
          </div>);
      case 'WAITLISTABLE':
        const maxWaitlistQuantity = cardData.singleOptionItem?.limitQuantity || 99;
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxWaitlistQuantity} />
            {isJustAdded ? <button className="waitlist-action-btn just-added" disabled><Check size={18} /> 신청됨</button>
                         : <button className="waitlist-action-btn" onClick={handleAddToWaitlist}><Hourglass size={16} /> 대기</button>}
          </div>);
      case 'REQUIRE_OPTION':
        return <button className="options-btn" onClick={handleCardClick}>옵션 선택하기 <ChevronRight size={16} /></button>;
      case 'AWAITING_STOCK':
        return <div className="options-btn disabled"><Hourglass size={16} /> 재고 준비중</div>;
      case 'ENDED':
        return <div className="options-btn disabled">예약 종료</div>;
      case 'SCHEDULED':
        return <div className="options-btn disabled">판매 예정</div>;
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
        const reserved = singleOptionVg.reservedCount || 0;
        const remaining = (totalStock || 0) - reserved;
        stockText = `${remaining}개 남음!`;
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
        <TopBadge />
        <div className="card-image-container">
          <img src={getOptimizedImageUrl(product.imageUrls?.[0], '200x200')} alt={product.groupName} loading="lazy" />
          {product.phase === 'past' && <div className="card-overlay-badge">예약 마감</div>}
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