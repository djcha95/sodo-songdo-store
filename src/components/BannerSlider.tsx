// src/components/BannerSlider.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Banner } from '../types';
import './BannerSlider.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
// ✅ 1. 이미지 최적화 유틸리티 함수를 import 합니다.
import { getOptimizedImageUrl } from '@/utils/imageUtils';

interface BannerSliderProps {
  banners: Banner[];
  className?: string;
}

const BannerSlider: React.FC<BannerSliderProps> = ({ banners, className }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const goToNext = useCallback(() => {
    setCurrentIndex((prevIndex) =>
      prevIndex === banners.length - 1 ? 0 : prevIndex + 1
    );
  }, [banners.length]);

  const goToPrev = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? banners.length - 1 : prevIndex - 1
    );
  };

  const startAutoSlide = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (banners.length > 1) {
      intervalRef.current = setInterval(() => {
        goToNext();
      }, 5000);
    }
  }, [banners.length, goToNext]);

  useEffect(() => {
    startAutoSlide();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [startAutoSlide]);

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.transform = `translateX(-${currentIndex * 100}%)`;
    }
  }, [currentIndex]);

  if (!banners || banners.length === 0) {
    return (
      <div className={`banner-slider-container ${className || ''}`}>
        <img src="https://via.placeholder.com/1200x300?text=No+Banners" alt="No Banners" />
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
            style={{ minWidth: '100%' }}
          >
            <img
              // ✅ 2. getOptimizedImageUrl 함수를 사용하여 1080x1080 사이즈의 webp 이미지를 요청합니다.
              src={getOptimizedImageUrl(banner.imageUrl, '1080x1080')}
              alt={`Banner ${index + 1}`}
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchpriority={index === 0 ? 'high' : 'auto'} // 'fetchPriority'를 'fetchpriority'로 수정
            />
          </a>
        ))}
      </div>

      {/* 배너가 1개보다 많을 때만 화살표와 도트를 표시합니다. */}
      {banners.length > 1 && (
        <>
          <button className="banner-nav-button prev" onClick={goToPrev}>
            <ChevronLeft size={24} />
          </button>
          <button className="banner-nav-button next" onClick={goToNext}>
            <ChevronRight size={24} />
          </button>
          <div className="banner-dots-container">
            {banners.map((_, index) => (
              <span
                key={index}
                className={`banner-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              ></span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BannerSlider;