// src/pages/admin/ProductCategoryBatchPage.tsx

import { useState, useEffect } from 'react';
import { getCategories } from '@/firebase/generalService';
import { getProductsByCategory, moveProductsToCategory } from '@/firebase/productService';
import type { Product, Category } from '@/types';
import toast from 'react-hot-toast';
import { Loader, ArrowLeftRight, Search, ChevronsRight, FileWarning, FolderSymlink } from 'lucide-react';
import './ProductCategoryBatchPage.css';

// '분류 없음'을 나타내는 특수 상수
const UNASSIGNED_CATEGORY_KEY = '__UNASSIGNED__';

const ProductCategoryBatchPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // 로딩 상태 세분화
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  
  // 선택 상태
  const [selectedCategory, setSelectedCategory] = useState<string>(UNASSIGNED_CATEGORY_KEY);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');

  // 카테고리 목록과 분류 없는 상품 목록을 한 번에 로드
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingCategories(true);
      try {
        const [categoriesData, unassignedProductsData] = await Promise.all([
          getCategories(),
          getProductsByCategory(null) // '분류 없음' 상품
        ]);
        setCategories(categoriesData);
        setProducts(unassignedProductsData);
      } catch (err) {
        console.error("초기 데이터 로딩 실패:", err);
        toast.error("데이터를 불러오는 데 실패했습니다.");
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchInitialData();
  }, []);

  // 카테고리 선택 시 해당 상품 목록 로드
  const handleCategorySelect = async (categoryName: string) => {
    if (loadingProducts) return;
    
    setSelectedCategory(categoryName);
    setLoadingProducts(true);
    setSelectedProductIds(new Set()); // 선택 초기화
    setSearchTerm(''); // 검색어 초기화

    try {
      const productsData = await getProductsByCategory(categoryName === UNASSIGNED_CATEGORY_KEY ? null : categoryName);
      setProducts(productsData);
    } catch (err) {
      console.error("상품 목록 로딩 실패:", err);
      toast.error("상품 목록을 불러오는 데 실패했습니다.");
    } finally {
      setLoadingProducts(false);
    }
  };

  // 상품 선택/해제 핸들러
  const handleProductSelect = (productId: string) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제 핸들러
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allProductIds = new Set(filteredProducts.map(p => p.id));
      setSelectedProductIds(allProductIds);
    } else {
      setSelectedProductIds(new Set());
    }
  };

  // 상품 이동 핸들러
  const handleMove = async (targetCategoryName: string) => {
    if (selectedProductIds.size === 0) {
      toast.error('이동할 상품을 먼저 선택해주세요.');
      return;
    }
    // 자기 자신에게 이동하는 것 방지
    if (selectedCategory === targetCategoryName) {
      toast.error('같은 카테고리로는 이동할 수 없습니다.');
      return;
    }

    setIsMoving(true);
    const productIdsToMove = Array.from(selectedProductIds);

    const promise = moveProductsToCategory(productIdsToMove, targetCategoryName === UNASSIGNED_CATEGORY_KEY ? '' : targetCategoryName);

    toast.promise(promise, {
      loading: `${productIdsToMove.length}개 상품을 '${targetCategoryName === UNASSIGNED_CATEGORY_KEY ? "분류 없음" : targetCategoryName}'(으)로 이동 중...`,
      success: () => {
        // 성공 시, 현재 목록에서 이동된 상품들을 제거하여 즉시 UI에 반영
        setProducts(prev => prev.filter(p => !productIdsToMove.includes(p.id)));
        setSelectedProductIds(new Set());
        setIsMoving(false);
        return '상품을 성공적으로 이동했습니다!';
      },
      error: (err) => {
        console.error("상품 이동 실패:", err);
        setIsMoving(false);
        return '상품 이동에 실패했습니다.';
      },
    });
  };

  // 검색어에 따라 필터링된 상품 목록
  const filteredProducts = products.filter(p => p.groupName.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loadingCategories) {
    return <div className="page-loader">페이지 구성 중... <Loader className="spin" /></div>;
  }

  return (
    <div className="product-category-assignment-page">
      <div className="category-panel">
        <div className="panel-header">
          <h3>카테고리 목록</h3>
        </div>
        <ul className="category-list">
          <li
            className={`category-item ${selectedCategory === UNASSIGNED_CATEGORY_KEY ? 'active' : ''}`}
            onClick={() => handleCategorySelect(UNASSIGNED_CATEGORY_KEY)}
          >
            <FolderSymlink size={16} />
            <span>분류 없음</span>
          </li>
          {categories.map(cat => (
            <li
              key={cat.id}
              className={`category-item ${selectedCategory === cat.name ? 'active' : ''}`}
              onClick={() => handleCategorySelect(cat.name)}
            >
              <span>{cat.name}</span>
              <button
                className="move-here-btn"
                title={`선택한 상품을 '${cat.name}'으로 이동`}
                onClick={(e) => { e.stopPropagation(); handleMove(cat.name); }}
                disabled={isMoving || selectedProductIds.size === 0 || selectedCategory === cat.name}
              >
                <ArrowLeftRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="product-panel">
        <div className="panel-header">
          <h3>
            {selectedCategory === UNASSIGNED_CATEGORY_KEY ? '분류 없는 상품' : `'${selectedCategory}' 상품 목록`}
            ({filteredProducts.length}개)
          </h3>
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="상품명으로 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="product-table-container">
          {loadingProducts ? (
            <div className="list-loader"><Loader className="spin" /> 상품 목록을 불러오는 중...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-list-indicator">
              <FileWarning size={40} />
              <p>표시할 상품이 없습니다.</p>
              <span>{searchTerm ? '검색 결과가 없습니다.' : ''}</span>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="checkbox-cell">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedProductIds.size === filteredProducts.length && filteredProducts.length > 0}
                      aria-label="전체 선택"
                    />
                  </th>
                  <th>상품명</th>
                  <th>최근 판매 회차</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(product => (
                  <tr key={product.id} className={selectedProductIds.has(product.id) ? 'selected' : ''}>
                    <td className="checkbox-cell">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.has(product.id)}
                        onChange={() => handleProductSelect(product.id)}
                      />
                    </td>
                    <td>{product.groupName}</td>
                    <td>{product.salesHistory[product.salesHistory.length-1]?.roundName || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selectedCategory !== UNASSIGNED_CATEGORY_KEY && (
          <div className="panel-footer">
            <button 
              className="unassign-btn"
              onClick={() => handleMove('')}
              disabled={isMoving || selectedProductIds.size === 0}
            >
              <ChevronsRight size={16} />
              선택한 상품({selectedProductIds.size})을 '분류 없음'으로 이동
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCategoryBatchPage;