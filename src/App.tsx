// src/App.tsx (수정 제안)

import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext'; // useAuth 훅을 가져옵니다.
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import './App.css'; 
import './styles/variables.css'; 
import './styles/common.css'; 
import LoadingSpinner from './components/LoadingSpinner'; // 로딩 스피너 임포트

/**
 * 최상위 앱 컴포넌트
 * Context Provider들을 감싸고, 라우팅된 컴포넌트들을 Outlet을 통해 렌더링합니다.
 * BrowserRouter는 main.tsx에서 담당하므로 여기서는 제거합니다.
 */
const App: React.FC = () => {
  const { loading } = useAuth(); // AuthContext의 loading 상태를 가져옵니다.

  // AuthContext 로딩 중이라면 로딩 스피너를 보여줍니다.
  // 이렇게 하면 하위 컨텍스트와 라우트 컴포넌트들이 AuthContext의 user 정보가 완전히 로드된 후에야 마운트됩니다.
  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    // AuthProvider는 main.tsx에서 RouterProvider를 감싸고 있으므로 여기서는 제거합니다.
    // 나머지 컨텍스트들은 AuthContext가 로딩된 후에 안전하게 렌더링됩니다.
    <CartProvider>
        <SelectionProvider>
          <EncoreRequestProvider>
            <Outlet /> 
          </EncoreRequestProvider>
        </SelectionProvider>
    </CartProvider>
  );
};

export default App;