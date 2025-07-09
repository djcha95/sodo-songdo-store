// src/layouts/CustomerLayout.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import './CustomerLayout.css'; // 새로운 CSS 파일을 사용합니다.

const CustomerLayout: React.FC = () => {
  return (
    <div className="customer-layout-container">
      <Header />
      <main className="customer-main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default CustomerLayout;