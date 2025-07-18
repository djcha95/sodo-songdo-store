// src/components/customer/ProductCard.tsx

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, Calendar, Hourglass, Check } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import toast from 'react-hot-toast';
import type { Product, SalesRound, CartItem, ProductDisplayStatus } from '@/types';
import useLongPress from '@/hooks/useLongPress';
import './ProductCard.css';

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined && date.nanoseconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn("Unsupported date format:", date);
  return null;
};

// --- Helper Functions ---
const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;
  
  const activeRounds = product.salesHistory.filter(r => r.status === 'selling' || r.status === 'scheduled');
  if (activeRounds.length > 0) {
    return activeRounds.sort((a, b) => {
        const dateA = safeToDate(b.createdAt)?.getTime() || 0;
        const dateB = safeToDate(a.createdAt)?.getTime() || 0;
        return dateA - dateB;
    })[0];
  }

  const nonDraftRounds = product.salesHistory.filter(r => r.status !== 'draft');
  if (nonDraftRounds.length > 0) {
    return nonDraftRounds.sort((a, b) => {
        const dateA = safeToDate(b.createdAt)?.getTime() || 0;
        const dateB = safeToDate(a.createdAt)?.getTime() || 0;
        return dateA - dateB;
    })[0];
  }
  return null;
};

// --- Quantity Controls Component ---
interface QuantityInputProps {
  quantity: number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
  maxStock?: number;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ quantity, setQuantity, maxStock = 999 }) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleUpdateQuantity = useCallback((change: number) => {
    setQuantity(q => Math.max(1, Math.min(q + change, maxStock)));
  }, [setQuantity, maxStock]);

  const handleDirectInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setQuantity(isNaN(value) ? 1 : Math.max(1, Math.min(value, maxStock)));
  };
  
  const handleInputBlur = () => setIsEditing(false);
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') inputRef.current?.blur();
  };

  const decreaseHandlers = useLongPress(() => handleUpdateQuantity(-1), () => handleUpdateQuantity(-1));
  const increaseHandlers = useLongPress(() => handleUpdateQuantity(1), () => handleUpdateQuantity(1));

  return (
    <div className="quantity-controls">
      <button {...decreaseHandlers} disabled={quantity <= 1}>
        <Minus size={16} />
      </button>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          className="quantity-input"
          value={quantity}
          onChange={handleDirectInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="quantity-display" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
          {quantity}
        </span>
      )}
      <button {...increaseHandlers} disabled={quantity >= maxStock}>
        <Plus size={16} />
      </button>
    </div>
  );
};


// --- Main Product Card Component ---
interface ProductCardProps {
  product: Product;
  status: ProductDisplayStatus;
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
    return () => { if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current); };
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
    
    const isLimitedStock = (status === 'ONGOING' || status === 'ADDITIONAL_RESERVATION') && totalStock > 0 && totalStock < Infinity;
    
    const isPurchasable = (status === 'ONGOING' || status === 'ADDITIONAL_RESERVATION') && !isSoldOut;
    const isWaitlistAvailable = status === 'ONGOING' && isSoldOut;
    const singleOptionItem = !isMultiOption ? displayRound.variantGroups?.[0]?.items?.[0] : null;

    const pickupDate = safeToDate(displayRound.pickupDate);
    if (!pickupDate) return null;

    return {
      displayRound, isPurchasable, isMultiOption, singleOptionItem, isLimitedStock,
      totalStock, isSoldOut, isWaitlistAvailable,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(pickupDate).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product, status]);

  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !cardData.singleOptionItem || isJustAdded) return;

    const { displayRound, singleOptionItem } = cardData;

    const cartItem: CartItem = {
      // ✅ [오류 수정] 필수 필드인 id와 stockDeductionAmount 추가
      id: `reservation-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount,
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
      status: 'RESERVATION',
      deadlineDate: displayRound.deadlineDate,
    };

    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 담았어요!`);
    setQuantity(1);

    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    setIsJustAdded(true);
    addedTimeoutRef.current = setTimeout(() => setIsJustAdded(false), 1500);

  }, [product, quantity, cardData, addToCart, isJustAdded]);
  
  const handleRequestWaitlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !user) {
      if (!user) toast.error("대기 신청을 하려면 로그인이 필요합니다.");
      return;
    }
    
    const { displayRound, singleOptionItem } = cardData;
    if (!singleOptionItem) {
      toast.error("옵션이 하나인 상품만 대기 신청이 가능합니다.");
      return;
    }

    const waitlistItem: CartItem = {
      // ✅ [오류 수정] 필수 필드인 id와 stockDeductionAmount 추가
      id: `waitlist-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount,
      productId: product.id,
      productName: product.groupName,
      imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId,
      roundName: displayRound.roundName,
      variantGroupId: displayRound.variantGroups?.[0]?.id || '',
      variantGroupName: displayRound.variantGroups?.[0]?.groupName || '',
      itemId: singleOptionItem.id || '',
      itemName: singleOptionItem.name,
      quantity: quantity,
      unitPrice: singleOptionItem.price,
      stock: singleOptionItem.stock,
      pickupDate: displayRound.pickupDate,
      status: 'WAITLIST',
      deadlineDate: displayRound.deadlineDate,
    };
        
    addToCart(waitlistItem);
    toast.success(`${product.groupName} ${quantity}개를 대기 목록에 추가했어요!`);
    setQuantity(1);
    
  }, [product, quantity, cardData, user, addToCart]);

  const handleCardClick = useCallback(() => { 
    navigate(`/product/${product.id}`, { state: { background: location } }); 
  }, [navigate, product.id, location]);

  if (!cardData) return null;

  const { isPurchasable, isMultiOption, isSoldOut, isWaitlistAvailable, price, pickupDateFormatted, storageType, totalStock, isLimitedStock } = cardData;

  const getStorageTypeInfo = (type: string | undefined) => {
    switch (type) {
      case 'FROZEN': return { label: '냉동', style: { backgroundColor: '#5c7cfa', color: '#fff' } };
      case 'COLD': return { label: '냉장', style: { backgroundColor: '#e63946', color: '#fff' } };
      case 'ROOM': return { label: '실온', style: { backgroundColor: '#212529', color: '#fff' } };
      default: return null;
    }
  };
  const storageInfo = getStorageTypeInfo(storageType);

  const renderActionControls = () => {
    if (status === 'PAST') return null;

    if (isWaitlistAvailable) {
      return (
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
            <Flame size={14} /> {isMultiOption ? '한정수량' : `${totalStock}개 한정`}
          </div>
        )}
        <div className="card-image-container">
          <img src={product.imageUrls?.[0]} alt={product.groupName} loading="lazy" />
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