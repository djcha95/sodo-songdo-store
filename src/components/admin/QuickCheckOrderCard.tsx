// src/components/admin/QuickCheckOrderCard.tsx

import React, { useMemo, useState } from 'react';
import type { AggregatedOrderGroup, OrderStatus } from '@/types';
// ✅ [수정] 사용하지 않는 toast와 OrderItem import를 제거했습니다.
import { Minus, Plus, Calendar, CheckCircle, Clock, DollarSign, PackageCheck, PackageX, UserX, AlertCircle } from 'lucide-react';
import useLongPress from '@/hooks/useLongPress';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import './QuickCheckOrderCard.css';
import { Timestamp } from 'firebase/firestore'; // Timestamp 타입을 import 합니다.

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; className: string }> = {
    PICKED_UP: { label: '픽업 완료', icon: <PackageCheck size={14} />, className: 'status-picked-up' },
    PREPAID: { label: '선입금', icon: <DollarSign size={14} />, className: 'status-prepaid' },
    RESERVED: { label: '예약', icon: <Clock size={14} />, className: 'status-reserved' },
    NO_SHOW: { label: '노쇼', icon: <UserX size={14} />, className: 'status-no-show' },
    CANCELED: { label: '취소', icon: <PackageX size={14} />, className: 'status-canceled' },
    COMPLETED: { label: '처리 완료', icon: <CheckCircle size={14} />, className: 'status-completed' },
};

interface QuickCheckOrderCardProps {
    group: AggregatedOrderGroup;
    isSelected: boolean;
    onSelect: (groupKey: string) => void;
    onQuantityChange: (orderId: string, itemId: string, newQuantity: number) => void;
}

const QuantityInput: React.FC<{
    orderId: string;
    itemId: string;
    quantity: number;
    onUpdate: (orderId: string, itemId: string, newQuantity: number) => void;
}> = ({ orderId, itemId, quantity, onUpdate }) => {
    const [currentQuantity, setCurrentQuantity] = useState(quantity);
    
    const handleUpdate = (newQuantity: number) => {
        const finalQuantity = Math.max(1, newQuantity);
        setCurrentQuantity(finalQuantity);
        onUpdate(orderId, itemId, finalQuantity);
    };

    const createQuantityHandlers = (delta: number) => {
        const performUpdate = () => handleUpdate(currentQuantity + delta);
        return useLongPress(performUpdate, performUpdate, { delay: 100 });
    };

    const decreaseHandlers = createQuantityHandlers(-1);
    const increaseHandlers = createQuantityHandlers(1);

    return (
        <div className="qcp-quantity-controls" onClick={(e) => e.stopPropagation()}>
            <button {...decreaseHandlers} className="qcp-quantity-btn" disabled={currentQuantity <= 1}>
                <Minus size={16} />
            </button>
            <span className="qcp-quantity-display">{currentQuantity}</span>
            <button {...increaseHandlers} className="qcp-quantity-btn">
                <Plus size={16} />
            </button>
        </div>
    );
};


const QuickCheckOrderCard: React.FC<QuickCheckOrderCardProps> = ({ group, isSelected, onSelect, onQuantityChange }) => {
    const statusInfo = useMemo(() => {
        const now = new Date();
        // ✅ [수정] pickupDeadlineDate가 Timestamp 객체인지 확인하고 .toDate()를 호출합니다.
        const pickupDeadline = group.pickupDeadlineDate instanceof Timestamp ? group.pickupDeadlineDate.toDate() : group.pickupDeadlineDate;
        if ((group.status === 'RESERVED' || group.status === 'PREPAID') && pickupDeadline && pickupDeadline < now) {
            return { label: '미수령(노쇼)', icon: <AlertCircle size={14} />, className: 'status-no-show' };
        }
        return STATUS_CONFIG[group.status] || { label: group.status, icon: null, className: '' };
    }, [group.status, group.pickupDeadlineDate]);

    const handleCardClick = () => {
        onSelect(group.groupKey);
    };

    // ✅ [수정] pickupDate가 Timestamp 객체인지 확인하고 .toDate()를 호출합니다.
    const pickupDate = group.pickupDate instanceof Timestamp ? group.pickupDate.toDate() : group.pickupDate;

    return (
        <div className={`qcp-order-card ${isSelected ? 'selected' : ''} ${statusInfo.className}`} onClick={handleCardClick}>
            <div className="qcp-card-header">
                <div className="qcp-customer-info">
                    <span className="qcp-customer-name">{group.customerInfo.name}</span>
                    <span className="qcp-customer-phone">{group.customerInfo.phone?.slice(-4)}</span>
                </div>
                <div className={`qcp-status-badge ${statusInfo.className}`}>
                    {statusInfo.icon}
                    {statusInfo.label}
                </div>
            </div>

            <div className="qcp-card-body">
                <div className="qcp-item-image">
                    <img src={getOptimizedImageUrl(group.item.imageUrl, '200x200')} alt={group.item.itemName} />
                </div>
                <div className="qcp-item-details">
                    <p className="qcp-item-name" title={group.item.itemName}>
                        {group.item.itemName}
                    </p>
                    <p className="qcp-item-price">
                        {group.totalPrice.toLocaleString()}원
                    </p>
                </div>
            </div>

            <div className="qcp-card-footer">
                <div className="qcp-pickup-info">
                    <Calendar size={14} />
                    {pickupDate ? pickupDate.toLocaleDateString('ko-KR') : '날짜 미정'}
                </div>
                {group.originalOrders.length > 1 ? (
                    <div className="qcp-quantity-display-static">
                        {group.totalQuantity}개
                    </div>
                ) : (
                    <QuantityInput
                        orderId={group.originalOrders[0].orderId}
                        itemId={group.item.itemId}
                        quantity={group.totalQuantity}
                        onUpdate={onQuantityChange}
                    />
                )}
            </div>
        </div>
    );
};

export default QuickCheckOrderCard;