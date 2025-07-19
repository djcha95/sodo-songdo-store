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
 const hasContent = childElements.length > 0 && childElements.some(child => child !== null);

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
       {/* ✅ [수정] 화살표를 CSS 클래스로 제어하여 항상 존재하도록 수정 */}
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