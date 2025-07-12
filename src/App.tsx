// src/App.tsx (수정본)

import React from 'react';
import { Outlet } from 'react-router-dom';
// ✅ [수정] 사용하지 않는 Toaster import 제거
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WaitlistProvider } from './context/WaitlistContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import './App.css'; // 전역 스타일시트
import './styles/variables.css'; // 전역 CSS 변수 파일 임포트
import './styles/common.css'; // 공통 스타일 파일 임포트

/**
 * 최상위 앱 컴포넌트
 * Context Provider들을 감싸고, 라우팅된 컴포넌트들을 Outlet을 통해 렌더링합니다.
 * BrowserRouter는 main.tsx에서 담당하므로 여기서는 제거합니다.
 */
const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <WaitlistProvider>
          <SelectionProvider>
            <EncoreRequestProvider>
              {/* Toaster 컴포넌트는 main.tsx에 이미 있으므로 여기서는 제거합니다. */}
              <Outlet /> {/* 라우트된 자식 컴포넌트들이 이 위치에 렌더링됩니다 */}
            </EncoreRequestProvider>
          </SelectionProvider>
        </WaitlistProvider>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;