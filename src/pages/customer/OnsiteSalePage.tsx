// src/pages/customer/OnsiteSalePage.tsx

import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product, VariantGroup, ProductItem } from '../../types';
import './OnsiteSalePage.css';
import { getOptimizedImageUrl } from '@/utils/imageUtils';

const OnsiteSalePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const location = useLocation();

  const categories = ['all', '과일', '채소', '가공식품', '기타'];

  useEffect(() => {
    const productsQuery = query(
      collection(db, 'products'),
      where('isAvailableForOnsiteSale', '==', true),
      where('status', '==', 'selling'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(productsQuery, (querySnapshot) => {
      const productsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          groupName: data.groupName || data.name || '이름 없음', 
          description: data.description || '',
          imageUrls: data.imageUrls || [],
          storageType: data.storageType || 'ROOM',
          category: data.category || '',
          subCategory: data.subCategory || '',
          variantGroups: (data.variantGroups as VariantGroup[] || []).map((vg: any) => ({
              id: vg.id || '', 
              groupName: vg.groupName || '하위 그룹명 없음',
              totalPhysicalStock: vg.totalPhysicalStock !== undefined ? vg.totalPhysicalStock : null,
              stockUnitType: vg.stockUnitType || '개',
              items: (vg.items as ProductItem[] || []).map((item: any) => ({
                  id: item.id || '', 
                  name: item.name || '품목명 없음',
                  price: item.price || 0,
                  stock: item.stock !== undefined ? item.stock : -1,
                  unitType: item.unitType || '',
                  limitQuantity: item.limitQuantity !== undefined ? item.limitQuantity : null,
                  expirationDate: item.expirationDate || null,
                  stockDeductionAmount: item.stockDeductionAmount !== undefined ? item.stockDeductionAmount : 1,
              }))
          })) || [],
          status: data.status || 'draft',
          isPublished: data.isPublished || false,
          publishAt: data.publishAt || null,
          deadlineDate: data.deadlineDate || null,
          pickupDate: data.pickupDate || null,
          pickupDeadlineDate: data.pickupDeadlineDate || null,
          expirationDate: data.expirationDate || null,
          createdAt: data.createdAt || null,
          specialLabels: data.specialLabels || [],
          encoreCount: data.encoreCount || 0,
          encoreRequesterIds: data.encoreRequesterIds || [],
          isNew: data.isNew || false,
          isAvailableForOnsiteSale: data.isAvailableForOnsiteSale || false,
        } as Product;
      });
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

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      if (!product.isAvailableForOnsiteSale) {
        return false;
      }

      const totalPhysicalStock = (product.variantGroups || []).reduce((sum: number, vg: VariantGroup) => {
        if (vg.totalPhysicalStock === -1 || vg.totalPhysicalStock === null) return Infinity;
        return sum + (vg.totalPhysicalStock || 0);
      }, 0);

      if (product.status === 'ended' || product.status === 'sold_out' || totalPhysicalStock === 0) {
        return false;
      }

      return activeCategory === 'all' ? true : product.category === activeCategory;
    });
  }, [products, activeCategory]);

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
          filteredProducts.map(product => {
            const representativeVariantGroup = product.variantGroups?.[0];
            const representativeItem = representativeVariantGroup?.items?.[0];

            if (!representativeVariantGroup || !representativeItem) {
              return null;
            }

            const currentTotalStock = (product.variantGroups || []).reduce((sum: number, vg: VariantGroup) => {
                if (vg.totalPhysicalStock === -1 || vg.totalPhysicalStock === null) return Infinity;
                return sum + (vg.totalPhysicalStock || 0);
            }, 0);

            const isSoldOut = currentTotalStock === 0;
            const isLowStock = currentTotalStock > 0 && currentTotalStock <= 5;

            return (
              <Link
                to={`/products/${product.id}`}
                state={{ background: location }}
                key={product.id}
                className="product-card-link"
              >
                <article className="product-card">
                  <div className="product-image-wrapper">
                    <img src={getOptimizedImageUrl(product.imageUrls[0], '200x200')} alt={product.groupName} className="product-image" />
                    {isSoldOut && <div className="sold-out-badge">품절</div>}
                    {!isSoldOut && isLowStock && <div className="low-stock-badge">품절 임박</div>}
                  </div>
                  <div className="product-info">
                    <h2 className="product-name">{product.groupName}</h2>
                    <p className="product-price">
                      {representativeItem.price.toLocaleString()}원 / {representativeItem.name}
                    </p>
                  </div>
                </article>
              </Link>
            );
          })
        ) : (
          <p className="no-products-message">현재 판매 중인 상품이 없습니다.</p>
        )}
      </main>
    </div>
  );
};

export default OnsiteSalePage;
