// src/App.tsx

import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AppTour from './components/customer/AppTour';
import { useTutorial } from './context/TutorialContext';

import './App.css';
import './styles/variables.css';
import './styles/common.css';

/**
 * ✅ [추가] 프리로딩할 페이지들의 import 함수를 배열로 정의합니다.
 * 사용자가 다음으로 이동할 가능성이 높은 핵심 페이지들을 지정합니다.
 */
const customerPagesToPreload = [
  () => import('@/pages/customer/ProductDetailPage'),
  () => import('@/pages/customer/CartPage'),
  () => import('@/pages/customer/MyPage'),
  () => import('@/pages/customer/OrderHistoryPage'),
  () => import('@/pages/customer/CustomerCenterPage'),
  () => import('@/pages/customer/EncorePage'),
];

const App: React.FC = () => {
  const { tourSteps, tourKey } = useTutorial();

  /**
   * ✅ [추가] 페이지 프리로딩 로직
   * 앱이 처음 로드된 후, 약간의 지연(2초)을 두고 백그라운드에서
   * 다른 페이지들의 코드(JS 청크)를 미리 다운로드합니다.
   * 이를 통해 사용자가 링크를 클릭했을 때 로딩 지연 없이 바로 페이지를 보여줄 수 있습니다.
   */
  useEffect(() => {
    const preloadTimer = setTimeout(() => {
      customerPagesToPreload.forEach(preloadFunc => {
        preloadFunc();
      });
    }, 2000); // 2초 딜레이

    // 컴포넌트가 언마운트될 때 타이머를 정리합니다.
    return () => clearTimeout(preloadTimer);
  }, []);


  return (
    <>
      <Outlet />
      <AppTour steps={tourSteps} tourKey={tourKey} />
    </>
  );
};

export default App;