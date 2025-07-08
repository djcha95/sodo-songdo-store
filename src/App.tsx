// src/App.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext'; // ✅ EncoreRequestProvider 추가
import './App.css';

/**
 * 최상위 앱 컴포넌트
 * - 모든 Provider를 이곳에서 관리하여 라우팅과 상태 관리의 계층을 명확히 분리합니다.
 */
const App: React.FC = () => {
  return (
    // ✅ 모든 Provider가 라우터의 자식들을 감싸도록 구조를 변경합니다.
    <AuthProvider>
      <CartProvider>
        <SelectionProvider>
          <EncoreRequestProvider>
            {/* 전역 Toast */}
            <Toaster position="top-center" reverseOrder={false} />

            {/* 라우터가 렌더링할 페이지들이 여기에 표시됩니다. */}
            <Outlet />
          </EncoreRequestProvider>
        </SelectionProvider>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;