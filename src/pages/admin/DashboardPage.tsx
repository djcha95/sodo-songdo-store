// src/pages/admin/DashboardPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProducts, updateMultipleVariantGroupStocks } from '@/firebase/productService'; 
import { db } from '@/firebase/firebaseConfig';
import { 
  collection, query, where, getDocs, Timestamp, 
  writeBatch, doc 
} from 'firebase/firestore';
import type { Product, Order, OrderItem, SalesRound, VariantGroup } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';
import { 
  TrendingUp, Hourglass, CheckCircle, Check, ClipboardCopy, Ticket, 
  ShieldAlert, Loader2 
} from 'lucide-react';
import './DashboardPage.css';
import { reportError } from '@/utils/logger';
import dayjs from 'dayjs';

interface EnrichedGroupItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  variantGroupName: string;
  publishDate: string; 
  confirmedReservedQuantity: number;
  pendingPrepaymentQuantity: number;
  waitlistedQuantity: number;
  configuredStock: number;
}

interface ActiveRaffleEvent {
    productId: string;
    roundId: string;
    productName: string;
    entryCount: number;
    deadlineDate: any; 
}

// ✅ [추가] 강력한 날짜 변환 헬퍼 함수 (ProductForm에서 가져옴)
const convertToDate = (dateSource: any): Date | null => {
  if (!dateSource) return null;
  if (dateSource instanceof Date) return dateSource;
  // Firebase Timestamp 객체인 경우
  if (typeof dateSource.toDate === 'function') return dateSource.toDate();
  // 직렬화된 Timestamp 객체인 경우 ({ seconds, nanoseconds })
  if (typeof dateSource === 'object' && dateSource.seconds !== undefined && dateSource.nanoseconds !== undefined) {
    return new Timestamp(dateSource.seconds, dateSource.nanoseconds).toDate();
  }
  // 문자열이나 숫자인 경우
  const d = new Date(dateSource);
  if (!isNaN(d.getTime())) return d;
  return null;
};

const CopyLinkButton: React.FC<{ productId: string }> = ({ productId }) => {
    const [copied, setCopied] = useState(false);
    
    // 1. 복사할 텍스트 형식을 변경합니다. (\n은 줄바꿈을 의미합니다)
    const shareText = `👉 예약은 여기에서!\nhttps://www.songdopick.store/product/${productId}`;

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 2. productUrl 대신 shareText를 클립보드에 씁니다.
        navigator.clipboard.writeText(shareText).then(() => {
            setCopied(true);
            toast.success('홍보 문구와 링크가 복사되었습니다!');
            setTimeout(() => setCopied(false), 2000);
        }, () => {
            toast.error('링크 복사에 실패했습니다.');
        });
    };

    return (
        // 3. (선택사항) 버튼에 마우스를 올렸을 때 나오는 설명도 수정하면 좋습니다.
        <button onClick={handleCopy} className="admin-action-button" title={`클릭하여 홍보 문구 복사:\n${shareText}`}>
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

const FixLimitModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    productName: string;
    productId: string;
}> = ({ isOpen, onClose, productName, productId }) => {
    const [limitQty, setLimitQty] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen) return null;

    const runFix = async () => {
        if (!window.confirm(`[${productName}] 상품을 구매한 모든 주문을 검사하여,\n${limitQty}개를 초과한 주문을 ${limitQty}개로 강제 하향 조정하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

        setIsProcessing(true);
        
        const promise = (async () => {
            try {
                const q = query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']));
                const snapshot = await getDocs(q);
                
                let batch = writeBatch(db);
                let count = 0;
                let fixedCount = 0;
                let batchCount = 0;

                for (const orderDoc of snapshot.docs) {
                    const data = orderDoc.data();
                    const items = data.items || [];
                    let isChanged = false;
                    let newTotalPrice = 0;

                    const newItems = items.map((item: any) => {
                        if (item.productId === productId) {
                            let newItem = { ...item };
                            
                            if (newItem.limitQuantity !== limitQty) {
                                newItem.limitQuantity = limitQty;
                                isChanged = true;
                            }
                            if (newItem.quantity > limitQty) {
                                newItem.quantity = limitQty;
                                isChanged = true;
                                fixedCount++;
                            }
                            newTotalPrice += (newItem.unitPrice * newItem.quantity);
                            return newItem;
                        } else {
                            newTotalPrice += (item.unitPrice * item.quantity);
                            return item;
                        }
                    });

                    if (isChanged) {
                        batch.update(doc(db, 'orders', orderDoc.id), { items: newItems, totalPrice: newTotalPrice });
                        count++;
                        batchCount++;
                        
                        if (batchCount >= 400) {
                            await batch.commit();
                            batch = writeBatch(db);
                            batchCount = 0;
                        }
                    }
                }

                if (batchCount > 0) await batch.commit();

                onClose();
                return `처리 완료! 총 ${count}건의 데이터에 제한 설정을 적용했습니다. (수량 초과 수정: ${fixedCount}건)`;
            } catch (e: any) {
                console.error(e);
                throw new Error(`오류 발생: ${e.message}`);
            } finally {
                setIsProcessing(false);
            }
        })();

        toast.promise(promise, {
            loading: `'${productName}' 수량 제한 조치 실행 중...`,
            success: (message) => message,
            error: (err) => err.message,
        });
    };

    return (
        <div className="admin-modal-overlay">
            <div className="admin-modal-content" style={{ maxWidth: '400px' }}>
                <div className="admin-modal-header">
                    <h4 style={{ color: '#d9534f', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldAlert size={20}/> 긴급 수량 제한 조치
                    </h4>
                </div>
                <div className="admin-modal-body">
                    <p style={{ marginBottom: '10px', fontSize: '0.95rem' }}>
                        <strong>대상 상품:</strong> {productName}
                    </p>
                    <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
                        이 상품을 구매한 과거 주문 내역을 조회하여, 설정한 수량보다 많이 주문한 건을 <strong>강제로 줄이고</strong>, 앞으로 변경하지 못하게 <strong>제한(Lock)</strong>을 겁니다.
                    </p>
                    <div className="form-group">
                        <label>제한할 최대 수량 (1인당)</label>
                        <input 
                            type="number" 
                            value={limitQty} 
                            onChange={e => setLimitQty(Number(e.target.value) < 1 ? 1 : Number(e.target.value))}
                            className="admin-input"
                            min="1"
                        />
                    </div>
                </div>
                <div className="admin-modal-footer">
                    <button onClick={onClose} disabled={isProcessing} className="modal-button secondary">취소</button>
                    <button onClick={runFix} disabled={isProcessing} className="modal-button danger">
                        {isProcessing ? <Loader2 className="spin" size={16}/> : '조치 실행'}
                    </button>
                </div>
            </div>
        </div>
    );
};


const DashboardPage: React.FC = () => {
  useDocumentTitle('대시보드');
  const [loading, setLoading] = useState(true);
  const [groupedItems, setGroupedItems] = useState<Record<string, EnrichedGroupItem[]>>({});
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [activeRaffles, setActiveRaffles] = useState<ActiveRaffleEvent[]>([]);
  
  const [fixTarget, setFixTarget] = useState<{id: string, name: string} | null>(null);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsResponse, allPendingOrders] = await Promise.all([
        getProducts(), 
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
      const currentActiveRaffles: ActiveRaffleEvent[] = [];

      productsResponse.products.forEach((product: Product) => {
        // 마지막 회차 정보 가져오기
        const latestRound = product.salesHistory?.[product.salesHistory.length - 1];
        
        if (latestRound) {
          const round = latestRound;

          // ✅ [수정] convertToDate를 사용하여 안전하게 Date 객체로 변환
          const publishDateObj = convertToDate(round.publishAt) || convertToDate(product.createdAt);
          const publishDateStr = publishDateObj ? formatDate(publishDateObj) : '날짜 없음';

          // 추첨 이벤트 확인
          const deadlineObj = convertToDate(round.deadlineDate);
          if (round.eventType === 'RAFFLE' && deadlineObj && new Date().getTime() < deadlineObj.getTime()) {
            currentActiveRaffles.push({
                productId: product.id,
                roundId: round.roundId,
                productName: product.groupName,
                entryCount: (round as any).entryCount || 0, 
                deadlineDate: round.deadlineDate as any, 
            });
          }

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
              publishDate: publishDateStr, // ✅ 변환된 날짜 문자열 사용
              confirmedReservedQuantity: confirmedReservationMap.get(groupKey) || 0,
              pendingPrepaymentQuantity: pendingPrepaymentMap.get(groupKey) || 0,
              waitlistedQuantity: round.waitlistCount || 0,
              configuredStock: finalConfiguredStock,
            });
          });
        } 
      });

      // 날짜(publishDate)별 그룹화
      const grouped = allDisplayItems.reduce((acc, item) => {
        const dateKey = item.publishDate;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(item);
        return acc;
      }, {} as Record<string, EnrichedGroupItem[]>);

      setGroupedItems(grouped);
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

  // 최신 날짜가 위로 오도록 정렬
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
        
      {fixTarget && (
        <FixLimitModal 
            isOpen={!!fixTarget}
            onClose={() => setFixTarget(null)}
            productId={fixTarget.id}
            productName={fixTarget.name}
        />
      )}

      <div className="dashboard-header">
        <div className="header-title-area">
          <TrendingUp size={28} />
          <h1>통합 판매 현황 대시보드</h1>
        </div>
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
            <h2 className="group-title">{date} 발행 상품</h2>
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
                    <th style={{ color: '#d9534f' }}>수량 제한</th> 
                  </tr>
                </thead>
                <tbody>
                  {groupedItems[date].map((item, index) => {
                    const remainingStock = item.configuredStock === -1 ? item.configuredStock : item.configuredStock - item.confirmedReservedQuantity;
                    
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
                        <td>
                          <CopyLinkButton productId={item.productId} />
                        </td>
                        <td>
                            <button 
                                className="admin-action-button danger"
                                onClick={() => setFixTarget({ id: item.productId, name: item.productName })}
                                title="1인당 구매 제한 설정 및 과거 주문 수정"
                                style={{ color: '#d9534f', borderColor: '#d9534f' }}
                            >
                                <ShieldAlert size={16} />
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
        !loading && <p className="no-data-message">표시할 상품 데이터가 없습니다.</p>
      )}
    </div>
  );
};

export default DashboardPage;