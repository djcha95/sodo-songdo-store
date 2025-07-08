// src/pages/admin/CouponAdminPage.tsx

import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트

interface Coupon {
  id: string;
  code: string;
  type: 'fixed' | 'percent';
  value: number;
  expiresAt?: Timestamp;
}

const CouponAdminPage = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'fixed' | 'percent'>('fixed');
  const [value, setValue] = useState(0);

  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        const couponSnapshot = await getDocs(query(collection(db, 'coupons')));
        const couponList = couponSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon));
        setCoupons(couponList);
      } catch (error) {
        console.error("쿠폰 불러오기 오류: ", error);
        toast.error("쿠폰 목록을 불러오는 데 실패했습니다."); // [추가] toast 알림
      }
    };
    fetchCoupons();
  }, []);

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || value <= 0) {
      toast.error("쿠폰 코드와 할인 값을 올바르게 입력해주세요."); // [수정] toast 알림
      return;
    }
    try {
      const newCoupon = { 
        code: code.toUpperCase(), 
        type, 
        value,
        createdAt: new Date(),
      };
      const docRef = await addDoc(collection(db, 'coupons'), newCoupon);
      setCoupons(prev => [...prev, { id: docRef.id, ...newCoupon, expiresAt: undefined }]);
      toast.success(`'${code.toUpperCase()}' 쿠폰이 성공적으로 생성되었습니다.`); // [수정] toast 알림
      setCode('');
      setValue(0);
    } catch (error) {
      console.error("쿠폰 생성 오류: ", error);
      toast.error("쿠폰 생성에 실패했습니다. 다시 시도해주세요."); // [수정] toast 알림
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>쿠폰 관리</h1>
      
      <form onSubmit={handleAddCoupon} style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h2 style={{marginTop: 0}}>새 쿠폰 생성</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input type="text" placeholder="쿠폰 코드 (예: SUMMER2024)" value={code} onChange={e => setCode(e.target.value)} required style={{padding: '10px'}}/>
          <select value={type} onChange={e => setType(e.target.value as any)} style={{padding: '10px'}}>
            <option value="fixed">정액 할인 (원)</option>
            <option value="percent">정률 할인 (%)</option>
          </select>
          <input type="number" placeholder="할인 값" value={value} onChange={e => setValue(Number(e.target.value))} required style={{padding: '10px'}} />
          <button type="submit" className="add-to-cart-btn">쿠폰 생성</button>
        </div>
      </form>

      <div style={{ backgroundColor: 'white', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', borderRadius: '0.5rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: '400px' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>코드</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>타입</th>
              <th style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>값</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map(c => (
              <tr key={c.id}>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>{c.code}</td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>{c.type === 'fixed' ? '정액(원)' : '정률(%)'}</td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>{c.type === 'percent' ? `${c.value}%` : `${c.value.toLocaleString()}원`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CouponAdminPage;