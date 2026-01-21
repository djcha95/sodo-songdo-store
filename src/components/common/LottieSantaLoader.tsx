import React from 'react';
import Lottie from 'lottie-react';
import redEnvelopeAnimation from '@/lottie/red envelope.json'; // ✅ 복 Lottie 파일
import './LottieSantaLoader.css';

interface LottieSantaLoaderProps {
  message?: string;
}

const LottieSantaLoader: React.FC<LottieSantaLoaderProps> = ({
  message = "복 담는 중이에요…",
}) => {
  return (
    <div className="lottie-loader-overlay">
      <div className="lottie-loader-card">
        <Lottie
          animationData={redEnvelopeAnimation}
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
