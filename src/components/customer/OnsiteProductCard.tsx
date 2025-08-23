// src/components/customer/OnsiteProductCard.tsx

import React from 'react';
import type { Product } from '@/types';
import OptimizedImage from '@/components/common/OptimizedImage';
import { useNavigate } from 'react-router-dom';
import './OnsiteProductCard.css';

interface OnsiteProductCardProps {
  product: Product;
}

const OnsiteProductCard: React.FC<OnsiteProductCardProps> = ({ product }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/product/${product.id}`);
  };

  // 재고가 없는 상품은 표시하지 않으므로, 이 컴포넌트에 왔다는 것은 재고가 있다는 의미.
  // 이 컴포넌트에서 재고를 확인하는 로직은 이미 부모 컴포넌트에서 처리하고 있습니다.
  
  return (
    <div className="onsite-product-card" onClick={handleClick} title={product.groupName}>
      <div className="onsite-card-image-wrapper">
        <OptimizedImage
          originalUrl={product.imageUrls?.[0]}
          size="150x150"
          alt={product.groupName}
          className="onsite-card-image"
        />
      </div>
    </div>
  );
};

export default OnsiteProductCard;