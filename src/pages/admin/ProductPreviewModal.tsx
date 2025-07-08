// src/pages/admin/ProductPreviewModal.tsx

import React from 'react';
// [수정] PreviewProduct 타입과 ProductItem, VariantGroup 타입을 types.ts에서 정확히 임포트
import type { PreviewProduct, ProductItem, VariantGroup } from '../../types'; 

interface ProductPreviewModalProps {
  product: PreviewProduct; 
  imagePreviews: string[];
  onClose: () => void;
}

const ProductPreviewModal: React.FC<ProductPreviewModalProps> = ({ product, imagePreviews, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose} style={modalOverlayStyle}>
      <div className="modal-content-preview" onClick={(e) => e.stopPropagation()} style={modalContentStyle}>
        <div style={headerStyle}>
          <h2>상품 미리보기</h2>
          <button onClick={onClose} style={closeButtonStyle}>X</button>
        </div>
        <div style={bodyStyle}>
          <h3 style={productNameStyle}>{product.name}</h3>
          <p style={descriptionStyle}>{product.description || '상세 설명이 없습니다.'}</p>

          {product.category && (
            <p style={categoryStyle}>
              카테고리: {product.category}
              {product.subCategory && ` (${product.subCategory})`}
            </p>
          )}
          {product.storageType && (
            <p style={categoryStyle}>
              보관타입: {
                product.storageType === 'ROOM' ? '실온' :
                product.storageType === 'CHILLED' ? '냉장' :
                product.storageType === 'FROZEN' ? '냉동' : ''
              }
            </p>
          )}
          
          {imagePreviews && imagePreviews.length > 0 && (
            <div style={imageGalleryStyle}>
              {imagePreviews.map((src, index) => (
                <img key={index} src={src} alt={`미리보기 ${index + 1}`} style={imageStyle} />
              ))}
            </div>
          )}
          
          {/* [수정] product.variantGroups를 순회하며 하위 상품 그룹 정보 표시 */}
          {product.variantGroups && product.variantGroups.length > 0 && (
            <div style={pricingOptionListStyle}>
              <h4 style={{marginBottom: '15px', fontSize: '1.2em', fontWeight: 'bold'}}>판매 옵션 상세</h4>
              {product.variantGroups.map((vg: VariantGroup, vgIndex: number) => (
                <div key={vgIndex} style={variantGroupStyle}>
                  <h5 style={variantGroupTitleStyle}>
                    {vg.groupName}
                    {vg.totalPhysicalStock !== undefined && vg.totalPhysicalStock !== null && (
                      <span style={variantGroupStockStyle}>
                        (총 재고: {vg.totalPhysicalStock === -1 ? '무제한' : `${vg.totalPhysicalStock.toLocaleString()}${vg.stockUnitType}`})
                      </span>
                    )}
                  </h5>
                  {vg.items && vg.items.length > 0 && (
                    <div style={itemsListStyle}>
                      {vg.items.map((item: ProductItem, itemIndex: number) => (
                        <p key={itemIndex} style={pricingOptionStyle}>
                          <span style={{fontWeight: 'normal', color: '#555'}}>선택지: </span>{item.name} | 
                          <span style={{fontWeight: 'normal', color: '#555'}}> 가격: </span>{item.price.toLocaleString()}원
                          {item.stock !== undefined && item.stock !== null && item.stock !== -1 && ` | 재고: ${item.stock.toLocaleString()}`}
                          {item.stockDeductionAmount !== undefined && item.stockDeductionAmount !== null && ` | 기준 재고: ${item.stockDeductionAmount.toLocaleString()}`}
                          {item.limitQuantity !== null && item.limitQuantity !== undefined && ` | 1인 제한: ${item.limitQuantity.toLocaleString()}개`}
                          {item.expirationDate && ` | 유통기한: ${new Date(item.expirationDate.toDate()).toLocaleDateString('ko-KR')}`}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {product.specialLabels && product.specialLabels.length > 0 && (
            <div style={labelsStyle}>
              {product.specialLabels.map((label, index) => (
                <span key={index} style={labelChipStyle}>{label}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPreviewModal;

// 인라인 스타일 변수들을 컴포넌트 정의 바깥에 선언
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10000,
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'white',
  padding: '30px',
  borderRadius: '10px',
  boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
  maxWidth: '600px',
  maxHeight: '90vh',
  overflowY: 'auto',
  position: 'relative',
  width: '90%',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #eee',
  paddingBottom: '15px',
  marginBottom: '20px',
};

const bodyStyle: React.CSSProperties = {
    // 미리보기 모달 바디의 추가 스타일이 필요하다면 여기에 정의
};

const productNameStyle: React.CSSProperties = {
  fontSize: '1.8em',
  fontWeight: 'bold',
  marginBottom: '10px',
};

const categoryStyle: React.CSSProperties = {
  fontSize: '0.9em',
  color: '#666',
  marginBottom: '15px',
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '1em',
  lineHeight: '1.6',
  marginBottom: '20px',
  whiteSpace: 'pre-wrap', 
};

const pricingOptionListStyle: React.CSSProperties = {
  borderTop: '1px solid #eee',
  paddingTop: '15px',
  marginBottom: '20px',
};

const variantGroupStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '15px',
  marginBottom: '15px',
  backgroundColor: '#f9f9f9',
};

const variantGroupTitleStyle: React.CSSProperties = {
  fontSize: '1.1em',
  fontWeight: 'bold',
  marginBottom: '10px',
  color: '#222',
};

const variantGroupStockStyle: React.CSSProperties = {
  fontSize: '0.9em',
  fontWeight: 'normal',
  color: '#666',
  marginLeft: '10px',
};

const itemsListStyle: React.CSSProperties = {
  marginLeft: '10px',
};

const pricingOptionStyle: React.CSSProperties = {
  fontSize: '0.95em',
  marginBottom: '5px',
  color: '#333',
};

const labelsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  marginTop: '15px',
};

const labelChipStyle: React.CSSProperties = {
  backgroundColor: '#f0f0f0',
  padding: '5px 10px',
  borderRadius: '20px',
  fontSize: '0.8em',
  fontWeight: 'bold',
  color: '#555',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5em',
  cursor: 'pointer',
  color: '#999',
};

const imageGalleryStyle: React.CSSProperties = {
  display: 'flex',
  overflowX: 'auto',
  gap: '10px',
  marginBottom: '20px',
  paddingBottom: '10px', 
};

const imageStyle: React.CSSProperties = {
  minWidth: '150px',
  height: '150px',
  objectFit: 'cover',
  borderRadius: '8px',
};