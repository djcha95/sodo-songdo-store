// src/App.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WaitlistProvider } from './context/WaitlistContext';
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
        <WaitlistProvider>
          <SelectionProvider>
            <EncoreRequestProvider>
              <Outlet />
            </EncoreRequestProvider>
          </SelectionProvider>
        </WaitlistProvider>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;