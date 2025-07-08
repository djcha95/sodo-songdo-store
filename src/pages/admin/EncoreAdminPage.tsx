// src/pages/admin/EncoreAdminPage.tsx

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트
import { Loader } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  encoreCount?: number; // [수정] requestCount 대신 encoreCount 사용
  stock?: number;
}

const EncoreAdminPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // encoreCount가 있는 문서를 내림차순으로 정렬하여 쿼리합니다.
    const q = query(collection(db, 'products'), orderBy('encoreCount', 'desc')); // [수정] encoreCount로 변경
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Product))
        // 요청이 1 이상인 상품만 화면에 표시합니다.
        .filter(p => (p.encoreCount || 0) > 0); // [수정] encoreCount로 변경
      setProducts(productList);
      setIsLoading(false);
    }, (error) => {
      console.error("앵콜 상품 목록 실시간 로딩 오류:", error);
      toast.error("앵콜 상품 목록을 불러오는 데 실패했습니다."); // [추가] toast 알림
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (isLoading) return (
    <div className="loading-overlay"> {/* 기존 로딩 스피너 컴포넌트 스타일 활용 */}
      <Loader size={48} className="spin" />
      <p>로딩 중...</p>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>앵콜 공구 요청 현황</h1>
      <div style={{ backgroundColor: 'white', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', borderRadius: '0.5rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>순위</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>상품명</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>요청 수</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>현재 재고</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, index) => (
              <tr key={product.id}>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>{index + 1}</td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>{product.name}</td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: 'bold' }}>{product.encoreCount || 0}</td> {/* [수정] encoreCount로 변경 */}
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>{product.stock === undefined ? 'N/A' : product.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && !isLoading && <p style={{ textAlign: 'center', padding: '20px' }}>아직 앵콜 요청이 없습니다.</p>}
      </div>
    </div>
  );
};

export default EncoreAdminPage;