// src/pages/customer/BeautyProductList.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import { getDisplayRound, determineActionState } from '@/utils/productUtils';
import ModernProductThumbCard from '@/components/customer/ModernProductThumbCard';
import SodomallLoader from '@/components/common/SodomallLoader';
import { useAuth } from '@/context/AuthContext';
import type { Product as OriginalProduct, SalesRound } from '@/shared/types';
import './BeautyProductList.css';

interface DisplayProduct extends OriginalProduct {
  displayRound: SalesRound;
  isPreorder?: boolean;
}

// ✅ [수정] 성인 타겟까지 아우르는 럭셔리 안내 문구
const BeautyComingSoon: React.FC = () => (
  <div className="beauty-coming-soon-card">
    <p className="main-text">PREMIUM LINE COMING SOON</p>
    <p className="sub-text">
      연약한 아이의 피부부터 안목 높은 성인의 피부까지.<br/>
      가장 완벽한 휴식을 선사하는 프리미엄 케어를 준비 중입니다.
    </p>
    <p className="detail-text">
      송도픽 단독 런칭 예정
    </p>
  </div>
);

const BeautyProductList: React.FC = () => {
  const navigate = useNavigate();
  const { userDocument } = useAuth();
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const fetchBeautyProducts = async () => {
    try {
      setLoading(true);
      // 충분한 수량을 가져오기 위해 100개 요청
      const { products: fetched } = await getPaginatedProductsWithStock(100, null, null, 'all');
      
      const beauties = fetched.filter(p => {
        const round = getDisplayRound(p);
        // PREMIUM 또는 COSMETICS 타입이면서 draft가 아닌 모든 상품(scheduled 포함) 노출
        return round && 
               (round.eventType === 'PREMIUM' || round.eventType === 'COSMETICS') && 
               round.status !== 'draft';
      });

      const processed: DisplayProduct[] = beauties.map(p => ({
        ...p,
        displayRound: getDisplayRound(p)!, 
        isPreorder: true 
      }));

      setProducts(processed);
    } catch (e) {
      console.error("뷰티 상품 로드 실패", e);
    } finally {
      setLoading(false);
    }
  };

  fetchBeautyProducts();
}, []);

  if (loading) return <SodomallLoader />;

  return (
    <div className="customer-page-container beauty-page">
      {/* 헤더: 뒤로가기 버튼 + 심플 타이틀 */}
      <header className="beauty-page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
        </button>
        <h1 className="header-title">PREMIUM COLLECTION</h1>
      </header>

      {/* ✅ [수정] 뷰티 소개 섹션 멘트 강화 */}
      <section className="beauty-intro">
        <img 
          src="/images/verymom/logo.jpg" 
          alt="VERY MOM" 
          className="intro-logo" 
        />
        
        <h2 className="intro-title">
          세대를 넘나드는<br/>최상의 피부 경험
        </h2>
        <p className="intro-desc">
          아이의 순수함을 지키는 섬세함과 성인 피부의 깊은 고민을 해결하는 기술력.<br/>
          베리맘의 시그니처 라인을 오직 송도픽 예약 혜택으로 제안합니다.
        </p>
      </section>

      {/* 상품 리스트 */}
      <div className="songdo-product-list beauty-list-grid">
      {products.length > 0 ? (
        products.map((p, idx) => (
          <ModernProductThumbCard
            key={p.id}
            product={p}
            index={idx} // 뷰티 페이지에서 순번 표시하고 싶을 때
            variant="grid" // 그리드 형식으로 꽉 차게 표시
          />
        ))
      ) : (
        <BeautyComingSoon />
      )}
    </div>
    </div>
  );
};

export default BeautyProductList;