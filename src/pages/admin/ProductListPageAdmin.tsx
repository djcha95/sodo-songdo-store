// src/pages/admin/ProductListPageAdmin.tsx

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import type { Product } from '../../types';
// ✅ 개선 사항: 경로 및 파일명 대소문자 수정
import brandLogo from '../../../assets/Sodomall_Logo.png'; 
import '../customer/ProductListPage.css';
import './ProductListPageAdmin.css';
import { useNavigate } from 'react-router-dom';

const ProductListPageAdmin = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchAllProducts = useCallback(async () => {
    setLoading(true);
    try {
      const productsQuery = query(
        collection(db, 'products'),
        orderBy('createdAt', 'desc')
      );
      const productSnapshot = await getDocs(productsQuery);
      const productList = productSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Product));
      setProducts(productList);
    } catch (error) {
      console.error("관리자 상품 목록 로딩 오류: ", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchAllProducts();
    }
  }, [user, fetchAllProducts]);

  const handleTogglePublish = async (product: Product) => {
    const productRef = doc(db, 'products', product.id);
    try {
      await updateDoc(productRef, {
        isPublished: !product.isPublished
      });
      await fetchAllProducts();
    } catch (error) {
      console.error("게시 상태 변경 오류: ", error);
      alert("상태 변경 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (window.confirm(`'${productName}' 상품을 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      try {
        await deleteDoc(doc(db, 'products', productId));
        await fetchAllProducts();
      } catch (error) {
        console.error("상품 삭제 오류: ", error);
        alert("상품 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const handleAddNewProduct = () => {
    navigate('/admin/products/add');
  };

  const handleEdit = (productId: string) => {
    navigate(`/admin/products/edit/${productId}`);
  };

  const displayPrice = (pricingOptions: Product['pricingOptions']) => {
    if (!pricingOptions || pricingOptions.length === 0) {
      return '가격 미정';
    }
    if (pricingOptions.length === 1) {
      return `${pricingOptions[0].price.toLocaleString()}원`;
    }
    const prices = pricingOptions.map(opt => opt.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (minPrice === maxPrice) {
      return `${minPrice.toLocaleString()}원`;
    }
    return `${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원`;
  };

  return (
    <>
      <Header brandLogoUrl={brandLogo} currentUserName={user?.displayName ?? '관리자'} />
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h1 className="admin-page-title">상품 관리</h1>
          <button onClick={handleAddNewProduct} className="admin-add-button">
            + 새 상품 추가
          </button>
        </div>

        {loading ? (
          <div className="loading-spinner">상품 목록을 업데이트하는 중...</div>
        ) : (
          <div className="admin-product-table-container">
            <table className="admin-product-table">
              <thead>
                <tr>
                  <th>게시 상태</th>
                  <th>이미지</th>
                  <th>상품명</th>
                  <th>재고</th>
                  <th>가격</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {products.length > 0 ? (
                  products.map(product => (
                    <tr key={product.id}>
                      <td>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={product.isPublished}
                            onChange={() => handleTogglePublish(product)}
                          />
                          <span className="slider"></span>
                        </label>
                      </td>
                      <td>
                        <img
                          src={product.imageUrls?.[0] || 'https://via.placeholder.com/60'}
                          alt={product.name}
                          className="admin-product-thumbnail"
                        />
                      </td>
                      <td className="product-name-cell">{product.name}</td>
                      <td>{product.stock.toLocaleString()}개</td>
                      <td>{displayPrice(product.pricingOptions)}</td>
                      <td>
                        <div className="admin-action-buttons">
                          <button onClick={() => handleEdit(product.id)} className="admin-edit-button">수정</button>
                          <button onClick={() => handleDelete(product.id, product.name)} className="admin-delete-button">삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="no-products-cell">등록된 상품이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default ProductListPageAdmin;