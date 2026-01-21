// src/components/common/SodomallLoader.tsx
import React from 'react';
import Lottie from 'lottie-react';
import redEnvelopeAnimation from '@/lottie/red envelope.json'; // ✅ 복 Lottie 파일
import './SodomallLoader.css';

interface SodomallLoaderProps {
  isInline?: boolean;
  message?: string;
}

const SodomallLoader: React.FC<SodomallLoaderProps> = ({
  isInline = false,
  message,
}) => {
  if (isInline) {
    return (
      <div className="loader-inline">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="santa-loader-overlay">
      <div className="santa-loader-card">
        {/* 🎊 SONGDOPICK 브랜드 라벨 */}
        <div className="santa-loader-brand">SONGDOPICK</div>

        <Lottie
          animationData={redEnvelopeAnimation}
          loop
          autoplay
          style={{ width: 240, height: 240 }}
        />
        <p className="santa-loader-text">
          {message || '복 담는 중이에요…'}
        </p>
      </div>
    </div>
  );
};

export default SodomallLoader;
