// src/pages/customer/OnsiteSalePage.tsx

import React from 'react';
import { HardHat } from 'lucide-react'; // 공사 중 아이콘
import './OnsiteSalePage.css';

const OnsiteSalePage: React.FC = () => {
  return (
    <div className="onsite-sale-container">
      <div className="development-notice">
        <HardHat size={48} className="notice-icon" />
        <h1 className="notice-title">현장 판매 페이지</h1>
        <p className="notice-message">이 페이지는 현재 준비 중입니다.</p>
        <span className="notice-subtext">
          더욱 편리하고 새로운 기능으로 곧 찾아뵙겠습니다!
        </span>
      </div>
    </div>
  );
};

export default OnsiteSalePage;