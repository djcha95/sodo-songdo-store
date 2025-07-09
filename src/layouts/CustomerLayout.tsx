// src/layouts/CustomerLayout.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
// ✅ Toaster와 관련 아이콘 import를 모두 삭제합니다.
// import { Toaster } from 'react-hot-toast';
// import { CheckCircle, XCircle } from 'lucide-react';
import './CustomerLayout.css';

const CustomerLayout: React.FC = () => {
  return (
    <div className="customer-layout-container">
      {/* ✅ 여기에 있던 Toaster 컴포넌트를 완전히 삭제합니다. */}
      {/* 이제 모든 토스트 알림은 main.tsx에 있는 Toaster가 관리합니다. */}

      <Header />
      <main className="customer-main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default CustomerLayout;