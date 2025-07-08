// src/components/admin/PricingOptionItem.tsx

import React from 'react';
import { PlusCircle, X, Minus } from 'lucide-react';
import type { PricingOption } from '../../types';

// id를 포함한 타입 정의
interface EditablePricingOption extends PricingOption {
  id: number;
}

// 이 컴포넌트가 받을 props 타입 정의
interface PricingOptionItemProps {
  option: EditablePricingOption;
  onPriceChange: (id: number, field: 'unit' | 'price', value: string | number) => void;
  onPriceStep: (id: number, amount: number) => void;
  onRemove: (id: number) => void;
  isRemovable: boolean;
}

const PricingOptionItem: React.FC<PricingOptionItemProps> = ({
  option,
  onPriceChange,
  onPriceStep,
  onRemove,
  isRemovable,
}) => {
  return (
    <div className="pricing-option-group">
      <div className="form-group unit-group">
        <input
          type="text"
          value={option.unit}
          onChange={(e) => onPriceChange(option.id, 'unit', e.target.value)}
          placeholder="단위 (예: 1박스)"
        />
      </div>
      <div className="form-group price-group">
        <div className="price-input-wrapper">
          <button type="button" onClick={() => onPriceStep(option.id, -100)}>
            <Minus size={16} />
          </button>
          <input
            type="number"
            value={option.price}
            onChange={(e) => onPriceChange(option.id, 'price', e.target.value)}
            placeholder="가격"
          />
          <button type="button" onClick={() => onPriceStep(option.id, 100)}>
            <PlusCircle size={16} />
          </button>
          <span>원</span>
        </div>
      </div>
      {isRemovable && (
        <button type="button" onClick={() => onRemove(option.id)} className="remove-pricing-option-btn">
          <X size={18} />
        </button>
      )}
    </div>
  );
};

// React.memo를 사용하여 props가 변경되지 않으면 리렌더링을 방지합니다.
// 이것이 포커스 문제를 해결하는 핵심입니다.
export default React.memo(PricingOptionItem);