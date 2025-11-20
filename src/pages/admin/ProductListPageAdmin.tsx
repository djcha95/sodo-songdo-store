// src/pages/admin/ProductListPageAdmin.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useNavigate } from 'react-router-dom';
import { updateMultipleVariantGroupStocks, deleteSalesRounds, updateSalesRound, getProductsWithStock, updateProductCoreInfo } from '@/firebase';
import type { Product, SalesRound, VariantGroup, StorageType, ProductItem } from '@/shared/types';
import toast from 'react-hot-toast';
import { Plus, Edit, Filter, Search, ChevronDown, Trash2, PackageOpen, ChevronsLeft, ChevronsRight, AlertTriangle, Copy, Sun, Snowflake, Tag, Loader2 } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import './ProductListPageAdmin.css';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);

import { formatKRW, parseKRW } from '@/utils/number';
import { reportError } from '@/utils/logger';

import { Timestamp } from 'firebase/firestore';
import { safeToDate, getDeadlines, getStockInfo } from '@/utils/productUtils';

// =================================================================
// 📌 타입 정의 및 헬퍼 함수
// =================================================================

interface EnrichedVariantGroup extends VariantGroup {
  configuredStock: number;
  remainingStock: number | string;
  status: SimplifiedStatus;
  expirationDate: number | null;
  price: number | null;
  itemId: string | null;
}

interface EnrichedRoundItem {
  uniqueId: string;
  productId: string;
  productName: string;
  productImage: string;
  round: SalesRound;
  createdAt: number;
  // ✅ [수정 1] publishAt(판매시작일) 대신 pickupDate(픽업일) 사용
  pickupDate: number; 
  storageType: StorageType;
  status: SimplifiedStatus;
  enrichedVariantGroups: EnrichedVariantGroup[];
  expirationDate: number | null;
}

type SimplifiedStatus = '판매예정' | '1차 공구중' | '2차 공구중' | '매진' | '판매종료' | '데이터 오류' | '옵션 오류';
// ✅ [수정 1] 정렬 키에 'publishAt'을 'pickupDate'로 변경
type SortableKeys = 'createdAt' | 'productName' | 'status' | 'pickupDate' | 'expirationDate';

const storageTypeOptions: { key: StorageType; name: string; icon: React.ReactNode }[] = [
  { key: 'ROOM', name: '상온', icon: <Sun size={16} /> },
  { key: 'COLD', name: '냉장', icon: <Snowflake size={16} /> },
  { key: 'FROZEN', name: '냉동', icon: <Snowflake size={16} /> },
  { key: 'FRESH', name: '신선', icon: <Tag size={16} /> }
];

const translateStorageType = (storageType: StorageType): string => {
  const typeMap: Record<StorageType, string> = { ROOM: '실온', COLD: '냉장', FROZEN: '냉동', FRESH: '신선' };
  return typeMap[storageType] || storageType;
};

const formatDateShortMMDD = (dateInput: any): string => {
  const date = safeToDate(dateInput);
  if (!date || date.getTime() === 0) return '–';
  return dayjs(date).format('MM/DD');
};

const getSimplifiedStatus = (round: SalesRound, remainingStock: number | string): SimplifiedStatus => {
  const now = dayjs();
  // 판매예정 상태를 위해 publishAt은 그대로 사용
  const publishAt = safeToDate(round.publishAt); 
  const { primaryEnd, secondaryEnd } = getDeadlines(round);

  if (publishAt && now.isBefore(publishAt)) return '판매예정';

  const finalDeadline = secondaryEnd || primaryEnd;
  if (finalDeadline && now.isAfter(finalDeadline)) return '판매종료';

  const isSoldOut = typeof remainingStock === 'number' && remainingStock <= 0;

  if (primaryEnd && now.isBefore(primaryEnd)) {
    return isSoldOut ? '매진' : '1차 공구중';
  }

  if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, '(]')) {
    return isSoldOut ? '매진' : '2차 공구중';
  }

  return isSoldOut ? '매진' : '1차 공구중';
};

const CopyableId: React.FC<{ id: string }> = ({ id }) => {
  if (!id) return null;
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id)
      .then(() => toast.success('ID 복사됨'))
      .catch(() => toast.error('복사 실패'));
  };
  return (
    <span className="copyable-id-inline" onClick={handleCopy} title={`전체 ID: ${id}`}>
      {id.substring(0, 6)}... <Copy size={12} />
    </span>
  );
};

// --- 인라인 편집 컴포넌트들 ---
const InlineEditor: React.FC<{
  initialValue: string | number | null;
  type: 'text' | 'number' | 'price';
  onSave: (newValue: string | number) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
}> = ({ initialValue, type, onSave, isLoading, disabled = false }) => {
  const safeInitialValue = initialValue === null ? (type === 'price' || type === 'number' ? 0 : '') : initialValue;
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<string | number>(safeInitialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(safeInitialValue); }, [safeInitialValue]);
  useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);

  const handleSave = async () => {
    let finalValue: string | number = value;
    if (type === 'price') {
      finalValue = parseKRW(String(value));
      if (isNaN(finalValue as number) || (finalValue as number) < 0) {
        toast.error("올바른 가격 형식이 아닙니다.");
        setValue(safeInitialValue); setIsEditing(false); return;
      }
    } else if (type === 'number') {
      finalValue = parseInt(String(value), 10);
      if (isNaN(finalValue as number) || ((finalValue as number) < 0 && (finalValue as number) !== -1)) {
        toast.error("올바른 숫자 형식이 아닙니다 (0 이상 또는 -1).");
        setValue(safeInitialValue); setIsEditing(false); return;
      }
    }
    if (finalValue !== safeInitialValue && finalValue !== '–') {
      try { await onSave(finalValue); setIsEditing(false); } catch (e) { setValue(safeInitialValue); setIsEditing(false); }
    } else { setIsEditing(false); }
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleSave(); else if (e.key === 'Escape') { setValue(safeInitialValue); setIsEditing(false); } };
  const displayValue = useMemo(() => {
    if (type === 'price') { const numValue = Number(initialValue); if (typeof numValue === 'number') { return isNaN(numValue) || numValue < 0 ? '–' : formatKRW(numValue); } return '–'; }
    if (type === 'number' && initialValue === -1) return '무제한';
    return String(initialValue) || '–';
  }, [initialValue, type]);

  if (isLoading) { return <span className="inline-loader"><Loader2 size={16} className="animate-spin" /></span>; }
  if (disabled) { return <span className="disabled-field">{displayValue}</span>; }
  if (isEditing) {
    return (<input ref={inputRef} type={type === 'price' ? 'text' : 'number'} value={type === 'price' && typeof value === 'number' ? formatKRW(value) : value} onChange={(e) => setValue(type === 'price' ? parseKRW(e.target.value) : e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className={`inline-input inline-input-${type}`} onClick={(e) => e.stopPropagation()} />);
  }
  return (<span className="editable-field" onClick={() => setIsEditing(true)}> {displayValue} </span>);
};

const InlineStorageEditor: React.FC<{
  initialValue: StorageType;
  onSave: (newValue: StorageType) => Promise<void>;
  isLoading?: boolean;
}> = ({ initialValue, onSave, isLoading: isSaving }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isInternalLoading, setIsInternalLoading] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { setValue(initialValue); }, [initialValue]);
  useEffect(() => { if (isEditing && selectRef.current) { selectRef.current.focus(); } }, [isEditing]);

  const handleSave = async () => {
    setIsEditing(false);
    if (value !== initialValue) {
      setIsInternalLoading(true);
      try { await onSave(value); } catch (error) { setValue(initialValue); } finally { setIsInternalLoading(false); }
    }
  };
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setValue(e.target.value as StorageType); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => { if (e.key === 'Enter' || e.key === 'Escape') { handleSave(); } };

  const isLoading = isSaving || isInternalLoading;
  const displayValue = storageTypeOptions.find(opt => opt.key === initialValue)?.name || initialValue;

  if (isLoading) { return <span className="inline-loader"><Loader2 size={16} className="animate-spin" /></span>; }
  if (isEditing) {
    return (
      <div style={{ position: 'relative', display: 'inline-block', minWidth: '80px' }}>
        <select ref={selectRef} value={value} onChange={handleChange} onBlur={handleSave} onKeyDown={handleKeyDown} disabled={isLoading} className="inline-storage-select" onClick={(e) => e.stopPropagation()} >
          {storageTypeOptions.map(opt => (<option key={opt.key} value={opt.key}>{opt.name}</option>))}
        </select>
        {isLoading && (<span className="inline-loader inline-loader-select"> <Loader2 size={16} className="animate-spin" /> </span>)}
      </div>
    );
  }
  return (
    <span className={`editable-field storage-badge storage-${initialValue.toLowerCase()}`} onClick={() => setIsEditing(true)}>
      {displayValue}
    </span>
  );
};

const InlineDateEditor: React.FC<{
  initialValue: number | null;
  onSave: (newValue: number) => Promise<void>;
  isLoading?: boolean;
}> = ({ initialValue, onSave, isLoading }) => {
  const [isEditing, setIsEditing] = useState(false);
  const dateString = useMemo(() => {
    return (initialValue && initialValue > 0) ? dayjs(initialValue).format('YYYY-MM-DD') : '';
  }, [initialValue]);

  const [value, setValue] = useState(dateString);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setValue(dateString); }, [dateString]);
  useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); } }, [isEditing]);
  const handleSave = async () => {
    if (value && value !== dateString) {
      try { const newTimestamp = dayjs(value).valueOf(); await onSave(newTimestamp); setIsEditing(false); } catch (e) { setValue(dateString); setIsEditing(false); }
    } else if (!value && dateString) {
      try { await onSave(0); setIsEditing(false); } catch (e) { setValue(dateString); setIsEditing(false); }
    } else { setIsEditing(false); }
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleSave(); else if (e.key === 'Escape') { setValue(dateString); setIsEditing(false); } };
  const displayValue = initialValue && initialValue > 0 ? dayjs(initialValue).format('MM/DD') : '–';

  if (isLoading) { return <span className="inline-loader"><Loader2 size={16} className="animate-spin" /></span>; }
  if (isEditing) {
    return (<input ref={inputRef} type="date" value={value} onChange={(e) => setValue(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className="inline-input inline-date-input" onClick={(e) => e.stopPropagation()} />);
  }
  return (<span className="editable-field" onClick={() => setIsEditing(true)}> {displayValue} </span>);
};

// --- 페이지네이션 ---
const PaginationControls: React.FC<{ currentPage: number; totalPages: number; onPageChange: (page: number) => void; itemsPerPage: number; onItemsPerPageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; totalItems: number; }> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, totalItems }) => {
  if (totalItems === 0 || totalPages <= 1) return null;
  return (
    <div className="pagination-container">
      <div className="pagination-left">
        <div className="items-per-page-selector"><label htmlFor="itemsPerPage">표시 개수:</label><select id="itemsPerPage" value={itemsPerPage} onChange={onItemsPerPageChange}><option value={20}>20개</option><option value={50}>50개</option><option value={100}>100개</option></select></div>
      </div>
      <div className="pagination-center"><button onClick={() => onPageChange(1)} disabled={currentPage === 1} title="첫 페이지"><ChevronsLeft size={16} /></button><button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>이전</button><span className="page-info">{currentPage} / {totalPages}</span><button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>다음</button><button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} title="마지막 페이지"><ChevronsRight size={16} /></button></div>
      <div className="pagination-right"><span className="total-items-display">총 {totalItems}개 회차</span></div>
    </div>
  );
};


// =================================================================
// 📌 메인 컴포넌트
// =================================================================

const ProductListPageAdmin: React.FC = () => {
  useDocumentTitle('간편 상품 관리');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<Product[]>([]);
  const [updatingItems, setUpdatingItems] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys, direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const productsData = await getProductsWithStock({ pageSize: 1000, lastVisible: null });
      setPageData(productsData.products);
    } catch (error: any) {
      reportError('ProductListPageAdmin.fetchData', error);
      toast.error("데이터 로딩 실패: " + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const processedRounds = useMemo<EnrichedRoundItem[]>(() => {
    let flatList: EnrichedRoundItem[] = [];
    pageData.forEach(p => {
      (Array.isArray(p.salesHistory) ? p.salesHistory : []).forEach(r => {
        const enrichedVariantGroups: EnrichedVariantGroup[] = (Array.isArray(r.variantGroups) ? r.variantGroups : []).map(vg => {
          const stockInfo = getStockInfo(vg);
          const safeItems: ProductItem[] = Array.isArray(vg.items) ? vg.items : [];
          const firstItem = safeItems[0];
          const configuredStock = vg.totalPhysicalStock ?? -1;
          const remainingStock = stockInfo.remainingUnits === Infinity ? '무제한' : stockInfo.remainingUnits;
          const status = getSimplifiedStatus(r, remainingStock);
          const earliestExpiration = safeItems.length > 0
            ? Math.min(...safeItems.map(i => safeToDate(i.expirationDate)?.getTime() || Infinity).filter(t => t !== Infinity))
            : null;

          return {
            ...vg, configuredStock, remainingStock, status,
            expirationDate: earliestExpiration !== Infinity ? earliestExpiration : null,
            price: firstItem?.price ?? null,
            itemId: firstItem?.id ?? null,
          };
        });

        const totalRemaining = enrichedVariantGroups.reduce((acc, vg) => {
          if (vg.remainingStock === '무제한') return Infinity;
          if (acc === Infinity) return Infinity;
          return acc + (vg.remainingStock as number);
        }, 0);
        const overallStatus = getSimplifiedStatus(r, totalRemaining);
        const overallEarliestExpiration = enrichedVariantGroups.length > 0
          ? Math.min(...enrichedVariantGroups.map(vg => vg.expirationDate || Infinity).filter(t => t !== Infinity))
          : null;

        flatList.push({
          uniqueId: `${p.id}-${r.roundId}`,
          productId: p.id,
          productName: p.groupName,
          productImage: p.imageUrls?.[0] || '/placeholder.svg',
          round: r,
          createdAt: safeToDate(r.createdAt)?.getTime() || 0,
          // ✅ [수정 2] 데이터 매핑 부분에서 pickupDate 연결
          pickupDate: (r.pickupDate ? safeToDate(r.pickupDate) : null)?.getTime() || 0,
          storageType: p.storageType,
          status: overallStatus,
          enrichedVariantGroups: enrichedVariantGroups,
          expirationDate: overallEarliestExpiration !== Infinity ? overallEarliestExpiration : null,
        });
      });
    });

    let filteredList = flatList;
    if (searchQuery) {
      filteredList = filteredList.filter(item =>
        item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.round.roundName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filterStatus !== 'all') {
      filteredList = filteredList.filter(item => {
        if (filterStatus === '매진') { return item.status === '매진'; }
        return item.status === filterStatus;
      });
    }

    return filteredList.sort((a, b) => {
      const key = sortConfig.key;
      let aVal: any; let bVal: any;

      if (key === 'createdAt') { aVal = a.createdAt; bVal = b.createdAt; }
      // ✅ [수정 2] 정렬 로직에 pickupDate 사용
      else if (key === 'pickupDate') { aVal = a.pickupDate; bVal = b.pickupDate; }
      else if (key === 'expirationDate') { aVal = a.expirationDate ?? 0; bVal = b.expirationDate ?? 0; }
      else if (key === 'productName') { aVal = a.productName; bVal = b.productName; }
      else if (key === 'status') { aVal = a.status; bVal = b.status; }
      else { return 0; }

      if (typeof aVal === 'number' && typeof bVal === 'number') { return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal; }
      if (typeof aVal === 'string' && typeof bVal === 'string') { return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal); }
      return 0;
    });
  }, [pageData, searchQuery, filterStatus, sortConfig]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterStatus, itemsPerPage]);

  const paginatedRounds = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedRounds.slice(startIndex, startIndex + itemsPerPage);
  }, [processedRounds, currentPage, itemsPerPage]);
  const totalPages = Math.ceil(processedRounds.length / itemsPerPage);

  const handleUpdate = useCallback(async (
    uniqueId: string,
    // ✅ [수정 3] field 타입 변경: 'publishAt' -> 'pickupDate'
    field: 'price' | 'stock' | 'storageType' | 'expirationDate' | 'pickupDate',
    newValue: string | number | StorageType,
    extraData: { productId: string; roundId: string; vgId?: string; itemId?: string }
  ) => {
    const loadingKey = `${uniqueId}-${field}-${extraData.vgId || 'product'}`;
    setUpdatingItems(prev => ({ ...prev, [loadingKey]: true }));
    const { productId, roundId, vgId, itemId } = extraData;

    try {
      let backendPromise: Promise<any>;

      if (field === 'storageType') {
        backendPromise = updateProductCoreInfo(productId, { storageType: newValue as StorageType }, [], [], []);
      }
      // ✅ [수정 3] '픽업일' 수정 로직으로 변경 및 updateSalesRound 호출
      else if (field === 'pickupDate') {
        const newDate = Timestamp.fromDate(new Date(newValue as number));
        backendPromise = updateSalesRound(productId, roundId, { pickupDate: newDate });
      }
      else if (field === 'expirationDate' && vgId && itemId) {
        const product = pageData.find(p => p.id === productId);
        const round = product?.salesHistory.find(r => r.roundId === roundId);
        const vg = round?.variantGroups?.find(v => v.id === vgId);
        const safeItems: ProductItem[] = Array.isArray(vg?.items) ? vg.items : [];
        const item = safeItems.find(i => i.id === itemId);

        if (!product || !round || !vg || !item) throw new Error("유통기한 업데이트 정보 누락");
        const newDate = Timestamp.fromDate(new Date(newValue as number));
        const updatedItem = { ...item, expirationDate: newDate };
        const updatedVg = { ...vg, items: safeItems.map(i => i.id === itemId ? updatedItem : i) };
        const updatedRound = { ...round, variantGroups: (Array.isArray(round.variantGroups) ? round.variantGroups : []).map(v => v.id === vgId ? updatedVg : v) };
        backendPromise = updateSalesRound(productId, roundId, updatedRound);
      }
      else if (field === 'price' && vgId && itemId) {
        const product = pageData.find(p => p.id === productId);
        const round = product?.salesHistory.find(r => r.roundId === roundId);
        const vg = round?.variantGroups?.find(v => v.id === vgId);
        const safeItems: ProductItem[] = Array.isArray(vg?.items) ? vg.items : [];
        const item = safeItems.find(i => i.id === itemId);

        if (!product || !round || !vg || !item) throw new Error("가격 업데이트 정보 누락");
        const updatedItem = { ...item, price: newValue as number };
        const updatedVg = { ...vg, items: safeItems.map(i => i.id === itemId ? updatedItem : i) };
        const updatedRound = { ...round, variantGroups: (Array.isArray(round.variantGroups) ? round.variantGroups : []).map(v => v.id === vgId ? updatedVg : v) };
        backendPromise = updateSalesRound(productId, roundId, updatedRound);
      }
      else if (field === 'stock' && vgId) {
        const newStock = Number(newValue);
        backendPromise = updateMultipleVariantGroupStocks([{ productId, roundId, variantGroupId: vgId, newStock: newStock }]);
      }
      else {
        throw new Error("처리할 수 없는 업데이트 필드");
      }

      await backendPromise;
      await fetchData();

    } catch (error: any) {
      reportError('ProductListPageAdmin.handleUpdate', error, { uniqueId, field, newValue, extraData });
      toast.error(`수정 실패: ${error.message}`);
      fetchData();
    } finally {
      setUpdatingItems(prev => ({ ...prev, [loadingKey]: false }));
    }
  }, [pageData, fetchData]);

  const handleSortChange = (key: SortableKeys) => { setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' })); };

  const toggleRowExpansion = (uniqueId: string) => {
    setExpandedRoundIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uniqueId)) newSet.delete(uniqueId);
      else newSet.add(uniqueId);
      return newSet;
    });
  };

  const handleDelete = useCallback(async (productId: string, roundId: string, productName: string, roundName: string) => {
    toast((t) => (
      <div className="confirmation-toast-content" style={{ maxWidth: '420px', textAlign: 'center' }}>
        <AlertTriangle size={44} style={{ color: 'var(--danger-color)', margin: '0 auto 1rem' }} />
        <h4 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>회차 영구 삭제</h4>
        <p style={{ margin: '0.5rem 0 1rem' }}><strong>'{productName}' ({roundName})</strong><br />정말 삭제하시겠습니까?</p>
        <div className="toast-buttons" style={{ display: 'flex', gap: '10px' }}>
          <button className="common-button button-secondary button-medium" style={{ flex: 1 }} onClick={() => toast.dismiss(t.id)}>취소</button>
          <button className="common-button button-danger button-medium" style={{ flex: 1 }} onClick={async () => {
            toast.dismiss(t.id);
            const promise = deleteSalesRounds([{ productId, roundId }]);
            await toast.promise(promise, { loading: "삭제 중...", success: "삭제 완료", error: "삭제 실패" });
            fetchData();
          }}>삭제</button>
        </div>
      </div>
    ), { id: 'delete-round-confirm', duration: Infinity, position: 'top-center' });
  }, [fetchData]);

  if (loading) return <SodomallLoader />;

  return (
    <div className="admin-page-container product-list-admin-container simplified inline-edit">
      <header className="admin-page-header">
        <h1 className="admin-page-title"><PackageOpen size={28} /> 상품 관리 (간편 편집)</h1>
      </header>

      <div className="product-list-controls-v2">
        <button onClick={() => navigate('/admin/products/add')} className="admin-add-button" title="신규 대표 상품 등록"><Plus size={18} /> 신규 대표 상품 추가</button>
        <div className="search-bar-wrapper">
          <Search size={18} className="search-icon" />
          <input type="text" placeholder="상품명, 회차명 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
        </div>
        <div className="filter-sort-wrapper">
          <div className="control-group">
            <Filter size={16} />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="control-select">
              <option value="all">모든 상태</option>
              <option value="1차 공구중">1차 공구중</option>
              <option value="2차 공구중">2차 공구중</option>
              <option value="매진">매진</option>
              <option value="판매종료">판매종료</option>
              <option value="판매예정">판매예정</option>
              <option value="데이터 오류">오류</option>
            </select>
          </div>
        </div>
      </div>

      <div className="admin-tab-content">
        <div className="admin-product-table-container">
          <table className="admin-product-table simple inline-edit-table">
            <thead>
              <tr>
                <th className="th-align-center" style={{ width: '50px' }}>No.</th>
                <th className="th-align-center" style={{ width: '100px' }}>ID</th>
                <th className="th-align-center sortable-header" onClick={() => handleSortChange('createdAt')} style={{ width: '80px' }}>
                  등록일 {sortConfig.key === 'createdAt' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                <th className="th-align-left sortable-header" onClick={() => handleSortChange('productName')} style={{ minWidth: '150px' }}>
                  상품/회차 {sortConfig.key === 'productName' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                <th className="th-align-center" style={{ width: '90px' }}>보관</th>
                <th className="th-align-center sortable-header" onClick={() => handleSortChange('expirationDate')} style={{ width: '90px' }}>
                  유통기한 {sortConfig.key === 'expirationDate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                {/* ✅ [수정 4] 헤더 텍스트 '픽업일'로 변경 및 정렬 키 'pickupDate' 연결 */}
                <th className="th-align-center sortable-header" onClick={() => handleSortChange('pickupDate')} style={{ width: '80px' }}>
                  픽업일 {sortConfig.key === 'pickupDate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                <th className="th-align-center sortable-header" onClick={() => handleSortChange('status')} style={{ width: '100px' }}>
                  상태 {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                <th className="th-align-right" style={{ width: '110px' }}>가격</th>
                <th className="th-align-right" style={{ width: '130px' }}>예약/재고</th>
                <th className="th-align-center" style={{ width: '100px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRounds.length > 0 ? (
                paginatedRounds.map((item, index) => {
                  const isExpandable = item.enrichedVariantGroups.length > 1;
                  const isExpanded = expandedRoundIds.has(item.uniqueId);
                  const firstVg = item.enrichedVariantGroups[0];

                  return (
                    <React.Fragment key={item.uniqueId}>
                      <tr className="master-row">
                        <td className="td-align-center td-nowrap">
                          <div className="no-and-expander">
                            <span>{(currentPage - 1) * itemsPerPage + index + 1}</span>
                            {isExpandable && (
                              <button className="expand-button" onClick={() => toggleRowExpansion(item.uniqueId)} title={isExpanded ? "접기" : "펼치기"}>
                                <ChevronDown size={18} className={`chevron-icon ${isExpanded ? 'expanded' : ''}`} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="td-align-center td-nowrap"><CopyableId id={item.productId} /></td>
                        <td className="td-align-center td-nowrap">{formatDateShortMMDD(item.createdAt)}</td>
                        <td className="td-align-left">
                          <div className="product-name-cell-simple">
                            <img src={item.productImage} alt={item.productName} className="product-thumbnail-small" />
                            <div className="product-name-text">
                              <span className="product-group-name">{item.productName}</span>
                              <span className="round-name-separator">/</span>
                              <span className="round-name-text-inline">{item.round.roundName.replace(' 판매', '')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="td-align-center td-nowrap">
                          <InlineStorageEditor
                            initialValue={item.storageType}
                            onSave={(newValue) => handleUpdate(item.uniqueId, 'storageType', newValue, { productId: item.productId, roundId: item.round.roundId })}
                            isLoading={updatingItems[`${item.uniqueId}-storageType-product`]}
                          />
                        </td>
                        <td className="td-align-center td-nowrap">
                          {!isExpandable && firstVg ? (
                            <InlineDateEditor
                              initialValue={firstVg.expirationDate}
                              onSave={(newValue) => handleUpdate(item.uniqueId, 'expirationDate', newValue, { productId: item.productId, roundId: item.round.roundId, vgId: firstVg.id, itemId: firstVg.itemId ?? undefined })}
                              isLoading={updatingItems[`${item.uniqueId}-expirationDate-${firstVg.id}`]}
                            />
                          ) : (<span className="disabled-field">{isExpandable ? '옵션별' : '–'}</span>)}
                        </td>
                        {/* ✅ [수정 4] 마스터 행에 픽업일 표시 및 에디터 연결 */}
                        <td className="td-align-center td-nowrap">
                          <InlineDateEditor
                            initialValue={item.pickupDate}
                            onSave={(newValue) => handleUpdate(item.uniqueId, 'pickupDate', newValue, { productId: item.productId, roundId: item.round.roundId })}
                            isLoading={updatingItems[`${item.uniqueId}-pickupDate-product`]}
                          />
                        </td>
                        <td className="td-align-center td-nowrap status-cell">
                          <span className={`status-badge status-${item.status.replace(/\s+/g, '-')}`}>{item.status}</span>
                        </td>
                        <td className="td-align-right td-nowrap">
                          {!isExpandable && firstVg ? (
                            <InlineEditor
                              initialValue={firstVg.price}
                              type="price"
                              onSave={(newValue) => handleUpdate(item.uniqueId, 'price', newValue, { productId: item.productId, roundId: item.round.roundId, vgId: firstVg.id, itemId: firstVg.itemId ?? undefined })}
                              isLoading={updatingItems[`${item.uniqueId}-price-${firstVg.id}`]}
                            />
                          ) : (<span className="disabled-field">{isExpandable ? '옵션별' : '–'}</span>)}
                        </td>
                        <td className="td-align-right stock-info-cell td-nowrap">
                          {!isExpandable && firstVg ? (
                            <>
                              <span className='reserved-count-display'>예약: {firstVg.reservedCount} /</span>
                              <InlineEditor
                                initialValue={firstVg.configuredStock}
                                type="number"
                                onSave={(newValue) => handleUpdate(item.uniqueId, 'stock', newValue, { productId: item.productId, roundId: item.round.roundId, vgId: firstVg.id })}
                                isLoading={updatingItems[`${item.uniqueId}-stock-${firstVg.id}`]}
                                disabled={item.status === '데이터 오류' || item.status === '옵션 오류'}
                              />
                            </>
                          ) : (<span className="disabled-field">{isExpandable ? '옵션별' : '–'}</span>)}
                        </td>
                        <td className="td-align-center td-nowrap">
                          <div className="action-buttons-wrapper inline-actions">
                            <button onClick={() => navigate('/admin/products/add', { state: { productId: item.productId, productGroupName: item.productName, lastRound: item.round } })} className="admin-action-button add-round" title="새 회차 추가"><Plus size={16} /></button>
                            <button onClick={() => navigate(`/admin/products/edit/${item.productId}/${item.round.roundId}`)} className="admin-action-button" title="상세 수정"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(item.productId, item.round.roundId, item.productName, item.round.roundName)} className="admin-action-button danger" title="삭제"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && item.enrichedVariantGroups.map((vg, vgIndex) => (
                        <tr key={vg.id} className="detail-row">
                          <td className="td-align-center td-nowrap"></td>
                          <td className="td-align-center td-nowrap"><span className="sub-row-no">{(currentPage - 1) * itemsPerPage + index + 1}-{vgIndex + 1}</span></td>
                          <td className="td-align-center td-nowrap"></td>
                          <td className="td-align-left td-nowrap" colSpan={1}><span className="sub-row-name">└ {vg.groupName}</span></td>
                          <td className="td-align-center td-nowrap"><span className="disabled-field">{translateStorageType(item.storageType)}</span></td>
                          <td className="td-align-center td-nowrap">
                            <InlineDateEditor
                              initialValue={vg.expirationDate}
                              onSave={(newValue) => handleUpdate(item.uniqueId, 'expirationDate', newValue, { productId: item.productId, roundId: item.round.roundId, vgId: vg.id, itemId: vg.itemId ?? undefined })}
                              isLoading={updatingItems[`${item.uniqueId}-expirationDate-${vg.id}`]}
                            />
                          </td>
                          {/* ✅ [수정 4] 상세 행에 픽업일 표시 및 에디터 연결 (줄 맞춤) */}
                          <td className="td-align-center td-nowrap">
                            <InlineDateEditor
                                initialValue={item.pickupDate}
                                onSave={(newValue) => handleUpdate(item.uniqueId, 'pickupDate', newValue, { productId: item.productId, roundId: item.round.roundId })}
                                isLoading={updatingItems[`${item.uniqueId}-pickupDate-product`]}
                            />
                          </td>
                          <td className="td-align-center td-nowrap status-cell"><span className={`status-badge status-${vg.status.replace(/\s+/g, '-')}`}>{vg.status}</span></td>
                          <td className="td-align-right td-nowrap">
                            <InlineEditor
                              initialValue={vg.price}
                              type="price"
                              onSave={(newValue) => handleUpdate(item.uniqueId, 'price', newValue, { productId: item.productId, roundId: item.round.roundId, vgId: vg.id, itemId: vg.itemId ?? undefined })}
                              isLoading={updatingItems[`${item.uniqueId}-price-${vg.id}`]}
                            />
                          </td>
                          <td className="td-align-right stock-info-cell td-nowrap">
                            <span className='reserved-count-display'>예약: {vg.reservedCount} /</span>
                            <InlineEditor
                              initialValue={vg.configuredStock}
                              type="number"
                              onSave={(newValue) => handleUpdate(item.uniqueId, 'stock', newValue, { productId: item.productId, roundId: item.round.roundId, vgId: vg.id })}
                              isLoading={updatingItems[`${item.uniqueId}-stock-${vg.id}`]}
                              disabled={vg.status === '데이터 오류' || vg.status === '옵션 오류'}
                            />
                          </td>
                          <td className="td-align-center td-nowrap"></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-color-light)' }}>표시할 상품 회차가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} itemsPerPage={itemsPerPage} onItemsPerPageChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} totalItems={processedRounds.length} />
      </div>
    </div>
  );
};

export default ProductListPageAdmin;