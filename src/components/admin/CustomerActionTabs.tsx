// src/components/admin/CustomerActionTabs.tsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Timestamp } from 'firebase/firestore';
import type { 
    UserDocument, 
    Order, 
    OrderItem, 
    LoyaltyTier, 
    OrderStatus,
    UniversalTimestamp,
    AggregatedOrderGroup 
} from '@/shared/types';
import QuickCheckOrderCard from './QuickCheckOrderCard';
import QuickCheckReviewCard from './QuickCheckReviewCard';
import { getReviewsByUserId } from '@/firebase/reviewService';
import type { Review } from '@/shared/types';
import {
    updateMultipleOrderStatuses,
    deleteMultipleOrders,
    splitBundledOrder,
    cancelOrder,
    revertFinalizedOrder
} from '@/firebase/orderService';
import { adjustUserCounts, setManualTierForUser } from '@/firebase/userService';
import { aggregateOrders } from '@/utils/orderAggregation'; 
import toast from 'react-hot-toast';
import { CheckCircle, DollarSign, XCircle, RotateCcw, Save, Shield, AlertTriangle, Undo2, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import './CustomerActionTabs.css';

interface CustomerActionTabsProps {
    user: UserDocument;
    orders: Order[];
    onStatUpdate: (updates: { pickup?: number; noshow?: number; points?: number }) => void;
    onActionSuccess: () => void;
    onMarkAsNoShow: (group: AggregatedOrderGroup) => void;
    reviewCount?: number;
}

const convertToDate = (date: UniversalTimestamp | Date | null | undefined): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date; 
    if ('toDate' in date && typeof date.toDate === 'function') return date.toDate();
    if ('_seconds' in date && typeof date._seconds === 'number') return date.toDate();
    return null; 
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
                    <option value="공구초보">공구초보</option>
                    <option value="공구제한">공구제한 (수동)</option>
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

type Tab = 'pickup' | 'history' | 'manage' | 'reviews';

const CustomerActionTabs: React.FC<CustomerActionTabsProps> = ({ 
    user, 
    orders = [], 
    onStatUpdate, 
    onActionSuccess,
    onMarkAsNoShow,
    reviewCount = 0
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('pickup');
    const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);

    // 리뷰 로드
    useEffect(() => {
        if (activeTab === 'reviews' && user.uid) {
            setReviewsLoading(true);
            getReviewsByUserId(user.uid)
                .then(setReviews)
                .catch((err) => {
                    console.error('리뷰 로드 실패:', err);
                    toast.error('리뷰를 불러오는데 실패했습니다.');
                })
                .finally(() => setReviewsLoading(false));
        }
    }, [activeTab, user.uid]);

    const handleSelectReview = useCallback((reviewId: string) => {
        setSelectedReviewIds(prev => prev.includes(reviewId) ? prev.filter(id => id !== reviewId) : [...prev, reviewId]);
    }, []);

    // Cloud Function 초기화
    const functions = getFunctions(getApp(), 'asia-northeast3');
    const updateOrderQuantityCallable = httpsCallable<
        { orderId: string; newQuantity: number },
        { success: boolean; message?: string }
    >(functions, 'updateOrderQuantity');

    const aggregatedPickupOrders = useMemo<AggregatedOrderGroup[]>(() => {
        const pickupOrders = orders.filter(o => o.status === 'RESERVED' || o.status === 'PREPAID');
        const groups = aggregateOrders(pickupOrders);
        return groups.sort((a, b) => {
            const dateA = convertToDate(a.pickupDate)?.getTime() || 0;
            const dateB = convertToDate(b.pickupDate)?.getTime() || 0;
            // 최신순 정렬 (내림차순)
            return dateB - dateA;
        });
    }, [orders]);

    const selectedGroups = useMemo(() =>
        aggregatedPickupOrders.filter(g => selectedGroupKeys.includes(g.groupKey)),
        [aggregatedPickupOrders, selectedGroupKeys]
    );

    const handleSelectGroup = useCallback((groupKey: string) => {
        setSelectedGroupKeys(prev => prev.includes(groupKey) ? prev.filter(key => key !== groupKey) : [...prev, groupKey]);
    }, []);

    // ✅ [수정] 수량 변경 시 즉시 Cloud Function 호출
    const handleQuantityChange = useCallback(
        (group: AggregatedOrderGroup, newQuantity: number) => {
            if (newQuantity <= 0) {
                toast.error('수량은 최소 1개 이상이어야 합니다.');
                return;
            }
            if (newQuantity === group.totalQuantity) {
                return;
            }
            // 레거시 중복 주문(문서 여러 개가 묶인 경우)은 여기서 처리 불가
            if (group.originalOrders.length > 1) {
                toast.error(
                    "여러 주문이 묶인 그룹은 여기에서 수량 변경이 어렵습니다.\n'전체 주문 내역' 탭에서 각각 주문을 수정해주세요."
                );
                return;
            }

            const orderId = group.originalOrders[0].orderId;
            const prevQty = group.totalQuantity;

            const ok = window.confirm(
                `${group.item.productName} 수량을 ${prevQty}개 → ${newQuantity}개로 변경할까요?\n(수량만 수정되며, 픽업 상태는 유지됩니다.)`
            );
            if (!ok) return;

            performAction(
                () => updateOrderQuantityCallable({ orderId, newQuantity }).then((res) => res.data),
                () => {}, // 통계 낙관적 업데이트 생략
                () => {},
                () => {
                    onActionSuccess();
                },
                {
                    loading: '수량 변경 중...',
                    success: '수량이 변경되었습니다.',
                    error: '수량 변경에 실패했습니다.',
                }
            );
        },
        [onActionSuccess, updateOrderQuantityCallable]
    );

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

        const firstOrderInGroup = selectedGroups[0];
        const orderToGetDate = orders.find(o => o.id === firstOrderInGroup.originalOrders[0].orderId);
        if (!orderToGetDate) return;

        const now = new Date();
        const pickupJsDate = convertToDate(orderToGetDate.pickupDate);
        let isPenaltyCancellation = false;
        
        const pickupDayStart = pickupJsDate ? new Date(pickupJsDate.setHours(0, 0, 0, 0)) : null;
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

        if (pickupDayStart && pickupDayStart.getTime() === todayStart.getTime()) {
            if (now.getHours() < 13) {
                isPenaltyCancellation = true;
            }
        }
        
        const penaltyType = isPenaltyCancellation ? 'late' : 'none';
        
        const updates = { 
            noshow: penaltyType === 'late' ? 0.5 * selectedGroupKeys.length : 0,
            points: penaltyType === 'late' ? -50 * selectedGroupKeys.length : 0 
        };
        const orderIdsToCancel = selectedGroups.flatMap(g => g.originalOrders.map(o => o.orderId));

        performAction(
            () => Promise.all(orderIdsToCancel.map(orderId => cancelOrder(orderId, { penaltyType }))),
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
            updates.noshow = -0.5;
            updates.points = 50;
        }

        performAction(
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
            case 'reviews':
                if (reviewsLoading) {
                    return <p className="no-data-message">리뷰를 불러오는 중...</p>;
                }
                return (
                    <div className="qcp-results-grid">
                        {reviews.map(review => (
                            <QuickCheckReviewCard
                                key={review.id}
                                review={review}
                                isSelected={selectedReviewIds.includes(review.id)}
                                onSelect={handleSelectReview}
                            />
                        ))}
                        {reviews.length === 0 && <p className="no-data-message">등록된 리뷰가 없습니다.</p>}
                    </div>
                );
            default:
                return null;
        }
    };

    const renderFooter = () => {
        if (activeTab !== 'pickup') return null;
        
        if (selectedGroupKeys.length === 0) return null;
        
        // 선택된 그룹 정보 계산
        const selectedGroupsList = aggregatedPickupOrders.filter(g => selectedGroupKeys.includes(g.groupKey));
        const totalSelectedPrice = selectedGroupsList.reduce((sum, g) => sum + g.totalPrice, 0);
        
        // 모든 선택된 항목이 '선입금' 상태인지 체크
        const allSelectedArePrepaid = selectedGroupsList.length > 0 && selectedGroupsList.every(g => g.originalOrders.every(o => o.status === 'PREPAID'));

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
                    <button onClick={() => handleStatusUpdate('NO_SHOW')} className="common-button button-danger">
                        <AlertTriangle size={16} /> 노쇼
                    </button>
                    <button onClick={handleCancelOrder} className="common-button button-secondary">
                        <XCircle size={16} /> 취소
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="cat-container">
            <div className="cat-tab-navigation">
                <button className={activeTab === 'pickup' ? 'active' : ''} onClick={() => setActiveTab('pickup')}>픽업 카드 ({aggregatedPickupOrders.length})</button>
                <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>전체 주문 내역 ({orders.length})</button>
                <button className={activeTab === 'reviews' ? 'active' : ''} onClick={() => setActiveTab('reviews')}>리뷰 ({reviewCount})</button>
                <button className={activeTab === 'manage' ? 'active' : ''} onClick={() => setActiveTab('manage')}>신뢰도 관리</button>
            </div>
            <div className={`cat-tab-content ${activeTab === 'pickup' || activeTab === 'reviews' ? 'is-grid-view' : ''}`}>
                {renderTabContent()}
            </div>
            {renderFooter()}
        </div>
    );
};

export default CustomerActionTabs;