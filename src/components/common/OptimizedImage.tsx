// src/components/common/OptimizedImage.tsx

import React, { useState, useEffect } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUtils';

interface OptimizedImageProps {
  originalUrl: string;
  size: '150x150' | '200x200' | '1080x1080';
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  originalUrl,
  size,
  alt,
  className,
  loading = 'lazy',
}) => {
  const optimizedUrl = getOptimizedImageUrl(originalUrl, size);
  const [imageUrl, setImageUrl] = useState(optimizedUrl);

  useEffect(() => {
    // originalUrl이 변경되면, 다시 optimizedUrl을 먼저 시도하도록 상태를 리셋합니다.
    setImageUrl(getOptimizedImageUrl(originalUrl, size));
  }, [originalUrl, size]);

  const handleError = () => {
    // 최적화된 이미지 로딩에 실패하면 (예: 아직 생성되지 않은 경우)
    // 원본 URL로 교체하여 이미지를 띄웁니다.
    if (imageUrl !== originalUrl) {
      setImageUrl(originalUrl);
    }
  };

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
    />
  );
};

export default OptimizedImage;