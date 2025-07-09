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
 // ✅ [수정] 개선된 훅을 사용합니다.
 const { scrollRef, mouseHandlers, scrollByPage, showLeftArrow, showRightArrow } = useHorizontalScroll();

 const cardElements = React.Children.toArray(children);
 // 섹션에 내용이 없거나, 빈 div만 있는 경우 렌더링하지 않습니다.
 if (cardElements.length === 0 || (cardElements.length === 1 && !cardElements[0])) {
    return null;
 }

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
     <div className="horizontal-scroll-container">
       {/* ✅ [수정] 이제 화살표가 컨텐츠 로딩 후에도 정상적으로 표시됩니다. */}
       {showLeftArrow && (
         <button className="scroll-arrow prev" onClick={() => scrollByPage('left')} aria-label="이전 상품 보기">
           <ChevronLeft />
         </button>
       )}
       {/* ✅ [수정] 스크롤 컨테이너에 마우스 드래그 이벤트를 적용합니다. */}
       <div className="product-grid horizontal-scroll" ref={scrollRef} {...mouseHandlers}>
         {children}
       </div>
       {showRightArrow && (
         <button className="scroll-arrow next" onClick={() => scrollByPage('right')} aria-label="다음 상품 보기">
           <ChevronRight />
         </button>
       )}
     </div>
   </section>
 );
};

export default ProductSection;
