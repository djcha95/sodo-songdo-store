// src/components/admin/QuickCheckOrderCard.tsx

import React, { useState } from 'react';
import type { OrderStatus, OrderItem, AggregatedOrderGroup } from '@/types';
import toast from 'react-hot-toast';
import { MinusCircle, PlusCircle } from 'lucide-react';
import './QuickCheckOrderCard.css';

interface OrderCardProps {
  group: AggregatedOrderGroup;
  onSelect: (groupKey: string) => void;
  isSelected: boolean;
  onQuantityChange: (orderId: string, itemId: string, newQuantity: number) => void;
}

const formatDate = (timestamp: any): string => {
  if (!timestamp) return '미지정';
  let date: Date;
  if (typeof timestamp.toDate === 'function') date = timestamp.toDate();
  else if (typeof timestamp.seconds === 'number') date = new Date(timestamp.seconds * 1000);
  else return '형식 오류';
  if (isNaN(date.getTime())) return '날짜 오류';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${month}/${day}(${dayOfWeek})`;
};

const isSameDay = (date1: any, date2: any): boolean => {
    const toJsDate = (ts: any): Date | null => {
        if (!ts) return null;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
        return null;
    }
    const d1 = toJsDate(date1);
    const d2 = toJsDate(date2);
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const getStatusClassName = (status: OrderStatus): string => {
    switch (status) {
      case 'PICKED_UP': return 'bg-picked-up-strong';
      case 'PREPAID': return 'bg-prepaid-strong';
      case 'NO_SHOW': return 'bg-noshow-strong';
      case 'CANCELED': return 'bg-canceled';
      default: return 'bg-default';
    }
};

const CardItemRow: React.FC<{
  item: OrderItem;
  totalQuantity: number;
  onQuantityChange: (newQuantity: number) => void;
}> = ({ item, totalQuantity, onQuantityChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentQuantity, setCurrentQuantity] = useState(totalQuantity);

  const handleUpdate = () => {
    setIsEditing(false);
    if (currentQuantity !== totalQuantity) {
        if(currentQuantity <= 0) {
            toast.error("수량은 1 이상이어야 합니다.");
            setCurrentQuantity(totalQuantity);
            return;
        }
        onQuantityChange(currentQuantity);
    }
  };

  const getFullItemName = (item: OrderItem) => {
    let name = item.productName || '';
    if (item.variantGroupName && item.variantGroupName !== item.productName) name += ` - ${item.variantGroupName}`;
    if (item.itemName) name += ` (${item.itemName})`;
    return name;
  };
  
  const handleQuantityClick = (e: React.MouseEvent) => {
      e.stopPropagation(); 
      setIsEditing(true);
  }

  const adjustQuantity = (e: React.MouseEvent, amount: number) => {
    e.stopPropagation();
    const newQuantity = Math.max(1, currentQuantity + amount);
    setCurrentQuantity(newQuantity);
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="qco-item">
      <span className="qco-item-name">{getFullItemName(item)}</span>
      {isEditing ? (
        <div className="qco-qty-editor" onClick={handleInputClick}>
            <button type="button" onClick={(e) => adjustQuantity(e, -1)}><MinusCircle size={18} /></button>
            <input
              type="number"
              className="qco-qty-input"
              value={currentQuantity}
              onChange={(e) => setCurrentQuantity(parseInt(e.target.value, 10) || 1)}
              onBlur={handleUpdate}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
              autoFocus
            />
            <button type="button" onClick={(e) => adjustQuantity(e, 1)}><PlusCircle size={18} /></button>
        </div>
      ) : (
        <span className="qco-item-qty" onClick={handleQuantityClick} title="수량 클릭하여 수정">
          {totalQuantity}개
        </span>
      )}
    </div>
  );
};

const QuickCheckOrderCard: React.FC<OrderCardProps> = ({ group, onSelect, isSelected, onQuantityChange }) => {
  const { groupKey, status, item, totalPrice, customerInfo, pickupDate, pickupDeadlineDate, totalQuantity, originalOrders } = group;
  
  const arrivalDate = pickupDate;
  const deadlineDate = pickupDeadlineDate ?? pickupDate;
  const isSingleDayPickup = isSameDay(arrivalDate, deadlineDate);
  
  const representativeOrderId = originalOrders.length > 0 ? originalOrders[0].orderId : '';

  return (
    <div
      className={`qc-order-card ${isSelected ? 'selected' : ''} ${getStatusClassName(status)}`}
      onClick={() => onSelect(groupKey)}
    >
      <div className="qco-top-row">
        {isSingleDayPickup ? (
            <span className='today'>🔥 {formatDate(arrivalDate)} 당일픽업</span>
        ) : (
            <>
                <span>{formatDate(arrivalDate)} 입고</span>
                <span>{formatDate(deadlineDate)} 마감</span>
            </>
        )}
      </div>

      <div className="qco-body">
          <CardItemRow 
            item={item}
            totalQuantity={totalQuantity}
            onQuantityChange={(newQuantity) => {
              // 그룹화된 경우, 어떤 주문의 수량을 바꿀지 결정하는 로직이 필요.
              // 여기서는 일단 첫 번째 주문의 수량을 변경하는 것으로 단순화합니다.
              if (representativeOrderId) {
                onQuantityChange(representativeOrderId, item.itemId, newQuantity);
              } else {
                toast.error("수량을 변경할 주문 정보를 찾을 수 없습니다.");
              }
            }}
          />
      </div>

      <div className="qco-bottom-row">
        <span className="qco-customer-name" title={`전화번호: ${customerInfo.phone}`}>{customerInfo.name}</span>
        <span className="qco-total-price">{totalPrice.toLocaleString()}원</span>
      </div>
    </div>
  );
};

export default QuickCheckOrderCard;