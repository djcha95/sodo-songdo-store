import React, { useState, useEffect, useCallback } from 'react';
// [수정] 실제 데이터 구조에 맞는 타입들을 가져옵니다.
import type { Product, SalesRound, VariantGroup, ProductItem } from '../../root-types';

// [수정] 모달이 받을 props 타입을 현재 데이터 구조에 맞게 변경합니다.
interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit: Product | null;
  roundIdToEdit: string | null;
  onSave: (productId: string, roundId: string, updatedRoundData: SalesRound) => void;
}

// [수정] 폼에서 사용할 데이터의 형태를 정의합니다.
// Product의 일부 정보와 SalesRound의 정보를 결합합니다.
interface EditFormData extends Omit<SalesRound, 'roundId' | 'createdAt' | 'publishAt' | 'waitlist' | 'waitlistCount'> {
  groupName: string; // From Product
  description: string; // From Product
}


const EditProductModal = ({ isOpen, onClose, productToEdit, roundIdToEdit, onSave }: EditProductModalProps) => {
  const [formData, setFormData] = useState<Partial<EditFormData>>({});

  useEffect(() => {
    if (productToEdit && roundIdToEdit) {
      const round = productToEdit.salesHistory.find(r => r.roundId === roundIdToEdit);
      if (round) {
        // [수정] 현재 데이터 구조에 맞게 formData를 초기화합니다.
        setFormData({
          groupName: productToEdit.groupName,
          description: productToEdit.description,
          roundName: round.roundName,
          status: round.status,
          variantGroups: JSON.parse(JSON.stringify(round.variantGroups)), // Deep copy
          deadlineDate: round.deadlineDate,
          pickupDate: round.pickupDate,
        });
      }
    }
  }, [productToEdit, roundIdToEdit]);

  // [수정] 최상위 필드 변경 핸들러
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  // [수정] VariantGroup (하위 상품 그룹)의 필드를 변경하는 핸들러
  const handleVariantGroupChange = useCallback((vgIndex: number, field: keyof VariantGroup, value: any) => {
    setFormData(prev => {
      const newVariantGroups = [...(prev.variantGroups || [])];
      (newVariantGroups[vgIndex] as any)[field] = value;
      return { ...prev, variantGroups: newVariantGroups };
    });
  }, []);

  // [수정] ProductItem (개별 판매 옵션)의 필드를 변경하는 핸들러
  const handleItemChange = useCallback((vgIndex: number, itemIndex: number, field: keyof ProductItem, value: any) => {
    setFormData(prev => {
      const newVariantGroups = [...(prev.variantGroups || [])];
      const newItems = [...newVariantGroups[vgIndex].items];
      (newItems[itemIndex] as any)[field] = (field === 'price' || field === 'stock' || field === 'stockDeductionAmount' || field === 'limitQuantity') ? Number(value) : value;
      newVariantGroups[vgIndex].items = newItems;
      return { ...prev, variantGroups: newVariantGroups };
    });
  }, []);


  const handleSave = () => {
    if (productToEdit && roundIdToEdit && formData) {
      // onSave에 전달할 SalesRound 데이터 재구성
      const originalRound = productToEdit.salesHistory.find(r => r.roundId === roundIdToEdit);
      if (!originalRound) return;

      const updatedRound: SalesRound = {
        ...originalRound,
        roundName: formData.roundName || originalRound.roundName,
        status: formData.status || originalRound.status,
        variantGroups: formData.variantGroups || originalRound.variantGroups,
        deadlineDate: formData.deadlineDate || originalRound.deadlineDate,
        pickupDate: formData.pickupDate || originalRound.pickupDate,
      };
      onSave(productToEdit.id, roundIdToEdit, updatedRound);
    }
  };

  if (!isOpen || !productToEdit) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <button onClick={onClose} className="modal-close-button">&times;</button>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>판매 회차 정보 수정</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '70vh', overflowY: 'auto', padding: '10px' }}>
          
          <div className="form-group">
            <label>대표 상품명 (수정 불가)</label>
            <input type="text" name="groupName" value={formData.groupName || ''} readOnly disabled />
          </div>
          <div className="form-group">
            <label>회차명</label>
            <input type="text" name="roundName" value={formData.roundName || ''} onChange={handleChange} />
          </div>

          {(formData.variantGroups || []).map((vg, vgIndex) => (
            <div key={vg.id || vgIndex} className="variant-group-box">
              {/* [수정] h4 태그를 input으로 변경하여 그룹명도 수정 가능하게 하고, handleVariantGroupChange 함수를 사용합니다. */}
              <div className="form-group">
                <label>하위 상품 그룹명</label>
                <input
                  type="text"
                  className="variant-group-title-input"
                  value={vg.groupName}
                  onChange={(e) => handleVariantGroupChange(vgIndex, 'groupName', e.target.value)}
                />
              </div>

              {vg.items.map((item, itemIndex) => (
                 <div key={item.id || itemIndex} className="pricing-option-row">
                   <div className="form-group">
                     <label style={{fontSize: '0.8em'}}>옵션명</label>
                     <input type="text" value={item.name} onChange={(e) => handleItemChange(vgIndex, itemIndex, 'name', e.target.value)} />
                   </div>
                   <div className="form-group">
                     <label style={{fontSize: '0.8em'}}>가격</label>
                     <input type="number" value={item.price} onChange={(e) => handleItemChange(vgIndex, itemIndex, 'price', e.target.value)} />
                   </div>
                   <div className="form-group">
                     <label style={{fontSize: '0.8em'}}>재고</label>
                     <input type="number" value={item.stock} onChange={(e) => handleItemChange(vgIndex, itemIndex, 'stock', e.target.value)} placeholder="무제한은 -1"/>
                   </div>
                 </div>
              ))}
            </div>
          ))}

        </div>

        <div style={{ marginTop: '2rem', textAlign: 'right' }}>
          <button onClick={onClose} style={{ marginRight: '1rem', padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} style={{ padding: '10px 20px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>저장하기</button>
        </div>
      </div>
    </div>
  );
};

export default EditProductModal;