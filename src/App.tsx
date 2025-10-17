// src/App.tsx

import React from 'react';
import { Outlet } from 'react-router-dom';

import './App.css';
import './styles/variables.css';
import './styles/common.css';

const App: React.FC = () => {
  // ❌ AppTour, useTutorial, 페이지 프리로딩 로직 모두 제거
  return (
    <>
      <Outlet />
    </>
  );
};

export default App;