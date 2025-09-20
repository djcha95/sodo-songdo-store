// src/pages/admin/EncoreAdminPage.tsx

import { useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { collection, getDocs, query, orderBy } from 'firebase/firestore/lite';
import { getFirebaseServices } from '@/firebase/firebaseInit';
import toast from 'react-hot-toast';
import { Loader } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  encoreCount?: number;
  stock?: number;
}

const EncoreAdminPage = () => {
  useDocumentTitle('앙코르 요청 관리');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEncoreProducts = async () => {
      setIsLoading(true);
      try {
        const { db } = await getFirebaseServices();
        const q = query(collection(db, 'products'), orderBy('encoreCount', 'desc'));
        const snapshot = await getDocs(q);
        const productList = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(p => (p.encoreCount || 0) > 0);
        setProducts(productList);
      } catch (error) {
        console.error("앵콜 상품 목록 로딩 오류:", error);
        toast.error("앵콜 상품 목록을 불러오는 데 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchEncoreProducts();
  }, []);

  if (isLoading) return (
    <div className="loading-overlay">
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
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: 'bold' }}>{product.encoreCount || 0}</td>
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