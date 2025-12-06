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
} from '@/shared/types';
// import '@/styles/ModernProduct.css';
import './BeautyProductList.css'; // 새로 만든 CSS 파일 경로ModernProduct.css

// ✅ 로컬에서 쓸 확장 타입 정의: OriginalProduct에 displayRound와 isPreorder를 추가합니다.
interface DisplayProduct extends OriginalProduct {
  displayRound: SalesRound;
  isPreorder?: boolean;
}

// ✅ 베이비 케어 Coming Soon 안내 컴포넌트 추가 (텍스트 수정)
const BeautyComingSoon: React.FC = () => (
  <div 
    className="beauty-coming-soon-card" // ✅ CSS 클래스 유지
  >
    <p className="main-text">
      PRE-ORDER COMING SOON!
    </p>
    <p className="sub-text">
      단 1% 나의 아기를 위한 프리미엄 베이비 케어 브랜드, 베리맘 사전예약 상품을 꼼꼼하게 준비 중입니다 🙏
    </p>
    <p className="detail-text">
      조금만 기다려주시면, 가장 좋은 혜택으로 만나보실 수 있습니다!
    </p>
  </div>
);

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
        // 전체 상품 중 베리맘/베이비 케어만 필터링
        const { products: fetched } = await getPaginatedProductsWithStock(100, null, null, 'all');
        
        // Product[] 타입의 beauties
        const beauties = fetched.filter(p => {
            // 카테고리 또는 태그, 이름으로 필터링 로직 수정
            const isBabyCareCategory = (p as any).category === 'baby_care'; // 'baby_care' 카테고리 가정
            // 태그나 이름으로 2차 필터 (끌리글램 제거)
            const hasTag = p.tags?.some(t => ['베리맘','육아','baby','베이비케어', '아기피부'].includes(t));
            const hasName = p.groupName.includes('베리맘'); // 끌리글램 제거
            
            // displayRound가 유효해야 함
            const round = getDisplayRound(p);
            // 필터 로직을 '베이비 케어 관련이거나' AND '유효한 라운드'로 수정
            return (isBabyCareCategory || hasTag || hasName) && round && round.status !== 'draft';
        });

        // Step 3. 데이터 가공 부분 수정: DisplayProduct[]로 명시
        const processed: DisplayProduct[] = beauties.map(p => ({
            ...p,
            displayRound: getDisplayRound(p)!, // OriginalProduct에 없는 속성 추가
            isPreorder: true // 뷰티 페이지 상품은 모두 사전예약 뱃지 노출
        }));

        setProducts(processed);
      } catch (e) {
        console.error("베이비 케어 상품 로드 실패", e);
      } finally {
        setLoading(false);
      }
    };

    fetchBeautyProducts();
  }, []);

  if (loading) return <SodomallLoader />;

  // 💡 상품이 있을 때도 안내문은 유지하고, 상품이 없을 때만 별도 컴포넌트로 대체하도록 로직 수정
  // 💡 즉, 상품이 없으면 아래 리스트 대신 Coming Soon 안내만 노출됩니다.

  return (
    <div className="customer-page-container beauty-page">
      {/* 헤더 */}
      <header className="beauty-page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
        </button>
        <h1 className="header-title">프리미엄 베이비 케어</h1>
      </header>

      {/* 뷰티 소개 섹션 (인트로) - 텍스트 수정 */}
      <section className="beauty-intro">
        <div className="intro-badge">PRE-ORDER</div>
        <h2 className="intro-title">베리맘 프리미엄 베이비 케어</h2>
        <p className="intro-desc">
          단 1% 나의 아기를 위한 프리미엄 베이비 케어 브랜드.<br/>
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
          /* ✅ 상품이 없을 때 Coming Soon 컴포넌트 노출 */
          <BeautyComingSoon />
        )}
      </div>
    </div>
  );
};

export default BeautyProductList;