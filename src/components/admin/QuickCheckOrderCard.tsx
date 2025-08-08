// src/components/admin/QuickCheckOrderCard.tsx

import React, { useState, useEffect } from 'react';
import type { OrderStatus, OrderItem, AggregatedOrderGroup } from '@/types';
import toast from 'react-hot-toast';
import { MinusCircle, PlusCircle, CheckSquare } from 'lucide-react';
import './QuickCheckOrderCard.css';

interface OrderCardProps {
  group: AggregatedOrderGroup;
  onSelect: (groupKey: string) => void;
  isSelected: boolean;
  onQuantityChange: (group: AggregatedOrderGroup, newQuantity: number) => void;
}

// CardItemRow 컴포넌트: 수량 편집 로직 개선
const CardItemRow: React.FC<{
  item: OrderItem;
  totalQuantity: number;
  onUpdateQuantity: (newQuantity: number) => void;
}> = ({ item, totalQuantity, onUpdateQuantity }) => {
  const [isEditing, setIsEditing] = useState(false);
  // ✅ [버그 수정 1] 수량 상태를 문자열로 관리하여 빈 값 입력을 허용
  const [currentQuantity, setCurrentQuantity] = useState<string>(String(totalQuantity));

  useEffect(() => {
    // 부모 컴포넌트로부터 받은 수량이 변경되면 내부 상태도 동기화
    setCurrentQuantity(String(totalQuantity));
  }, [totalQuantity]);

  const handleUpdate = () => {
    setIsEditing(false);
    const newQuantity = parseInt(currentQuantity, 10);
    // 유효성 검사: 숫자가 아니거나, 0 이하이거나, 원래 수량과 같으면 변경하지 않음
    if (isNaN(newQuantity) || newQuantity <= 0) {
      toast.error("유효한 수량을 입력해주세요.");
      setCurrentQuantity(String(totalQuantity)); // 원래 수량으로 복원
      onUpdateQuantity(totalQuantity); // 부모에게도 원상 복귀 알림
      return;
    }

    if (newQuantity !== totalQuantity) {
      onUpdateQuantity(newQuantity);
    }
  };
  
  const handleQuantityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  // ✅ [버그 수정 2] +/- 버튼 이벤트가 부모로 전파되는 것을 확실히 막고, 즉시 반영
  const adjustQuantity = (e: React.MouseEvent, amount: number) => {
    e.stopPropagation();
    const newQuantity = Math.max(1, parseInt(currentQuantity || '0', 10) + amount);
    setCurrentQuantity(String(newQuantity));
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };
  
  const getFullItemName = (item: OrderItem) => {
    let name = item.productName || '';
    if (item.variantGroupName && item.variantGroupName !== item.productName) name += ` - ${item.variantGroupName}`;
    if (item.itemName) name += ` (${item.itemName})`;
    return name;
  };

  return (
    <div className="qco-item" onClick={(e) => e.stopPropagation()}>
      <span className="qco-item-name" title={getFullItemName(item)}>{getFullItemName(item)}</span>
      {isEditing ? (
        <div className="qco-qty-editor" onClick={handleInputClick}>
          <button type="button" onClick={(e) => adjustQuantity(e, -1)}><MinusCircle size={18} /></button>
          <input
            type="number"
            className="qco-qty-input"
            value={currentQuantity}
            // ✅ [버그 수정 1] 빈 값 입력을 위해 로직 변경
            onChange={(e) => setCurrentQuantity(e.target.value)}
            onBlur={handleUpdate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setCurrentQuantity(String(totalQuantity));
              }
            }}
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


// QuickCheckOrderCard 컴포넌트: 주요 로직은 동일
const QuickCheckOrderCard: React.FC<OrderCardProps> = ({ group, onSelect, isSelected, onQuantityChange }) => {
  const { groupKey, status, item, totalPrice, customerInfo, pickupDate, pickupDeadlineDate, totalQuantity } = group;
  
  const formatDate = (timestamp: any): string => { /* ... (이하 동일) ... */
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

  const isSameDay = (date1: any, date2: any): boolean => { /* ... (이하 동일) ... */
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

  const getStatusClassName = (status: OrderStatus): string => { /* ... (이하 동일) ... */
      switch (status) {
        case 'PICKED_UP': return 'bg-picked-up-strong';
        case 'PREPAID': return 'bg-prepaid-strong';
        case 'NO_SHOW': return 'bg-noshow-strong';
        case 'CANCELED': return 'bg-canceled';
        default: return 'bg-default';
      }
  };

  const arrivalDate = pickupDate;
  const deadlineDate = pickupDeadlineDate ?? pickupDate;
  const isSingleDayPickup = isSameDay(arrivalDate, deadlineDate);

  const handleItemQuantityUpdate = (newQuantity: number) => {
    onQuantityChange(group, newQuantity);
  };

  return (
    <div
      className={`qc-order-card ${isSelected ? 'selected' : ''} ${getStatusClassName(status)}`}
      onClick={() => onSelect(groupKey)}
    >
      {isSelected && (
        <div className="qco-checkmark">
          <CheckSquare size={24} />
        </div>
      )}

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
            onUpdateQuantity={handleItemQuantityUpdate}
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