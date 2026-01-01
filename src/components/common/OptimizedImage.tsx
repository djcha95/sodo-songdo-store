// src/components/common/OptimizedImage.tsx

import React, { useState, useEffect } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUtils';

interface OptimizedImageProps {
  originalUrl?: string | null;
  size: '150x150' | '200x200' | '1080x1080';
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  originalUrl,
  size,
  alt,
  className,
  loading = 'lazy',
  draggable = false,
}) => {
  const getPlaceholderUrl = (s: OptimizedImageProps['size']) => {
    const dim = s === '1080x1080' ? '1080x1080' : s;
    return `https://placeholder.com/${dim}.png?text=No+Image`;
  };

  const safeOriginalUrl =
    typeof originalUrl === 'string' && originalUrl.trim() ? originalUrl : getPlaceholderUrl(size);

  const optimizedUrl = getOptimizedImageUrl(safeOriginalUrl, size) || safeOriginalUrl;
  const [imageUrl, setImageUrl] = useState(optimizedUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // originalUrl이 변경되면, 다시 optimizedUrl을 먼저 시도하도록 상태를 리셋합니다.
    const nextSafe =
      typeof originalUrl === 'string' && originalUrl.trim() ? originalUrl : getPlaceholderUrl(size);
    setImageUrl(getOptimizedImageUrl(nextSafe, size) || nextSafe);
    setHasError(false);
  }, [originalUrl, size]);

  const handleError = () => {
    // 최적화된 이미지 로딩에 실패하면 (예: 아직 생성되지 않은 경우)
    // 원본 URL로 교체하여 이미지를 띄웁니다.
    if (!hasError) {
      setImageUrl(safeOriginalUrl);
      setHasError(true);
      return;
    }
    setImageUrl(getPlaceholderUrl(size));
  };

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) e.preventDefault();
      }}
    />
  );
};

export default OptimizedImage;