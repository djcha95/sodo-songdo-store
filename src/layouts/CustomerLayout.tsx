// src/layouts/CustomerLayout.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/common/Header';
import BottomNav from '@/components/common/BottomNav';
import './CustomerLayout.css';

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
