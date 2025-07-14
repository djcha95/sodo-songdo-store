// src/App.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext'; // ✅ NotificationProvider import
import './App.css'; 
import './styles/variables.css'; 
import './styles/common.css'; 
import LoadingSpinner from './components/common/LoadingSpinner';

const App: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    // ✅ NotificationProvider 추가
    <NotificationProvider>
      <CartProvider>
          <SelectionProvider>
            <EncoreRequestProvider>
              <Outlet /> 
            </EncoreRequestProvider>
          </SelectionProvider>
      </CartProvider>
    </NotificationProvider>
  );
};

export default App;