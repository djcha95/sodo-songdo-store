// src/pages/customer/EncorePage.tsx

import { useState, useEffect } from 'react';
import { collection, getDocs, query, doc, runTransaction, arrayUnion, increment, orderBy } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import '../../App.css'; // 전역 스타일
import '../customer/ProductListPage.css'; // 상품 카드 스타일 재활용
import { Loader } from 'lucide-react';
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트

interface Product {
  id: string;
  name: string;
  imageUrl?: string;
  encoreCount?: number; // requestCount 대신 encoreCount 사용
  encoreRequesterIds?: string[]; // requesterIds 대신 encoreRequesterIds 사용
}

const EncorePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchPastProducts = async () => {
      setIsLoading(true);
      try {
        // '요청 수'가 많은 순서대로 상품을 정렬하여 가져옵니다.
        const productsQuery = query(collection(db, 'products'), orderBy('encoreCount', 'desc')); // [수정] encoreCount로 변경
        const productSnapshot = await getDocs(productsQuery);
        const productList = productSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().title, // 'name' 필드가 없을 경우 'title' 사용
          ...doc.data(),
        } as Product));
        setProducts(productList);
      } catch (error) {
        console.error("앵콜 상품 목록 불러오기 오류:", error);
        toast.error("앵콜 상품 목록을 불러오는 데 실패했습니다."); // [수정] toast 알림
      } finally {
        setIsLoading(false);
      }
    };
    fetchPastProducts();
  }, []);

  const handleRequestEncore = async (productId: string) => {
    if (!user) {
      toast.error("로그인 후 요청할 수 있습니다."); // [수정] toast 알림
      return;
    }

    const productRef = doc(db, "products", productId);
    const userId = user.uid;

    try {
      await runTransaction(db, async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          throw new Error("상품을 찾을 수 없습니다.");
        }

        const productData = productDoc.data();
        const encoreRequesterIds = productData?.encoreRequesterIds || []; // [수정] encoreRequesterIds로 변경

        if (encoreRequesterIds.includes(userId)) { // [수정] encoreRequesterIds로 변경
          // 이미 요청한 경우, 에러를 발생시켜 트랜잭션을 중단합니다.
          throw new Error("이미 요청하신 상품입니다.");
        }

        // 아직 요청하지 않았다면, 요청자 ID와 카운트를 업데이트합니다.
        transaction.update(productRef, {
          encoreRequesterIds: arrayUnion(userId), // [수정] encoreRequesterIds로 변경
          encoreCount: increment(1) // [수정] encoreCount로 변경
        });
      });

      toast.success("재공구 요청이 완료되었습니다!"); // [수정] toast 알림
      // 화면에 즉시 반영하기 위해 상태를 업데이트합니다.
      setProducts(prevProducts =>
        prevProducts.map(p =>
          p.id === productId ? { ...p, encoreCount: (p.encoreCount || 0) + 1 } : p // [수정] encoreCount로 변경
        )
      );

    } catch (error: any) {
      if (error.message === "이미 요청하신 상품입니다.") {
        toast("이미 요청하신 상품입니다.", { icon: '👏' }); // [수정] toast 알림 (정보성)
      } else {
        toast.error("앵콜 요청 중 오류가 발생했습니다. 다시 시도해 주세요."); // [수정] toast 알림
      }
      console.error("앵콜 요청 오류: ", error);
    }
  };

  if (isLoading) {
    return (
      <div className="customer-page-container full-height-center">
        <Loader size={48} className="spin-loader" />
        <p>상품 목록을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="customer-page-container">
      <header className="page-header">
        <h1>앵콜 공구 요청</h1>
        <p className="page-description">지난 공구 상품들을 보고, 재공구를 원하는 상품을 요청해주세요!</p>
      </header>
      
      <main>
        <div className="product-grid general-grid">
          {products.length > 0 ? (
            products.map(product => (
              // product-card-wrapper 클래스를 사용하여 스타일 재활용
              <div key={product.id} className="product-card-wrapper past-product">
                <div className="product-image-wrapper">
                   {/* imageUrl이 없을 때 placehold.co를 사용 */}
                   <img src={product.imageUrl || `https://placehold.co/280x280?text=${product.name.substring(0, 10)}`} alt={product.name} className="product-image" />
                   <div className="product-badge past-badge">판매 종료</div>
                </div>
                <div className="product-content">
                   <h2 className="product-title-list">{product.name}</h2>
                   <div className="encore-info">
                       <span>앵콜 요청 수</span>
                       <span className="encore-count">{product.encoreCount || 0}</span> {/* [수정] encoreCount로 변경 */}
                   </div>
                   <button 
                       className="add-to-cart-button" 
                       onClick={() => handleRequestEncore(product.id)}
                   >
                       👍 앵콜 요청하기
                   </button>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-section-text">지난 상품 목록이 없습니다.</p>
          )}
        </div>
      </main>
    </div>
  );
};

export default EncorePage;