// src/components/admin/CustomerActionTabs.tsx

import React, { useState, useMemo, useEffect } from 'react';
import type { Timestamp } from 'firebase/firestore';
import type { UserDocument, Order, AggregatedOrderGroup, LoyaltyTier, OrderStatus } from '@/types';
import QuickCheckOrderCard from './QuickCheckOrderCard';
import { 
    updateMultipleOrderStatuses, revertOrderStatus, deleteMultipleOrders, splitAndUpdateOrderStatus 
} from '@/firebase/orderService';
import { adjustUserCounts, setManualTierForUser } from '@/firebase/userService';
import toast from 'react-hot-toast';
import { GitCommit, CheckCircle, DollarSign, XCircle, RotateCcw, Trash2, Save, Shield, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import './CustomerActionTabs.css';


const ActionableOrderTable: React.FC<{ 
    orders: Order[];
    onStatusChange: (order: Order, newStatus: OrderStatus) => void; 
}> = ({ orders = [], onStatusChange }) => {
    
    const sortedOrders = useMemo(() =>
        [...orders].sort((a, b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis()),
        [orders]
    );

    const statusOptions: { value: OrderStatus; label: string }[] = [
        { value: 'RESERVED', label: '예약' },
        { value: 'PREPAID', label: '선입금' },
        { value: 'PICKED_UP', label: '픽업완료' },
        { value: 'CANCELED', label: '취소' },
        { value: 'NO_SHOW', label: '노쇼' },
    ];

    const statusInfo: Record<OrderStatus, { label: string; className: string }> = {
        RESERVED: { label: '예약', className: 'status-reserved' },
        PREPAID: { label: '선입금', className: 'status-prepaid' },
        PICKED_UP: { label: '픽업완료', className: 'status-picked-up' },
        COMPLETED: { label: '처리완료', className: 'status-picked-up' },
        CANCELED: { label: '취소', className: 'status-canceled' },
        NO_SHOW: { label: '노쇼', className: 'status-no-show' },
    };

    return (
        <div className="order-table-container">
            {orders.length > 0 ? (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>예약일</th>
                                <th>상품 정보</th>
                                <th>금액</th>
                                <th>상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedOrders.map(order => (
                                // 🎨 [모바일 UI/UX 고도화] tr에 상태별 클래스 추가
                                <tr key={order.id} className={`status-row-${order.status}`}>
                                    <td>{format((order.createdAt as Timestamp).toDate(), 'M/d(eee)', { locale: ko })}</td>
                                    <td>{order.items.map(item => `${item.productName} (${item.quantity}개)`).join(', ')}</td>
                                    <td>{order.totalPrice.toLocaleString()}원</td>
                                    <td>
                                        <div className="status-select-wrapper">
                                            <select
                                                value={order.status}
                                                onChange={(e) => onStatusChange(order, e.target.value as OrderStatus)}
                                                className={`status-select ${statusInfo[order.status]?.className || ''}`}
                                            >
                                                {statusOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <p className="no-data-message">주문 내역이 없습니다.</p>}
        </div>
    );
};

const TrustManagementCard: React.FC<{ user: UserDocument }> = ({ user }) => {
    const [pickupCount, setPickupCount] = useState(user.pickupCount || 0);
    const [noShowCount, setNoShowCount] = useState(user.noShowCount || 0);
    const [manualTier, setManualTier] = useState<LoyaltyTier | 'auto'>(user.manualTier || 'auto');

    useEffect(() => {
        setPickupCount(user.pickupCount || 0);
        setNoShowCount(user.noShowCount || 0);
        setManualTier(user.manualTier || 'auto');
    }, [user]);

    const handleCountsSave = () => {
        const promise = adjustUserCounts(user.uid, pickupCount, noShowCount);
        toast.promise(promise, { loading: '저장 중...', success: '저장 완료', error: '저장 실패' });
    };

    const handleTierSave = () => {
        const newTier = manualTier === 'auto' ? null : manualTier;
        const promise = setManualTierForUser(user.uid, newTier);
        toast.promise(promise, { loading: '적용 중...', success: '적용 완료', error: '적용 실패' });
    };
    
    return (
        <div className="trust-management-container">
            <div className="management-section">
                <h3><Shield size={20} />신뢰도 관리</h3>
                <h4>등급 직접 지정 (구제용)</h4>
                <p className="description">
                    {user.manualTier 
                        ? <>현재 <strong style={{color: 'var(--accent-color)'}}>{user.manualTier}</strong> 등급으로 수동 설정되어 있습니다.</> 
                        : "현재 픽업/노쇼 횟수에 따라 자동 계산됩니다."}
                </p>
                <div className="role-form">
                    <select value={manualTier} onChange={e => setManualTier(e.target.value as LoyaltyTier | 'auto')}>
                        <option value="auto">자동 계산</option>
                        <option value="공구의 신">공구의 신</option><option value="공구왕">공구왕</option><option value="공구요정">공구요정</option><option value="공구새싹">공구새싹</option><option value="주의 요망">주의 요망</option><option value="참여 제한">참여 제한</option>
                    </select>
                    <button onClick={handleTierSave} className="common-button button-primary button-small"><Save size={14}/> 등급 적용</button>
                </div>
            </div>
            <hr className="divider" />
            <div className="management-section">
                <h4>픽업/노쇼 횟수 조정 (데이터 보정용)</h4>
                <div className="counts-form">
                    <div className="form-group-inline">
                        <label>픽업 완료</label>
                        <input type="number" value={pickupCount} onChange={e => setPickupCount(Number(e.target.value))} />
                    </div>
                    <div className="form-group-inline">
                        <label>노쇼</label>
                        <input type="number" value={noShowCount} onChange={e => setNoShowCount(Number(e.target.value))} />
                    </div>
                    <button onClick={handleCountsSave} className="common-button button-secondary button-small"><Save size={14}/> 횟수 저장</button>
                </div>
                <div className="warning-box">
                    <AlertTriangle size={16} />
                    <span><strong>주의:</strong> 데이터 오류 수정이 필요한 명확한 경우에만 사용하세요.</span>
                </div>
            </div>
        </div>
    );
};


interface CustomerActionTabsProps {
    user: UserDocument;
    orders: Order[];
    onActionComplete: () => void;
}
interface SplitInfo {
  group: AggregatedOrderGroup;
  newQuantity: number;
}
type Tab = 'pickup' | 'history' | 'manage';

const CustomerActionTabs: React.FC<CustomerActionTabsProps> = ({ user, orders = [], onActionComplete }) => {
    const [activeTab, setActiveTab] = useState<Tab>('pickup');
    const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
    const [splitInfo, setSplitInfo] = useState<SplitInfo | null>(null);

    const aggregatedPickupOrders = useMemo<AggregatedOrderGroup[]>(() => {
        const pickupOrders = orders.filter(o => o.status === 'RESERVED' || o.status === 'PREPAID');
        const groups = new Map<string, AggregatedOrderGroup>();
        pickupOrders.forEach(order => {
            order.items.forEach(item => {
                const groupKey = `${order.userId}-${item.productId}-${item.itemId}-${order.status}`;
                if (groups.has(groupKey)) {
                    const existingGroup = groups.get(groupKey)!;
                    existingGroup.totalQuantity += item.quantity;
                    existingGroup.totalPrice += (item.unitPrice * item.quantity);
                    existingGroup.originalOrders.push({ orderId: order.id, quantity: item.quantity, status: order.status });
                } else {
                    groups.set(groupKey, {
                        groupKey, customerInfo: order.customerInfo, item,
                        totalQuantity: item.quantity, totalPrice: item.unitPrice * item.quantity,
                        status: order.status, pickupDate: order.pickupDate, pickupDeadlineDate: order.pickupDeadlineDate,
                        originalOrders: [{ orderId: order.id, quantity: item.quantity, status: order.status }]
                    });
                }
            });
        });
        return Array.from(groups.values());
    }, [orders]);

    const selectedGroups = useMemo(() => 
        aggregatedPickupOrders.filter(g => selectedGroupKeys.includes(g.groupKey)),
        [aggregatedPickupOrders, selectedGroupKeys]
    );

    const handleSelectGroup = (groupKey: string) => {
        if(splitInfo) { toast.error('수량 변경 후에는 먼저 분할 처리를 완료해주세요.'); return; }
        setSelectedGroupKeys(prev => prev.includes(groupKey) ? prev.filter(key => key !== groupKey) : [...prev, groupKey]);
    };

    const handleQuantityChange = (group: AggregatedOrderGroup, newQuantity: number) => {
        if (newQuantity !== group.totalQuantity) {
            if(group.originalOrders.length > 1) { toast.error("묶인 그룹의 수량은 변경할 수 없습니다."); return; }
            setSplitInfo({ group, newQuantity });
            setSelectedGroupKeys([group.groupKey]);
        } else {
            setSplitInfo(null);
            setSelectedGroupKeys([]);
        }
    };
    
    const handleAction = async (action: () => Promise<any>, messages: { loading: string; success: string; error: string; }) => {
        const promise = action();
        toast.promise(promise, { loading: messages.loading, success: () => { onActionComplete(); return messages.success; }, error: (err) => err.message || messages.error });
    };

    const handleStatusUpdate = (status: OrderStatus) => {
        const orderIdsToUpdate = selectedGroups.flatMap(g => g.originalOrders.map(o => o.orderId));
        handleAction(() => updateMultipleOrderStatuses(orderIdsToUpdate, status), { loading: '상태 변경 중...', success: '상태가 변경되었습니다.', error: '상태 변경 실패' });
    };
    
    const handleTableStatusChange = (order: Order, newStatus: OrderStatus) => {
        if (order.status === newStatus) return;

        const originalStatus = order.status;
        let actionPromise: Promise<any>;

        if (['RESERVED', 'PREPAID'].includes(newStatus) && !['RESERVED', 'PREPAID'].includes(originalStatus)) {
             actionPromise = revertOrderStatus([order.id], originalStatus);
        } else {
             actionPromise = updateMultipleOrderStatuses([order.id], newStatus);
        }

        handleAction(() => actionPromise, { loading: '상태 변경 중...', success: '상태가 변경되었습니다.', error: '상태 변경 실패' });
    };

    const handleDelete = () => {
        const orderIdsToDelete = selectedGroups.flatMap(g => g.originalOrders.map(o => o.orderId));
        handleAction(() => deleteMultipleOrders(orderIdsToDelete), { loading: '주문 삭제 중...', success: '삭제되었습니다.', error: '삭제 실패' });
    };
    
    const handleSplit = () => {
        if (!splitInfo) return;
        const performSplitAction = (remainingStatus: OrderStatus) => {
            const orderIdToSplit = splitInfo.group.originalOrders[0].orderId;
            handleAction(() => splitAndUpdateOrderStatus(orderIdToSplit, splitInfo.newQuantity, remainingStatus), { loading: '분할 처리 중...', success: '분할 처리가 완료되었습니다.', error: '분할 처리 실패' });
        };
        toast.custom((t) => (
            <div className="confirmation-toast">
                <h4>분할 처리 확인</h4>
                <p><strong>{splitInfo.newQuantity}개</strong>를 픽업 처리하고,<br/>남은 <strong>{splitInfo.group.totalQuantity - splitInfo.newQuantity}개</strong>는 어떻게 할까요?</p>
                <div className="toast-buttons">
                    <button className="common-button button-danger button-medium" onClick={() => { toast.dismiss(t.id); performSplitAction('NO_SHOW'); }}>노쇼 처리</button>
                    <button className="common-button button-secondary button-medium" onClick={() => { toast.dismiss(t.id); performSplitAction('RESERVED'); }}>예약 유지</button>
                    <button className="common-button button-light button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
                </div>
            </div>
        ), { duration: Infinity, position: 'top-center' });
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'pickup':
                return (
                    <div className="qcp-results-grid">
                        {aggregatedPickupOrders.map(group => (
                            <QuickCheckOrderCard
                                key={group.groupKey} group={group} isSelected={selectedGroupKeys.includes(group.groupKey)}
                                onSelect={handleSelectGroup} onQuantityChange={handleQuantityChange}
                            />
                        ))}
                        {aggregatedPickupOrders.length === 0 && <p className="no-data-message">처리 대기중인 항목이 없습니다.</p>}
                    </div>
                );
            case 'history': 
                return <ActionableOrderTable orders={orders} onStatusChange={handleTableStatusChange} />;
            case 'manage': 
                return <TrustManagementCard user={user} />;
            default: 
                return null;
        }
    };

    const renderFooter = () => {
        if (activeTab !== 'pickup' || selectedGroupKeys.length === 0) return null;
        
        const totalSelectedPrice = selectedGroups.reduce((sum, g) => sum + g.totalPrice, 0);

        if (splitInfo) {
            return (
                <div className="cat-action-footer">
                    <span className="cat-footer-summary">{splitInfo.group.item.productName}: {splitInfo.group.totalQuantity}개 중 {splitInfo.newQuantity}개</span>
                    <div className="cat-footer-actions">
                        <button onClick={handleSplit} className="common-button button-pickup"><GitCommit size={16} /> 분할 픽업</button>
                    </div>
                </div>
            )
        }

        const allSelectedArePrepaid = selectedGroups.length > 0 && selectedGroups.every(g => g.status === 'PREPAID');
        
        const prepaymentButton = allSelectedArePrepaid ? (
            <button onClick={() => handleStatusUpdate('RESERVED')} className="common-button button-prepaid-cancel">
                <RotateCcw size={16} /> 선입금 취소
            </button>
        ) : (
            <button onClick={() => handleStatusUpdate('PREPAID')} className="common-button button-prepaid">
                <DollarSign size={16} /> 선입금
            </button>
        );
        
        return (
            <div className="cat-action-footer">
                <span className="cat-footer-summary">{selectedGroupKeys.length}건 선택 / {totalSelectedPrice.toLocaleString()}원</span>
                <div className="cat-footer-actions">
                    <button onClick={() => handleStatusUpdate('PICKED_UP')} className="common-button button-pickup"><CheckCircle size={20} /> 픽업</button>
                    {prepaymentButton}
                    <button onClick={() => handleStatusUpdate('CANCELED')} className="common-button button-cancel"><XCircle size={16} /> 취소</button>
                    <button onClick={handleDelete} className="common-button button-dark"><Trash2 size={16} /> 삭제</button>
                </div>
            </div>
        )
    }
    
    return (
        <div className="cat-container">
            <div className="cat-tab-navigation">
                <button className={activeTab === 'pickup' ? 'active' : ''} onClick={() => setActiveTab('pickup')}>픽업 카드 ({aggregatedPickupOrders.length})</button>
                <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>전체 주문 내역 ({orders.length})</button>
                <button className={activeTab === 'manage' ? 'active' : ''} onClick={() => setActiveTab('manage')}>신뢰도 관리</button>
            </div>
            <div className={`cat-tab-content ${activeTab === 'pickup' ? 'is-grid-view' : ''}`}>
                {renderTabContent()}
            </div>
            {renderFooter()}
        </div>
    );
};

export default CustomerActionTabs;