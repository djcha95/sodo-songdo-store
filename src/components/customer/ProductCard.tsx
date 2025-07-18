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
// ✅ [수정] 필요한 타입만 임포트하여 경고 해결
import type { Product, SalesRound, CartItem } from '@/types';
import useLongPress from '@/hooks/useLongPress';
import './ProductCard.css';

// --- 유틸리티 및 헬퍼 함수 ---

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  // ✅ [수정] 문자열 날짜도 파싱할 수 있도록 추가
  if (typeof date === 'string') { 
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn("Unsupported date format:", date);
  return null;
};

const getDisplayRound = (product: Product): SalesRound | null => {
    if (!product.salesHistory || product.salesHistory.length === 0) return null;
    const sellingRound = product.salesHistory.find(r => r.status === 'selling');
    if (sellingRound) return sellingRound;
  
    const now = new Date();
    const futureScheduledRounds = product.salesHistory
      .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! > now)
      .sort((a, b) => safeToDate(a.publishAt)!.getTime() - safeToDate(b.publishAt)!.getTime());
    if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];
  
    const pastRounds = product.salesHistory
      .filter(r => r.status === 'ended' || r.status === 'sold_out')
      .sort((a, b) => safeToDate(b.deadlineDate)!.getTime() - safeToDate(a.deadlineDate)!.getTime());
    if (pastRounds.length > 0) return pastRounds[0];
    
    const nonDraftRounds = product.salesHistory
      .filter(r => r.status !== 'draft')
      .sort((a,b) => safeToDate(b.createdAt)!.getTime() - safeToDate(a.createdAt)!.getTime());
  
    return nonDraftRounds[0] || null;
};

type ProductActionState = 'PURCHASABLE' | 'WAITLISTABLE' | 'REQUIRE_OPTION' | 'ENDED' | 'SCHEDULED';

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
      <button {...decreaseHandlers} disabled={quantity <= 1}><Minus size={16} /></button>
      {isEditing ? (
        <input ref={inputRef} type="number" className="quantity-input" value={quantity} onChange={handleDirectInputChange} onBlur={handleInputBlur} onKeyDown={handleInputKeyDown} onClick={(e) => e.stopPropagation()} />
      ) : (
        <span className="quantity-display" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>{quantity}</span>
      )}
      <button {...increaseHandlers} disabled={quantity >= maxStock}><Plus size={16} /></button>
    </div>
  );
};


// --- Main Product Card Component ---
interface ProductCardProps {
  product: Product;
  reservedQuantitiesMap: Map<string, number>;
  isPastProduct?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, reservedQuantitiesMap, isPastProduct = false }) => {
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

// src/components/customer/ProductCard.tsx

  const cardData = useMemo(() => {
    const displayRound = getDisplayRound(product);
    if (!displayRound) return null;

    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    const singleOptionVg = !isMultiOption ? displayRound.variantGroups?.[0] : null;
    const singleOptionItem = singleOptionVg?.items?.[0] || null;

    const reservedKey = `${product.id}-${displayRound.roundId}-${singleOptionVg?.id}`;
    const reserved = reservedQuantitiesMap.get(reservedKey) || 0;
    
    // 'totalStock'을 안전하게 계산하도록 수정
    const totalStock = singleOptionVg?.totalPhysicalStock; 
    const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : (totalStock || 0) - reserved;

    let actionState: ProductActionState = 'ENDED';

    // ... (이하 actionState를 결정하는 로직은 그대로 유지)
    if (isPastProduct) {
      actionState = 'ENDED';
    } else {
      const now = new Date();
      const publishAtDate = safeToDate(displayRound.publishAt);
      const finalSaleDeadline = safeToDate(displayRound.pickupDate) ? dayjs(safeToDate(displayRound.pickupDate)).hour(13).minute(0).second(0).toDate() : null;
      
      if (displayRound.status === 'scheduled' && publishAtDate && now < publishAtDate) {
        actionState = 'SCHEDULED';
      } else if (finalSaleDeadline && now >= finalSaleDeadline) {
        actionState = 'ENDED';
      } else if (displayRound.status === 'selling') {
        if (isMultiOption) {
          actionState = 'REQUIRE_OPTION';
        } else {
          const isSoldOut = remainingStock < (singleOptionItem?.stockDeductionAmount || 1);
          if (!isSoldOut) {
            actionState = 'PURCHASABLE';
          } else {
            const createdAtDate = safeToDate(displayRound.createdAt);
            const firstPeriodDeadline = createdAtDate ? dayjs(createdAtDate).add(1, 'day').hour(13).minute(0).second(0).toDate() : null;
            const isFirstPeriodActive = firstPeriodDeadline && now < firstPeriodDeadline;
            actionState = isFirstPeriodActive ? 'WAITLISTABLE' : 'ENDED';
          }
        }
      }
    }

    return {
      displayRound, isMultiOption, singleOptionItem, singleOptionVg, remainingStock, actionState,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(safeToDate(displayRound.pickupDate)).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product, reservedQuantitiesMap, isPastProduct]);
  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !cardData.singleOptionItem || isJustAdded) return;
    const { displayRound, singleOptionItem, singleOptionVg, remainingStock } = cardData;
    
    if (quantity * singleOptionItem.stockDeductionAmount > remainingStock) {
        toast.error('재고가 부족합니다.');
        return;
    }

    const cartItem: CartItem = {
      id: `reservation-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount,
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
    const { displayRound, singleOptionItem, singleOptionVg } = cardData;
    if (!singleOptionItem || !singleOptionVg) return;

    const waitlistItem: CartItem = {
      id: `waitlist-${product.id}-${singleOptionItem.id}-${Date.now()}`,
      stockDeductionAmount: singleOptionItem.stockDeductionAmount,
      productId: product.id,
      productName: product.groupName,
      imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId,
      roundName: displayRound.roundName,
      variantGroupId: singleOptionVg.id,
      variantGroupName: singleOptionVg.groupName,
      itemId: singleOptionItem.id,
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

  const { price, pickupDateFormatted, storageType, actionState, remainingStock } = cardData;

  const getStorageTypeInfo = (type: typeof product.storageType) => {
    switch (type) {
      case 'FROZEN': return { label: '냉동', style: { backgroundColor: '#5c7cfa', color: '#fff' } };
      case 'COLD': return { label: '냉장', style: { backgroundColor: '#e63946', color: '#fff' } };
      case 'ROOM': return { label: '실온', style: { backgroundColor: '#212529', color: '#fff' } };
      default: return null; // undefined 또는 다른 값이 올 경우를 대비
    }
  };
  const storageInfo = getStorageTypeInfo(storageType);
  const isLimitedStock = remainingStock > 0 && remainingStock !== Infinity;

  const renderActionControls = () => {
    // ✅ [수정] isPastProduct일 경우 아무것도 렌더링하지 않음
    if (isPastProduct) {
      return null;
    }

    switch (actionState) {
      case 'PURCHASABLE':
        const maxStockForUI = Math.floor(remainingStock / (cardData.singleOptionItem?.stockDeductionAmount || 1));
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} setQuantity={setQuantity} maxStock={maxStockForUI} />
            {isJustAdded ? (
              <button className="add-to-cart-btn just-added" disabled><Check size={18} /> 완료</button>
            ) : (
              <button className="add-to-cart-btn" onClick={handleAddToCart}>담기</button>
            )}
          </div>
        );
      case 'WAITLISTABLE':
        return (
          <div className="action-controls" onClick={(e) => e.stopPropagation()}>
            <QuantityInput quantity={quantity} setQuantity={setQuantity} />
            <button className="waitlist-btn" onClick={handleRequestWaitlist}><Hourglass size={14} /><span>대기</span></button>
          </div>
        );
      case 'REQUIRE_OPTION':
        return <button className="options-btn" onClick={handleCardClick}>옵션 선택하기 <ChevronRight size={16} /></button>;
      case 'ENDED':
        return <div className="options-btn disabled">예약 종료</div>;
      case 'SCHEDULED':
        return <div className="options-btn disabled">판매 예정</div>;
      default:
        return null;
    }
  };

  return (
    <div className="product-card-wrapper">
      <div className="product-card-final" onClick={handleCardClick}>
        {isLimitedStock && (actionState === 'PURCHASABLE' || actionState === 'REQUIRE_OPTION') && (
          <div className="card-top-badge"><Flame size={14} /> {cardData.isMultiOption ? '한정수량' : `${remainingStock}개 한정`}</div>
        )}
        <div className="card-image-container">
          <img src={product.imageUrls?.[0]} alt={product.groupName} loading="lazy" />
          {/* ✅ [수정] 지난 상품 카드에서는 '예약 종료' 배지를 표시하지 않음 */}
          {actionState === 'ENDED' && !isPastProduct && <div className="card-overlay-badge">예약 종료</div>}
        </div>
        <div className="card-content-container">
          <div className="content-row"><h3 className="content-title">{product.groupName}</h3>{storageInfo && <span className="content-badge" style={storageInfo.style}>{storageInfo.label}</span>}</div>
          <div className="content-row meta-row"><span className="content-price">{price.toLocaleString()}원</span><span className="content-pickup"><Calendar size={14} /> {pickupDateFormatted}</span></div>
          <div className="content-action-row">{renderActionControls()}</div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductCard);