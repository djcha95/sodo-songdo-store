// src/pages/customer/SeollalProductList.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import { getDisplayRound, determineActionState } from '@/utils/productUtils';
import ModernProductThumbCard from '@/components/customer/ModernProductThumbCard';
import SodomallLoader from '@/components/common/SodomallLoader';
import { useAuth } from '@/context/AuthContext';
import type { Product as OriginalProduct, SalesRound } from '@/shared/types';
import './BeautyProductList.css'; // 같은 스타일 재사용

interface DisplayProduct extends OriginalProduct {
  displayRound: SalesRound;
}

const SeollalProductList: React.FC = () => {
  const navigate = useNavigate();
  const { userDocument } = useAuth();
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSeollalProducts = async () => {
      try {
        setLoading(true);
        // 충분한 수량을 가져오기 위해 100개 요청
        const { products: fetched } = await getPaginatedProductsWithStock(100, null, null, 'all');
        
        const seollalProducts = fetched.filter(p => {
          const round = getDisplayRound(p);
          // SEOLLAL 타입이면서 draft가 아닌 모든 상품(scheduled 포함) 노출
          // actionState가 ENDED가 아닌 상품만 표시
          if (!round || round.status === 'draft') return false;
          if (round.eventType !== 'SEOLLAL') return false;
          
          const actionState = determineActionState(round, userDocument as any);
          return !['ENDED', 'AWAITING_STOCK'].includes(actionState);
        });

        const processed: DisplayProduct[] = seollalProducts.map(p => ({
          ...p,
          displayRound: getDisplayRound(p)!, 
        }));

        setProducts(processed);
      } catch (e) {
        console.error("설날 상품 로드 실패", e);
      } finally {
        setLoading(false);
      }
    };

    fetchSeollalProducts();
  }, [userDocument]);

  if (loading) return <SodomallLoader />;

  return (
    <div className="customer-page-container modern-shell beauty-page">
      <div className="modern-inner-shell">
        {/* 페이지 헤더(내부) */}
        <header className="beauty-page-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={22} />
          </button>
          <h1 className="header-title">🧧 설날 선물 공구</h1>
        </header>

        {/* 인트로 섹션 */}
        <section className="beauty-intro">
          <h2 className="intro-title">
            2026 설날,<br/>마음을 전하는 특별한 선물
          </h2>
          <p className="intro-desc">
            한 해의 시작을 더욱 의미 있게 만들어 줄<br/>
            정성 가득한 설 선물 세트를 만나보세요.
          </p>
        </section>

        {/* 상품 리스트 */}
        <div className="songdo-product-list beauty-list-grid">
        {products.length > 0 ? (
          products.map((p, idx) => (
            <ModernProductThumbCard
              key={p.id}
              product={p}
              index={idx}
              variant="grid"
            />
          ))
        ) : (
          <div className="beauty-coming-soon-card">
            <p className="main-text">🧧 설날 상품 준비 중</p>
            <p className="sub-text">
              설날 특별 상품을 준비하고 있습니다.<br/>
              곧 만나보실 수 있습니다.
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default SeollalProductList;
