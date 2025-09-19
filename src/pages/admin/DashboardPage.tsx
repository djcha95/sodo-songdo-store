// src/pages/admin/DashboardPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProducts, updateMultipleVariantGroupStocks } from '@/firebase/productService'; 
import { db } from '@/firebase/firebaseConfig';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Product, Order, OrderItem, SalesRound, VariantGroup } from '@/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';
import { TrendingUp, Hourglass, CheckCircle, Check, ClipboardCopy, Ticket } from 'lucide-react';
import './DashboardPage.css';
import { reportError } from '@/utils/logger';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);


interface EnrichedGroupItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  variantGroupName: string;
  publishDate: string; // ✅ [수정] uploadDate -> publishDate
  confirmedReservedQuantity: number;
  pendingPrepaymentQuantity: number;
  waitlistedQuantity: number;
  configuredStock: number;
  round: SalesRound; // ✅ [추가] 재고 확인 알림 로직을 위해 round 정보 포함
}

interface ActiveRaffleEvent {
    productId: string;
    roundId: string;
    productName: string;
    entryCount: number;
    deadlineDate: Timestamp;
}

// ✅ [추가] ProductListPageAdmin.tsx의 유틸리티 함수들을 가져와서 사용합니다.
const safeToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (typeof timestamp.seconds === 'number' && typeof timestamp.nanoseconds === 'number') {
    return new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
  }
  return null;
};

// ✅ [오류 수정] 사용하지 않는 secondaryDeadlineDate 관련 로직을 제거합니다.
const getDeadlines = (round: SalesRound) => {
    const primaryEnd = round.deadlineDate ? dayjs(safeToDate(round.deadlineDate)) : null;
    return { primaryEnd };
};

const getDynamicStatusText = (round: SalesRound): string => {
  if (round.eventType === 'RAFFLE') return '응모진행중';
  if (round.manualStatus === 'sold_out') return "매진 (수동)";
  if (round.manualStatus === 'ended') return "판매종료 (수동)";
  if (round.isManuallyOnsite) return "현장판매 (수동)";

  const now = dayjs();
  const { primaryEnd } = getDeadlines(round);
  const pickupStart = round.pickupDate ? dayjs(safeToDate(round.pickupDate)) : null;
  const pickupDeadline = round.pickupDeadlineDate ? dayjs(safeToDate(round.pickupDeadlineDate)) : null;

  if (primaryEnd && now.isAfter(primaryEnd)) {
      if (pickupStart && pickupDeadline && now.isBetween(pickupStart, pickupDeadline, null, '[]')) {
          return "픽업중";
      }
      if (pickupDeadline && now.isAfter(pickupDeadline)) {
          return "현장판매중";
      }
      return "2차 공구중";
  }
  return "판매종료";
};


const CopyLinkButton: React.FC<{ productId: string }> = ({ productId }) => {
    const [copied, setCopied] = useState(false);
    const productUrl = `https://www.sodo-songdo.store/product/${productId}`;

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
  const [initialData, setInitialData] = useState<Record<string, EnrichedGroupItem[]>>({});
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [activeRaffles, setActiveRaffles] = useState<ActiveRaffleEvent[]>([]);

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
          // ✅ [수정] 묶음 수량을 반영하여 실제 재고 차감량을 계산합니다.
          const actualDeduction = item.quantity * (item.stockDeductionAmount || 1);
          
          if(order.status === 'RESERVED' && order.wasPrepaymentRequired) {
            const currentQty = pendingPrepaymentMap.get(groupKey) || 0;
            pendingPrepaymentMap.set(groupKey, currentQty + actualDeduction);
          } else {
            const currentQty = confirmedReservationMap.get(groupKey) || 0;
            confirmedReservationMap.set(groupKey, currentQty + actualDeduction);
          }
        });
      });

      const allDisplayItems: EnrichedGroupItem[] = [];
      const currentActiveRaffles: ActiveRaffleEvent[] = [];
      const initialStockValues: Record<string, string> = {};

      productsResponse.products.forEach((product: Product) => {
        product.salesHistory?.forEach((round: SalesRound) => {
          // ✅ [수정] 그룹화 기준을 상품 등록일에서 '판매 게시일'로 변경합니다.
          const publishDate = round.publishAt && 'toDate' in round.publishAt ? formatDate(round.publishAt.toDate()) : '날짜 미지정';

          if (round.eventType === 'RAFFLE' && round.deadlineDate && Timestamp.now().toMillis() < round.deadlineDate.toMillis()) {
            currentActiveRaffles.push({
                productId: product.id,
                roundId: round.roundId,
                productName: product.groupName,
                entryCount: round.entryCount || 0,
                deadlineDate: round.deadlineDate,
            });
          }

          round.variantGroups?.forEach((vg: VariantGroup) => {
            const groupId = vg.id || `${product.id}-${round.roundId}-${vg.groupName}`;
            const groupKey = `${product.id}-${round.roundId}-${groupId}`;

            const groupStock = vg.totalPhysicalStock ?? -1;
            const hasGroupStock = groupStock !== -1;
            const representativeItemStock = vg.items?.[0]?.stock ?? -1;
            const finalConfiguredStock = hasGroupStock ? groupStock : representativeItemStock;
            
            initialStockValues[groupKey] = finalConfiguredStock === -1 ? '' : String(finalConfiguredStock);

            allDisplayItems.push({
              id: groupKey,
              productId: product.id,
              productName: product.groupName,
              imageUrl: product.imageUrls?.[0] || '/placeholder.svg',
              roundId: round.roundId,
              roundName: round.roundName,
              variantGroupId: groupId,
              variantGroupName: vg.groupName,
              publishDate: publishDate,
              confirmedReservedQuantity: confirmedReservationMap.get(groupKey) || 0,
              pendingPrepaymentQuantity: pendingPrepaymentMap.get(groupKey) || 0,
              waitlistedQuantity: round.waitlistCount || 0,
              configuredStock: finalConfiguredStock,
              round: round,
            });
          });
        });
      });

      const grouped = allDisplayItems.reduce((acc, item) => {
        // ✅ [수정] publishDate를 기준으로 그룹화합니다.
        const dateKey = item.publishDate;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(item);
        return acc;
      }, {} as Record<string, EnrichedGroupItem[]>);
      
      setInitialData(grouped);
      setStockInputs(initialStockValues);
      setActiveRaffles(currentActiveRaffles);

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
    return Object.keys(initialData).sort((a, b) => b.localeCompare(a));
  }, [initialData]);

  const handleStockInputChange = (groupId: string, value: string) => {
    setStockInputs(prev => ({ ...prev, [groupId]: value }));
  };

  // ✅ [추가] 변경된 재고를 한 번에 저장하는 함수
  const handleBulkStockSave = useCallback(async () => {
    const allItems = Object.values(initialData).flat();
    const updatePayload: { productId: string; roundId: string; variantGroupId: string; newStock: number; }[] = [];

    for (const item of allItems) {
      const currentInputValue = stockInputs[item.id];
      if (currentInputValue === undefined) continue;

      const newStock = currentInputValue.trim() === '' ? -1 : parseInt(currentInputValue, 10);
      if (isNaN(newStock) || (newStock < 0 && newStock !== -1)) {
        toast.error(`'${item.productName} - ${item.variantGroupName}'의 재고 형식이 올바르지 않습니다.`);
        return;
      }

      if (newStock !== item.configuredStock) {
        updatePayload.push({
          productId: item.productId,
          roundId: item.roundId,
          variantGroupId: item.variantGroupId,
          newStock: newStock
        });
      }
    }

    if (updatePayload.length === 0) {
      toast.success("변경된 재고 내역이 없습니다.");
      return;
    }

    const promise = updateMultipleVariantGroupStocks(updatePayload);
    
    toast.promise(promise, {
      loading: `${updatePayload.length}개 항목의 재고 업데이트 중...`,
      success: () => {
        fetchData(); // 성공 후 데이터 새로고침
        return "재고가 성공적으로 업데이트되었습니다.";
      },
      error: "재고 업데이트 중 오류가 발생했습니다."
    });

  }, [stockInputs, initialData, fetchData]);

  if (loading) return <SodomallLoader />;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-title-area">
          <TrendingUp size={28} />
          <h1>통합 판매 현황 대시보드</h1>
        </div>
        {/* ✅ [추가] 재고 일괄 저장 버튼 */}
        <button 
          onClick={handleBulkStockSave} 
          className="dashboard-save-button"
        >
          <Check size={18} />
          변경된 재고 일괄 저장
        </button>
      </div>
      
      {activeRaffles.length > 0 && (
          <div className="dashboard-group raffle-summary-group">
              <h2 className="group-title"><Ticket size={20} /> 진행중인 추첨 이벤트</h2>
              <div className="raffle-cards-container">
                  {activeRaffles.map(raffle => (
                      <div key={raffle.roundId} className="raffle-summary-card">
                          <h3 className="raffle-product-name">{raffle.productName}</h3>
                          <div className="raffle-info">
                              <span className="raffle-entry-count">
                                  <strong>{raffle.entryCount}</strong>명 응모 중
                              </span>
                              <span className="raffle-deadline">
                                  마감: {dayjs(raffle.deadlineDate.toDate()).format('M/D(ddd) HH:mm')}
                              </span>
                          </div>
                          <Link to={`/admin/events/${raffle.productId}/${raffle.roundId}`} className="raffle-details-link">
                              관리하기
                          </Link>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {sortedDateKeys.length > 0 ? (
        sortedDateKeys.map(date => (
          <div key={date} className="dashboard-group">
            {/* ✅ [수정] 그룹 타이틀을 '판매 게시일' 기준으로 변경 */}
            <h2 className="group-title">
              {date === '날짜 미지정' ? '판매 게시일 미지정' : `${date} 판매 게시 상품`}
            </h2>
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
                    <th>링크 복사</th>
                  </tr>
                </thead>
                <tbody>
                  {initialData[date].map((item, index) => {
                    const remainingStock = item.configuredStock === -1 ? item.configuredStock : item.configuredStock - item.confirmedReservedQuantity;
                    
                    // ✅ [추가] 1차 공구 마감 후 재고 확인이 필요한지 여부 판단
                    const { primaryEnd } = getDeadlines(item.round);
                    const statusText = getDynamicStatusText(item.round);
                    const isConfirmationNeeded = primaryEnd && dayjs().isAfter(primaryEnd) && !['판매종료', '매진', '응모종료', '추첨완료'].includes(statusText);
                    
                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td><img src={item.imageUrl} alt={item.productName} className="dashboard-product-thumbnail" /></td>
                        <td className="dashboard-product-name-cell">
                          <Link to={`/admin/products/edit/${item.productId}/${item.roundId}`} className="product-link">
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
                        {/* ✅ [수정] 재고 셀을 항상 input으로 표시하고, 확인 필요시 스타일 적용 */}
                        <td className={`stock-cell ${isConfirmationNeeded ? 'stock-confirmation-needed' : ''}`}>
                          <input
                            type="number"
                            placeholder="무제한"
                            className="stock-input"
                            value={stockInputs[item.id] || ''}
                            onChange={(e) => handleStockInputChange(item.id, e.target.value)}
                          />
                        </td>
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