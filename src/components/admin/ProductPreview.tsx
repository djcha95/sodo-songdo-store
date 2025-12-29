// src/components/admin/ProductPreview.tsx - 실시간 미리보기 컴포넌트

import React from 'react';
import { Eye, Package, Calendar } from 'lucide-react';
import dayjs from 'dayjs';
import './ProductPreview.css';

interface ProductPreviewProps {
  groupName: string;
  description: string;
  imageUrls: string[];
  price: number | '';
  roundName: string;
  publishDate: Date;
  pickupDate: Date | null;
  storageType: string;
  composition: string;
  categories: string[];
}

const ProductPreview: React.FC<ProductPreviewProps> = ({
  groupName,
  description,
  imageUrls,
  price,
  roundName,
  publishDate,
  pickupDate,
  storageType,
  composition,
  categories,
}) => {
  const storageTypeMap: Record<string, { label: string; color: string }> = {
    ROOM: { label: '실온', color: '#f59e0b' },
    COLD: { label: '냉장', color: '#3b82f6' },
    FROZEN: { label: '냉동', color: '#8b5cf6' },
    FRESH: { label: '신선', color: '#10b981' },
  };

  const storageInfo = storageTypeMap[storageType] || storageTypeMap.ROOM;

  return (
    <div className="product-preview-container">
      <div className="preview-header">
        <Eye size={20} />
        <h3>실시간 미리보기</h3>
        <span className="preview-badge">고객 화면</span>
      </div>

      <div className="preview-card">
        {/* 이미지 */}
        <div className="preview-image-container">
          {imageUrls.length > 0 ? (
            <img 
              src={imageUrls[0]} 
              alt={groupName || '상품 이미지'} 
              className="preview-image"
            />
          ) : (
            <div className="preview-image-placeholder">
              <Package size={48} />
              <p>이미지를 등록하세요</p>
            </div>
          )}
          {categories.length > 0 && (
            <div className="preview-category-badge">
              {categories[0]}
            </div>
          )}
        </div>

        {/* 상품 정보 */}
        <div className="preview-content">
          <div className="preview-title-row">
            <h4 className="preview-title">
              {groupName || '상품명을 입력하세요'}
            </h4>
            <span 
              className="preview-storage-badge"
              style={{ 
                backgroundColor: `${storageInfo.color}15`,
                color: storageInfo.color,
                borderColor: storageInfo.color
              }}
            >
              {storageInfo.label}
            </span>
          </div>

          {description && (
            <p className="preview-description">{description}</p>
          )}

          {composition && (
            <div className="preview-composition">
              <strong>구성:</strong>
              <div className="preview-composition-list">
                {composition.split('\n').filter(line => line.trim()).map((line, i) => (
                  <div key={i} className="preview-composition-item">
                    {line.trim()}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="preview-price-row">
            {typeof price === 'number' && price > 0 ? (
              <span className="preview-price">
                {price.toLocaleString()}원
              </span>
            ) : (
              <span className="preview-price-placeholder">가격을 설정하세요</span>
            )}
          </div>

          <div className="preview-meta-row">
            <div className="preview-meta-item">
              <Package size={14} />
              <span>{roundName || '회차명'}</span>
            </div>
            {pickupDate && (
              <div className="preview-meta-item">
                <Calendar size={14} />
                <span>{dayjs(pickupDate).format('M/D(ddd) 픽업')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 발행 정보 */}
      <div className="preview-publish-info">
        <div className="preview-publish-item">
          <strong>발행일:</strong>
          <span>{dayjs(publishDate).format('YYYY년 M월 D일 오후 2시')}</span>
        </div>
      </div>
    </div>
  );
};

export default ProductPreview;

