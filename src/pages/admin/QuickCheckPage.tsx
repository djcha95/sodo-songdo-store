// src/pages/admin/QuickCheckPage.tsx

import React, { useState, useMemo, useRef, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import {
    searchOrdersUnified,
    updateMultipleOrderStatuses,
    deleteMultipleOrders,
    revertOrderStatus,
    updateOrderItemQuantity,
    splitAndUpdateOrderStatus, // ✨ [신규] 분할 처리 함수 import
} from '../../firebase/orderService';
import type { Order, OrderStatus, AggregatedOrderGroup } from '../../types';
import { Search, Phone, CheckCircle, DollarSign, Loader, Trash2, UserX, RotateCcw, Filter, X as ClearIcon, GitCommit } from 'lucide-react';
import toast from 'react-hot-toast';
import QuickCheckOrderCard from '@/components/admin/QuickCheckOrderCard';
import './QuickCheckPage.css';

// ✨ [신규] 분할 처리 상태를 위한 타입
interface SplitInfo {
  group: AggregatedOrderGroup;
  newQuantity: number;
}

const QuickCheckPage: React.FC = () => {
  useDocumentTitle('빠른 예약확인');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [rawSearchResults, setRawSearchResults] = useState<Order[]>([]);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'pickup' | 'all'>('pickup');
  const [disambiguationNames, setDisambiguationNames] = useState<string[]>([]);
  const [activeNameFilter, setActiveNameFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsGridRef = useRef<HTMLDivElement>(null);

  // ✨ [신규] 주문 분할을 위한 상태 추가
  const [splitInfo, setSplitInfo] = useState<SplitInfo | null>(null);

  const clearSearch = () => {
    setSearchTerm('');
    setRawSearchResults([]);
    setSelectedGroupKeys([]);
    setDisambiguationNames([]);
    setActiveNameFilter(null);
    setSplitInfo(null); // ✨ 상태 초기화
    searchInputRef.current?.focus();
  };
  
  const refreshAndDeselect = async () => {
    setSplitInfo(null); // ✨ 상태 초기화
    if (searchTerm.trim().length >= 2) {
      const results = await searchOrdersUnified(searchTerm.trim());
      setRawSearchResults(results);
      const isNumericSearch = /^\d+$/.test(searchTerm.trim());
      if (isNumericSearch) {
          const uniqueNames = [...new Set(results.map(order => order.customerInfo.name))];
          if (uniqueNames.length > 1) {
              setDisambiguationNames(uniqueNames.sort());
          } else {
              setDisambiguationNames([]);
          }
      } else {
          setDisambiguationNames([]);
      }
    } else {
        setRawSearchResults([]);
        setDisambiguationNames([]);
        setActiveNameFilter(null);
    }
    setSelectedGroupKeys([]);
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim().length < 2) {
      toast.error('검색어를 2자 이상 입력해주세요.');
      return;
    }
    setIsLoading(true);
    setSelectedGroupKeys([]);
    setDisambiguationNames([]);
    setActiveNameFilter(null);
    setSplitInfo(null); // ✨ 상태 초기화
    try {
      const results = await searchOrdersUnified(searchTerm.trim());
      setRawSearchResults(results);
      if (results.length === 0) {
        toast('검색 결과가 없습니다.', { icon: '🔍' });
        searchInputRef.current?.select();
      } else {
        toast.success(`${results.length}건의 주문을 찾았습니다!`);
        const isNumericSearch = /^\d+$/.test(searchTerm.trim());
        if (isNumericSearch) {
            const uniqueNames = [...new Set(results.map(order => order.customerInfo.name))];
            if (uniqueNames.length > 1) {
                setDisambiguationNames(uniqueNames.sort());
            }
        }
      }
    } catch (error) {
      toast.error('주문 검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectGroup = (groupKey: string) => {
    // 분할 처리 모드에서는 카드 선택을 비활성화
    if(splitInfo) {
        toast.error('수량 변경 후에는 먼저 분할 처리를 완료해주세요.');
        return;
    }
    setSelectedGroupKeys(prev =>
      prev.includes(groupKey) ? prev.filter(key => key !== groupKey) : [...prev, groupKey]
    );
  };

  const getSelectedOriginalOrderIds = () => {
    const allSelectedOrders = aggregatedResults
      .filter(group => selectedGroupKeys.includes(group.groupKey))
      .flatMap(group => group.originalOrders);
    return [...new Set(allSelectedOrders.map(o => o.orderId))];
  };
  
  const handleStatusUpdate = async (status: OrderStatus) => {
    const orderIdsToUpdate = getSelectedOriginalOrderIds();
    if (orderIdsToUpdate.length === 0) return;
    
    const promise = updateMultipleOrderStatuses(orderIdsToUpdate, status).then(refreshAndDeselect);
    
    toast.promise(promise, { 
        loading: '처리 중...', 
        success: `'${status}' 상태로 성공적으로 변경되었습니다!`, 
        error: '처리 중 오류가 발생했습니다.' 
    });
  };

  const handleRevertStatus = async (statusToRevert: OrderStatus) => {
    const orderIdsToRevert = getSelectedOriginalOrderIds();
    if (orderIdsToRevert.length === 0) return;
    const promise = revertOrderStatus(orderIdsToRevert, statusToRevert).then(refreshAndDeselect);
    toast.promise(promise, { loading: '처리 중...', success: '성공적으로 되돌렸습니다!', error: '처리 중 오류가 발생했습니다.' });
  };

  const handleDelete = () => {
     const orderIdsToDelete = getSelectedOriginalOrderIds();
     if (orderIdsToDelete.length === 0) return;
     toast(t => (
        <div>
          <p style={{ margin: '0 0 8px' }}>정말 {orderIdsToDelete.length}개의 예약을 삭제하시겠습니까?</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="toast-button-cancel" onClick={() => toast.dismiss(t.id)}>취소</button>
            <button className="toast-button-confirm" onClick={() => {
              toast.dismiss(t.id);
              const promise = deleteMultipleOrders(orderIdsToDelete).then(refreshAndDeselect);
              toast.promise(promise, { loading: '삭제 중...', success: '성공적으로 삭제되었습니다!', error: '삭제 중 오류가 발생했습니다.' });
            }}>삭제</button>
          </div>
        </div>
    ));
  };
  
  // ✨ [수정] 수량 변경 핸들러: 분할 처리 모드 진입/해제
  const handleQuantityChange = (group: AggregatedOrderGroup, newQuantity: number) => {
    if (newQuantity !== group.totalQuantity) {
        // 단일 품목 주문에 대해서만 분할 처리 허용
        if(group.originalOrders.length > 1) {
            toast.error("여러 주문이 묶인 그룹의 수량은 변경할 수 없습니다.");
            return;
        }
        setSplitInfo({ group, newQuantity });
        setSelectedGroupKeys([group.groupKey]); // 분할 처리할 카드만 선택되도록
    } else {
        // 원래 수량으로 돌아오면 분할 모드 해제
        setSplitInfo(null);
        setSelectedGroupKeys([]);
    }
  };

  // ✨ [신규] 분할 처리를 최종 실행하는 함수
  const handleConfirmSplit = (remainingStatus: OrderStatus) => {
    if (!splitInfo) return;

    const { group, newQuantity } = splitInfo;
    const originalOrderId = group.originalOrders[0].orderId;

    const promise = splitAndUpdateOrderStatus(originalOrderId, newQuantity, remainingStatus).then(refreshAndDeselect);
    
    toast.promise(promise, {
        loading: '주문을 분할하여 처리 중...',
        success: '성공적으로 분할 처리되었습니다!',
        error: (err) => err.toString(),
    });
  };

  // ✨ [신규] 분할 처리 확인 토스트를 띄우는 함수
  const showSplitConfirmToast = () => {
    if (!splitInfo) return;
    const remainingQuantity = splitInfo.group.totalQuantity - splitInfo.newQuantity;

    toast((t) => (
        <div className="custom-toast-container">
            <h4>주문 분할 처리</h4>
            <p className="toast-message">
                <b>{splitInfo.newQuantity}개</b>는 '픽업 완료' 처리하고, <br/>
                남은 <b>{remainingQuantity}개</b>는 어떻게 할까요?
            </p>
            <div className="toast-button-group">
                <button className="toast-button toast-button-cancel" onClick={() => toast.dismiss(t.id)}>취소</button>
                <button
                    className="toast-button toast-button-noshow"
                    onClick={() => {
                        toast.dismiss(t.id);
                        handleConfirmSplit('NO_SHOW');
                    }}
                >노쇼 처리</button>
            </div>
        </div>
    ), { duration: 10000, position: 'top-center' });
  };


  const aggregatedResults = useMemo<AggregatedOrderGroup[]>(() => {
    let results = rawSearchResults;
    if (activeNameFilter) results = results.filter(order => order.customerInfo.name === activeNameFilter);
    if (filterMode === 'pickup' && !splitInfo) { // 분할모드일때는 필터링 잠시 해제
      results = results.filter(order => order.status === 'RESERVED' || order.status === 'PREPAID');
    }
    
    const groups = new Map<string, AggregatedOrderGroup>();

    results.forEach(order => {
        order.items.forEach(item => {
            const groupKey = `${order.customerInfo.name}-${item.productId}-${item.itemId}-${order.status}`;
            
            if (groups.has(groupKey)) {
                const existingGroup = groups.get(groupKey)!;
                existingGroup.totalQuantity += item.quantity;
                existingGroup.totalPrice += (item.unitPrice * item.quantity);
                existingGroup.originalOrders.push({ orderId: order.id, quantity: item.quantity, status: order.status });
            } else {
                groups.set(groupKey, {
                    groupKey,
                    customerInfo: order.customerInfo,
                    item: item,
                    totalQuantity: item.quantity,
                    totalPrice: item.unitPrice * item.quantity,
                    status: order.status,
                    pickupDate: order.pickupDate,
                    pickupDeadlineDate: order.pickupDeadlineDate,
                    originalOrders: [{ orderId: order.id, quantity: item.quantity, status: order.status }]
                });
            }
        });
    });

    return Array.from(groups.values());
  }, [rawSearchResults, filterMode, activeNameFilter, splitInfo]);

  const selectedTotalPrice = useMemo(() => {
    // 분할 모드 시, 변경된 수량 기준으로 가격 재계산
    if (splitInfo) {
        const { group, newQuantity } = splitInfo;
        const unitPrice = group.totalPrice / group.totalQuantity;
        return newQuantity * unitPrice;
    }

    return aggregatedResults
      .filter((group: AggregatedOrderGroup) => selectedGroupKeys.includes(group.groupKey))
      .reduce((sum: number, group: AggregatedOrderGroup) => sum + group.totalPrice, 0);
  }, [selectedGroupKeys, aggregatedResults, splitInfo]);


  const renderFooterActions = () => {
    // ✨ [수정] 분할 처리 모드일 때의 버튼 렌더링
    if (splitInfo) {
        return (
            <button onClick={showSplitConfirmToast} className="action-split-process">
                <GitCommit size={16}/>
                분할하여 처리하기
            </button>
        );
    }

    const selectedGroupedOrders = aggregatedResults
      .filter(group => selectedGroupKeys.includes(group.groupKey));
    
    const selectedStatuses = selectedGroupedOrders.map(group => group.status);

    const allPickedUp = selectedStatuses.length > 0 && selectedStatuses.every(s => s === 'PICKED_UP');
    const allPrepaid = selectedStatuses.length > 0 && selectedStatuses.every(s => s === 'PREPAID');
    const allNoShow = selectedStatuses.length > 0 && selectedStatuses.every(s => s === 'NO_SHOW');

    return (
        <>
        <button onClick={() => allPickedUp ? handleRevertStatus('PICKED_UP') : handleStatusUpdate('PICKED_UP')} className={allPickedUp ? 'action-cancel-pickup' : 'action-pickup'}>
            {allPickedUp ? <RotateCcw size={16}/> : <CheckCircle size={16}/>}
            {allPickedUp ? '픽업취소' : '픽업'}
        </button>
        <button onClick={() => allPrepaid ? handleRevertStatus('PREPAID') : handleStatusUpdate('PREPAID')} className={allPrepaid ? 'action-cancel-prepaid' : 'action-prepaid'}>
            {allPrepaid ? <RotateCcw size={16}/> : <DollarSign size={16}/>}
            {allPrepaid ? '선입금취소' : '선입금'}
        </button>
        <button onClick={() => allNoShow ? handleRevertStatus('NO_SHOW') : handleStatusUpdate('NO_SHOW')} className={allNoShow ? 'action-cancel-noshow' : 'action-noshow'}>
            {allNoShow ? <RotateCcw size={16}/> : <UserX size={16}/>}
            {allNoShow ? '노쇼취소' : '노쇼'}
        </button>
        <button onClick={handleDelete} className="action-delete">
            <Trash2 size={16}/>삭제
        </button>
      </>
    );
  };

  useEffect(() => {
    if (resultsGridRef.current) {
      setTimeout(() => {
        resultsGridRef.current?.classList.add('loaded');
      }, 50);
    }
    return () => {
      resultsGridRef.current?.classList.remove('loaded');
    };
  }, [rawSearchResults]);

  return (
    <div className="quick-check-page">
      <header className="qcp-header"><h1>빠른 예약 확인</h1></header>
      <div className="qcp-search-container">
        <form onSubmit={handleSearch} className="qcp-search-form">
            <div className="qcp-filter-wrapper">
                <Filter className="qcp-filter-icon" size={18}/>
                <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)} className="qcp-filter-select">
                    <option value="pickup">픽업 대상</option>
                    <option value="all">전체 보기</option>
                </select>
            </div>
            <div className="qcp-input-wrapper">
            <Phone className="qcp-input-icon" size={20} />
            <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="고객 이름 또는 전화번호 뒷자리"
                className="qcp-input"
                disabled={isLoading}
            />
            {searchTerm && <ClearIcon className="qcp-clear-icon" size={20} onClick={clearSearch} />}
            </div>
            <button type="submit" className="qcp-search-button" disabled={isLoading}>
            {isLoading ? <Loader size={20} className="spin" /> : <Search size={20} />}
            <span>조회</span>
            </button>
        </form>
      </div>
      {disambiguationNames.length > 0 && (
        <div className="qcp-name-selector">
            <h4>📞 동일한 번호로 여러 고객이 검색되었습니다. 조회를 원하는 이름을 선택하세요.</h4>
            <div className="qcp-name-buttons">
                {disambiguationNames.map(name => (
                    <button key={name} onClick={() => setActiveNameFilter(name)} className={activeNameFilter === name ? 'active' : ''}>
                        {name}
                    </button>
                ))}
            </div>
        </div>
      )}
      {isLoading && rawSearchResults.length === 0 && (
        <div className="qcp-loader-container"><Loader size={30} className="spin" /></div>
      )}
      {rawSearchResults.length > 0 && !isLoading && (
        <div className="qcp-results-summary">
            총 <strong>{aggregatedResults.length}</strong>건의 예약 내역
            {splitInfo && <span className="split-mode-indicator"> (분할 처리 중)</span>}
        </div>
      )}
      <div className="qcp-results-container">
        <div ref={resultsGridRef} className="qcp-results-grid">
          {aggregatedResults.map((group) => (
            <QuickCheckOrderCard
              key={group.groupKey}
              group={group}
              onSelect={handleSelectGroup}
              isSelected={selectedGroupKeys.includes(group.groupKey)}
              onQuantityChange={handleQuantityChange}
            />
          ))}
          {aggregatedResults.length === 0 && !isLoading && searchTerm.length >= 2 && rawSearchResults.length > 0 && (
            <div className="qcp-no-results">
              <p>선택한 필터 또는 이름에 해당하는 예약이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
      {selectedGroupKeys.length > 0 && (
        <div className="qcp-footer">
          <div className="qcp-footer-summary">
            총 {selectedTotalPrice.toLocaleString()}원
          </div>
          <div className="qcp-footer-actions">
            {renderFooterActions()}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickCheckPage;