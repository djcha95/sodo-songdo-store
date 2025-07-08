// src/pages/admin/DashboardPage.tsx

import React, { useState, useEffect } from 'react';
import { getProducts, updateItemStock } from '../../firebase/productService';
import { getReservedQuantities } from '../../firebase/orderService';
import type { ProductItem } from '../../types';
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import { Box, Save } from 'lucide-react';
import './DashboardPage.css';
// [삭제] 더 이상 필요 없는 commonAdmin.css import 라인을 제거합니다.
// import '../../styles/commonAdmin.css';

interface DisplayItem extends ProductItem {
    productName: string;
    roundName: string;
    deadlineDate: Date;
    status: string;
    reservedQuantity: number;
    // 식별을 위한 ID들
    productId: string;
    roundId: string;
    variantGroupId: string;
}

const DashboardPage: React.FC = () => {
    const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
    const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [products, reservedQuantitiesMap] = await Promise.all([
                getProducts(false),
                getReservedQuantities(),
            ]);

            const items: DisplayItem[] = [];
            products.forEach(p => {
                const activeRound = p.salesHistory?.find(r => r.status === 'selling' || r.status === 'scheduled');
                
                if (activeRound) {
                    activeRound.variantGroups.forEach(vg => {
                        (vg.items || []).forEach(item => {
                            const key = `${activeRound.roundId}-${item.id}`;
                            items.push({
                                ...item,
                                productName: p.groupName,
                                roundName: activeRound.roundName,
                                deadlineDate: activeRound.deadlineDate.toDate(),
                                status: activeRound.status,
                                reservedQuantity: reservedQuantitiesMap.get(key) || 0,
                                productId: p.id,
                                roundId: activeRound.roundId,
                                variantGroupId: vg.id || '',
                            });
                        });
                    });
                }
            });

            items.sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime());
            setDisplayItems(items);
        } catch (error) {
            toast.error("대시보드 데이터를 불러오는 중 오류가 발생했습니다.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
    }, []);

    const handleStockInputChange = (itemId: string, value: string) => {
        setStockInputs(prev => ({ ...prev, [itemId]: value }));
    };

    const handleStockSave = async (item: DisplayItem) => {
        const newStockValue = stockInputs[item.id!];
        if (newStockValue === undefined || newStockValue.trim() === '') {
            toast.error("입력된 재고 값이 없습니다.");
            return;
        }

        const newStock = newStockValue.trim() === '' ? -1 : Number(newStockValue);
        if (isNaN(newStock)) {
            toast.error("재고는 숫자만 입력 가능합니다.");
            return;
        }

        const promise = updateItemStock(item.productId, item.roundId, item.variantGroupId, item.id!, newStock);
        
        await toast.promise(promise, {
            loading: `${item.productName} 재고 업데이트 중...`,
            success: "재고가 성공적으로 업데이트되었습니다!",
            error: "재고 업데이트 중 오류가 발생했습니다.",
        });

        fetchData();
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="dashboard-container">
            <div className="dashboard-widget">
                <div className="widget-header">
                    <Box size={20} />
                    <h2>실시간 예약 현황 및 재고 관리</h2>
                </div>
                <div className="widget-content">
                    {displayItems.length > 0 ? (
                        <table className="stock-table">
                            <thead>
                                <tr>
                                    <th>상품명 (옵션)</th>
                                    <th>판매 상태</th>
                                    <th>판매 마감일</th>
                                    <th>현재 예약 수량</th>
                                    <th>현재 설정된 재고</th>
                                    <th>실제 입고 재고 입력</th>
                                    <th>저장</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayItems.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.productName} - {item.name} ({item.roundName})</td>
                                        <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                                        <td>{item.deadlineDate.toLocaleString('ko-KR')}</td>
                                        <td><strong>{item.reservedQuantity}</strong> 개</td>
                                        <td>{item.stock === -1 ? '무제한' : `${item.stock} 개`}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className="stock-input"
                                                placeholder="입고 수량"
                                                value={stockInputs[item.id!] ?? ''}
                                                onChange={e => handleStockInputChange(item.id!, e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <button className="save-stock-button" onClick={() => handleStockSave(item)}>
                                                <Save size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="no-data-message">현재 판매중이거나 예약된 상품이 없습니다.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;