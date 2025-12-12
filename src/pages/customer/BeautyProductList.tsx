// src/pages/customer/BeautyProductList.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import { getDisplayRound, determineActionState } from '@/utils/productUtils';
import ModernProductCard from '@/components/customer/ModernProductCard';
import SodomallLoader from '@/components/common/SodomallLoader';
import { useAuth } from '@/context/AuthContext';
import type { Product as OriginalProduct, SalesRound } from '@/shared/types';
import './BeautyProductList.css';

interface DisplayProduct extends OriginalProduct {
  displayRound: SalesRound;
  isPreorder?: boolean;
}

// ✅ 럭셔리한 안내 문구로 변경
const BeautyComingSoon: React.FC = () => (
  <div className="beauty-coming-soon-card">
    <p className="main-text">PRE-ORDER COMING SOON</p>
    <p className="sub-text">
      가장 소중한 우리 아이를 위한<br/>
      프리미엄 베이비 케어 '베리맘'을 준비 중입니다.
    </p>
    <p className="detail-text">
      12/15(월) 오후 1시 오픈 예정
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
        const { products: fetched } = await getPaginatedProductsWithStock(100, null, null, 'all');
        
        const beauties = fetched.filter(p => {
            const round = getDisplayRound(p);
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

      {/* ✅ [수정] 뷰티 소개 섹션: 로고 이미지 적용 */}
      <section className="beauty-intro">
        {/* 기존 intro-badge 텍스트 대신 로고 이미지 사용 */}
        <img 
          src="/images/verymom/logo.jpg" 
          alt="VERY MOM" 
          className="intro-logo" 
        />
        
        <h2 className="intro-title">
          단 1%의 아기를 위한<br/>프리미엄 스킨케어
        </h2>
        <p className="intro-desc">
          자연에서 얻은 귀한 성분으로 완성된<br/>
          베리맘의 시그니처 라인을 송도픽 단독 혜택으로 만나보세요.
        </p>
      </section>

      {/* 상품 리스트 */}
      <div className="songdo-product-list beauty-list-grid">
        {products.length > 0 ? (
          products.map((p) => (
            <ModernProductCard
              key={p.id}
              product={p}
              actionState={determineActionState(p.displayRound as any, userDocument as any)}
              phase="primary"
              isPreorder={true}
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