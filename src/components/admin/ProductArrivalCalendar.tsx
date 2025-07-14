// src/components/admin/ProductArrivalCalendar.tsx

import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './ProductArrivalCalendar.css';
// ❗ [수정] 상대 경로 대신 절대 경로 별칭을 사용하여 import 안정성을 높입니다.
import { getProductArrivals } from '@/firebase'; 
import Header from '../common/Header';
import toast from 'react-hot-toast';

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

interface ArrivalItem {
  id: string; // roundId를 고유 ID로 사용
  name: string; // "상품명 (회차명)" 형식
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
        // ❗ [수정] 새로운 getProductArrivals 함수는 ArrivalInfo[] 타입을 반환합니다.
        const arrivalInfoList = await getProductArrivals();

        // ❗ [수정] 반환된 데이터를 컴포넌트의 상태에 맞게 변환합니다.
        const arrivals = arrivalInfoList.map(info => ({
          id: info.roundId, // 고유 키로 roundId 사용
          name: `${info.productName} (${info.roundName})`, // 상품명과 회차명을 함께 표시
          arrivalDate: info.arrivalDate.toDate(), // Timestamp를 Date 객체로 변환
        }));

        setProductArrivals(arrivals);

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

  const selectedDate = Array.isArray(value) ? value[0] : value;

  const selectedDateArrivals = selectedDate
    ? productArrivals.filter((item: ArrivalItem) => {
        return item.arrivalDate.getFullYear() === selectedDate.getFullYear() &&
               item.arrivalDate.getMonth() === selectedDate.getMonth() &&
               item.arrivalDate.getDate() === selectedDate.getDate();
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
                formatDay={(_locale, date) => date.getDate().toString()}
              />
            </div>

            <div className="arrival-list-section">
              <h3>{selectedDate ? selectedDate.toLocaleDateString() : '날짜를 선택하세요'} 입고 예정 상품</h3>
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