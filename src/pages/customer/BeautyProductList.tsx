// src/pages/customer/BeautyProductList.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getPaginatedProductsWithStock } from '@/firebase/productService';
import { getDisplayRound, determineActionState } from '@/utils/productUtils';
import ModernProductCard from '@/components/customer/ModernProductCard';
import SodomallLoader from '@/components/common/SodomallLoader';
import { useAuth } from '@/context/AuthContext';
import type { 
  Product as OriginalProduct, 
  SalesRound 
} from '@/shared/types'; // 기존 Product import를 이렇게 변경하세요!
// import '@/styles/ModernProduct.css';

// ✅ 로컬에서 쓸 확장 타입 정의: OriginalProduct에 displayRound와 isPreorder를 추가합니다.
interface DisplayProduct extends OriginalProduct {
  displayRound: SalesRound;
  isPreorder?: boolean;
}

const BeautyProductList: React.FC = () => {
  const navigate = useNavigate();
  const { userDocument } = useAuth();
  // Step 2. State 타입 변경: Product[] -> DisplayProduct[]
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBeautyProducts = async () => {
      try {
        setLoading(true);
        // 전체 상품 중 뷰티만 필터링 (실제 구현시 백엔드 쿼리 권장)
        const { products: fetched } = await getPaginatedProductsWithStock(100, null, null, 'all');
        
        // Product[] 타입의 beauties
        const beauties = fetched.filter(p => {
            const isBeautyCategory = (p as any).category === 'beauty';
            // 태그나 이름으로 2차 필터
            const hasTag = p.tags?.some(t => ['베리맘', '끌리글램', 'beauty', '뷰티', '화장품'].includes(t));
            const hasName = p.groupName.includes('베리맘') || p.groupName.includes('끌리글램');
            
            // displayRound가 유효해야 함
            const round = getDisplayRound(p);
            return (isBeautyCategory || hasTag || hasName) && round && round.status !== 'draft';
        });

        // Step 3. 데이터 가공 부분 수정: DisplayProduct[]로 명시
        const processed: DisplayProduct[] = beauties.map(p => ({
            ...p,
            displayRound: getDisplayRound(p)!, // OriginalProduct에 없는 속성 추가
            isPreorder: true // 뷰티 페이지 상품은 모두 사전예약 뱃지 노출
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
      {/* 헤더 */}
      <header className="beauty-page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
        </button>
        <h1 className="header-title">뷰티 · 헤어 케어</h1>
      </header>

      {/* 뷰티 소개 섹션 */}
      <section className="beauty-intro">
        <div className="intro-badge">PRE-ORDER</div>
        <h2 className="intro-title">베리맘 · 끌리글램 사전예약</h2>
        <p className="intro-desc">
          겨울철 건조한 피부와 모발을 위한 솔루션.<br/>
          송도픽에서 가장 좋은 혜택으로 만나보세요.
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
              isPreorder={true} // 뱃지 활성화
            />
          ))
        ) : (
          <div className="empty-state">
             <p>준비된 뷰티 상품이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BeautyProductList;