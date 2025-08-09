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
import { TrendingUp, SaveAll, Hourglass, CheckCircle } from 'lucide-react';
import './DashboardPage.css';

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
  const [isSaving, setIsSaving] = useState(false); // ✅ [추가] 저장 중 상태 관리

  // Cloud Function 참조 설정
  const functions = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
  const addStockAndProcessWaitlistCallable = useMemo(() => httpsCallable<any, WaitlistProcessResult>(functions, 'addStockAndProcessWaitlist'), [functions]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsResponse, allPendingOrders] = await Promise.all([
        // getProducts는 이제 페이지네이션 객체를 반환하므로 .products로 접근합니다.
        getProducts(false, 9999), // 모든 상품을 가져오기 위해 큰 페이지 사이즈 설정
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
      console.error("대시보드 데이터를 불러오는 중 오류 발생:", error);
      toast.error("데이터를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedItems).sort((a, b) => b.localeCompare(a));
  }, [groupedItems]);

  const handleStockInputChange = (groupId: string, value: string) => {
    setStockInputs(prev => ({ ...prev, [groupId]: value }));
  };

  // ✅ [수정] 대기열 처리 로직을 포함하도록 핸들러 전면 수정
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
      return Promise.resolve(); // 오류가 있는 경우에도 Promise chain을 중단하지 않음
    }

    const additionalStock = item.configuredStock !== -1 ? newStock - item.configuredStock : 0;

    if (additionalStock > 0) {
      const payload = {
        productId: item.productId,
        roundId: item.roundId,
        variantGroupId: item.variantGroupId,
        additionalStock: additionalStock
      };
      // Cloud Function 호출
      return addStockAndProcessWaitlistCallable(payload).catch(e => {
        console.error(`'${item.productName}' 대기열 처리 실패:`, e);
        toast.error(`'${item.productName}' 처리 중 오류: ${(e as Error).message}`);
        hasError = true;
      });
    }
    return Promise.resolve(); // 재고 추가가 없는 경우 즉시 해결
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
          // ✅ [수정] isSaving 상태일 때 버튼 비활성화
          onClick={handleBulkSave}
          disabled={Object.keys(stockInputs).length === 0 || isSaving}
        >
          <SaveAll size={18} />
          {isSaving ? '저장 중...' : '모든 변경사항 저장'}
        </button>
      </div>

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
                            disabled={isSaving} // ✅ [추가] 저장 중 입력 비활성화
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
        <p className="no-data-message">표시할 상품 데이터가 없습니다.</p>
      )}
    </div>
  );
};

export default DashboardPage;