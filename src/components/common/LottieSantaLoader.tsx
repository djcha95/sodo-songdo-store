import React from 'react';
import Lottie from 'lottie-react';
import santaAnimation from '@/lottie/santa-delivery.json';

interface LottieSantaLoaderProps {
  message?: string;
}

const LottieSantaLoader: React.FC<LottieSantaLoaderProps> = ({
  message = "🎁 산타가 선물 싣고 오는 중이에요…",
}) => {
  return (
    <div className="lottie-loader-overlay">
      <div className="lottie-loader-card">
        <Lottie
          animationData={santaAnimation}
          loop={true}
          style={{ width: 220, height: 220 }}
        />
        <p className="lottie-loader-text">{message}</p>
      </div>
    </div>
  );
};

export default LottieSantaLoader;
