// src/components/common/InlineSodomallLoader.tsx

import React from 'react';
import './InlineSodomallLoader.css';

interface InlineSodomallLoaderProps {
  message?: string;
}

const InlineSodomallLoader: React.FC<InlineSodomallLoaderProps> = ({ message = '콘텐츠 로딩 중...' }) => {
  return (
    <div className="inline-loader-wrapper">
      <div className="inline-loader-text">
        <span>소</span>
        <span>도</span>
        <span>몰</span>
      </div>
      <p className="inline-loader-message">{message}</p>
    </div>
  );
};

export default InlineSodomallLoader;