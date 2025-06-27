// src/pages/admin/ProductListPageAdmin.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, Timestamp, limit, startAfter, endBefore, limitToLast, DocumentData, QueryDocumentSnapshot, where, QueryConstraint } from 'firebase/firestore';
import { db, updateProductOnsiteSaleStatus, getProductsCount } from '../../firebase';
import type { Product, Category, StorageType } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useAdminBulkSelection } from '../../context/AdminBulkSelectionContext';
import BulkActionBar from '@/components/admin/BulkActionBar';
import { Edit2, Loader, Plus, Filter, SortAsc, SortDesc, Search, Store, ChevronLeft, ChevronRight } from 'lucide-react';

import './ProductListPageAdmin.css';

// 인라인 편집 가능한 셀 컴포넌트
const EditableCell: React.FC<{
  value: string | number;
  onSave: (newValue: string | number) => Promise<void>;
}> = ({ value, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (String(currentValue) !== String(value)) {
      const valueToSave = typeof value === 'number' ? Number(currentValue) : currentValue;
      await onSave(valueToSave);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={typeof value === 'number' ? 'number' : 'text'}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="inline-edit-input"
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className="editable-cell-value">
      {typeof value === 'number' ? value.toLocaleString() + '개' : value}
      <Edit2 size={12} className="edit-icon-on-hover" />
    </div>
  );
};


const PRODUCTS_PER_PAGE = 20;

const ProductListPageAdmin: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { selectedIds, toggleSelection, selectAll, clearSelection, isSelected } = useAdminBulkSelection();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStorage, setFilterStorage] = useState<StorageType | 'all'>('all');
  const [showOnsiteOnly, setShowOnsiteOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'publishAt' | 'name' | 'expirationDate'>('publishAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [firstVisible, setFirstVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  
  const [isFetching, setIsFetching] = useState(false);


  const fetchPage = useCallback(async (direction: 'next' | 'prev' | 'first' = 'first') => {
    if (isFetching) return;
    setIsFetching(true);
    setLoading(true);
    clearSelection();

    let newPage = currentPage;
    if (direction === 'next') newPage++;
    if (direction === 'prev') newPage--;
    if (direction === 'first') newPage = 1;

    try {
      // [수정] 쿼리 구성 순서 변경
      // 1. 'where' 필터 조건들을 먼저 배열에 담습니다.
      const filterConstraints: QueryConstraint[] = [];
      if (filterCategory !== 'all') {
        filterConstraints.push(where('category', '==', filterCategory));
      }
      if (filterStorage !== 'all') {
        filterConstraints.push(where('storageType', '==', filterStorage));
      }

      // 2. 페이지네이션과 정렬 조건을 별도로 구성합니다.
      const orderAndPageConstraints: QueryConstraint[] = [orderBy(sortBy, sortOrder)];

      if (direction === 'next' && lastVisible) {
        orderAndPageConstraints.push(startAfter(lastVisible));
      } else if (direction === 'prev' && firstVisible) {
        orderAndPageConstraints.push(endBefore(firstVisible), limitToLast(PRODUCTS_PER_PAGE));
      } else {
        orderAndPageConstraints.push(limit(PRODUCTS_PER_PAGE));
      }
      
      // 3. 최종 쿼리를 생성합니다. (where -> orderBy -> limit 순서)
      const finalQuery = query(collection(db, 'products'), ...filterConstraints, ...orderAndPageConstraints);
      
      const documentSnapshots = await getDocs(finalQuery);
      const productList = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      
      if (productList.length > 0) {
        setProducts(productList);
        setFirstVisible(documentSnapshots.docs[0]);
        setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
        setCurrentPage(newPage);
      } else {
        if (direction === 'first') {
          setProducts([]); // 첫 페이지인데 결과가 없으면 목록 비우기
        }
        setCurrentPage(newPage > 1 ? newPage - 1 : 1); // 다음/이전 페이지에 데이터가 없으면 페이지 번호 복구
      }

    } catch (error) {
      console.error("페이지 데이터 로딩 오류:", error);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [isFetching, currentPage, sortBy, sortOrder, filterCategory, filterStorage, lastVisible, firstVisible, clearSelection]);

  
  useEffect(() => {
    const applyFilters = async () => {
      setLoading(true);
      const count = await getProductsCount(filterCategory, filterStorage);
      setTotalProducts(count);
      setLastVisible(null);
      setFirstVisible(null);
      await fetchPage('first');
      setCurrentPage(1);
      setLoading(false);
    };
    applyFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterStorage, sortBy, sortOrder]);
  
  useEffect(() => {
    const fetchCategoriesData = async () => {
        const categoriesQuery = query(collection(db, 'categories'));
        const categorySnapshot = await getDocs(categoriesQuery);
        setCategories(categorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    };
    fetchCategoriesData();
  }, []);

  const finalProductList = useMemo(() => {
      let productsToProcess = [...products];
      if (searchQuery) {
          productsToProcess = productsToProcess.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      if (showOnsiteOnly) {
        productsToProcess = productsToProcess.filter(p => p.isAvailableForOnsiteSale === true);
      }
      return productsToProcess;
  }, [products, searchQuery, showOnsiteOnly]);

  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE) || 1;

  const handleTogglePublish = async (product: Product) => {
    const productRef = doc(db, 'products', product.id);
    try {
      const newStatus = !product.isPublished;
      await updateDoc(productRef, { isPublished: newStatus, status: newStatus ? 'selling' : 'draft' });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isPublished: newStatus, status: newStatus ? 'selling' : 'draft' } : p));
    } catch (error) {
        alert("게시 상태 변경 중 오류가 발생했습니다.");
    }
  };

  const handleToggleOnsiteSale = async (product: Product) => {
    try {
      const newStatus = !product.isAvailableForOnsiteSale;
      await updateProductOnsiteSaleStatus(product.id, newStatus);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isAvailableForOnsiteSale: newStatus } : p));
    } catch (error) {
        console.error("현장 판매 상태 변경 오류:", error);
        alert("현장 판매 상태 변경 중 오류가 발생했습니다.");
    }
  };

  const handleCellSave = async (productId: string, field: keyof Product, newValue: any) => {
    const productRef = doc(db, 'products', productId);
    try {
      await updateDoc(productRef, { [field]: newValue });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field]: newValue } : p));
    } catch (error) {
      alert("업데이트 중 오류가 발생했습니다.");
      console.error(error);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      selectAll(finalProductList.map(p => p.id));
    } else {
      clearSelection();
    }
  };

  const formatDate = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '–';
    const date = timestamp.toDate();
    return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  };
  
  const isAllSelected = finalProductList.length > 0 && selectedIds.length === finalProductList.length;

  return (
    <div className="admin-page-container product-list-admin-container">
      <div className="admin-page-header">
        <h1 className="admin-page-title">상품 관리 대시보드</h1>
        <button onClick={() => navigate('/admin/products/add')} className="admin-add-button"><Plus size={16}/> 새 상품 추가</button>
      </div>

      <div className="product-list-controls">
        <div className="search-bar-wrapper">
            <Search size={18} className="search-icon"/>
            <input 
                type="text" 
                placeholder="상품명으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
            />
        </div>
        <div className="filter-sort-wrapper">
            <div className="control-group">
                <Filter size={16} />
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="control-select">
                    <option value="all">모든 카테고리</option>
                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
                <select value={filterStorage} onChange={(e) => setFilterStorage(e.target.value as StorageType | 'all')} className="control-select">
                    <option value="all">모든 보관타입</option>
                    <option value="ROOM">실온</option>
                    <option value="CHILLED">냉장</option>
                    <option value="FROZEN">냉동</option>
                </select>
            </div>
            <div className="control-group">
                {sortOrder === 'desc' ? <SortDesc size={16} /> : <SortAsc size={16} />}
                <button onClick={() => setSortBy('publishAt')} className={`control-button ${sortBy === 'publishAt' ? 'active' : ''}`}>발행일순</button>
                <button onClick={() => setSortBy('expirationDate')} className={`control-button ${sortBy === 'expirationDate' ? 'active' : ''}`}>유통기한순</button>
                <button onClick={() => setSortBy('name')} className={`control-button ${sortBy === 'name' ? 'active' : ''}`}>이름순</button>
                <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')} className="control-button">
                    {sortOrder === 'desc' ? '내림차순' : '오름차순'}
                </button>
            </div>
            <div className="control-group onsite-sale-toggle">
                <Store size={16} />
                <label htmlFor="onsite-toggle">현장판매만 보기</label>
                <label className="toggle-switch small">
                    <input type="checkbox" id="onsite-toggle" checked={showOnsiteOnly} onChange={(e) => setShowOnsiteOnly(e.target.checked)} />
                    <span className="slider round"></span>
                </label>
            </div>
        </div>
      </div>

      {loading && !finalProductList.length ? ( <div className="loading-spinner"><Loader className="spin" /> 상품 목록을 불러오는 중...</div> ) : (
        <>
        <div className="admin-product-table-container">
          <table className="admin-product-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} /></th>
                <th>발행일</th>
                <th>유통기한</th>
                <th style={{width: '30%'}}>상품명</th>
                <th>재고</th>
                <th>가격</th>
                <th style={{textAlign: 'center'}}>현장판매</th>
                <th style={{textAlign: 'center'}}>게시</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {finalProductList.length > 0 ? (
                finalProductList.map(product => (
                  <tr key={product.id} className={isSelected(product.id) ? 'selected-row' : ''}>
                    <td><input type="checkbox" checked={isSelected(product.id)} onChange={() => toggleSelection(product.id)} /></td>
                    <td>{formatDate(product.publishAt)}</td>
                    <td>{formatDate(product.expirationDate)}</td>
                    <td className="product-name-cell"><EditableCell value={product.name} onSave={(newValue) => handleCellSave(product.id, 'name', newValue)} /></td>
                    <td className="stock-cell"><EditableCell value={product.stock} onSave={(newValue) => handleCellSave(product.id, 'stock', newValue)} /></td>
                    <td>{product.pricingOptions[0]?.price.toLocaleString() || '미정'}원</td>
                    <td style={{textAlign: 'center'}}>
                        <label className="toggle-switch small">
                          <input type="checkbox" checked={!!product.isAvailableForOnsiteSale} onChange={() => handleToggleOnsiteSale(product)} />
                          <span className="slider round"></span>
                        </label>
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={product.isPublished} onChange={() => handleTogglePublish(product)} />
                        <span className="slider round"></span>
                      </label>
                    </td>
                    <td><button onClick={() => navigate(`/admin/products/edit/${product.id}`)} className="admin-edit-button">상세 수정</button></td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={9} className="no-products-cell">표시할 상품이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="pagination-controls">
            <span>총 {totalProducts}개 상품 (현재 페이지: {finalProductList.length}개)</span>
            <div className="page-nav">
                <button onClick={() => fetchPage('prev')} disabled={currentPage <= 1 || isFetching}>
                    <ChevronLeft size={20} /> 이전
                </button>
                <span>{currentPage} / {totalPages} 페이지</span>
                <button onClick={() => fetchPage('next')} disabled={currentPage >= totalPages || isFetching}>
                    다음 <ChevronRight size={20} />
                </button>
            </div>
        </div>
        </>
      )}
      <BulkActionBar onActionComplete={() => fetchPage('first')} />
    </div>
  );
};

export default ProductListPageAdmin;