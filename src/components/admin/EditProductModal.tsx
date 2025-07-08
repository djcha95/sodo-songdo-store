import React, { useState, useEffect } from 'react';
import type { Product, PricingOption } from '../../types';

// 부모 컴포넌트로부터 받을 props 타입 정의
interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  // [수정] onSave가 Product의 일부만 받을 수 있도록 Partial<Product> 사용
  onSave: (updatedProductData: Partial<Product>) => void; 
}

const EditProductModal = ({ isOpen, onClose, product, onSave }: EditProductModalProps) => {
  // [수정] formData의 상태를 새로운 Product 구조에 맞게 확장
  const [formData, setFormData] = useState<Partial<Product>>({});

  useEffect(() => {
    // product prop이 변경될 때마다 formData를 초기화합니다.
    if (product) {
      setFormData({
        name: product.name,
        description: product.description,
        pricingOptions: JSON.parse(JSON.stringify(product.pricingOptions)), // 깊은 복사로 배열 복사
        initialStock: product.initialStock,
        stock: product.stock,
        maxOrderPerPerson: product.maxOrderPerPerson,
      });
    }
  }, [product]);

  // 기본 입력 필드 변경 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: (name === 'name' || name === 'description') ? value : Number(value) 
    }));
  };
  
  // 가격 옵션 변경 핸들러
  const handlePricingChange = (index: number, field: keyof PricingOption, value: string | number) => {
    const newOptions = [...(formData.pricingOptions || [])];
    const option = newOptions[index];
    if (field === 'price') {
      option.price = Number(value);
    } else {
      option.unit = String(value);
    }
    setFormData(prev => ({ ...prev, pricingOptions: newOptions }));
  };
  const addPricingOption = () => {
    const newOptions = [...(formData.pricingOptions || []), { unit: '', price: 0 }];
    setFormData(prev => ({ ...prev, pricingOptions: newOptions }));
  };
  const removePricingOption = (index: number) => {
    const newOptions = (formData.pricingOptions || []).filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, pricingOptions: newOptions }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  if (!isOpen || !product) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <button onClick={onClose} className="modal-close-button">&times;</button>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>상품 정보 수정</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '70vh', overflowY: 'auto', padding: '10px' }}>
          
          {/* 기본 정보 */}
          <div className="form-group">
            <label>상품명</label>
            <input type="text" name="name" value={formData.name || ''} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>상세 설명</label>
            <textarea name="description" value={formData.description || ''} onChange={handleChange} rows={5} />
          </div>

          {/* 판매 정보 */}
          <div className="form-group">
            <label>가격 정책</label>
            <div className="pricing-options-container">
              {(formData.pricingOptions || []).map((option, index) => (
                <div key={index} className="pricing-option-row">
                  <div className="form-group">
                    <label style={{fontSize: '0.8em'}}>단위</label>
                    <input type="text" value={option.unit} onChange={(e) => handlePricingChange(index, 'unit', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label style={{fontSize: '0.8em'}}>가격 (원)</label>
                    <input type="number" value={option.price} onChange={(e) => handlePricingChange(index, 'price', e.target.value)} />
                  </div>
                  {(formData.pricingOptions?.length || 0) > 1 && <button type="button" onClick={() => removePricingOption(index)} className="remove-option-btn">X</button>}
                </div>
              ))}
              <button type="button" onClick={addPricingOption} className="add-option-btn">+ 가격 옵션 추가</button>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>현재 재고</label>
              <input type="number" name="stock" value={formData.stock || 0} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>1인당 최대 구매 수량</label>
              <input type="number" name="maxOrderPerPerson" value={formData.maxOrderPerPerson || ''} onChange={handleChange} placeholder="입력 안하면 무제한"/>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'right' }}>
          <button onClick={onClose} style={{ marginRight: '1rem', padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} style={{ padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>저장하기</button>
        </div>
      </div>
    </div>
  );
};

export default EditProductModal;