// src/components/common/SodomallLoader.tsx
import React from 'react';
import Lottie from 'lottie-react';
import santaDelivery from '@/lottie/santa-delivery.json'; // ✅ 이름 반영
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
        {/* 🎩 SONGDOPICK 브랜드 라벨 */}
        <div className="santa-loader-brand">SONGDOPICK</div>

        <Lottie
          animationData={santaDelivery}
          loop
          autoplay
          style={{ width: 240, height: 240 }}
        />
        <p className="santa-loader-text">
          {message || '🎅 산타가 선물 싣고 오는 중이에요…'}
        </p>
      </div>
    </div>
  );
};

export default SodomallLoader;
