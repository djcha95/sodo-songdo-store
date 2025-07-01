// src/components/BannerSlider.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Banner } from '../types';
import './BannerSlider.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface BannerSliderProps {
  banners: Banner[];
  className?: string; // className prop 추가
}

const BannerSlider: React.FC<BannerSliderProps> = ({ banners, className }) => { // className prop 받기
  const [currentIndex, setCurrentIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const goToNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === banners.length - 1 ? 0 : prevIndex + 1
    );
  };

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
  }, [banners.length]);

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
    // 배너가 없을 경우 플레이스홀더 이미지 또는 아무것도 렌더링하지 않음 (이전 로직 유지)
    // ProductListPage.css의 .banner-slider-container img 스타일을 따르도록 div 구조 유지
    return (
      <div className={`banner-slider-container ${className || ''}`}>
        <img src="https://via.placeholder.com/1200x300?text=No+Banners" alt="No Banners" />
      </div>
    );
  }

  return (
    <div className={`banner-slider-container ${className || ''}`}> {/* className 적용 */}
      <div className="banner-slider-wrapper" ref={sliderRef}>
        {banners.map((banner, index) => (
          <a
            key={banner.id}
            href={banner.linkTo || '#'}
            target={banner.linkTo?.startsWith('http') ? '_blank' : '_self'} // 외부 링크일 경우 새 탭, 아니면 현재 탭
            rel="noopener noreferrer"
            className="banner-slide"
            style={{ minWidth: '100%' }} // 슬라이드가 항상 100% 너비를 차지하도록
          >
            <img src={banner.imageUrl} alt={`Banner ${index + 1}`} />
          </a>
        ))}
      </div>

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