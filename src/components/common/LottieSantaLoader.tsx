import React from 'react';
import Lottie from 'lottie-react';
import newYearAnimation from '@/lottie/new-year.json'; // ✅ 새해 Lottie 파일 (사용자가 받은 파일명에 맞게 수정 필요)
import './LottieSantaLoader.css';

interface LottieSantaLoaderProps {
  message?: string;
}

const LottieSantaLoader: React.FC<LottieSantaLoaderProps> = ({
  message = "🎉 2026년 새해를 준비하는 중이에요…",
}) => {
  return (
    <div className="lottie-loader-overlay">
      <div className="lottie-loader-card">
        <Lottie
          animationData={newYearAnimation}
          loop={true}
          autoplay={true}
          style={{ width: 220, height: 220 }}
        />
        <p className="lottie-loader-text">{message}</p>
      </div>
    </div>
  );
};

export default LottieSantaLoader;
