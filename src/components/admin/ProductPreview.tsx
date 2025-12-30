// src/components/admin/ProductPreview.tsx - 실시간 미리보기 컴포넌트

import React from 'react';
import { Eye, Package, Calendar, Hourglass, Sun, Snowflake, Tag } from 'lucide-react';
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
  extraInfo?: string;
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
  extraInfo,
}) => {
  const storageLabels: Record<string, string> = {
    ROOM: '실온',
    COLD: '냉장',
    FROZEN: '냉동',
    FRESH: '신선',
  };

  const storageIcons: Record<string, React.ReactNode> = {
    ROOM: <Sun size={16} />,
    COLD: <Snowflake size={16} />,
    FROZEN: <Snowflake size={16} />,
    FRESH: <Tag size={16} />,
  };

  const storageLabel = storageLabels[storageType] || '실온';
  const storageIcon = storageIcons[storageType] || <Sun size={16} />;

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
        </div>

        {/* 상품 정보 영역 - ProductDetailPage와 동일한 구조 */}
        <div className="preview-content">
          {/* 카테고리 태그 */}
          {categories.length > 0 && (
            <div className="preview-category-badge-row" style={{ display: 'flex', gap: '6px', marginBottom: '12px', justifyContent: 'center' }}>
              {categories.map((c: string) => (
                <span key={c} style={{
                  backgroundColor: '#000',
                  color: '#fff',
                  padding: '3px 10px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  borderRadius: '2px',
                  letterSpacing: '-0.02em'
                }}>{c}</span>
              ))}
            </div>
          )}

          {/* 상품명 */}
          <h4 className="preview-title" style={{ textAlign: 'center', fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.5rem', color: '#222' }}>
            {groupName || '상품명을 입력하세요'}
          </h4>

          {/* 상품 설명 */}
          {description && description.trim() && (
            <div className="preview-description" style={{ 
              fontSize: '0.95rem', 
              lineHeight: '1.6', 
              color: '#475569', 
              textAlign: 'center',
              marginBottom: '0.8rem',
              whiteSpace: 'pre-wrap'
            }}>
              {description}
            </div>
          )}

          {/* 상품 구성 섹션 */}
          <div className="preview-specs-section" style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
            <div className="preview-spec-item" style={{ marginBottom: '16px' }}>
              <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#000', marginBottom: '8px' }}>상품 구성</h5>
              <div style={{ 
                fontSize: '0.85rem', 
                lineHeight: '1.6', 
                color: '#444', 
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {composition || '상품 구성 정보가 등록되지 않았습니다.'}
              </div>
            </div>

            {/* 기타 정보 */}
            {extraInfo && extraInfo.trim() && (
              <div className="preview-spec-item">
                <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#000', marginBottom: '8px' }}>기타 정보</h5>
                <div style={{ 
                  fontSize: '0.85rem', 
                  lineHeight: '1.6', 
                  color: '#666', 
                  whiteSpace: 'pre-wrap' 
                }}>
                  {extraInfo}
                </div>
              </div>
            )}
          </div>

          {/* 키 정보 박스 */}
          <div className="preview-key-info" style={{
            marginTop: '0.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: '16px',
            padding: '1.2rem'
          }}>
            {/* 픽업일 */}
            {pickupDate && (
              <div className="preview-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: '0.8rem' }}>
                <div className="preview-info-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                  <Calendar size={16} />픽업일
                </div>
                <div className="preview-info-value" style={{ color: '#1e293b', fontWeight: 700 }}>
                  {dayjs(pickupDate).format('M.D(ddd)')}
                </div>
              </div>
            )}

            {/* 보관 방법 */}
            <div className="preview-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: '0.8rem' }}>
              <div className="preview-info-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                {storageIcon}보관 방법
              </div>
              <div className={`preview-info-value storage-type-${storageType}`} style={{
                color: 'white',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                backgroundColor: storageType === 'FROZEN' ? '#3b82f6' : 
                                 storageType === 'COLD' ? '#0ea5e9' : 
                                 storageType === 'ROOM' ? '#64748b' : '#10b981'
              }}>
                {storageLabel}
              </div>
            </div>

            {/* 가격 */}
            <div className="preview-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
              <div className="preview-info-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                <Package size={16} />가격
              </div>
              <div className="preview-info-value" style={{ color: '#1e293b', fontWeight: 700 }}>
                {typeof price === 'number' && price > 0 ? (
                  <span>{price.toLocaleString()}원</span>
                ) : (
                  <span style={{ color: '#cbd5e1' }}>가격 설정 필요</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPreview;

