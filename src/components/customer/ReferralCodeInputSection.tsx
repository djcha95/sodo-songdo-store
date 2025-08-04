// src/components/customer/ReferralCodeInputSection.tsx

import React, { useState } from 'react';
import { Gift, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
// ✅ [수정] 새로운 Cloud Function 호출 함수를 import 합니다.
import { submitReferralCode } from '@/firebase/userService'; 

const ReferralCodeInputSection: React.FC = () => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('로그인 정보가 유효하지 않습니다.');
      return;
    }
    if (!code.trim()) {
      toast.error('초대 코드를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    // ✅ [수정] 새로운 Cloud Function 호출 로직으로 변경합니다.
    // 더 이상 uid를 넘길 필요가 없으며, 성공 시 메시지를 동적으로 표시합니다.
    const promise = submitReferralCode(code.trim().toUpperCase());

    toast.promise(promise, {
      loading: '코드를 확인하는 중...',
      success: (message) => String(message), // Cloud Function에서 반환된 성공 메시지 표시
      error: (err: any) => err.message || '코드 적용에 실패했습니다. 다시 확인해주세요.',
    });

    try {
      await promise;
    } catch (error) {
      // toast.promise가 오류를 처리하므로 여기서는 콘솔에만 기록합니다.
      console.error("Referral code submission failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="referral-input-card" data-tutorial-id="mypage-referral-input">
      <div className="referral-input-header">
        <Gift size={24} />
        <h4>친구 초대 코드 입력</h4>
      </div>
      <p className="referral-input-guide">
        <Info size={14} />
        <span className="guide-text">
          초대 코드를 입력하고 즉시 <strong>30포인트</strong>를 받으세요! (최초 1회)
        </span>
      </p>
      <div className="referral-input-form">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="친구에게 받은 초대 코드"
          disabled={isLoading}
        />
        <button onClick={handleSubmit} className="common-button button-primary" disabled={isLoading}>
          {isLoading ? '확인 중...' : '포인트 받기'}
        </button>
      </div>
    </div>
  );
};

export default ReferralCodeInputSection;