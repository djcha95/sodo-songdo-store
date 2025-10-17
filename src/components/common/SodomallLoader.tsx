// src/components/common/SodomallLoader.tsx

import React from 'react';
import './SodomallLoader.css';

interface SodomallLoaderProps {
  isInline?: boolean;
  message?: string; // ✅ [추가] 메시지 props를 받을 수 있도록 합니다.
}

const SodomallLoader: React.FC<SodomallLoaderProps> = ({ isInline = false, message }) => {
  if (isInline) {
    return (
      <div className="loader-inline">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="loader-container">
      <div className="loader-content">
        <div className="spinner-full"></div>
        {/* ✅ [수정] message가 있으면 표시하고, 없으면 기본 텍스트를 보여줍니다. */}
        <p className="loader-text">{message || '잠시만 기다려주세요...'}</p>
      </div>
    </div>
  );
};

export default SodomallLoader;