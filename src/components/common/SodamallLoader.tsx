// src/components/common/SodamallLoader.tsx

import React from 'react';
// ✅ [수정] 자신에게 맞는 CSS 파일을 import 하도록 경로를 수정합니다.
import './SodamallLoader.css';

interface SodamallLoaderProps {
  message?: string;
}

const SodamallLoader: React.FC<SodamallLoaderProps> = ({ message }) => {
  return (
    <div className="sodamall-loader-overlay">
      <div className="sodamall-loader-container">
        <div className="sodamall-loader-text">
          <span>소</span>
          <span>도</span>
          <span>몰</span>
        </div>
        {message && <p className="sodamall-loader-message">{message}</p>}
      </div>
    </div>
  );
};

export default SodamallLoader;