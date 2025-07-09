// src/layouts/CustomerLayout.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
// ✅ Toaster와 커스텀 아이콘을 import 합니다.
import { Toaster } from 'react-hot-toast';
import { CheckCircle, XCircle } from 'lucide-react';
import './CustomerLayout.css';

const CustomerLayout: React.FC = () => {
  return (
    <div className="customer-layout-container">
      {/* ✅ Toaster 컴포넌트를 여기에 추가하고, toastOptions를 통해 전역 스타일을 설정합니다.
        이제 이 레이아웃을 사용하는 모든 페이지에서 toast() 함수를 호출하면
        아래에 정의된 예쁜 디자인이 적용됩니다.
      */}
      <Toaster
        position="top-center"
        toastOptions={{
          // 모든 토스트에 적용될 기본 스타일
          style: {
            background: '#ffffff', // 요청하신 하얀색 배경
            color: '#0052cc',      // 요청하신 파란색 글자
            border: '1px solid #f0f0f0',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
            borderRadius: '999px', // 둥근 알약 모양
            padding: '12px 18px',
            fontSize: '15px',
            fontWeight: 500,
          },
          // 성공 토스트에만 특별히 적용될 스타일
          success: {
            duration: 3000,
            // 요청하신 초록색 체크 아이콘
            icon: <CheckCircle size={22} color="#28a745" />,
            style: {
              // 성공 토스트는 파란색 대신 더 부드러운 검은색 글자를 사용
              color: '#1a1a1a',
            },
          },
          // 에러 토스트에 적용될 스타일
          error: {
            duration: 4000,
            icon: <XCircle size={22} color="#e63946" />,
            style: {
              color: '#1a1a1a',
            },
          },
        }}
      />

      <Header />
      <main className="customer-main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default CustomerLayout;
