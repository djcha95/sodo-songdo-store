// src/components/LoadingSpinner.tsx

import React from 'react';
import './LoadingSpinner.css'; // ✅ 새로운 CSS 파일 import

const LoadingSpinner: React.FC = () => {
  return (
    <div className="loading-overlay">
      {/* ✅ '소도몰' 텍스트 애니메이션으로 교체 */}
      <h1 className="loading-text">소도몰</h1>
    </div>
  );
};

export default LoadingSpinner;