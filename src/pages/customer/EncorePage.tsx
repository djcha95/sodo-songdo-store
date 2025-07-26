// src/pages/customer/EncorePage.tsx

import React from 'react';
import { HardHat } from 'lucide-react'; // 공사 중 아이콘
import './OnsiteSalePage.css'; // 현장 판매 페이지와 동일한 스타일 재사용

const EncorePage: React.FC = () => {
  return (
    // 현장 판매 페이지와 동일한 컨테이너 및 클래스 이름 사용
    <div className="onsite-sale-container">
      <div className="development-notice">
        <HardHat size={48} className="notice-icon" />
        <h1 className="notice-title">앵콜/요청 페이지</h1>
        <p className="notice-message">이 페이지는 현재 준비 중입니다.</p>
        <span className="notice-subtext">
          지난 상품에 대한 앵콜 요청 통계를 한눈에 볼 수 있도록 준비하고 있어요!
        </span>
      </div>
    </div>
  );
};

export default EncorePage;