// src/components/admin/QuickCheckOrderCard.tsx

import React, { useState, useEffect } from 'react';
import type { OrderStatus, OrderItem, AggregatedOrderGroup } from '@/types';
import toast from 'react-hot-toast';
import { MinusCircle, PlusCircle, CheckSquare } from 'lucide-react';
import './QuickCheckOrderCard.css';
import { formatKRW } from '@/utils/number';

interface OrderCardProps {
  group: AggregatedOrderGroup;
  onSelect: (groupKey: string) => void;
  isSelected: boolean;
  onQuantityChange: (group: AggregatedOrderGroup, newQuantity: number) => void;
  isFuture: boolean; // ✅ [추가] 미래 입고 상품 여부를 받는 prop
}

// 개별 품목 행: 수량 편집 UX/에러 처리 강화
const CardItemRow: React.FC<{
  item: OrderItem;
  totalQuantity: number;
  onUpdateQuantity: (newQuantity: number) => void;
}> = ({ item, totalQuantity, onUpdateQuantity }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentQuantity, setCurrentQuantity] = useState<string>(String(totalQuantity));

  useEffect(() => {
    setCurrentQuantity(String(totalQuantity));
  }, [totalQuantity]);

  const handleUpdate = () => {
    setIsEditing(false);
    const newQuantity = parseInt(currentQuantity, 10);
    if (isNaN(newQuantity) || newQuantity <= 0) {
      toast.error('유효한 수량을 입력해주세요.');
      setCurrentQuantity(String(totalQuantity));
      onUpdateQuantity(totalQuantity);
      return;
    }
    if (newQuantity !== totalQuantity) onUpdateQuantity(newQuantity);
  };

  const handleQuantityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

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

// 메인 카드
const QuickCheckOrderCard: React.FC<OrderCardProps> = ({ group, onSelect, isSelected, onQuantityChange, isFuture }) => {
  const { groupKey, status, item, totalPrice, customerInfo, pickupDate, pickupDeadlineDate, totalQuantity } = group;

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
    };
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

  const arrivalDate = pickupDate;
  const deadlineDate = pickupDeadlineDate ?? pickupDate;
  const isSingleDayPickup = isSameDay(arrivalDate, deadlineDate);

  const handleItemQuantityUpdate = (newQuantity: number) => {
    onQuantityChange(group, newQuantity);
  };

  return (
    // ✅ [수정] isFuture 값에 따라 'is-future' 클래스를 동적으로 추가합니다.
    <div className={`qc-order-card ${isSelected ? 'selected' : ''} ${getStatusClassName(status)} ${isFuture ? 'is-future' : ''}`} onClick={() => onSelect(groupKey)}>
      {/* ✅ [추가] isFuture가 true일 때만 '입고 예정' 배지를 표시합니다. */}
      {isFuture && <div className="qco-future-badge">입고 예정</div>}

      {isSelected && (
        <div className="qco-checkmark">
          <CheckSquare size={24} />
        </div>
      )}

      <div className="qco-top-row">
        {isSingleDayPickup ? (
          <span className="today">🔥 {formatDate(arrivalDate)} 당일픽업</span>
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
        <span className="qco-total-price">{formatKRW(totalPrice)}원</span>
      </div>
    </div>
  );
};

export default QuickCheckOrderCard;