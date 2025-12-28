// src/components/admin/ResponsiveTable.tsx

import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import './ResponsiveTable.css';

interface Column {
  key: string;
  label: string;
  mobileLabel?: string;
  render?: (value: any, item: any) => React.ReactNode;
  mobileRender?: (item: any) => React.ReactNode;
}

interface ResponsiveTableProps {
  columns: Column[];
  data: any[];
  keyExtractor?: (item: any, index: number) => string | number;
  emptyMessage?: string;
  className?: string;
}

// Timestamp 객체나 다른 객체를 안전하게 문자열로 변환하는 헬퍼 함수
const safeRenderValue = (value: any): React.ReactNode => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  // Firestore Timestamp 객체 처리
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleDateString('ko-KR');
  }
  // Timestamp-like 객체 처리 ({seconds, nanoseconds})
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    try {
      const timestamp = value instanceof Timestamp 
        ? value 
        : new Timestamp(value.seconds, value.nanoseconds || 0);
      return timestamp.toDate().toLocaleDateString('ko-KR');
    } catch {
      return '-';
    }
  }
  // toDate 메서드가 있는 객체 처리
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      return value.toDate().toLocaleDateString('ko-KR');
    } catch {
      return '-';
    }
  }
  // Date 객체 처리
  if (value instanceof Date) {
    return value.toLocaleDateString('ko-KR');
  }
  // 배열이나 객체는 JSON 문자열로 변환 (디버깅용)
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const ResponsiveTable: React.FC<ResponsiveTableProps> = ({
  columns,
  data,
  keyExtractor = (item, index) => item.id || index,
  emptyMessage = '표시할 데이터가 없습니다.',
  className = ''
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (data.length === 0) {
    return (
      <div className={`responsive-table-empty ${className}`}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  if (isMobile) {
    // 모바일: 카드 뷰
    return (
      <div className={`responsive-table-mobile ${className}`}>
        {data.map((item, index) => (
          <div key={keyExtractor(item, index)} className="mobile-table-card">
            {columns.map(column => {
              const value = item[column.key];
              const content = column.mobileRender
                ? column.mobileRender(item)
                : column.render
                ? column.render(value, item)
                : safeRenderValue(value);

              // 모바일에서 숨길 컬럼은 null 반환
              if (column.mobileLabel === null) return null;

              return (
                <div key={column.key} className="mobile-card-row">
                  <div className="mobile-card-label">
                    {column.mobileLabel || column.label}
                  </div>
                  <div className="mobile-card-value">{content}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // 데스크톱: 테이블 뷰
  return (
    <div className={`responsive-table-wrapper ${className}`}>
      <table className="responsive-table-desktop">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={keyExtractor(item, index)}>
              {columns.map(column => {
                const value = item[column.key];
                const content = column.render
                  ? column.render(value, item)
                  : safeRenderValue(value);

                return (
                  <td key={column.key}>{content}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ResponsiveTable;

