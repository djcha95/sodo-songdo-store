// src/components/auth/ReferralCodeModal.tsx
import React, { useState } from 'react';
import { Gift, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { submitReferralCode, skipReferralCode } from '@/firebase/userService';
import { useAuth } from '@/context/AuthContext';
import './ReferralCodeModal.css';

interface Props {
  onSuccess: () => void;
}

const ReferralCodeModal: React.FC<Props> = ({ onSuccess }) => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    if (!code.trim()) {
      toast.error('추천인 코드를 입력해주세요.');
      return;
    }
    setIsLoading(true);
    try {
      await submitReferralCode(user.uid, code.trim().toUpperCase());
      toast.success('추천인 코드가 등록되었습니다! (+30P)');
      onSuccess();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!user) return;
    try {
      await skipReferralCode(user.uid);
      onSuccess(); // 건너뛰어도 성공으로 처리하여 모달을 닫음
    } catch (error) {
      console.error("Referral skip error:", error);
      onSuccess(); // 오류가 발생해도 일단 닫음
    }
  };

  return (
    <div className="referral-modal-overlay">
      <div className="referral-modal-content">
        <div className="referral-modal-icon">
          <Gift size={32} />
        </div>
        <h2>추천인 코드가 있으신가요?</h2>
        <p>코드를 입력하면 <strong>추가 30포인트</strong>를 바로 드려요!</p>
        <div className="referral-input-wrapper">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SODO1234"
            disabled={isLoading}
          />
          <button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? '...' : <ArrowRight size={20} />}
          </button>
        </div>
        <button onClick={handleSkip} className="skip-button" disabled={isLoading}>
          건너뛰기
        </button>
      </div>
    </div>
  );
};

export default ReferralCodeModal;