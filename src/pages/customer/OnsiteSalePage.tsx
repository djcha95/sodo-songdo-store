// src/pages/customer/OnsiteSalePage.tsx

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types'; // Product 타입을 가져옵니다.
import './OnsiteSalePage.css'; // 새로운 CSS 파일 임포트

const OnsiteSalePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = ['all', '과일', '채소', '가공식품', '기타']; // 예시 카테고리

  useEffect(() => {
    // 'products' 컬렉션에서 'isAvailableForOnsiteSale'이 true인 상품만 쿼리합니다.
    const productsQuery = query(
      collection(db, 'products'),
      where('isAvailableForOnsiteSale', '==', true),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(productsQuery, (querySnapshot) => {
      const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productsData);
      setLoading(false);
    }, (err: DocumentData) => {
      console.error("현장 판매 상품 로딩 오류:", err);
      if (err.code === 'permission-denied') {
        setError("상품 정보를 볼 수 있는 권한이 없습니다.");
      } else {
        setError("데이터를 불러오는 중 오류가 발생했습니다.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredProducts = products.filter(product =>
    activeCategory === 'all' ? true : product.category === activeCategory
  );
  
  if (loading) {
    return <div className="onsite-sale-page-container">상품 목록을 불러오는 중...</div>;
  }

  if (error) {
    return <div className="onsite-sale-page-container error-message">오류: {error}</div>;
  }

  return (
    <div className="onsite-sale-page-container">
      <header className="page-header">
        <h1 className="page-title">현장 판매 상품</h1>
        <p className="page-description">
          온라인으로 재고를 확인하고, 매장에서 바로 구매 가능한 상품들입니다.<br/>
          (실시간 재고와 차이가 있을 수 있으며, 예약은 불가능합니다.)
        </p>
      </header>

      <div className="category-filters">
        {categories.map(category => (
          <button
            key={category}
            className={`filter-button ${activeCategory === category ? 'active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            {category === 'all' ? '전체' : category}
          </button>
        ))}
      </div>

      <main className="product-grid">
        {filteredProducts.length > 0 ? (
          filteredProducts.map(product => (
            <Link to={`/products/${product.id}`} key={product.id} className="product-card-link">
              <article className="product-card">
                <div className="product-image-wrapper">
                  <img src={product.imageUrls[0]} alt={product.name} className="product-image" />
                  {product.stock === 0 && <div className="sold-out-badge">품절</div>}
                  {product.stock > 0 && product.stock <= 5 && <div className="low-stock-badge">품절 임박</div>}
                </div>
                <div className="product-info">
                  <h2 className="product-name">{product.name}</h2>
                  <p className="product-price">
                    {product.pricingOptions[0].price.toLocaleString()}원 / {product.pricingOptions[0].unit}
                  </p>
                </div>
              </article>
            </Link>
          ))
        ) : (
          <p className="no-products-message">현재 판매 중인 상품이 없습니다.</p>
        )}
      </main>
    </div>
  );
};

export default OnsiteSalePage;