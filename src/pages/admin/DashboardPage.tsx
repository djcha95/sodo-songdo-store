import React, { useState, useEffect, useMemo } from 'react';
// ❗ [FIX 2] 사용하지 않는 updateItemStock 함수 import 제거
import { getProducts } from '@/firebase/productService';
import { db } from '@/firebase/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Product, Order, OrderItem, SalesRound, VariantGroup } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import { TrendingUp, Save } from 'lucide-react';
import './DashboardPage.css';

// --- 타입 정의 ---

interface EnrichedGroupItem {
  id: string; 
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  variantGroupName: string;
  uploadDate: string; 
  reservedQuantity: number;
  waitlistedQuantity: number;
  configuredStock: number; 
}

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- 메인 컴포넌트 ---

const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [groupedItems, setGroupedItems] = useState<Record<string, EnrichedGroupItem[]>>({});
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [products, allReservedOrders] = await Promise.all([
        getProducts(false),
        getDocs(query(collection(db, 'orders'), where('status', '==', 'RESERVED'))),
      ]);

      const reservedQuantitiesMap = new Map<string, number>();
      allReservedOrders.forEach(doc => {
        const order = doc.data() as Order;
        (order.items || []).forEach((item: OrderItem) => {
          const groupKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
          const currentQty = reservedQuantitiesMap.get(groupKey) || 0;
          reservedQuantitiesMap.set(groupKey, currentQty + item.quantity);
        });
      });

      const allDisplayItems: EnrichedGroupItem[] = [];
      products.forEach((product: Product) => {
        const uploadDate = product.createdAt ? formatDate(product.createdAt.toDate()) : '날짜 없음';
        
        product.salesHistory?.forEach((round: SalesRound) => {
          round.variantGroups?.forEach((vg: VariantGroup) => {
            const groupId = vg.id || `${product.id}-${round.roundId}-${vg.groupName}`;
            const groupKey = `${product.id}-${round.roundId}-${groupId}`;
            
            // ❗ [FIX 1] '설정된 재고' 계산 시 null 타입을 완벽하게 처리하도록 로직 보강
            const groupStock = vg.totalPhysicalStock ?? -1; // null이면 -1로 변환
            const hasGroupStock = groupStock !== -1;
            const representativeItemStock = vg.items?.[0]?.stock ?? -1; // 옵셔널 체이닝과 null 병합으로 안정성 확보
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
              reservedQuantity: reservedQuantitiesMap.get(groupKey) || 0,
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

  const handleStockSave = async (item: EnrichedGroupItem) => {
    const newStockValue = stockInputs[item.id];
    if (newStockValue === undefined || newStockValue.trim() === '') {
      toast.error("입력된 최종 재고 값이 없습니다.");
      return;
    }
    
    const newStock = parseInt(newStockValue, 10);
    if (isNaN(newStock)) {
      toast.error("재고는 숫자만 입력 가능합니다.");
      return;
    }
    
    toast.error("저장 기능은 그룹 재고 업데이트를 위한 백엔드 함수 연결이 필요합니다.");
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <TrendingUp size={24} />
        <h1>통합 판매 현황 대시보드</h1>
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
                    <th>예약 수량</th>
                    <th>대기 수량</th>
                    <th>남은 수량</th>
                    <th>설정된 재고</th>
                    <th>최종 재고 입력</th>
                    <th>저장</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems[date].map((item, index) => {
                    const remainingStock = item.configuredStock === -1 ? -1 : item.configuredStock - item.reservedQuantity;
                    const displayName = item.productName === item.variantGroupName 
                      ? item.productName 
                      : `${item.productName} - ${item.variantGroupName}`;

                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td className="product-name-cell">{displayName}</td>
                        <td>{item.roundName}</td>
                        <td className="quantity-cell">{item.reservedQuantity}</td>
                        <td className="quantity-cell">{item.waitlistedQuantity}</td>
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
                          />
                        </td>
                        <td>
                          <button 
                            className="save-button" 
                            onClick={() => handleStockSave(item)}
                            aria-label={`${displayName} 재고 저장`}
                          >
                            <Save size={18} />
                          </button>
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