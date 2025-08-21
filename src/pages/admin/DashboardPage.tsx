// src/pages/admin/DashboardPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProducts, updateMultipleVariantGroupStocks } from '@/firebase/productService'; 
import { db } from '@/firebase/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Product, Order, OrderItem, SalesRound, VariantGroup } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';
// ✅ [수정] 링크 복사를 위한 Check, ClipboardCopy 아이콘 추가
import { TrendingUp, Hourglass, CheckCircle, Check, ClipboardCopy } from 'lucide-react';
import './DashboardPage.css';
import { reportError } from '@/utils/logger';


interface EnrichedGroupItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
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

// ✅ [추가] 상품 페이지 링크 복사 버튼 컴포넌트
const CopyLinkButton: React.FC<{ productId: string }> = ({ productId }) => {
    const [copied, setCopied] = useState(false);
    // TODO: 실제 운영 도메인으로 변경해야 합니다.
    const productUrl = `https://www.sodomall.com/product/${productId}`;

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(productUrl).then(() => {
            setCopied(true);
            toast.success('상품 링크가 복사되었습니다!');
            setTimeout(() => setCopied(false), 2000);
        }, () => {
            toast.error('링크 복사에 실패했습니다.');
        });
    };

    return (
        <button onClick={handleCopy} className="admin-action-button" title={`클릭하여 링크 복사:\n${productUrl}`}>
            {copied ? <Check size={16} color="var(--success-color)" /> : <ClipboardCopy size={16} />}
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
  const [editingStockId, setEditingStockId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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
              imageUrl: product.imageUrls?.[0] || '/placeholder.svg',
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedItems).sort((a, b) => b.localeCompare(a));
  }, [groupedItems]);

  const handleStockInputChange = (groupId: string, value: string) => {
    setStockInputs(prev => ({ ...prev, [groupId]: value }));
  };
  
  const handleStockEditStart = (itemId: string, currentStock: number) => {
    setEditingStockId(itemId);
    setStockInputs(prev => ({
        ...prev,
        [itemId]: currentStock === -1 ? '' : String(currentStock)
    }));
  };

  const handleStockEditSave = useCallback(async (itemId: string) => {
    setEditingStockId(null);
    const newStockValue = stockInputs[itemId];
    if (newStockValue === undefined) return;

    const allItems = Object.values(groupedItems).flat();
    const itemToUpdate = allItems.find(i => i.id === itemId);

    if (!itemToUpdate) {
        toast.error("업데이트할 상품 정보를 찾지 못했습니다.");
        return;
    }
    
    const newStock = newStockValue.trim() === '' ? -1 : parseInt(newStockValue, 10);
    if (isNaN(newStock) || (newStock < 0 && newStock !== -1)) {
        toast.error("재고는 0 이상의 숫자 또는 -1(무제한)만 입력 가능합니다.");
        return;
    }

    if (newStock === itemToUpdate.configuredStock) return;

    const updatePayload = [{
        productId: itemToUpdate.productId,
        roundId: itemToUpdate.roundId,
        variantGroupId: itemToUpdate.variantGroupId,
        newStock: newStock
    }];

    const promise = updateMultipleVariantGroupStocks(updatePayload);

    toast.promise(promise, {
        loading: `'${itemToUpdate.productName}' 재고 업데이트 중...`,
        success: () => {
            fetchData();
            return "재고가 성공적으로 업데이트되었습니다.";
        },
        error: "재고 업데이트 중 오류가 발생했습니다."
    });
  }, [stockInputs, groupedItems, fetchData]);

  if (loading) return <SodomallLoader />;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-title-area">
          <TrendingUp size={28} />
          <h1>통합 판매 현황 대시보드</h1>
        </div>
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
                    <th className="image-col">이미지</th> 
                    <th>상품명 / 회차명</th>
                    <th className="wait-col"><Hourglass size={14} /> 선입금 대기</th>
                    <th className="reserve-col"><CheckCircle size={14} /> 확정 수량</th>
                    <th>대기 수량</th>
                    <th>남은 수량</th>
                    <th>설정된 재고</th>
                    {/* ✅ [추가] 링크 복사 컬럼 */}
                    <th>링크 복사</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems[date].map((item, index) => {
                    const remainingStock = item.configuredStock === -1 ? -1 : item.configuredStock - item.confirmedReservedQuantity;
                    
                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td><img src={item.imageUrl} alt={item.productName} className="dashboard-product-thumbnail" /></td>
                        <td className="dashboard-product-name-cell">
                          <Link to={`/admin/products/edit/${item.productId}/${item.roundId}`} className="product-link">
                            {/* ✅ [수정] 상품명과 옵션명이 같으면 상품명만 표시 */}
                            {item.productName === item.variantGroupName 
                              ? item.productName
                              : `${item.productName} - ${item.variantGroupName}`
                            }
                          </Link>
                          <span className="round-name-subtext">{item.roundName}</span>
                        </td>
                        <td className="quantity-cell wait-col">{item.pendingPrepaymentQuantity > 0 ? item.pendingPrepaymentQuantity : '-'}</td>
                        <td className="quantity-cell reserve-col">{item.confirmedReservedQuantity}</td>
                        <td className="quantity-cell">{item.waitlistedQuantity > 0 ? item.waitlistedQuantity : '-'}</td>
                        <td className="quantity-cell important-cell">
                          {remainingStock === -1
                            ? <span className="unlimited-stock">무제한</span>
                            : `${remainingStock}`}
                        </td>
                        <td className="stock-cell">
                          {editingStockId === item.id ? (
                            <input
                              type="number"
                              className="stock-input"
                              value={stockInputs[item.id] || ''}
                              onChange={(e) => handleStockInputChange(item.id, e.target.value)}
                              onBlur={() => handleStockEditSave(item.id)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleStockEditSave(item.id);
                                  if (e.key === 'Escape') setEditingStockId(null);
                              }}
                              autoFocus
                            />
                          ) : (
                            <button
                              className="stock-display-button"
                              onClick={() => handleStockEditStart(item.id, item.configuredStock)}
                              title="재고 수량을 클릭하여 수정"
                            >
                              {item.configuredStock === -1
                                ? <span className="unlimited-stock">무제한</span>
                                : `${item.configuredStock}`}
                            </button>
                          )}
                        </td>
                        {/* ✅ [추가] 링크 복사 버튼 셀 */}
                        <td>
                          <CopyLinkButton productId={item.productId} />
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