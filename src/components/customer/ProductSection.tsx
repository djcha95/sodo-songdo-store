// src/components/customer/ProductSection.tsx

import React from 'react';
import './ProductSection.css';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface ProductSectionProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  countdownText?: string | null;
  tutorialId?: string; // ✅ [추가] 튜토리얼 ID를 받을 수 있도록 속성 추가
}

const ProductSection: React.FC<ProductSectionProps> = ({
  icon,
  title,
  children,
  countdownText,
  tutorialId, // ✅ [추가]
}) => {
  const { scrollRef, mouseHandlers, scrollByPage, showLeftArrow, showRightArrow } = useHorizontalScroll();

  const childElements = React.Children.toArray(children);
  const hasContent = childElements.length > 0 && childElements.some(child => child !== null);

  return (
    // ✅ [추가] 받은 tutorialId를 data-tutorial-id 속성으로 설정
    <section className="page-section product-section" data-tutorial-id={tutorialId}>
      <div className="section-header">
        <h2 className="section-title">
          {icon}
          {title}
        </h2>
        {countdownText && (
          <div className="section-countdown">
            <Clock size={14} className="countdown-icon" />
            <span>마감</span>
            <span className="countdown-time">{countdownText}</span>
          </div>
        )}
      </div>
      
      <div className="horizontal-scroll-container">
        <button 
          className={`scroll-arrow prev ${showLeftArrow ? 'visible' : ''}`} 
          onClick={() => scrollByPage('left')} 
          aria-label="이전 상품 보기"
        >
          <ChevronLeft />
        </button>
        
        <div className="product-grid horizontal-scroll" ref={scrollRef} {...mouseHandlers}>
          {hasContent ? children : null}
        </div>

        <button 
          className={`scroll-arrow next ${showRightArrow ? 'visible' : ''}`} 
          onClick={() => scrollByPage('right')} 
          aria-label="다음 상품 보기"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
};

export default ProductSection;
