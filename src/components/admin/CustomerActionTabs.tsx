// src/components/admin/CustomerActionTabs.tsx

import React, { useState, useMemo, useEffect } from 'react';
import type { Timestamp } from 'firebase/firestore';
import type { UserDocument, Order, AggregatedOrderGroup, LoyaltyTier, OrderStatus } from '@/types';
import QuickCheckOrderCard from './QuickCheckOrderCard';
import {
    updateMultipleOrderStatuses,
    revertOrderStatus,
    deleteMultipleOrders,
    splitAndUpdateOrderStatus,
    splitBundledOrder,
    cancelOrder,
    revertFinalizedOrder // [추가] 취소 복구 함수 import
} from '@/firebase/orderService';
import { adjustUserCounts, setManualTierForUser } from '@/firebase/userService';
import toast from 'react-hot-toast';
import { GitCommit, CheckCircle, DollarSign, XCircle, RotateCcw, Trash2, Save, Shield, AlertTriangle, Undo2, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import './CustomerActionTabs.css';

interface CustomerActionTabsProps {
    user: UserDocument;
    orders: Order[];
    onStatUpdate: (updates: { pickup?: number; noshow?: number; points?: number }) => void;
    onActionSuccess: () => void;
}

const convertToDate = (date: Timestamp | Date | null | undefined): Date | null => {
    if (!date) return null;
    if ('toDate' in date && typeof date.toDate === 'function') return date.toDate();
    return date as Date;
};

const performAction = async (
    actionPromise: () => Promise<any>,
    optimisticUpdate: () => void,
    revertUpdate: () => void,
    onSuccess: () => void,
    messages: { loading: string; success: string; error: string; }
) => {
    optimisticUpdate();
    const toastId = toast.loading(messages.loading);
    try {
        const result = await actionPromise();
        const successMessage = typeof result === 'object' && result.message ? result.message : messages.success;
        toast.success(successMessage, { id: toastId });
        onSuccess();
    } catch (error: any) {
        revertUpdate();
        toast.error(error.message || messages.error, { id: toastId });
    }
};

const ActionableOrderTable: React.FC<{
    orders: Order[];
    onStatusChange: (order: Order) => void;
    onSplitOrder: (orderId: string) => void;
}> = ({ orders = [], onStatusChange, onSplitOrder }) => {
    const sortedOrders = useMemo(() =>
        [...orders].sort((a, b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis()),
        [orders]
    );
    const statusInfo: Record<OrderStatus, { label: string; className: string }> = {
        RESERVED: { label: '예약', className: 'status-reserved' },
        PREPAID: { label: '선입금', className: 'status-prepaid' },
        PICKED_UP: { label: '픽업완료', className: 'status-picked-up' },
        COMPLETED: { label: '처리완료', className: 'status-picked-up' },
        CANCELED: { label: '취소', className: 'status-canceled' },
        NO_SHOW: { label: '노쇼', className: 'status-no-show' },
        LATE_CANCELED: { label: '마감임박취소', className: 'status-canceled' }
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
                                <th>작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedOrders.map(order => {
                                // [수정] '되돌리기' 버튼이 CANCELED, LATE_CANCELED 상태에서도 보이도록 조건 변경
                                const isRevertable = ['PICKED_UP', 'NO_SHOW', 'CANCELED', 'LATE_CANCELED'].includes(order.status);
                                const isSplittable = Array.isArray(order.items) && order.items.length > 1;

                                return (
                                    <tr key={order.id} className={`status-row-${order.status}`}>
                                        <td>{format((order.createdAt as Timestamp).toDate(), 'M/d(eee)', { locale: ko })}</td>
                                        <td>{order.items.map(item => `${item.productName} (${item.quantity}개)`).join(', ')}</td>
                                        <td>{(order.totalPrice || 0).toLocaleString()}원</td>
                                        <td className="status-cell">
                                            <div className="status-cell-content">
                                                <span className={`status-badge ${statusInfo[order.status]?.className || ''}`}>{statusInfo[order.status]?.label}</span>
                                            </div>
                                        </td>
                                        <td className="action-cell">
                                            {isRevertable && (
                                                <button onClick={() => onStatusChange(order)} className="revert-button" title="예약 상태로 되돌리기">
                                                    <Undo2 size={14} /> 되돌리기
                                                </button>
                                            )}
                                            {isSplittable && (
                                                <button onClick={() => onSplitOrder(order.id)} className="split-button" title="이 주문을 개별 주문으로 분할합니다">
                                                    <GitBranch size={14} /> 주문 분할
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
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
                        <option value="공구의 신">공구의 신</option>
                        <option value="공구왕">공구왕</option>
                        <option value="공구요정">공구요정</option>
                        <option value="공구새싹">공구새싹</option>
                        <option value="주의 요망">주의 요망</option>
                        <option value="참여 제한">참여 제한</option>
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
                        <input type="number" step="0.5" value={noShowCount} onChange={e => setNoShowCount(Number(e.target.value))} />
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

type Tab = 'pickup' | 'history' | 'manage';
interface SplitInfo { group: AggregatedOrderGroup; newQuantity: number; }

const CustomerActionTabs: React.FC<CustomerActionTabsProps> = ({ user, orders = [], onStatUpdate, onActionSuccess }) => {
    const [activeTab, setActiveTab] = useState<Tab>('pickup');
    const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
    const [splitInfo, setSplitInfo] = useState<SplitInfo | null>(null);

    const aggregatedPickupOrders = useMemo<AggregatedOrderGroup[]>(() => {
        const pickupOrders = orders.filter(o => o.status === 'RESERVED' || o.status === 'PREPAID');
        const groups = new Map<string, AggregatedOrderGroup>();
        pickupOrders.forEach(order => {
            order.items.forEach(item => {
                const groupKey = `${order.userId}-${item.productId}-${item.itemId}-${order.status}`;
                const itemPrice = (item.unitPrice || 0) * item.quantity;

                if (groups.has(groupKey)) {
                    const existingGroup = groups.get(groupKey)!;
                    existingGroup.totalQuantity += item.quantity;
                    existingGroup.totalPrice += itemPrice;
                    existingGroup.originalOrders.push({ orderId: order.id, quantity: item.quantity, status: order.status });
                } else {
                    groups.set(groupKey, {
                        groupKey, customerInfo: order.customerInfo, item,
                        totalQuantity: item.quantity,
                        totalPrice: itemPrice,
                        status: order.status, pickupDate: order.pickupDate, pickupDeadlineDate: order.pickupDeadlineDate,
                        originalOrders: [{ orderId: order.id, quantity: item.quantity, status: order.status }]
                    });
                }
            });
        });

        const sortedGroups = Array.from(groups.values()).sort((a, b) => {
            const dateA = convertToDate(a.pickupDate)?.getTime() || 0;
            const dateB = convertToDate(b.pickupDate)?.getTime() || 0;
            return dateA - dateB;
        });

        return sortedGroups;
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

    const handleStatusUpdate = (status: OrderStatus) => {
        if (selectedGroupKeys.length === 0) return;
        const orderIdsToUpdate = selectedGroups.flatMap(g => g.originalOrders.map(o => o.orderId));
        
        const updates: { pickup?: number; noshow?: number; points?: number } = {};
        const messages = { loading: '상태 변경 중...', success: '상태가 변경되었습니다.', error: '상태 변경 실패' };

        const calculatePoints = () => selectedGroups.reduce((sum, g) => sum + g.totalPrice, 0) * 0.01;

        if (status === 'PICKED_UP') {
            updates.pickup = selectedGroupKeys.length;
            updates.points = Math.round(calculatePoints());
        } else if (status === 'NO_SHOW') {
            updates.noshow = selectedGroupKeys.length;
            updates.points = -Math.round(calculatePoints()); 
        }

        performAction(
            () => updateMultipleOrderStatuses(orderIdsToUpdate, status),
            () => onStatUpdate(updates),
            () => onStatUpdate({
                pickup: -(updates.pickup || 0),
                noshow: -(updates.noshow || 0),
                points: -(updates.points || 0),
            }),
            () => { setSelectedGroupKeys([]); onActionSuccess(); },
            messages
        );
    };

    const handleCancelOrder = () => {
        if (selectedGroupKeys.length === 0) return;

        const firstOrder = orders.find(o => o.id === selectedGroups[0].originalOrders[0].orderId);
        if (!firstOrder) return;

        // [핵심 수정] 새로운 페널티 규칙 로직
        const now = new Date();
        const pickupJsDate = convertToDate(firstOrder.pickupDate);
        let isPenaltyCancellation = false;

        if (pickupJsDate) {
            const pickupDay = new Date(pickupJsDate);
            pickupDay.setHours(0, 0, 0, 0);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 픽업일이 오늘이고,
            if (pickupDay.getTime() === today.getTime()) {
                // 현재 시간이 오후 1시(13시) 이전이라면 페널티 대상
                if (now.getHours() < 13) {
                    isPenaltyCancellation = true;
                }
            }
        }
        
        const penaltyType = isPenaltyCancellation ? 'late' : 'none';
        
        const updates = { 
            noshow: penaltyType === 'late' ? 0.5 * selectedGroupKeys.length : 0,
            // 백엔드 callable/orders.ts의 POINT_POLICIES.LATE_CANCEL_PENALTY.points 값과 일치시켜야 합니다.
            points: penaltyType === 'late' ? -50 * selectedGroupKeys.length : 0 
        };
        const orderIdsToCancel = selectedGroups.flatMap(g => g.originalOrders.map(o => o.orderId));

        const cancelPromises = orderIdsToCancel.map(orderId => cancelOrder(orderId, { penaltyType }));
        
        performAction(
            () => Promise.all(cancelPromises),
            () => onStatUpdate(updates),
            () => onStatUpdate({ noshow: -(updates.noshow || 0), points: -(updates.points || 0) }),
            () => { setSelectedGroupKeys([]); onActionSuccess(); },
            { 
                loading: '주문 취소 중...', 
                success: penaltyType === 'late' ? '주문이 취소되고 페널티가 적용되었습니다.' : '주문이 취소되었습니다.', 
                error: '취소 실패' 
            }
        );
    };

    const handleTableStatusChange = (order: Order) => {
        const originalStatus = order.status;
        const updates: { pickup?: number; noshow?: number; points?: number } = {};

        const pointChange = Math.round((order.totalPrice || 0) * 0.01);

        if (originalStatus === 'PICKED_UP') {
            updates.pickup = -1;
            updates.points = -pointChange;
        } else if (originalStatus === 'NO_SHOW') {
            updates.noshow = -1;
            updates.points = pointChange;
        } else if (originalStatus === 'LATE_CANCELED') {
            // [추가] 페널티 취소 복구 로직
            updates.noshow = -0.5;
            updates.points = 50; // 페널티로 차감된 50포인트 복구
        }

        performAction(
            // [수정] 새로운 백엔드 함수 호출
            () => revertFinalizedOrder(order.id, originalStatus),
            () => onStatUpdate(updates),
            () => onStatUpdate({
                pickup: -(updates.pickup || 0),
                noshow: -(updates.noshow || 0),
                points: -(updates.points || 0),
            }),
            onActionSuccess,
            { loading: '상태를 되돌리는 중...', success: '예약 상태로 되돌렸습니다.', error: '되돌리기에 실패했습니다.' }
        );
    };
    
    const handleDelete = () => {
        if (selectedGroupKeys.length === 0) return;
        const orderIdsToDelete = selectedGroups.flatMap(g => g.originalOrders.map(o => o.orderId));
        performAction(
            () => deleteMultipleOrders(orderIdsToDelete),
            () => {},
            () => {},
            () => { setSelectedGroupKeys([]); onActionSuccess(); },
            { loading: '주문 삭제 중...', success: '삭제되었습니다.', error: '삭제 실패' }
        );
    };

    const handleSplit = () => {
        if (!splitInfo) return;
        const performSplitAction = (remainingStatus: OrderStatus) => {
            const orderIdToSplit = splitInfo.group.originalOrders[0].orderId;
            const pointChange = Math.round(splitInfo.group.item.unitPrice * splitInfo.newQuantity * 0.01);

            const updates: { pickup?: number; noshow?: number; points?: number } = { pickup: 1, points: pointChange };
            if (remainingStatus === 'NO_SHOW') {
                updates.noshow = 1;
            }

            performAction(
                () => splitAndUpdateOrderStatus(orderIdToSplit, splitInfo.newQuantity, remainingStatus),
                () => onStatUpdate(updates),
                () => onStatUpdate({ pickup: -(updates.pickup || 0), noshow: -(updates.noshow || 0), points: -(updates.points || 0) }),
                onActionSuccess,
                { loading: '분할 처리 중...', success: '분할 처리가 완료되었습니다.', error: '분할 처리 실패' }
            );
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

    const handleSplitOrder = (orderId: string) => {
        toast.custom((t) => (
            <div className="confirmation-toast-content">
              <AlertTriangle size={44} className="toast-icon" style={{ color: 'var(--warning-color)' }} />
              <h4>주문 분할 확인</h4>
              <p>이 묶음 주문을 여러 개의 개별 주문으로 분할하시겠습니까? <br/><strong>원본 주문은 취소 처리됩니다.</strong></p>
              <div className="toast-buttons">
                <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>아니오</button>
                <button className="common-button button-warning button-medium" onClick={() => {
                    toast.dismiss(t.id);
                    const promise = splitBundledOrder(orderId);
                    toast.promise(promise, {
                        loading: '주문을 분할하는 중입니다...',
                        success: (res) => {
                            onActionSuccess();
                            return res.message;
                        },
                        error: (err) => err.message || '주문 분할에 실패했습니다.'
                    });
                }}>네, 분할합니다</button>
              </div>
            </div>
          ), { id: 'split-order-confirmation', duration: Infinity, style: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 } });
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'pickup':
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                return (
                    <div className="qcp-results-grid">
                        {aggregatedPickupOrders.map(group => {
                            const pickupJsDate = convertToDate(group.pickupDate);
                            const isFuture = pickupJsDate ? pickupJsDate > today : false;

                            return (
                                <QuickCheckOrderCard
                                    key={group.groupKey}
                                    group={group}
                                    isSelected={selectedGroupKeys.includes(group.groupKey)}
                                    onSelect={handleSelectGroup}
                                    onQuantityChange={handleQuantityChange}
                                    isFuture={isFuture}
                                />
                            );
                        })}
                        {aggregatedPickupOrders.length === 0 && <p className="no-data-message">처리 대기중인 항목이 없습니다.</p>}
                    </div>
                );
            case 'history':
                return <ActionableOrderTable orders={orders} onStatusChange={handleTableStatusChange} onSplitOrder={handleSplitOrder} />;
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
                    <button onClick={handleCancelOrder} className="common-button button-cancel"><XCircle size={16} /> 취소</button>
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