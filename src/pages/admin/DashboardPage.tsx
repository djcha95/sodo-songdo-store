// src/pages/admin/DashboardPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProducts } from '@/firebase/productService';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/firebase/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Product, Order, OrderItem, SalesRound, VariantGroup } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';
import { TrendingUp, SaveAll, Hourglass, CheckCircle, Search, Copy, Check } from 'lucide-react';
import './DashboardPage.css';
import { reportError } from '@/utils/logger';


// ✅ [수정] 주문 검색 결과를 위한 UI 전용 타입 정의
interface SearchedOrderForUI {
  id: string;
  createdAt: Date; // JS Date 객체로 명시
  orderNumber?: string;
  customerInfo: { name: string; phone: string; };
  items: OrderItem[];
  status: string;
}

// Cloud Function의 반환 타입을 위한 인터페이스
interface WaitlistProcessResult {
  convertedCount: number;
  failedCount: number;
}

interface EnrichedGroupItem {
  id: string;
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  variantGroupName: string;
  uploadDate: string;
  confirmedReservedQuantity: number;
  pendingPrepaymentQuantity: number;
  waitlistedQuantity: number;
  configuredStock: number;
}

const CopyToClipboardButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            toast.success(`ID가 복사되었습니다!`, { duration: 1500 });
            setTimeout(() => setCopied(false), 2000);
        }, () => {
            toast.error('복사에 실패했습니다.');
        });
    };

    return (
        <button onClick={handleCopy} className="copy-id-button" title="클릭해서 ID 복사">
            {copied ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
            <span className="id-text">{textToCopy}</span>
        </button>
    );
};


const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DashboardPage: React.FC = () => {
  useDocumentTitle('대시보드');
  const [loading, setLoading] = useState(true);
  const [groupedItems, setGroupedItems] = useState<Record<string, EnrichedGroupItem[]>>({});
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // ✅ [수정] 주문 검색 관련 상태의 타입을 새 UI 타입으로 변경
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedOrders, setSearchedOrders] = useState<SearchedOrderForUI[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);


  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const addStockAndProcessWaitlistCallable = useMemo(() => httpsCallable<any, WaitlistProcessResult>(functions, 'addStockAndProcessWaitlist'), [functions]);
  
  const searchOrdersByCustomerCallable = useMemo(() => httpsCallable<{ query: string }, { success: boolean; orders: any[] }>(functions, 'searchOrdersByCustomer'), [functions]);


  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsResponse, allPendingOrders] = await Promise.all([
        getProducts(false, 9999),
        getDocs(query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']))),
      ]);

      const confirmedReservationMap = new Map<string, number>();
      const pendingPrepaymentMap = new Map<string, number>();

      allPendingOrders.forEach(doc => {
        const order = doc.data() as Order;
        (order.items || []).forEach((item: OrderItem) => {
          const groupKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          
          if(order.status === 'RESERVED' && order.wasPrepaymentRequired) {
            const currentQty = pendingPrepaymentMap.get(groupKey) || 0;
            pendingPrepaymentMap.set(groupKey, currentQty + item.quantity);
          } else {
            const currentQty = confirmedReservationMap.get(groupKey) || 0;
            confirmedReservationMap.set(groupKey, currentQty + item.quantity);
          }
        });
      });

      const allDisplayItems: EnrichedGroupItem[] = [];
      productsResponse.products.forEach((product: Product) => {
        const uploadDate = product.createdAt && 'toDate' in product.createdAt ? formatDate(product.createdAt.toDate()) : '날짜 없음';

        product.salesHistory?.forEach((round: SalesRound) => {
          round.variantGroups?.forEach((vg: VariantGroup) => {
            const groupId = vg.id || `${product.id}-${round.roundId}-${vg.groupName}`;
            const groupKey = `${product.id}-${round.roundId}-${groupId}`;

            const groupStock = vg.totalPhysicalStock ?? -1;
            const hasGroupStock = groupStock !== -1;
            const representativeItemStock = vg.items?.[0]?.stock ?? -1;
            const finalConfiguredStock = hasGroupStock ? groupStock : representativeItemStock;

            allDisplayItems.push({
              id: groupKey,
              productId: product.id,
              productName: product.groupName,
              roundId: round.roundId,
              roundName: round.roundName,
              variantGroupId: groupId,
              variantGroupName: vg.groupName,
              uploadDate: uploadDate,
              confirmedReservedQuantity: confirmedReservationMap.get(groupKey) || 0,
              pendingPrepaymentQuantity: pendingPrepaymentMap.get(groupKey) || 0,
              waitlistedQuantity: round.waitlistCount || 0,
              configuredStock: finalConfiguredStock,
            });
          });
        });
      });

      const grouped = allDisplayItems.reduce((acc, item) => {
        const dateKey = item.uploadDate;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(item);
        return acc;
      }, {} as Record<string, EnrichedGroupItem[]>);

      setGroupedItems(grouped);

    } catch (error) {
      reportError("대시보드 데이터 로딩 실패", error);
      toast.error("데이터를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ✅ [수정] 주문 검색 핸들러 내부 로직 수정
  const handleOrderSearch = async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (searchQuery.trim().length < 2) {
          toast.error('검색어는 2자 이상 입력해주세요.');
          return;
      }

      setSearchLoading(true);
      setHasSearched(true);
      setSearchedOrders([]);

      try {
          const result = await searchOrdersByCustomerCallable({ query: searchQuery });
          if (result.data.success) {
              // UI 전용 타입으로 데이터를 가공
              const ordersForUI: SearchedOrderForUI[] = result.data.orders.map(o => ({
                id: o.id,
                createdAt: new Date(o.createdAt._seconds * 1000), // Date 객체로 변환
                orderNumber: o.orderNumber,
                customerInfo: o.customerInfo,
                items: o.items || [],
                status: o.status,
              }));
              setSearchedOrders(ordersForUI);
          } else {
              toast.error('검색에 실패했습니다.');
          }
      } catch (error: any) {
          reportError('OrderSearch.handleSearch', error);
          toast.error(error.message || '검색 중 오류가 발생했습니다.');
      } finally {
          setSearchLoading(false);
      }
  };

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedItems).sort((a, b) => b.localeCompare(a));
  }, [groupedItems]);

  const handleStockInputChange = (groupId: string, value: string) => {
    setStockInputs(prev => ({ ...prev, [groupId]: value }));
  };

  const handleBulkSave = async () => {
    if (Object.keys(stockInputs).length === 0) {
      toast.error("변경된 내용이 없습니다.");
      return;
    }
    setIsSaving(true);

    const allItems = Object.values(groupedItems).flat();
    let hasError = false;

    const promises = Object.entries(stockInputs).map(async ([itemId, newStockValue]) => {
      const item = allItems.find(i => i.id === itemId);
      if (!item || newStockValue.trim() === '') return;

      const newStock = parseInt(newStockValue, 10);
      if (isNaN(newStock) || newStock < 0) {
        toast.error(`'${item.productName}'의 재고 값이 올바르지 않습니다.`);
        hasError = true;
        return Promise.resolve();
      }

      const additionalStock = item.configuredStock !== -1 ? newStock - item.configuredStock : 0;

      if (additionalStock > 0) {
        const payload = {
          productId: item.productId,
          roundId: item.roundId,
          variantGroupId: item.variantGroupId,
          additionalStock: additionalStock
        };
        return addStockAndProcessWaitlistCallable(payload).catch(e => {
          reportError(`'${item.productName}' 대기열 처리 실패`, e);
          toast.error(`'${item.productName}' 처리 중 오류: ${(e as Error).message}`);
          hasError = true;
        });
      }
      return Promise.resolve();
    });

    await toast.promise(
      Promise.all(promises),
      {
        loading: "재고 변경 및 대기열 처리 중...",
        success: "모든 변경 작업이 완료되었습니다.",
        error: "저장 작업 중 예기치 않은 오류가 발생했습니다.",
      }
    );

    setIsSaving(false);
    setStockInputs({});
    if (!hasError) {
      fetchData();
    }
  };
  
  if (loading) return <SodomallLoader />;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-title-area">
          <TrendingUp size={28} />
          <h1>통합 판매 현황 대시보드</h1>
        </div>
        <button
          className="bulk-save-button"
          onClick={handleBulkSave}
          disabled={Object.keys(stockInputs).length === 0 || isSaving}
        >
          <SaveAll size={18} />
          {isSaving ? '저장 중...' : '모든 변경사항 저장'}
        </button>
      </div>
      
      <div className="dashboard-group">
        <h2 className="group-title">고객 주문 검색</h2>
        <form onSubmit={handleOrderSearch} className="order-search-form">
            <div className="search-bar-wrapper" style={{ flexGrow: 1 }}>
                <Search size={18} className="search-icon"/>
                <input 
                    type="text" 
                    placeholder="고객 이름 또는 전화번호 뒷 4자리로 검색..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />
            </div>
            <button type="submit" className="search-button-in-form" disabled={searchLoading}>
                {searchLoading ? '검색 중...' : '검색'}
            </button>
        </form>
      </div>

      {searchLoading && <SodomallLoader message="주문을 검색하고 있습니다..." />}
      {!searchLoading && hasSearched && (
        <div className="dashboard-group">
          <h2 className="group-title">'{searchQuery}' 검색 결과 ({searchedOrders.length}건)</h2>
          {searchedOrders.length > 0 ? (
            <div className="table-wrapper">
               <table className="dashboard-table">
                  <thead>
                      <tr>
                          <th>주문일시</th>
                          <th>주문번호</th>
                          <th>고객명</th>
                          <th>연락처</th>
                          <th>주문 상품 (클릭해서 ID 복사)</th>
                          <th>상태</th>
                      </tr>
                  </thead>
                  <tbody>
                      {searchedOrders.map(order => (
                          <tr key={order.id}>
                              {/* ✅ [수정] 이제 order.createdAt은 Date 객체이므로 바로 toLocaleString 사용 가능 */}
                              <td>{order.createdAt.toLocaleString('ko-KR')}</td>
                              <td>{order.orderNumber}</td>
                              <td>{order.customerInfo.name}</td>
                              <td>{order.customerInfo.phone}</td>
                              <td>
                                  <ul className="ordered-item-list">
                                      {(order.items || []).map(item => (
                                          <li key={item.variantGroupId}>
                                              <span>{item.productName} - {item.itemName}</span>
                                              <CopyToClipboardButton textToCopy={item.variantGroupId} />
                                          </li>
                                      ))}
                                  </ul>
                              </td>
                              <td><span className={`status-badge status-${order.status.toLowerCase()}`}>{order.status}</span></td>
                          </tr>
                      ))}
                  </tbody>
              </table>
            </div>
          ) : (
            <p className="no-data-message">검색 결과가 없습니다.</p>
          )}
        </div>
      )}

      <hr className="section-divider" />

      {sortedDateKeys.length > 0 ? (
        sortedDateKeys.map(date => (
          <div key={date} className="dashboard-group">
            <h2 className="group-title">{date} 업로드 상품</h2>
            <div className="table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>상품명</th>
                    <th>판매 회차</th>
                    <th className="wait-col"><Hourglass size={14} /> 선입금 대기</th>
                    <th className="reserve-col"><CheckCircle size={14} /> 확정 수량</th>
                    <th>대기 수량</th>
                    <th>남은 수량</th>
                    <th>설정된 재고</th>
                    <th>최종 재고 입력</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems[date].map((item, index) => {
                    const remainingStock = item.configuredStock === -1 ? -1 : item.configuredStock - item.confirmedReservedQuantity;
                    const displayName = item.productName === item.variantGroupName
                      ? item.productName
                      : `${item.productName} - ${item.variantGroupName}`;

                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td className="product-name-cell">{displayName}</td>
                        <td>{item.roundName}</td>
                        <td className="quantity-cell wait-col">{item.pendingPrepaymentQuantity > 0 ? item.pendingPrepaymentQuantity : '-'}</td>
                        <td className="quantity-cell reserve-col">{item.confirmedReservedQuantity}</td>
                        <td className="quantity-cell">{item.waitlistedQuantity > 0 ? item.waitlistedQuantity : '-'}</td>
                        <td className="quantity-cell important-cell">
                          {remainingStock === -1
                            ? <span className="unlimited-stock">무제한</span>
                            : `${remainingStock}`}
                        </td>
                        <td className="quantity-cell">
                          {item.configuredStock === -1
                            ? <span className="unlimited-stock">무제한</span>
                            : `${item.configuredStock}`}
                        </td>
                        <td>
                          <input
                            type="number"
                            className="final-stock-input"
                            placeholder="발주량 입력"
                            value={stockInputs[item.id] || ''}
                            onChange={(e) => handleStockInputChange(item.id, e.target.value)}
                            disabled={isSaving}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        !loading && <p className="no-data-message">표시할 상품 데이터가 없습니다.</p>
      )}
    </div>
  );
};

export default DashboardPage;