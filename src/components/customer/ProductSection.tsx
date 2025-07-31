// src/components/customer/ProductSection.tsx

import React from 'react';
import './ProductSection.css';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

// ✅ [수정] ProductListPage에서 icon을 보내주고 있으므로, 타입 오류 방지를 위해 props 정의는 유지합니다.
interface ProductSectionProps {
 icon?: React.ReactNode;
 title: React.ReactNode;
 children: React.ReactNode;
 countdownText?: string | null;
}

// ✅ [수정] props에서 icon을 받도록 유지합니다.
const ProductSection: React.FC<ProductSectionProps> = ({ icon, title, children, countdownText }) => {
 const { scrollRef, mouseHandlers, scrollByPage, showLeftArrow, showRightArrow } = useHorizontalScroll();

 const childElements = React.Children.toArray(children);
 const hasContent = childElements.length > 0 && childElements.some(child => child !== null);

 return (
   <section className="page-section product-section">
     <div className="section-header">
       <h2 className="section-title">
         {/* ✅ 요청하신 대로 아이콘 렌더링(표시) 로직은 제거된 상태를 유지합니다. */}
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