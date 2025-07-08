// src/components/customer/ProductSection.tsx

import React from 'react';
import './ProductSection.css';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';
// [수정] Clock 아이콘을 lucide-react에서 가져옵니다.
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface ProductSectionProps {
 title: React.ReactNode;
 children: React.ReactNode;
 countdownText?: string | null;
}

const ProductSection: React.FC<ProductSectionProps> = ({ title, children, countdownText }) => {
 const { scrollRef, scrollByPage, showLeftArrow, showRightArrow } = useHorizontalScroll();

 const cardElements = React.Children.toArray(children);
 if (cardElements.length === 0) return null;

 return (
   <section className="page-section product-section">
     <div className="section-header">
       <h2 className="section-title">{title}</h2>
       {countdownText && (
         <div className="section-countdown">
           {/* [수정] 아이콘 크기를 14로 줄입니다. */}
           <Clock size={14} className="countdown-icon" />
           <span>마감까지</span>
           <span className="countdown-time">{countdownText}</span>
         </div>
       )}
     </div>
     <div className="horizontal-scroll-container">
       {showLeftArrow && (
         <button className="scroll-arrow prev" onClick={() => scrollByPage('left')} aria-label="이전 상품 보기">
           <ChevronLeft />
         </button>
       )}
       <div className="product-grid horizontal-scroll" ref={scrollRef}>
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