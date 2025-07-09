// src/components/customer/ProductCard.tsx

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, Calendar, Hourglass, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { requestWaitlist } from '@/firebase/productService';
import toast from 'react-hot-toast';
import type { Product, SalesRound, CartItem, ProductStatus } from '@/types';
import './ProductCard.css';

// --- Helper Functions ---
const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;
  const activeRounds = product.salesHistory.filter(r => r.status === 'selling' || r.status === 'scheduled');
  if (activeRounds.length > 0) return activeRounds.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  const nonDraftRounds = product.salesHistory.filter(r => r.status !== 'draft');
  if (nonDraftRounds.length > 0) return nonDraftRounds.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  return null;
};

// --- Quantity Controls Component ---
interface QuantityInputProps {
  quantity: number;
  setQuantity: (updater: React.SetStateAction<number>) => void;
  maxStock?: number;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ quantity, setQuantity, maxStock = 999 }) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleQuantityChange = (newQuantity: number) => {
    const validatedQuantity = Math.max(1, Math.min(newQuantity, maxStock));
    setQuantity(validatedQuantity);
  };

  const stopCounter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  const startCounter = (delta: number) => {
    stopCounter();
    handleQuantityChange(quantity + delta);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setQuantity(q => Math.max(1, Math.min(q + delta, maxStock)));
      }, 100);
    }, 400);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    if (inputRef.current) {
      const numValue = parseInt(inputRef.current.value, 10);
      if (isNaN(numValue) || numValue < 1) {
        setQuantity(1);
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  return (
    <div className="quantity-controls">
      <button
        onMouseDown={(e) => { e.stopPropagation(); startCounter(-1); }}
        onMouseUp={stopCounter}
        onMouseLeave={stopCounter}
        onTouchStart={(e) => { e.stopPropagation(); startCounter(-1); }}
        onTouchEnd={stopCounter}
        disabled={quantity <= 1}
      >
        <Minus size={16} />
      </button>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          className="quantity-input"
          value={quantity}
          onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10) || 1)}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="quantity-display" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
          {quantity}
        </span>
      )}
      <button
        onMouseDown={(e) => { e.stopPropagation(); startCounter(1); }}
        onMouseUp={stopCounter}
        onMouseLeave={stopCounter}
        onTouchStart={(e) => { e.stopPropagation(); startCounter(1); }}
        onTouchEnd={stopCounter}
        disabled={quantity >= maxStock}
      >
        <Plus size={16} />
      </button>
    </div>
  );
};


// --- Main Product Card Component ---
interface ProductCardProps {
  product: Product;
  status: ProductStatus;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, status }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isJustAdded, setIsJustAdded] = useState(false);
  const addedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) {
        clearTimeout(addedTimeoutRef.current);
      }
    };
  }, []);

  const cardData = useMemo(() => {
    const displayRound = getDisplayRound(product);
    if (!displayRound) return null;

    const totalStock = displayRound.variantGroups?.reduce((acc, vg) => {
        if (vg.totalPhysicalStock != null && vg.totalPhysicalStock !== -1) return acc + vg.totalPhysicalStock;
        return acc + (vg.items?.reduce((itemAcc, item) => itemAcc + (item.stock === -1 ? Infinity : (item.stock || 0)), 0) || 0);
    }, 0) ?? 0;
    
    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    const isSoldOut = totalStock === 0;
    
    const isLimitedStock = 
      status === 'ADDITIONAL_RESERVATION' || 
      (status === 'ONGOING' && totalStock > 0 && totalStock < Infinity);

    const isPurchasable = (status === 'ONGOING' || status === 'ADDITIONAL_RESERVATION') && !isSoldOut;
    const isWaitlistAvailable = status === 'ONGOING' && isSoldOut;
    const singleOptionItem = !isMultiOption ? displayRound.variantGroups?.[0]?.items?.[0] : null;

    return {
      displayRound, isPurchasable, isMultiOption, singleOptionItem, isLimitedStock,
      totalStock, isSoldOut, isWaitlistAvailable,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(displayRound.pickupDate.toDate()).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product, status]);

  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !cardData.singleOptionItem || isJustAdded) return;

    const { displayRound, singleOptionItem } = cardData;
    const cartItem: CartItem = {
      productId: product.id,
      productName: product.groupName,
      imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId,
      roundName: displayRound.roundName,
      variantGroupId: displayRound.variantGroups?.[0]?.id || '',
      variantGroupName: displayRound.variantGroups?.[0]?.groupName || '',
      itemId: singleOptionItem.id || '',
      itemName: singleOptionItem.name,
      quantity,
      unitPrice: singleOptionItem.price,
      stock: singleOptionItem.stock,
      pickupDate: displayRound.pickupDate,
    };
    
    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 담았어요!`);
    setQuantity(1);

    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => {
      setIsJustAdded(false);
    }, 1500);

  }, [product, quantity, cardData, addToCart, isJustAdded]);
  
  const handleRequestWaitlist = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !user) {
      if (!user) toast.error("대기 신청을 하려면 로그인이 필요합니다.");
      return;
    }

    const toastId = toast.loading("대기 명단에 등록 중입니다...");
    try {
      await requestWaitlist(product.id, cardData.displayRound.roundId, user.uid, quantity);
      toast.success("대기 명단에 등록되었습니다!", { id: toastId });
      setQuantity(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "신청 중 오류가 발생했습니다.";
      toast.error(message, { id: toastId });
    }
  }, [product.id, quantity, cardData, user]);

  const handleCardClick = useCallback(() => { 
    navigate(`/product/${product.id}`, { state: { background: location } }); 
  }, [navigate, product.id, location]);

  if (!cardData) return null;

  const { isPurchasable, isMultiOption, isSoldOut, isWaitlistAvailable, price, pickupDateFormatted, storageType, totalStock, isLimitedStock } = cardData;

  const getStorageTypeInfo = (type: string | undefined) => {
    switch (type) {
      case 'FROZEN': return { label: '냉동', style: { backgroundColor: '#5c7cfa', color: '#fff', fontWeight: 600 } };
      case 'COLD': return { label: '냉장', style: { backgroundColor: '#e63946', color: '#fff', fontWeight: 600 } };
      case 'ROOM': return { label: '실온', style: { backgroundColor: '#212529', color: '#fff', fontWeight: 600 } };
      default: return null;
    }
  };
  const storageInfo = getStorageTypeInfo(storageType);

  const renderActionControls = () => {
    if (status === 'PAST') return null;

    if (isWaitlistAvailable) {
      return (
        // ✅ [수정] 이 div에 onClick 핸들러를 추가하여 이벤트 버블링을 막습니다.
        <div className="action-controls" onClick={(e) => e.stopPropagation()}>
          <QuantityInput quantity={quantity} setQuantity={setQuantity} />
          <button className="waitlist-btn" onClick={handleRequestWaitlist}>
            <Hourglass size={14} />
            <span>대기</span>
          </button>
        </div>
      );
    }
    
    if (!isPurchasable) return <div className="options-btn disabled">{isSoldOut ? '품절' : '마감'}</div>;
    
    if (isMultiOption) return <button className="options-btn" onClick={handleCardClick}>옵션 선택하기 <ChevronRight size={16} /></button>;
    
    const variantGroup = cardData.displayRound?.variantGroups?.[0];
    const physicalStock = variantGroup?.totalPhysicalStock;
    const maxStockForUI = (physicalStock != null && physicalStock !== -1) ? physicalStock : 999;
    
    return (
      // ✅ [수정] 이 div에 onClick 핸들러를 추가하여 이벤트 버블링을 막습니다.
      <div className="action-controls" onClick={(e) => e.stopPropagation()}>
        <QuantityInput quantity={quantity} setQuantity={setQuantity} maxStock={maxStockForUI} />
        {isJustAdded ? (
          <button className="add-to-cart-btn just-added" disabled>
            <Check size={18} />
            완료
          </button>
        ) : (
          <button className="add-to-cart-btn" onClick={handleAddToCart}>
            담기
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="product-card-wrapper">
      <div className="product-card-final" onClick={handleCardClick}>
        {isLimitedStock && (
          <div className="card-top-badge">
            <Flame size={14} /> {isMultiOption ? '한정수량 예약중!' : `${totalStock}개 한정!`}
          </div>
        )}
        <div className="card-image-container">
          <img src={product.imageUrls?.[0]} alt={product.groupName} loading="lazy" fetchPriority="low" />
          {!isPurchasable && !isWaitlistAvailable && status !== 'PAST' && <div className="card-overlay-badge">{isSoldOut ? '품절' : '마감'}</div>}
        </div>
        <div className="card-content-container">
          <div className="content-row"><h3 className="content-title">{product.groupName}</h3>{storageInfo && <span className="content-badge" style={storageInfo.style}>{storageInfo.label}</span>}</div>
          <div className="content-row meta-row"><span className="content-price">{(price ?? 0).toLocaleString()}원</span><span className="content-pickup"><Calendar size={14} /> {pickupDateFormatted}</span></div>
          <div className="content-action-row">{renderActionControls()}</div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductCard);
