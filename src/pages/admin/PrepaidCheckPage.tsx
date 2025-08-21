// src/pages/admin/PrepaidCheckPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Wallet, User, Package, Box, Ban, CheckCheck, ChevronsDown, ChevronsUp } from 'lucide-react';
import { getPrepaidOrders, updateMultipleOrderStatuses, revertOrderStatus } from '@/firebase/orderService';
import type { Order, OrderStatus, GroupedPrepaidData, AggregatedProductInfo } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import PrepaidListTable from '@/components/admin/PrepaidListTable';
import './PrepaidCheckPage.css';
import dayjs from 'dayjs';
import 'dayjs/locale/ko'; // ✅ [수정] 한국어 로케일 import

dayjs.locale('ko'); // ✅ [수정] dayjs 전역 로케일 설정

const PrepaidCheckPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // ✅ [추가] 아코디언 상태 관리

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setSelectedOrderIds(new Set());
    try {
      const orders = await getPrepaidOrders();
      setAllOrders(orders);
    } catch (error: any) {
      toast.error(error.message || '데이터를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const processedData = useMemo((): GroupedPrepaidData[] => {
    let filtered = allOrders;

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const isNumeric = /^\d+$/.test(term);
      filtered = filtered.filter(order => 
        order.customerInfo.name.toLowerCase().includes(term) ||
        (isNumeric && order.customerInfo.phone.endsWith(term))
      );
    }

    const groups = filtered.reduce((acc, order) => {
      if (!order.items || order.items.length === 0) return acc;
      
      // ✅ [오류 수정] pickupDate가 Date 객체일 수 있으므로 .toDate() 호출을 안전하게 처리
      const pickupDate = order.pickupDate;
      const dateObj = 'toDate' in pickupDate ? pickupDate.toDate() : pickupDate;
      const key = dayjs(dateObj).format('YYYY년 M월 D일 (ddd)');

      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {} as Record<string, Order[]>);

    return Object.entries(groups)
      .map(([key, orders]) => {
        const productMap = new Map<string, AggregatedProductInfo>();
        orders.forEach(order => {
          order.items.forEach(item => {
            const mapKey = `${item.productId}-${item.variantGroupId || 'default'}`;
            if (!productMap.has(mapKey)) {
              productMap.set(mapKey, {
                id: mapKey,
                productName: item.productName,
                variantName: item.variantGroupName || '',
                totalQuantity: 0,
                customers: [],
              });
            }
            const existing = productMap.get(mapKey)!;
            existing.totalQuantity += item.quantity;
            existing.customers.push({
              name: order.customerInfo.name,
              phoneLast4: order.customerInfo.phoneLast4 || '',
              quantity: item.quantity,
            });
          });
        });

        productMap.forEach(p => p.customers.sort((a,b) => a.name.localeCompare(b.name)));

        return {
          groupKey: key,
          orders: orders,
          products: Array.from(productMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
        };
      })
      // ✅ [오류 수정] a.key -> a.groupKey로 수정
      .sort((a, b) => b.groupKey.localeCompare(a.groupKey));

  }, [allOrders, searchTerm]);

  // ✅ [추가] 데이터 로드 시 모든 그룹을 펼친 상태로 초기화
  useEffect(() => {
    if (processedData.length > 0) {
      setExpandedGroups(new Set(processedData.map(g => g.groupKey)));
    }
  }, [processedData]);


  const handleSelectGroup = (orderIds: string[], isSelected: boolean) => {
    const newSelected = new Set(selectedOrderIds);
    if (isSelected) {
      orderIds.forEach(id => newSelected.delete(id));
    } else {
      orderIds.forEach(id => newSelected.add(id));
    }
    setSelectedOrderIds(newSelected);
  };
  
  // ✅ [추가] 아코디언 토글 핸들러
  const handleToggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };
  
  // ✅ [추가] 모두 펼치기/접기 핸들러
  const handleToggleAll = (expand: boolean) => {
    if (expand) {
      setExpandedGroups(new Set(processedData.map(g => g.groupKey)));
    } else {
      setExpandedGroups(new Set());
    }
  };

  const handleBulkAction = async (action: 'pickup' | 'unprepaid' | 'cancel') => {
    if (selectedOrderIds.size === 0) return;
    
    const orderIds = Array.from(selectedOrderIds);
    let promise: Promise<any>;
    let successMessage = '';

    if (action === 'unprepaid') {
        promise = revertOrderStatus(orderIds, 'PREPAID');
        successMessage = `${orderIds.length}개 주문을 '예약' 상태로 변경했습니다.`;
    } else {
        const targetStatusMap: { [key: string]: OrderStatus } = {
            pickup: 'PICKED_UP',
            cancel: 'CANCELED',
        };
        const targetStatus = targetStatusMap[action];
        promise = updateMultipleOrderStatuses(orderIds, targetStatus);
        successMessage = `${orderIds.length}개 주문의 상태를 성공적으로 변경했습니다.`;
    }

    await toast.promise(promise, {
      loading: '상태를 업데이트하는 중...',
      success: successMessage,
      error: '상태 업데이트 중 오류가 발생했습니다.',
    });

    fetchData();
  };

  return (
    <div className="prepaid-check-page">
      <header className="pcp-header">
        <h1><Wallet className="header-icon" /> 선입금 미픽업 관리</h1>
        <p>선입금 완료 후 아직 픽업되지 않은 내역을 관리합니다. (아코디언 테이블 뷰)</p>
      </header>

      <div className="pcp-filter-container">
        <div className="pcp-filter-group pcp-search-group">
          <label htmlFor="search-term"><User size={16} /> 고객 검색</label>
          <input 
            type="text" 
            id="search-term" 
            placeholder="이름 또는 전화번호 뒷자리로 필터링" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {/* ✅ [추가] 모두 펼치기/접기 버튼 */}
        <div className="pcp-view-controls">
          <button onClick={() => handleToggleAll(true)}><ChevronsDown size={16} /> 모두 펼치기</button>
          <button onClick={() => handleToggleAll(false)}><ChevronsUp size={16} /> 모두 접기</button>
        </div>
      </div>
      
      <div className={`pcp-bulk-actions ${selectedOrderIds.size > 0 ? 'visible' : ''}`}>
        <span className="bulk-info">{selectedOrderIds.size}개 주문 선택됨</span>
        <div className="bulk-buttons">
            <button className="pcp-bulk-button pickup" onClick={() => handleBulkAction('pickup')}>
                <Box size={18} /> 픽업 완료
            </button>
            <button className="pcp-bulk-button unprepaid" onClick={() => handleBulkAction('unprepaid')}>
                <CheckCheck size={18} /> 선입금 해제
            </button>
            <button className="pcp-bulk-button cancel" onClick={() => handleBulkAction('cancel')}>
                <Ban size={18} /> 예약 취소
            </button>
        </div>
      </div>

      <div className="pcp-list-container">
        {isLoading ? (
          <SodomallLoader message="선입금 내역을 불러오는 중..." />
        ) : processedData.length > 0 ? (
          <PrepaidListTable 
            groupedData={processedData}
            selectedOrderIds={selectedOrderIds}
            onSelectGroup={handleSelectGroup}
            expandedGroups={expandedGroups}
            onToggleGroup={handleToggleGroup}
          />
        ) : (
          <div className="pcp-message-area">
            <Package size={48} />
            <p>조건에 맞는 선입금 내역이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrepaidCheckPage;