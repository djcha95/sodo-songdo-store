// src/components/common/SodomallLoader.tsx

import React from 'react';
// ✅ [수정] 자신에게 맞는 CSS 파일을 import 하도록 경로를 수정합니다.
import './SodomallLoader.css';

interface SodomallLoaderProps {
  message?: string;
}

const SodomallLoader: React.FC<SodomallLoaderProps> = ({ message }) => {
  return (
    <div className="Sodomall-loader-overlay">
      <div className="Sodomall-loader-container">
        <div className="Sodomall-loader-text">
          <span>소</span>
          <span>도</span>
          <span>몰</span>
        </div>
        {message && <p className="Sodomall-loader-message">{message}</p>}
      </div>
    </div>
  );
};

export default SodomallLoader;