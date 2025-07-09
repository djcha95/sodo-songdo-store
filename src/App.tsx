// src/App.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
// ✅ Toaster를 여기서 삭제합니다.
// import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import './App.css';

/**
 * 최상위 앱 컴포넌트
 */
const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <SelectionProvider>
          <EncoreRequestProvider>
            {/* ✅ Toaster 컴포넌트를 여기서 삭제합니다. */}
            <Outlet />
          </EncoreRequestProvider>
        </SelectionProvider>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;