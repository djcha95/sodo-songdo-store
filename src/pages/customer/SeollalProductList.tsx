// src/pages/customer/SeollalProductList.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import { getDisplayRound, determineActionState, safeToDate } from '@/utils/productUtils';
import ModernProductThumbCard from '@/components/customer/ModernProductThumbCard';
import SodomallLoader from '@/components/common/SodomallLoader';
import { useAuth } from '@/context/AuthContext';
import type { Product as OriginalProduct, SalesRound } from '@/shared/types';
import './SeollalProductList.css'; // 설날 전용 스타일

interface DisplayProduct extends OriginalProduct {
  displayRound: SalesRound;
}

const SeollalProductList: React.FC = () => {
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

        // ✅ 등록일 기준 오름차순 정렬 (오래된 것부터)
        const sorted = processed.sort((a, b) => {
          const dateA = safeToDate(a.displayRound?.createdAt)?.getTime() || 0;
          const dateB = safeToDate(b.displayRound?.createdAt)?.getTime() || 0;
          return dateA - dateB; // 오름차순: 작은 값(오래된 것)이 앞에
        });

        setProducts(sorted);
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
    <div className="customer-page-container modern-shell seollal-page">
      <div className="modern-inner-shell">
        {/* 설날 프로모션 배너 */}
        <section className="seollal-promo-banner">
          <img 
            src="/images/events/seollal-promo-2026.jpg" 
            alt="2026 설날 선물 공구 프로모션"
            className="seollal-promo-image"
          />
        </section>

        {/* 상품 리스트 */}
        <div className="seollal-product-list">
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
          <div className="seollal-coming-soon-card">
            <p className="main-text">설날 상품 준비 중</p>
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
