// src/pages/admin/PickupProcessingPage.tsx

import React, { useState } from 'react';
// ✅ [수정] updateMultipleOrderStatuses 함수 import
import { searchOrdersByPhoneNumber, updateMultipleOrderStatuses } from '../../firebase';
import type { Order, OrderItem, OrderStatus } from '../../types';
import { Search, Phone, CheckCircle, XCircle, DollarSign, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

// 개별 주문 상품 아이템을 표시하는 컴포넌트
interface OrderItemDisplayProps {
  item: OrderItem;
}

const OrderItemDisplay: React.FC<OrderItemDisplayProps> = ({ item }) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: '1px dashed #eee'
    }}>
      {/* ✅ [수정] item.name -> item.productName 으로 변경 */}
      <span>{item.productName} ({item.itemName})</span>
      <span>{item.quantity}개</span>
    </div>
  );
};

// 주문 카드 컴포넌트
interface OrderCardProps {
  order: Order;
  onSelect: (orderId: string) => void;
  isSelected: boolean;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onSelect, isSelected }) => {
  const {
    id,
    status,
    createdAt, // ✅ [수정] orderDate -> createdAt
    customerInfo, // ✅ [수정] customerName -> customerInfo
    pickupDate,
    items = [],
    totalPrice
  } = order;
  
  // ✅ [수정] status 값을 OrderStatus 타입에 맞게 변경
  const statusColor = (statusValue: OrderStatus) => {
    switch (statusValue) {
      case 'PREPAID': return '#fffbe6';
      case 'RESERVED': return '#e3f2fd';
      case 'PICKED_UP': return '#e8f5e9';
      case 'CANCELED': return '#ffebee';
      case 'NO_SHOW': return '#fce4ec';
      default: return 'white';
    }
  };

  const statusText = (statusValue: OrderStatus) => {
    switch (statusValue) {
      case 'PREPAID': return '결제 완료';
      case 'RESERVED': return '예약';
      case 'PICKED_UP': return '픽업 완료';
      case 'CANCELED': return '취소';
      case 'NO_SHOW': return '노쇼';
      default: return '알 수 없음';
    }
  };

  return (
    <div
      style={{
        backgroundColor: statusColor(status),
        border: isSelected ? '2px solid #007bff' : '2px solid transparent',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        width: '90%',
        minWidth: '280px',
        maxWidth: '300px',
        userSelect: 'none',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
      onClick={() => onSelect(id)}
    >
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#333' }}>
          {/* ✅ [수정] createdAt으로 날짜 표시 */}
          <span>주문일: {createdAt ? new Date((createdAt as any).seconds * 1000).toLocaleDateString() : '날짜 없음'}</span>
          <span style={{ fontWeight: 'bold', color: '#007bff' }}>{statusText(status)}</span>
        </div>
        {/* ✅ [수정] customerInfo.name으로 이름 표시 */}
        <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '10px 0 5px' }}>{customerInfo.name} 님</h3>
        <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '10px' }}>
          픽업 예정일: {pickupDate ? new Date(pickupDate.seconds * 1000).toLocaleDateString() : '미정'}
        </div>
        <div style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
           {/* ✅ [수정] item.id -> item.itemId 로 키 변경 */}
          {items.map((item: OrderItem, index: number) => (
            <OrderItemDisplay key={item.itemId || index} item={item} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333' }}>총 {totalPrice.toLocaleString()}원</span>
      </div>
    </div>
  );
};

const PickupProcessingPage: React.FC = () => {
  const [phoneNumberLast4, setPhoneNumberLast4] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumberLast4.length < 2 || phoneNumberLast4.length > 4) {
      toast.error('전화번호 뒷 2~4자리를 입력해주세요.');
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setSelectedOrderIds([]);

    try {
      const results = await searchOrdersByPhoneNumber(phoneNumberLast4);
      if (results.length === 0) {
        toast('검색 결과가 없습니다.', { icon: '🔍' });
      } else {
        toast.success(`${results.length}건의 주문을 찾았습니다!`);
      }
      setSearchResults(results);
    } catch (error) {
      console.error("주문 검색 중 오류 발생:", error);
      toast.error('주문 검색 중 오류가 발생했습니다. 다시 시도해주세요.');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };
  
  // ✅ [수정] 여러 주문을 한 번에 업데이트하는 로직으로 변경
  const handleStatusUpdate = async (status: OrderStatus) => {
    if (selectedOrderIds.length === 0) {
      toast.error('처리할 주문을 선택해주세요.');
      return;
    }

    const updatePromise = new Promise<void>(async (resolve, reject) => {
      try {
        await updateMultipleOrderStatuses(selectedOrderIds, status);
        const results = await searchOrdersByPhoneNumber(phoneNumberLast4);
        setSearchResults(results);
        setSelectedOrderIds([]);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    const statusTextMap = { 'PICKED_UP': '픽업 완료', 'CANCELED': '취소', 'PREPAID': '결제 완료' };
    const successText = `${selectedOrderIds.length}개 주문이 '${statusTextMap[status] || status}' 처리되었습니다!`;


    toast.promise(updatePromise, {
      loading: '주문 상태 변경 중...',
      success: successText,
      error: '주문 상태 변경 중 오류가 발생했습니다. 다시 시도해주세요.',
    });
  };

  const totalPrice = searchResults
    .filter((order: Order) => selectedOrderIds.includes(order.id))
    .reduce((sum: number, order: Order) => sum + order.totalPrice, 0);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '20px' }}>
        빠른 픽업 처리
      </h1>
      <form onSubmit={handleSearch} style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '300px' }}>
          <Phone size={20} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="tel"
            value={phoneNumberLast4}
            onChange={(e) => setPhoneNumberLast4(e.target.value)}
            placeholder="전화번호 뒷 4자리"
            pattern="[0-9]*"
            maxLength={4}
            style={{
              width: '100%',
              padding: '10px 10px 10px 40px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '1rem',
            }}
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
          disabled={isLoading}
        >
          {isLoading ? <Loader size={20} className="spin" /> : <Search size={20} />}
          <span>조회</span>
        </button>
      </form>

      {isLoading && searchResults.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <Loader size={30} className="spin" />
        </div>
      )}

      {searchResults.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', justifyContent: 'center', paddingBottom: '100px' }}>
            {searchResults.map((order: Order) => (
              <OrderCard
                key={order.id}
                order={order}
                onSelect={handleSelectOrder}
                isSelected={selectedOrderIds.includes(order.id)}
              />
            ))}
          </div>

          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              width: '100%',
              backgroundColor: 'white',
              padding: '10px 20px',
              boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxSizing: 'border-box',
              gap: '10px',
              zIndex: 1000,
            }}
          >
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', flexShrink: 0 }}>
              총 {totalPrice.toLocaleString()}원
            </span>
            <div style={{ display: 'flex', flexGrow: 1, gap: '5px' }}>
              {/* ✅ [수정] status 값을 OrderStatus 타입에 맞게 변경 */}
              <button
                onClick={() => handleStatusUpdate('PREPAID')}
                style={{ backgroundColor: '#ffc107', color: 'white', height: '50px', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', flexGrow: 1, cursor: 'pointer', border: 'none' }}
                disabled={selectedOrderIds.length === 0 || isLoading}
              >
                <DollarSign size={20} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                결제 완료
              </button>
              <button
                onClick={() => handleStatusUpdate('CANCELED')}
                style={{ backgroundColor: '#dc3545', color: 'white', height: '50px', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', flexGrow: 1, cursor: 'pointer', border: 'none' }}
                disabled={selectedOrderIds.length === 0 || isLoading}
              >
                <XCircle size={20} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                취소 처리
              </button>
              <button
                onClick={() => handleStatusUpdate('PICKED_UP')}
                style={{ backgroundColor: '#007bff', color: 'white', height: '50px', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', flexGrow: 1, cursor: 'pointer', border: 'none' }}
                disabled={selectedOrderIds.length === 0 || isLoading}
              >
                <CheckCircle size={20} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                픽업 완료
              </button>
            </div>
          </div>
        </>
      )}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default PickupProcessingPage;