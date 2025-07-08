// src/pages/admin/ProductListPageAdmin.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts, getCategories } from '../../firebase';
import type { Product, SalesRound, Category, SalesRoundStatus } from '../../types';
import toast from 'react-hot-toast';
import { Plus, History, Archive, Edit, Filter, Search, ChevronDown, ArrowUpDown, ChevronsUpDown } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import './ProductListPageAdmin.css';

/**
 * 판매 이력 배열에서 화면에 표시할 가장 최신 회차를 찾습니다.
 */
const getLatestRound = (salesHistory: SalesRound[] = []): SalesRound | null => {
  if (!salesHistory || salesHistory.length === 0) return null;
  return [...salesHistory]
    .filter(r => r.status !== 'draft')
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0] || null;
};

/**
 * 상품의 모든 옵션 중에서 가장 이른 유통기한을 찾아 반환합니다. (정렬용)
 */
const getEarliestExpirationDate = (product: Product): number => {
    const latestRound = getLatestRound(product.salesHistory);
    if (!latestRound) return Infinity;
    
    const dates = latestRound.variantGroups
        .flatMap(vg => vg.items.map(i => i.expirationDate?.toMillis()))
        .filter((d): d is number => d !== undefined && d !== null);
        
    if (dates.length === 0) return Infinity;
    return Math.min(...dates);
};

/**
 * Firestore Timestamp를 날짜 또는 날짜/시간 문자열로 변환합니다.
 */
const formatDate = (timestamp?: { toDate: () => Date } | null) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '–';
    const date = timestamp.toDate();
    return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\.$/, '');
};

const ProductListPageAdmin: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState<SalesRoundStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'groupName' | 'expirationDate'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const toggleRowExpansion = (productId: string) => {
    setExpandedProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [fetchedProducts, fetchedCategories] = await Promise.all([
          getProducts(false), 
          getCategories()
        ]);
        setProducts(fetchedProducts);
        setCategories(fetchedCategories);
      } catch (error) {
        toast.error("데이터를 불러오는 중 오류가 발생했습니다.");
        console.error("Firestore 데이터 조회 오류:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const processedProducts = useMemo(() => {
    let tempProducts = [...products];

    if (searchQuery) {
        tempProducts = tempProducts.filter(p => p.groupName.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (filterCategory !== 'all') {
      tempProducts = tempProducts.filter(p => p.category === filterCategory);
    }
    if (filterStatus !== 'all') {
        tempProducts = tempProducts.filter(p => {
            const latestRound = getLatestRound(p.salesHistory);
            return latestRound?.status === filterStatus;
        });
    }
    
    tempProducts.sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        switch (sortBy) {
            case 'groupName':
                aVal = a.groupName.toLowerCase();
                bVal = b.groupName.toLowerCase();
                break;
            case 'expirationDate':
                aVal = getEarliestExpirationDate(a);
                bVal = getEarliestExpirationDate(b);
                break;
            case 'createdAt':
            default:
                aVal = a.createdAt.toMillis();
                bVal = b.createdAt.toMillis();
                break;
        }

        if (sortOrder === 'asc') {
            return aVal < bVal ? -1 : 1;
        } else {
            return aVal > bVal ? -1 : 1;
        }
    });

    return tempProducts;
  }, [products, searchQuery, filterCategory, filterStatus, sortBy, sortOrder]);
  
  const handleAddNewRound = (product: Product) => {
    const latestRound = getLatestRound(product.salesHistory);
    navigate(`/admin/rounds/add`, { state: { productId: product.id, productGroupName: product.groupName, lastRound: latestRound } });
  };
  
  const handleSortChange = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
        setSortBy(newSortBy);
        setSortOrder('desc'); // 새로운 정렬 기준 선택 시 기본 내림차순
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-page-container product-list-admin-container">
      <header className="admin-page-header">
        <h1 className="admin-page-title">대표 상품 관리</h1>
        <button onClick={() => navigate('/admin/products/add')} className="admin-add-button">
          <Plus size={18}/> 신규 대표 상품 추가
        </button>
      </header>
      
      <div className="product-list-controls-v2">
        <div className="search-bar-wrapper">
            <Search size={18} className="search-icon"/>
            <input type="text" placeholder="상품명으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input"/>
        </div>
        <div className="filter-sort-wrapper">
            <div className="control-group">
                <Filter size={16} />
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="control-select">
                  <option value="all">모든 카테고리</option>
                  {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="control-select">
                  <option value="all">모든 상태</option>
                  <option value="selling">판매중</option>
                  <option value="scheduled">예정</option>
                  <option value="ended">종료</option>
                  <option value="sold_out">품절</option>
                </select>
            </div>
        </div>
      </div>
      
      <div className="admin-product-table-container">
        <table className="admin-product-table">
          <thead>
            <tr>
              <th style={{width: '40px'}}></th>
              <th className="sortable-header" onClick={() => handleSortChange('groupName')}>
                대표 상품명 {sortBy === 'groupName' && <ArrowUpDown size={14}/>}
              </th>
              <th>카테고리</th>
              <th>최신 회차 상태</th>
              <th>최신 회차 가격</th>
              <th className="sortable-header" onClick={() => handleSortChange('expirationDate')}>
                유통기한 {sortBy === 'expirationDate' && <ArrowUpDown size={14}/>}
              </th>
              <th className="sortable-header" onClick={() => handleSortChange('createdAt')}>
                최초 등록일 {sortBy === 'createdAt' && <ArrowUpDown size={14}/>}
              </th>
              <th style={{ textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {processedProducts.length > 0 ? processedProducts.map(product => {
              const latestRound = getLatestRound(product.salesHistory);
              const startingPrice = latestRound?.variantGroups[0]?.items[0]?.price.toLocaleString() ?? '정보 없음';
              const isExpanded = expandedProductIds.has(product.id);
              const earliestExpiration = getEarliestExpirationDate(product);
              
              return (
                <React.Fragment key={product.id}>
                  <tr className="master-row">
                    <td>
                      <button className="expand-button" onClick={() => toggleRowExpansion(product.id)}>
                        <ChevronDown size={20} className={`chevron-icon ${isExpanded ? 'expanded' : ''}`} />
                      </button>
                    </td>
                    <td>
                      <div className="product-name-cell-v2">
                        <img src={product.imageUrls[0] || '/placeholder.svg'} alt={product.groupName} className="product-thumbnail" />
                        <div className="product-name-text">
                            <span className="product-group-name">{product.groupName}</span>
                            <span className="product-id-text">ID: {product.id}</span>
                        </div>
                      </div>
                    </td>
                    <td>{product.category || '미지정'}</td>
                    <td><span className={`status-badge status-${latestRound?.status || 'unknown'}`}>{latestRound?.status || '이력 없음'}</span></td>
                    <td><span className="price-text">{startingPrice === '정보 없음' ? '–' : `${startingPrice} 원~`}</span></td>
                    <td>
                        {earliestExpiration === Infinity ? '–' : formatDate({ toDate: () => new Date(earliestExpiration) })}
                    </td>
                    <td>{formatDate(product.createdAt)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="action-buttons">
                        <button onClick={() => handleAddNewRound(product)} className="admin-action-button primary" title="새 회차 추가"><Plus size={14}/> 새 회차</button>
                        <div className="secondary-actions">
                            <button onClick={() => toggleRowExpansion(product.id)} className="admin-action-button-icon" title="판매 이력 보기"><History size={16}/></button>
                            <button onClick={() => navigate(`/admin/products/edit-core/${product.id}`)} className="admin-action-button-icon" title="대표 정보 수정"><Edit size={16}/></button>
                            <button className="admin-action-button-icon danger" title="상품 보관(아카이브)"><Archive size={16}/></button>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="detail-row">
                      <td colSpan={8}>
                        <div className="detail-container">
                            <h4 className="detail-title">판매 이력 (총 {product.salesHistory.length}회)</h4>
                            <div className="history-grid">
                            {product.salesHistory.length > 0 
                             ? [...product.salesHistory].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map(round => (
                                <div key={round.roundId} className="history-card">
                                    <div className="history-card-header">
                                        <h5 className="round-name">{round.roundName}</h5>
                                        <span className={`status-badge status-${round.status}`}>{round.status}</span>
                                    </div>
                                    <div className="history-card-body">
                                        <p><strong>판매 기간:</strong> {formatDate(round.publishAt)} ~ {formatDate(round.deadlineDate)}</p>
                                        <p><strong>옵션 구성:</strong> {round.variantGroups.length}개 그룹, {round.variantGroups.reduce((acc, vg) => acc + vg.items.length, 0)}개 품목</p>
                                    </div>
                                    <div className="history-card-footer">
                                        <button onClick={() => navigate(`/admin/rounds/edit/${product.id}/${round.roundId}`)} className="admin-edit-button">
                                            <Edit size={14}/> 이 회차 수정
                                        </button>
                                    </div>
                                </div>
                            )) : <p className="no-history-text">판매 이력이 없습니다.</p>}
                           </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            }) : (
              <tr><td colSpan={8} className="no-products-cell">표시할 상품이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductListPageAdmin;