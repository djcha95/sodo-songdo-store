// src/App.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
// import { Toaster } from 'react-hot-toast'; // <-- Toaster import도 제거합니다.
import { useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext';
import './App.css';
import './styles/variables.css';
import './styles/common.css';
import SodamallLoader from '@/components/common/SodamallLoader';

const App: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return <SodamallLoader />;
  }

  return (
    <>
      {/* ❗️❗️ [중요] 중복 선언된 Toaster 삭제 ❗️❗️
        프로젝트의 진입점인 'main.tsx'에 이미 Toaster가 있으므로,
        이곳의 Toaster 컴포넌트는 반드시 삭제해야 합니다.
      */}
      
      <NotificationProvider>
        <CartProvider>
            <SelectionProvider>
              <EncoreRequestProvider>
                <Outlet />
              </EncoreRequestProvider>
            </SelectionProvider>
        </CartProvider>
      </NotificationProvider>
    </>
  );
};

export default App;