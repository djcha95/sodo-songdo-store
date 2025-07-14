// src/components/common/InlineSodamallLoader.tsx

import React from 'react';
import './InlineSodamallLoader.css';

interface InlineSodamallLoaderProps {
  message?: string;
}

const InlineSodamallLoader: React.FC<InlineSodamallLoaderProps> = ({ message = '콘텐츠 로딩 중...' }) => {
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

export default InlineSodamallLoader;