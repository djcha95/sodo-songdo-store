// src/components/common/SodomallLoader.tsx
import React from 'react';
import Lottie from 'lottie-react';
import newYearAnimation from '@/lottie/new-year.json'; // ✅ 새해 Lottie 파일 (사용자가 받은 파일명에 맞게 수정 필요)
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
          animationData={newYearAnimation}
          loop
          autoplay
          style={{ width: 240, height: 240 }}
        />
        <p className="santa-loader-text">
          {message || '🎉 2026년 새해를 준비하는 중이에요…'}
        </p>
      </div>
    </div>
  );
};

export default SodomallLoader;
