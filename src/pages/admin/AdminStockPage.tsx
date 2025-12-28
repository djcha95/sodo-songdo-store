// src/pages/admin/AdminStockPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { 
  getInventoryItems, 
  updateInventoryItem, 
  ensureInventoryItem 
} from '@/firebase/inventory';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import type { InventoryItem } from '@/firebase/inventory';
import SodomallLoader from '@/components/common/SodomallLoader';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import toast from 'react-hot-toast';
import { RefreshCw, Search, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, Edit3, X } from 'lucide-react';
import dayjs from 'dayjs';
import { safeToDate } from '@/utils/date'; // ✅ 이제 date.ts에 추가했으므로 오류가 사라질 것입니다.
import './AdminStockPage.css';

// 정렬 설정 타입
type SortKey = 'productName' | 'quantity' | 'costPrice' | 'salePrice' | 'expiryDate' | 'updatedAt';
interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

const AdminStockPage: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]); // EditableStockItem 대신 InventoryItem 사용 (자동저장이므로 dirty 체크 불필요)
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [draft, setDraft] = useState<Partial<InventoryItem>>({});
  
  // 필터 및 정렬 상태
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'productName', direction: 'asc' });

  // 로딩 상태
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. 데이터 불러오기
  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getInventoryItems();
      setItems(data);
    } catch (error: any) {
      toast.error('재고 목록을 불러오는데 실패했습니다.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

// 2. 동기화 기능 (유통기한 포함 - 로직 개선됨)
  const handleSync = async () => {
    if (!window.confirm('기존 상품 중 "현장판매"로 설정된 상품을 재고 목록으로 불러오시겠습니까?')) return;
    try {
      setIsSyncing(true);
      const productsSnapshot = await getDocs(collection(db, 'products'));
      let syncedCount = 0;
      
      const promises = productsSnapshot.docs.map(async (doc) => {
        const productData = doc.data();
        const salesHistory = productData.salesHistory || [];
        const onsiteRound = salesHistory.find((round: any) => round.isManuallyOnsite === true);

        if (onsiteRound) {
           // 1. 가격 정보 (첫 번째 옵션 기준)
           const firstVariant = onsiteRound.variantGroups?.[0]?.items?.[0];
           const price = firstVariant?.price || 0;
           
           // 2. ✅ [수정] 유통기한 찾기 (모든 옵션을 순회하여 가장 빠른 날짜 선택)
           let expiryDate = '';
           
           // 모든 아이템 수집
           const allItems: any[] = [];
           onsiteRound.variantGroups?.forEach((vg: any) => {
             if (Array.isArray(vg.items)) allItems.push(...vg.items);
           });

           // 유효한 유통기한이 있는 아이템들 필터링
           const itemsWithDate = allItems.filter((i: any) => i.expirationDate);
           
           if (itemsWithDate.length > 0) {
              // 날짜순 정렬 (오름차순: 빠른 날짜가 앞으로)
              itemsWithDate.sort((a: any, b: any) => {
                const dateA = safeToDate(a.expirationDate)?.getTime() || Infinity;
                const dateB = safeToDate(b.expirationDate)?.getTime() || Infinity;
                return dateA - dateB;
              });
              
              // 가장 빠른 날짜 선택
              const bestDate = safeToDate(itemsWithDate[0].expirationDate);
              if (bestDate) {
                expiryDate = dayjs(bestDate).format('YYYY-MM-DD');
              }
           }
           
           // 3. 재고 아이템 생성 (없으면 생성)
           await ensureInventoryItem(doc.id, productData.groupName, price);
           
           // 4. 생성된 재고 문서 찾아서 유통기한 업데이트
           const q = query(collection(db, 'inventory'), where('productId', '==', doc.id));
           const invSnapshot = await getDocs(q);

           if (!invSnapshot.empty) {
             const inventoryId = invSnapshot.docs[0].id;
             // 유통기한이 찾아졌다면 업데이트
             if (expiryDate) {
                await updateInventoryItem(inventoryId, { expiryDate });
             }
           }

           syncedCount++;
        }
      });
      await Promise.all(promises);
      toast.success(`동기화 완료! ${syncedCount}개의 상품을 확인했습니다.`);
      await fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error(`동기화 실패: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleAutoSave = async (id: string, field: keyof InventoryItem, value: string | number | boolean) => {
    const currentItem = items.find(i => i.id === id);
    // 변경된 값이 없으면 저장하지 않음
    if (currentItem && currentItem[field] === value) return;

    try {
      setIsSaving(true);
      let valueToSave = value;

      // 납품가(costPrice) 자동 계산 로직
      if (field === 'costPrice' && currentItem) {
        const numValue = Number(value);
        if (!isNaN(numValue) && numValue > 0) {
           // 비과세 체크 여부 확인
           if (currentItem.isTaxFree) {
             valueToSave = numValue; // 비과세면 그대로
           } else {
             valueToSave = Math.round(numValue * 1.1); // 과세면 1.1배
             toast(`부가세 포함 ${valueToSave.toLocaleString()}원`, { icon: '💰', duration: 2000 });
           }
           // 화면 즉시 반영
           setItems(prev => prev.map(item => item.id === id ? { ...item, costPrice: valueToSave as number } : item));
        }
      }

      // 비과세(isTaxFree) 체크박스 변경 시 즉시 저장
      if (field === 'isTaxFree') {
        setItems(prev => prev.map(item => item.id === id ? { ...item, isTaxFree: value as boolean } : item));
      }

      // Firestore 업데이트
      await updateInventoryItem(id, { [field]: valueToSave });
      
      // 상태 업데이트 (costPrice/isTaxFree가 아닌 나머지 필드들)
      if (field !== 'costPrice' && field !== 'isTaxFree') {
         setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: valueToSave } : item));
      }

    } catch (error) {
      console.error(error);
      toast.error('저장 실패');
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setDraft({
      quantity: item.quantity,
      isTaxFree: item.isTaxFree || false,
      costPrice: item.costPrice,
      salePrice: item.salePrice,
      expiryDate: item.expiryDate,
      memo: item.memo,
    });
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setDraft({});
  };

  const saveDraft = async () => {
    if (!editingItem) return;
    const id = editingItem.id;
    try {
      // ✅ 저장 순서 중요: isTaxFree → costPrice(부가세 자동계산 로직 반영) → 나머지
      if (typeof draft.isTaxFree === 'boolean' && (editingItem.isTaxFree || false) !== draft.isTaxFree) {
        await handleAutoSave(id, 'isTaxFree', draft.isTaxFree);
      }
      if (typeof draft.quantity === 'number' && editingItem.quantity !== draft.quantity) {
        await handleAutoSave(id, 'quantity', draft.quantity);
      }
      if (typeof draft.costPrice === 'number' && editingItem.costPrice !== draft.costPrice) {
        await handleAutoSave(id, 'costPrice', draft.costPrice);
      }
      if (typeof draft.salePrice === 'number' && editingItem.salePrice !== draft.salePrice) {
        await handleAutoSave(id, 'salePrice', draft.salePrice);
      }
      if (typeof draft.expiryDate === 'string' && editingItem.expiryDate !== draft.expiryDate) {
        await handleAutoSave(id, 'expiryDate', draft.expiryDate);
      }
      if (typeof draft.memo === 'string' && editingItem.memo !== draft.memo) {
        await handleAutoSave(id, 'memo', draft.memo);
      }

      toast.success('저장 완료');
      closeEditModal();
    } catch (e) {
      // handleAutoSave 내부에서 toast 처리
    }
  };

  // 4. 입력값 변경 (타이핑 시 로컬 상태 반영)
  const handleInputChange = (id: string, field: keyof InventoryItem, value: string) => {
    setItems((prev) => prev.map((item) => {
        if (item.id !== id) return item;

        if (field === 'quantity' || field === 'costPrice' || field === 'salePrice') {
          const num = value === '' ? 0 : Number(value.replace(/[^0-9]/g, ''));
          return { ...item, [field]: isNaN(num) ? 0 : num };
        }

        // 스마트 날짜 변환 (251127 -> 2025-11-27)
        if (field === 'expiryDate') {
          const raw = value.replace(/[^0-9]/g, '');
          let formattedValue = value;
          if (raw.length === 6 && !value.includes('-')) {
             const yy = raw.substring(0, 2);
             const mm = raw.substring(2, 4);
             const dd = raw.substring(4, 6);
             formattedValue = `20${yy}-${mm}-${dd}`;
          }
          return { ...item, expiryDate: formattedValue };
        }

        return { ...item, [field]: value };
      })
    );
  };

  // 5. 정렬 핸들러
  const handleSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // 6. 데이터 가공
  const processedItems = useMemo(() => {
    let filtered = items;

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.productName.toLowerCase().includes(lowerQuery) || 
        item.memo.toLowerCase().includes(lowerQuery)
      );
    }

    return [...filtered].sort((a, b) => {
      const key = sortConfig.key;
      let aVal: any = a[key];
      let bVal: any = b[key];

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, showZeroStock, searchQuery, sortConfig]);

  const renderSortableHeader = (label: string, key: SortKey, align: 'left' | 'center' | 'right' = 'left', width?: string) => (
    <th 
      // ✅ CSS 클래스명 수정 (th-center)
      className={`sortable-header ${align === 'center' ? 'th-center' : ''}`} 
      onClick={() => handleSort(key)} 
      style={{ width, textAlign: align === 'right' ? 'right' : undefined }}
    >
      <div className={`header-content ${align}`}>
        {label}
        {sortConfig.key === key ? (
          sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
        ) : (
          <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
        )}
      </div>
    </th>
  );

  if (loading) return <SodomallLoader />;

  return (
    <div className="admin-page-container admin-stock-page">
      {/* 자동저장 인디케이터 */}
      <div className={`auto-save-indicator ${isSaving ? 'visible' : ''}`}>
        <CheckCircle2 size={16} className="animate-spin" />
        저장 중...
      </div>

      <AdminPageHeader
        title="현장판매 재고 관리"
        subtitle="'현장판매' 상품 재고 입력 (입력 후 포커스 이동 시 자동 저장됨)"
        priority="high"
        actions={
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="common-button button-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "동기화 중..." : "기존 상품 불러오기"}
          </button>
        }
      />

      <section className="admin-stock-controls-bar">
        <div className="search-wrapper">
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            className="search-input" 
            placeholder="제품명 또는 비고 검색..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="admin-stock-options">
          <span style={{ color: '#94a3b8' }}>|</span>
          <span>총 <strong>{processedItems.length}</strong>개 품목</span>
        </div>
      </section>

      {/* ✅ [P0/모바일] 카드뷰 + 모달 편집 */}
      {isMobile && (
        <div className="admin-mobile-only">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {processedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openEditModal(item)}
                className="inventory-mobile-card"
              >
                <div className="inventory-card-top">
                  <div className="inventory-card-title">{item.productName}</div>
                  <div className="inventory-card-cta">
                    <Edit3 size={16} /> 편집
                  </div>
                </div>
                <div className="inventory-card-meta">
                  <span>재고 <strong>{item.quantity}</strong></span>
                  <span>판매가 <strong>{item.salePrice.toLocaleString()}원</strong></span>
                  {item.expiryDate ? <span>유통기한 <strong>{item.expiryDate}</strong></span> : <span>유통기한 -</span>}
                </div>
                {item.memo ? <div className="inventory-card-memo">{item.memo}</div> : null}
              </button>
            ))}
            {processedItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                {searchQuery ? '검색 결과가 없습니다.' : 
                 (showZeroStock ? '데이터가 없습니다. 우측 상단 [기존 상품 불러오기]를 눌러보세요.' : '판매 가능한(재고 > 0) 상품이 없습니다.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ✅ [데스크톱] 기존 테이블 유지 */}
      {!isMobile && (
        <div className="admin-desktop-only admin-stock-table-wrapper">
        <table className="admin-stock-table">
          <thead>
            <tr>
              {/* ✅ th-center 클래스 적용 */}
              <th className="th-center" style={{ width: '50px' }}>#</th>
              {renderSortableHeader("제품명", "productName", "left")}
              {renderSortableHeader("재고", "quantity", "right", "70px")}
              <th className="th-center" style={{ width: '60px' }}>비과세</th>
              {renderSortableHeader("납품가", "costPrice", "right", "100px")}
              {renderSortableHeader("판매가", "salePrice", "right", "100px")}
              {renderSortableHeader("유통기한", "expiryDate", "center", "110px")}
              <th style={{ width: '25%' }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {processedItems.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                  {searchQuery ? '검색 결과가 없습니다.' : 
                   (showZeroStock ? '데이터가 없습니다. 우측 상단 [기존 상품 불러오기]를 눌러보세요.' : '판매 가능한(재고 > 0) 상품이 없습니다.')}
                </td>
              </tr>
            )}
            {processedItems.map((item, idx) => (
              <tr key={item.id} className={item.quantity === 0 ? 'row-zero' : ''}>
                {/* ✅ td-center 클래스 적용 */}
                <td className="td-center" style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                <td>
                  <input 
                    className="cell-input" 
                    value={item.productName} 
                    onChange={(e) => handleInputChange(item.id, 'productName', e.target.value)}
                    onBlur={(e) => handleAutoSave(item.id, 'productName', e.target.value)}
                  />
                </td>
                <td>
                  <input 
                    className={`cell-input cell-input-number ${item.quantity > 0 ? 'stock-positive' : ''}`} 
                    value={item.quantity.toString()} 
                    onChange={(e) => handleInputChange(item.id, 'quantity', e.target.value)}
                    onBlur={(e) => handleAutoSave(item.id, 'quantity', e.target.value)}
                  />
                </td>
                {/* 비과세 체크박스 */}
                <td>
                  <div className="tax-free-cell">
                    <input 
                      type="checkbox" 
                      className="tax-free-checkbox"
                      checked={item.isTaxFree || false} 
                      onChange={(e) => handleAutoSave(item.id, 'isTaxFree', e.target.checked)}
                      title="체크 시 납품가 부가세 자동계산(1.1배) 제외"
                    />
                  </div>
                </td>
                <td>
                  <input 
                    className="cell-input cell-input-number" 
                    value={item.costPrice.toString()} 
                    onChange={(e) => handleInputChange(item.id, 'costPrice', e.target.value)}
                    onBlur={(e) => handleAutoSave(item.id, 'costPrice', e.target.value)}
                    placeholder="납품가"
                  />
                </td>
                <td>
                  <input 
                    className="cell-input cell-input-number" 
                    value={item.salePrice.toString()} 
                    onChange={(e) => handleInputChange(item.id, 'salePrice', e.target.value)}
                    onBlur={(e) => handleAutoSave(item.id, 'salePrice', e.target.value)}
                  />
                </td>
                <td>
                  <input 
                    className="cell-input cell-input-center" 
                    placeholder="YYYY-MM-DD" 
                    value={item.expiryDate} 
                    onChange={(e) => handleInputChange(item.id, 'expiryDate', e.target.value)}
                    onBlur={(e) => handleAutoSave(item.id, 'expiryDate', e.target.value)}
                    title="251127 입력 시 2025-11-27 자동 변환"
                  />
                </td>
                <td>
                  <input 
                    className="cell-input" 
                    value={item.memo} 
                    onChange={(e) => handleInputChange(item.id, 'memo', e.target.value)}
                    onBlur={(e) => handleAutoSave(item.id, 'memo', e.target.value)}
                    placeholder="메모" 
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* ✅ [P0/모바일] 편집 모달 */}
      {editingItem && (
        <div className="inventory-edit-overlay" role="dialog" aria-modal="true">
          <div className="inventory-edit-modal">
            <div className="inventory-edit-header">
              <div>
                <h3 className="inventory-edit-title">{editingItem.productName}</h3>
                <p className="inventory-edit-subtitle">모바일에서는 모달에서만 편집합니다.</p>
              </div>
              <button type="button" className="inventory-edit-close" onClick={closeEditModal}>
                <X size={18} />
              </button>
            </div>

            <div className="inventory-edit-body">
              <label className="inventory-field">
                <span>재고</span>
                <input
                  type="number"
                  value={Number(draft.quantity ?? 0)}
                  onChange={(e) => setDraft(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                />
              </label>

              <label className="inventory-field inventory-field-inline">
                <span>비과세</span>
                <input
                  type="checkbox"
                  checked={Boolean(draft.isTaxFree)}
                  onChange={(e) => setDraft(prev => ({ ...prev, isTaxFree: e.target.checked }))}
                />
              </label>

              <label className="inventory-field">
                <span>납품가</span>
                <input
                  type="number"
                  value={Number(draft.costPrice ?? 0)}
                  onChange={(e) => setDraft(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                />
              </label>

              <label className="inventory-field">
                <span>판매가</span>
                <input
                  type="number"
                  value={Number(draft.salePrice ?? 0)}
                  onChange={(e) => setDraft(prev => ({ ...prev, salePrice: Number(e.target.value) }))}
                />
              </label>

              <label className="inventory-field">
                <span>유통기한</span>
                <input
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={String(draft.expiryDate ?? '')}
                  onChange={(e) => setDraft(prev => ({ ...prev, expiryDate: e.target.value }))}
                />
              </label>

              <label className="inventory-field">
                <span>비고</span>
                <input
                  type="text"
                  value={String(draft.memo ?? '')}
                  onChange={(e) => setDraft(prev => ({ ...prev, memo: e.target.value }))}
                />
              </label>
            </div>

            <div className="inventory-edit-footer">
              <button type="button" className="common-button button-secondary" onClick={closeEditModal}>취소</button>
              <button type="button" className="common-button button-primary" onClick={saveDraft}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStockPage;