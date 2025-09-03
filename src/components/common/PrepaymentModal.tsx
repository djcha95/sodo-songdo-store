// src/components/common/PrepaymentModal.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote } from 'lucide-react';
import './PrepaymentModal.css';

interface PrepaymentModalProps {
  isOpen: boolean;
  totalPrice: number;
  onClose: () => void;
}

const PrepaymentModal: React.FC<PrepaymentModalProps> = ({ isOpen, totalPrice, onClose }) => {
  const navigate = useNavigate();

  if (!isOpen) {
    return null;
  }

  const openChannelTalk = () => {
    window.open('http://pf.kakao.com/_CxjNKn/chat', '_blank', 'noopener,noreferrer');
  };

  const handleGoToHistory = () => {
    onClose();
    navigate('/mypage/history');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon-wrapper">
          <Banknote size={48} />
        </div>
        <h4>⚠️ 선입금 후 예약 확정</h4>
        <p className="description-text"> {/* ✅ 클래스 추가 */}
          해당 상품은 선입금이 필수입니다.
          <br />
          아래 계좌로 입금 후 채널톡으로 내역을 보내주세요.
        </p>
        <div className="bank-info-highlight">
          <strong className="bank-account-number">우리은행 1005-504-763060</strong> {/* ✅ 클래스 추가 */}
          <strong className="account-holder-name">(차동진)</strong> {/* ✅ 클래스 추가 */}
          <div className="price-to-pay-prominent">
            <span className="price-label">입금할 금액</span>
            <span className="price-value">{totalPrice.toLocaleString()}원</span>
          </div>
        </div>
        <small className="notice-text"> {/* ✅ 클래스 추가 */}
          관리자가 확인 후 예약을 확정 처리해 드립니다.<br/> {/* ✅ 줄바꿈 태그 유지 */}
          미입금 시 예약은 자동 취소될 수 있습니다.
        </small>
        <div className="modal-button-group">
          <button className="modal-button primary" onClick={openChannelTalk}>
            입금 내역 보내기 (채널톡)
          </button>
          <div className="modal-button-row">
            <button className="modal-button secondary" onClick={handleGoToHistory}>
              주문내역
            </button>
            <button className="modal-button tertiary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrepaymentModal;