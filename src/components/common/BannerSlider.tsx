// src/components/BannerSlider.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Banner } from '../../root-types';
import './BannerSlider.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getOptimizedImageUrl } from '@/utils/imageUtils';

interface BannerSliderProps {
  banners: Banner[];
  className?: string;
}

const PLACEHOLDER = 'https://placeholder.com/1200x400.png?text=Banner';

const isFirebaseStorage = (url?: string) => {
  if (!url) return false;
  try {
    return new URL(url).hostname.includes('firebasestorage.googleapis.com');
  } catch {
    return false;
  }
};

const SafeBannerImage: React.FC<{
  src?: string;
  alt: string;
  eager?: boolean;
}> = ({ src, alt, eager }) => {
  const original = (src && src.trim()) ? src : PLACEHOLDER;

  // 초기 렌더에서 깜빡임 방지: 첫 시도 src 결정
  const initialSrc = React.useMemo(() => {
    if (isFirebaseStorage(original)) return original;
    const optimized = getOptimizedImageUrl(original, '1080x1080');
    return optimized || original;
  }, [original]);

  const [imageSrc, setImageSrc] = useState(initialSrc);

  // src 변경 시 1회만 재결정
  useEffect(() => {
    if (isFirebaseStorage(original)) {
      setImageSrc(original);
    } else {
      const optimized = getOptimizedImageUrl(original, '1080x1080') || original;
      setImageSrc(optimized);
    }
  }, [original]);

  // onError: 최적화 → 원본 → 플레이스홀더 순서로 1~2회만 폴백
  const handleError = useCallback(() => {
    if (imageSrc !== original) {
      setImageSrc(original);
    } else if (imageSrc !== PLACEHOLDER) {
      setImageSrc(PLACEHOLDER);
    }
  }, [imageSrc, original]);

  return (
    <img
      src={imageSrc}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      // react에서는 소문자 속성도 그대로 전달되므로 유지
      fetchpriority={eager ? 'high' : 'auto'}
      onError={handleError}
    />
  );
};

const BannerSlider: React.FC<BannerSliderProps> = ({ banners, className }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const goToNext = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex === banners.length - 1 ? 0 : prevIndex + 1
    );
  }, [banners.length]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? banners.length - 1 : prevIndex - 1
    );
  }, [banners.length]);

  const startAutoSlide = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (banners.length > 1) {
      intervalRef.current = setInterval(goToNext, 5000);
    }
  }, [banners.length, goToNext]);

  useEffect(() => {
    startAutoSlide();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startAutoSlide]);

  // 인덱스 이동 애니메이션
  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.transform = `translateX(-${currentIndex * 100}%)`;
    }
  }, [currentIndex]);

  // 배너 배열 바뀌면 인덱스/슬라이드 타이머 리셋
  useEffect(() => {
    setCurrentIndex(0);
    startAutoSlide();
  }, [banners, startAutoSlide]);

  if (!banners || banners.length === 0) {
    return (
      <div className={`banner-slider-container ${className || ''}`}>
        <div className="banner-slide-placeholder">배너가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className={`banner-slider-container ${className || ''}`}>
      <div className="banner-slider-wrapper" ref={sliderRef}>
        {banners.map((banner, index) => (
          <a
            key={banner.id}
            href={banner.linkTo || '#'}
            target={banner.linkTo?.startsWith('http') ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className="banner-slide"
            aria-label={`배너 ${index + 1}`}
          >
            <SafeBannerImage
              src={banner.imageUrl}
              alt={`Banner ${index + 1}`}
              eager={index === 0}
            />
          </a>
        ))}
      </div>

      {banners.length > 1 && (
        <>
          <button className="banner-nav-button prev" onClick={goToPrev} aria-label="이전 배너">
            <ChevronLeft size={24} />
          </button>
          <button className="banner-nav-button next" onClick={goToNext} aria-label="다음 배너">
            <ChevronRight size={24} />
          </button>
          <div className="banner-dots-container">
            {banners.map((_, index) => (
              <button
                key={index}
                className={`banner-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`배너 ${index + 1}로 이동`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BannerSlider;
