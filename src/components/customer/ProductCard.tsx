// src/components/customer/ProductCard.tsx

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Flame, Minus, Plus, ChevronRight, Calendar } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import toast from 'react-hot-toast';
import type { Timestamp } from 'firebase/firestore';
import type { Product, SalesRound, CartItem, ProductStatus } from '@/types';

import './ProductCard.css';

/**
 * 상품 데이터에서 화면에 표시할 가장 적절한 판매 회차 정보를 찾아 반환합니다.
 * @param product Product 객체
 * @returns 현재 표시해야 할 SalesRound 객체 또는 null
 */
const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) {
    return null;
  }
  
  const activeRounds = product.salesHistory.filter((r: SalesRound) => 
    r.status === 'selling' || r.status === 'scheduled'
  );
  if (activeRounds.length > 0) {
    return activeRounds.sort((a: SalesRound, b: SalesRound) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  }

  const nonDraftRounds = product.salesHistory.filter((r: SalesRound) => r.status !== 'draft');
  if (nonDraftRounds.length > 0) {
    return nonDraftRounds.sort((a: SalesRound, b: SalesRound) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
  }

  return null;
};

interface ProductCardProps {
  product: Product;
  status: ProductStatus;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, status }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);

  // 상품의 표시 정보와 상태를 계산하는 로직
  const cardData = useMemo(() => {
    const displayRound = getDisplayRound(product);
    if (!displayRound) return null;

    const isPurchasable = status === 'ONGOING' || status === 'ADDITIONAL_RESERVATION';
    const isMultiOption = (displayRound.variantGroups?.length ?? 0) > 1 || (displayRound.variantGroups?.[0]?.items?.length ?? 0) > 1;
    const singleOptionItem = !isMultiOption ? displayRound.variantGroups?.[0]?.items?.[0] : null;
    const totalStock = displayRound.variantGroups?.reduce((acc, vg) => acc + (vg.items?.reduce((iAcc, i) => iAcc + (i.stock === -1 ? Infinity : (i.stock || 0)), 0) || 0), 0) ?? 0;
    const isLimitedStock = isPurchasable && product.limitedStockAmount && product.limitedStockAmount > 0 && product.limitedStockAmount < 50;

    return {
      displayRound, isPurchasable, isMultiOption, singleOptionItem, isLimitedStock,
      totalStock, isSoldOut: totalStock === 0,
      price: singleOptionItem?.price ?? displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0,
      pickupDateFormatted: dayjs(displayRound.pickupDate.toDate()).locale('ko').format('M/D(ddd)'),
      storageType: product.storageType,
    };
  }, [product, status]);

  // 수량 변경 핸들러
  const handleQuantityChange = useCallback((e: React.MouseEvent, delta: number) => {
    e.stopPropagation();
    setQuantity(prev => Math.max(1, prev + delta));
  }, []);

  // 장바구니 담기 핸들러
  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardData || !cardData.displayRound || !cardData.singleOptionItem) return;
    const { displayRound, singleOptionItem } = cardData;

    const cartItem: CartItem = {
      productId: product.id, productName: product.groupName,
      imageUrl: product.imageUrls?.[0] || '',
      roundId: displayRound.roundId, roundName: displayRound.roundName,
      variantGroupId: displayRound.variantGroups?.[0]?.id || '',
      variantGroupName: displayRound.variantGroups?.[0]?.groupName || '',
      itemId: singleOptionItem.id || '', itemName: singleOptionItem.name,
      quantity, unitPrice: singleOptionItem.price,
      stock: singleOptionItem.stock, pickupDate: displayRound.pickupDate,
    };
    addToCart(cartItem);
    toast.success(`${product.groupName} ${quantity}개를 담았습니다.`);
    setQuantity(1);
  }, [product, quantity, cardData, addToCart]);
  
  // 카드 클릭 핸들러 (상세 페이지 이동)
  const handleCardClick = useCallback(() => {
    navigate(`/product/${product.id}`, { state: { background: location } });
  }, [navigate, product.id, location]);

  if (!cardData) return null;

  const { isPurchasable, isMultiOption, isLimitedStock, isSoldOut, price, pickupDateFormatted, storageType } = cardData;

  const getStorageTypeInfo = (type: string | undefined) => {
    switch (type) {
      case 'FROZEN': return { label: '냉동', style: { backgroundColor: '#5c7cfa', color: '#fff', fontWeight: 600 } };
      case 'COLD': return { label: '냉장', style: { backgroundColor: '#e63946', color: '#fff', fontWeight: 600 } };
      case 'ROOM': return { label: '실온', style: { backgroundColor: '#212529', color: '#fff', fontWeight: 600 } };
      default: return null;
    }
  };
  const storageInfo = getStorageTypeInfo(storageType);

  // 카드 하단의 버튼 영역을 렌더링하는 함수
  const renderActionControls = () => {
    if (status === 'PAST') {
      return null;
    }
    if (!isPurchasable) {
      return <div className="options-btn disabled">{isSoldOut ? '품절' : '마감'}</div>;
    }
    if (isMultiOption) {
      return <button className="options-btn" onClick={handleCardClick}>옵션 선택하기 <ChevronRight size={16} /></button>;
    }
    return (
      <div className="action-controls">
        <div className="quantity-controls">
          <button onClick={(e) => handleQuantityChange(e, -1)} disabled={quantity <= 1}><Minus size={16} /></button>
          <span>{quantity}</span>
          <button onClick={(e) => handleQuantityChange(e, 1)}><Plus size={16} /></button>
        </div>
        <button className="add-to-cart-btn" onClick={handleAddToCart}>담기</button>
      </div>
    );
  };

  return (
    <div className="product-card-wrapper">
      <div className="product-card-final" onClick={handleCardClick}>
        {isLimitedStock && product.limitedStockAmount && (
          <div className="card-top-badge">
            <Flame size={14} /> {product.limitedStockAmount}개 한정!
          </div>
        )}
        <div className="card-image-container">
          <img src={product.imageUrls?.[0]} alt={product.groupName} loading="lazy" fetchpriority="low" />
          {!isPurchasable && status !== 'PAST' && <div className="card-overlay-badge">{isSoldOut ? '품절' : '마감'}</div>}
        </div>
        <div className="card-content-container">
          <div className="content-row">
            <h3 className="content-title">{product.groupName}</h3>
            {storageInfo && <span className="content-badge" style={storageInfo.style}>{storageInfo.label}</span>}
          </div>
          <div className="content-row meta-row">
            <span className="content-price">{(price ?? 0).toLocaleString()}원</span>
            <span className="content-pickup"><Calendar size={14} /> {pickupDateFormatted}</span>
          </div>
          <div className="content-action-row">
            {renderActionControls()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductCard);