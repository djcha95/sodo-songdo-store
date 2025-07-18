// src/components/customer/ProductSection.tsx

import React from 'react';
import './ProductSection.css';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface ProductSectionProps {
 title: React.ReactNode;
 children: React.ReactNode;
 countdownText?: string | null;
}

const ProductSection: React.FC<ProductSectionProps> = ({ title, children, countdownText }) => {
 const { scrollRef, mouseHandlers, scrollByPage, showLeftArrow, showRightArrow } = useHorizontalScroll();

 const childElements = React.Children.toArray(children);
 const hasContent = childElements.length > 0 && (childElements.length > 1 || childElements[0]);

 return (
   <section className="page-section product-section">
     <div className="section-header">
       <h2 className="section-title">{title}</h2>
       {countdownText && (
         <div className="section-countdown">
           <Clock size={14} className="countdown-icon" />
           <span>마감</span>
           <span className="countdown-time">{countdownText}</span>
         </div>
       )}
     </div>
     
     {/* ✅ [수정] 내용이 있을 때만 스크롤 컨테이너를 렌더링 */}
     {hasContent ? (
        <div className="horizontal-scroll-container">
          {showLeftArrow && (
            <button className="scroll-arrow prev" onClick={() => scrollByPage('left')} aria-label="이전 상품 보기">
              <ChevronLeft />
            </button>
          )}
          <div className="product-grid horizontal-scroll" ref={scrollRef} {...mouseHandlers}>
            {children}
          </div>
          {showRightArrow && (
            <button className="scroll-arrow next" onClick={() => scrollByPage('right')} aria-label="다음 상품 보기">
              <ChevronRight />
            </button>
          )}
        </div>
     ) : (
        // 내용이 없을 경우 children을 그대로 렌더링 (플레이스홀더 등)
        children
     )}
   </section>
 );
};

export default ProductSection;