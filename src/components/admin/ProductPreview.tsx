// src/components/admin/ProductPreview.tsx - 실시간 미리보기 컴포넌트

import React, { useMemo, useState, useEffect } from 'react';
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
  expirationDate?: Date | null;
  variantGroups: Array<{
    id: string;
    groupName: string;
    items: Array<{
      id: string;
      name: string;
      price: number | '';
    }>;
  }>;
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
  expirationDate,
  variantGroups,
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

  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  const hasMultipleGroups = variantGroups.length > 1;

  useEffect(() => {
    if (variantGroups.length === 0) {
      setSelectedGroupId('');
      setSelectedItemId('');
      return;
    }

    if (!hasMultipleGroups) {
      setSelectedGroupId(variantGroups[0].id);
      return;
    }

    if (!variantGroups.some((vg) => vg.id === selectedGroupId)) {
      setSelectedGroupId('');
    }
  }, [variantGroups, hasMultipleGroups, selectedGroupId]);

  const selectedVariantGroup = useMemo(() => {
    if (variantGroups.length === 0) return null;
    if (!hasMultipleGroups) return variantGroups[0];
    return variantGroups.find((vg) => vg.id === selectedGroupId) || null;
  }, [variantGroups, hasMultipleGroups, selectedGroupId]);

  useEffect(() => {
    if (!selectedVariantGroup) {
      setSelectedItemId('');
      return;
    }

    if (selectedVariantGroup.items.length === 1) {
      setSelectedItemId(selectedVariantGroup.items[0].id);
      return;
    }

    if (!selectedVariantGroup.items.some((it) => it.id === selectedItemId)) {
      setSelectedItemId('');
    }
  }, [selectedVariantGroup, selectedItemId]);

  const selectedItem = useMemo(() => {
    if (!selectedVariantGroup) return null;
    return selectedVariantGroup.items.find((it) => it.id === selectedItemId) || null;
  }, [selectedVariantGroup, selectedItemId]);

  const displayPrice = useMemo(() => {
    if (selectedItem && typeof selectedItem.price === 'number') {
      return selectedItem.price;
    }
    if (selectedVariantGroup && typeof selectedVariantGroup.items?.[0]?.price === 'number') {
      return selectedVariantGroup.items[0].price;
    }
    return typeof price === 'number' ? price : null;
  }, [selectedItem, selectedVariantGroup, price]);

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

          {/* 옵션 선택 (상세 페이지와 동일한 UI 톤) */}
          {variantGroups.length > 0 && (
            <div className="preview-option-section" style={{ marginTop: '16px' }}>
              {hasMultipleGroups && (
                <div className="preview-select-wrapper">
                  <select
                    className="preview-price-select"
                    value={selectedGroupId}
                    onChange={(e) => {
                      setSelectedGroupId(e.target.value);
                      setSelectedItemId('');
                    }}
                  >
                    <option value="" disabled>옵션을 선택해주세요.</option>
                    {variantGroups.map((vg) => {
                      const representativePrice = vg.items?.[0]?.price;
                      const priceText = typeof representativePrice === 'number'
                        ? ` (${representativePrice.toLocaleString()}원)`
                        : '';
                      return (
                        <option key={vg.id} value={vg.id}>
                          {`${vg.groupName || '옵션명 없음'}${priceText}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {selectedVariantGroup && selectedVariantGroup.items.length > 1 && (
                <div className="preview-select-wrapper">
                  <select
                    className="preview-price-select"
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                  >
                    <option value="" disabled>세부 옵션을 선택해주세요.</option>
                    {selectedVariantGroup.items.map((item) => {
                      const basePrice = typeof selectedVariantGroup.items?.[0]?.price === 'number'
                        ? selectedVariantGroup.items[0].price
                        : 0;
                      const itemPrice = typeof item.price === 'number' ? item.price : basePrice;
                      const priceDiff = itemPrice - basePrice;
                      const priceText = priceDiff > 0 ? ` (+${priceDiff.toLocaleString()}원)` : '';
                      return (
                        <option key={item.id} value={item.id}>
                          {item.name || '세부 옵션명 없음'}{priceText}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
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
                                 storageType === 'COLD' ? '#ef4444' : 
                                 storageType === 'ROOM' ? '#64748b' : '#10b981'
              }}>
                {storageLabel}
              </div>
            </div>

            {/* 유통기한 */}
            {expirationDate && (
              <div className="preview-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: '0.8rem' }}>
                <div className="preview-info-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                  <Hourglass size={16} />유통기한
                </div>
                <div className="preview-info-value" style={{ color: '#1e293b', fontWeight: 700 }}>
                  {dayjs(expirationDate).format('YYYY.MM.DD')}
                </div>
              </div>
            )}

            {/* 가격 */}
            <div className="preview-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
              <div className="preview-info-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontWeight: 600 }}>
                <Package size={16} />가격
              </div>
              <div className="preview-info-value" style={{ color: '#1e293b', fontWeight: 700 }}>
                {typeof displayPrice === 'number' && displayPrice > 0 ? (
                  <span>{displayPrice.toLocaleString()}원</span>
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

