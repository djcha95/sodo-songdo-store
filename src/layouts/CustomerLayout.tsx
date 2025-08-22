// src/layouts/CustomerLayout.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/common/Header';
import './CustomerLayout.css';

const CustomerLayout: React.FC = () => {
  return (
    <div className="customer-layout-container">
      {/* ✅ 기존 Header와 BottomNav를 새로운 Header 하나로 통합 */}
      <Header />
      <main className="customer-main-content">
        <Outlet />
      </main>
      {/* ❌ BottomNav 제거 */}
    </div>
  );
};

export default CustomerLayout;