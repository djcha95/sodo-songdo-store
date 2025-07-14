// src/components/QuantityModal.tsx
import React, { useState } from 'react';
import { FiX, FiPlus, FiMinus } from 'react-icons/fi';
import './QuantityModal.css'; // src/components/QuantityModal.css

interface QuantityModalProps {
  productName: string;
  stock: number;
  onClose: () => void;
  onAddToCart: (quantity: number) => void;
}

export const QuantityModal: React.FC<QuantityModalProps> = ({ productName, stock, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);

  const handleQuantityChange = (delta: number) => {
    const newQuantity = quantity + delta;
    if (newQuantity > 0 && newQuantity <= stock) {
      setQuantity(newQuantity);
    }
  };

  const handleConfirm = () => {
    onAddToCart(quantity);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}><FiX /></button>
        <h3>수량 선택</h3>
        <p className="modal-product-name">{productName}</p>
        <div className="quantity-selector">
          <button onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}><FiMinus /></button>
          <span>{quantity}</span>
          <button onClick={() => handleQuantityChange(1)} disabled={quantity >= stock}><FiPlus /></button>
        </div>
        <p className="modal-stock-info">남은 수량: {stock}개</p>
        <button className="modal-confirm-button" onClick={handleConfirm}>
          장바구니 담기
        </button>
      </div>
    </div>
  );
};