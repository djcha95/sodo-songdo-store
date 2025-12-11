// src/components/common/ConfirmModal.tsx

import React from 'react';
import { X, CheckCircle2, Info } from 'lucide-react';
import './ConfirmModal.css';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  productName: string;
  price: number;
  quantity: number;
  loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  productName,
  price,
  quantity,
  loading = false,
}) => {
  if (!isOpen) return null;

  const totalPrice = price * quantity;

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      {/* e.stopPropagation()은 모달 내부 클릭 시 닫히지 않게 함 */}
      <div
        className="confirm-modal luxury-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <h3>예약 확인</h3>
          <button
            className="confirm-close-btn"
            type="button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="confirm-modal-content">
          <div className="confirm-icon-area luxury">
            <CheckCircle2 size={48} color="#0F172A" strokeWidth={1.5} />
          </div>

          <p className="confirm-main-text luxury">
            아래 상품을 예약하시겠습니까?
          </p>

          <div className="order-summary-box luxury">
            <div className="summary-row product-name">
              <span>{productName}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row details">
              <span className="detail-qty">{quantity}개</span>
              <span className="total-price luxury">
                {totalPrice.toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="safe-notice luxury">
            <Info size={16} className="notice-icon" />
            <span>
              예약 후 <b>[내 예약내역]</b>에서 언제든지 취소하실 수 있습니다.
            </span>
          </div>

          <div className="confirm-modal-actions luxury">
            <button
              className="btn-cancel luxury"
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              다음에요
            </button>
            <button
              className="btn-confirm luxury"
              type="button"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? '처리중...' : '네, 예약할게요'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
