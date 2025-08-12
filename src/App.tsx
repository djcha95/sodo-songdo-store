// src/App.tsx (수정 완료)

import React from 'react';
import { Outlet } from 'react-router-dom';
import AppTour from './components/customer/AppTour'; // 튜토리얼 UI는 여전히 필요
import { useTutorial } from './context/TutorialContext'; // 튜토리얼 데이터는 Context에서 가져옴

// ✅ CSS import는 유지
import './App.css';
import './styles/variables.css';
import './styles/common.css';

const App: React.FC = () => {
  // 🔥 App.tsx는 이제 Provider 선언 없이 Outlet과 튜토리얼 UI만 렌더링
  const { tourSteps, tourKey } = useTutorial();

  return (
    <>
      <Outlet />
      <AppTour steps={tourSteps} tourKey={tourKey} />
    </>
  );
};

export default App;