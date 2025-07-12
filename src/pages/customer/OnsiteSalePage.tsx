// src/pages/admin/ProductCategoryBatchPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { getProducts, updateProductCoreInfo } from '@/firebase/productService';
import { getCategories } from '@/firebase/generalService';
import type { Product, Category } from '@/types';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import './ProductCategoryBatchPage.css';

const ProductCategoryBatchPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 각 상품별로 변경된 카테고리 정보를 임시 저장하는 state
  const [changes, setChanges] = useState<Record<string, { category?: string; subCategory?: string }>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedProducts, fetchedCategories] = await Promise.all([
          getProducts(false), // 보관되지 않은 모든 상품 가져오기
          getCategories(),
        ]);
        setProducts(fetchedProducts);
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("데이터 로딩 오류:", err);
        setError("상품 또는 카테고리 정보를 불러오는 데 실패했습니다.");
        toast.error("데이터 로딩에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 대분류 선택 시 호출되는 핸들러
  const handleMainCategoryChange = (productId: string, newMainCategoryName: string) => {
    setChanges(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        category: newMainCategoryName,
        subCategory: '', // 대분류가 바뀌면 하위 분류는 초기화
      },
    }));
  };
  
  // 하위 분류 선택 시 호출되는 핸들러
  const handleSubCategoryChange = (productId: string, newSubCategory: string) => {
    setChanges(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        subCategory: newSubCategory,
      },
    }));
  };

  // 저장 버튼 클릭 시 호출되는 핸들러
  const handleSaveChanges = async (productId: string) => {
    const productChanges = changes[productId];
    if (!productChanges) {
      toast.info('변경 사항이 없습니다.');
      return;
    }

    // updateProductCoreInfo는 productData, newImageFiles, existingImageUrls, originalAllImageUrls 를 인자로 받음
    // 여기서는 카테고리만 업데이트하므로 나머지 인자는 빈 배열 또는 기존 값으로 전달
    const originalProduct = products.find(p => p.id === productId);
    if (!originalProduct) return;

    const promise = updateProductCoreInfo(
      productId, 
      productChanges, 
      [], // newImageFiles
      originalProduct.imageUrls, // existingImageUrls
      originalProduct.imageUrls  // originalAllImageUrls
    );
    
    toast.promise(promise, {
      loading: '카테고리 정보 저장 중...',
      success: '성공적으로 저장되었습니다!',
      error: '저장에 실패했습니다.',
    });
    
    // 저장 후 로컬 상태도 업데이트하여 화면에 즉시 반영
    promise.then(() => {
      setProducts(prevProducts =>
        prevProducts.map(p =>
          p.id === productId ? { ...p, ...productChanges } : p
        )
      );
      // 저장된 변경사항은 초기화
      setChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[productId];
        return newChanges;
      });
    });
  };

  const categoryOptions = useMemo(() => {
    return categories.map(cat => (
      <option key={cat.id} value={cat.name}>{cat.name}</option>
    ));
  }, [categories]);

  const getSubCategoryOptions = (mainCategoryName: string) => {
    const category = categories.find(c => c.name === mainCategoryName);
    if (!category) return null;
    return category.subCategories.map(sub => (
      <option key={sub} value={sub}>{sub}</option>
    ));
  };

  if (loading) return <div className="batch-page-loading">데이터를 불러오는 중입니다...</div>;
  if (error) return <div className="batch-page-error">{error}</div>;

  return (
    <div className="product-category-batch-page">
      <h2>상품 카테고리 일괄 관리</h2>
      <p>상품 목록에서 카테고리를 변경하고 각 행의 저장 버튼을 누르세요.</p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>상품명</th>
              <th>대분류</th>
              <th>하위 분류</th>
              <th>저장</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => {
              const currentChange = changes[product.id] || {};
              const displayCategory = currentChange.category ?? product.category;
              const displaySubCategory = currentChange.subCategory ?? product.subCategory;

              return (
                <tr key={product.id}>
                  <td>{product.groupName}</td>
                  <td>
                    <select
                      value={displayCategory || ''}
                      onChange={(e) => handleMainCategoryChange(product.id, e.target.value)}
                    >
                      <option value="">-- 대분류 선택 --</option>
                      {categoryOptions}
                    </select>
                  </td>
                  <td>
                    <select
                      value={displaySubCategory || ''}
                      onChange={(e) => handleSubCategoryChange(product.id, e.target.value)}
                      disabled={!displayCategory}
                    >
                      <option value="">-- 하위 분류 선택 --</option>
                      {displayCategory && getSubCategoryOptions(displayCategory)}
                    </select>
                  </td>
                  <td>
                    <button 
                      onClick={() => handleSaveChanges(product.id)}
                      disabled={!changes[product.id]}
                      className="save-btn"
                    >
                      <Save size={16} />
                      <span>저장</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductCategoryBatchPage;