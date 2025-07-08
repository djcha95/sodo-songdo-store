// src/components/admin/ProductArrivalCalendar.tsx

import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './ProductArrivalCalendar.css'; // 경로 수정
import { getProductArrivals } from '../../firebase';
import type { Product } from '../../types';
import Header from '../Header'; // Header 컴포넌트는 공통이므로 경로는 그대로 유지
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

interface ArrivalItem {
  id: string;
  name: string;
  arrivalDate: Date;
}

const ProductArrivalCalendar: React.FC = () => {
  const [value, onChange] = useState<Value>(new Date());
  const [productArrivals, setProductArrivals] = useState<ArrivalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArrivals = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const products = await getProductArrivals();
        const arrivals = products.map((product: Product) => ({
          id: product.id,
          name: product.name,
          arrivalDate: product.arrivalDate?.toDate() || new Date(0),
        })).filter((item: ArrivalItem) => item.arrivalDate.getTime() > 0);

        setProductArrivals(arrivals);
        // [수정] toast.info 대신 toast(message, { icon: 'ℹ️' }) 사용
        if (arrivals.length === 0) {
          toast('예정된 상품 입고가 없습니다.', { icon: 'ℹ️' });
        }
      } catch (err) {
        console.error("상품 입고일 불러오기 오류:", err);
        setError("상품 입고일 정보를 불러오는 데 실패했습니다.");
        toast.error("상품 입고일 정보를 불러오는 데 실패했습니다.");
        setProductArrivals([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArrivals();
  }, []);

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const hasArrival = productArrivals.some((item: ArrivalItem) => {
        return item.arrivalDate.getFullYear() === date.getFullYear() &&
               item.arrivalDate.getMonth() === date.getMonth() &&
               item.arrivalDate.getDate() === date.getDate();
      });
      return hasArrival ? <div className="dot"></div> : null;
    }
    return null;
  };

  const selectedDateArrivals = Array.isArray(value) && value[0]
    ? productArrivals.filter((item: ArrivalItem) => {
        const selectedSingleDate = value[0] as Date;
        return item.arrivalDate.getFullYear() === selectedSingleDate.getFullYear() &&
               item.arrivalDate.getMonth() === selectedSingleDate.getMonth() &&
               item.arrivalDate.getDate() === selectedSingleDate.getDate();
      })
    : [];

  return (
    <>
      <Header title="입고 달력" />
      <div className="product-arrival-calendar-page-container">
        {isLoading ? (
          <div className="loading-message">입고 정보를 불러오는 중...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <>
            <div className="calendar-wrapper">
              <Calendar
                onChange={onChange}
                value={value}
                locale="ko-KR"
                tileContent={tileContent}
                formatDay={(_locale: string | undefined, date: Date) => date.getDate().toString()}
              />
            </div>

            <div className="arrival-list-section">
              <h3>{Array.isArray(value) && value[0] ? (value[0] as Date).toLocaleDateString() : '날짜를 선택하세요'} 입고 예정 상품</h3>
              {selectedDateArrivals.length > 0 ? (
                <ul className="arrival-list">
                  {selectedDateArrivals.map((item: ArrivalItem) => (
                    <li key={item.id} className="arrival-item-card">
                      <p className="arrival-item-product">{item.name}</p>
                      <p className="arrival-item-date">입고일: {item.arrivalDate.toLocaleDateString()}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-arrivals-message">선택된 날짜에 입고 예정 상품이 없습니다.</p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default ProductArrivalCalendar;