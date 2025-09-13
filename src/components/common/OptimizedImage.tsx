// src/components/common/OptimizedImage.tsx (교체)

import React, { useState, useEffect, useMemo } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUtils';

interface OptimizedImageProps {
  originalUrl: string;
  size: '150x150' | '200x200' | '1080x1080';
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

const sizeToWH: Record<OptimizedImageProps['size'], { w: number; h: number }> = {
  '150x150': { w: 150, h: 150 },
  '200x200': { w: 200, h: 200 },
  '1080x1080': { w: 1080, h: 1080 },
};

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  originalUrl,
  size,
  alt,
  className,
  loading = 'lazy',
  fetchPriority = 'auto',
}) => {
  const optimizedUrl = useMemo(() => getOptimizedImageUrl(originalUrl, size), [originalUrl, size]);
  const [imageUrl, setImageUrl] = useState(optimizedUrl);

  useEffect(() => {
    setImageUrl(getOptimizedImageUrl(originalUrl, size));
  }, [originalUrl, size]);

  const handleError = () => {
    if (imageUrl !== originalUrl) setImageUrl(originalUrl);
  };

  const { w, h } = sizeToWH[size];

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      width={w}
      height={h}
      onError={handleError}
    />
  );
};

export default OptimizedImage;
