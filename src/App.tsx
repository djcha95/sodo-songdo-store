// src/App.tsx

import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
// ✅ [추가] useQueryClient 훅을 가져옵니다.
import { useQueryClient } from '@tanstack/react-query';
import AppTour from './components/customer/AppTour';
import { useTutorial } from './context/TutorialContext';
// ✅ [추가] 데이터를 가져오는 API 함수들을 import 합니다.
import { fetchMyPageData } from '@/api/user';
import { fetchCartData } from '@/api/cart';

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
  // ✅ [추가] queryClient 인스턴스를 가져옵니다.
  const queryClient = useQueryClient();

  /**
   * ✅ [추가] 페이지 프리로딩 및 데이터 프리페칭 로직
   * 앱이 처음 로드된 후, 약간의 지연(2초)을 두고 백그라운드에서
   * 다른 페이지들의 코드(JS 청크)를 미리 다운로드하고,
   * 동시에 해당 페이지에서 필요한 데이터를 미리 가져와 캐시에 저장합니다.
   * 이를 통해 사용자가 링크를 클릭했을 때 로딩 지연 없이 페이지와 데이터를 바로 보여줄 수 있습니다.
   */
  useEffect(() => {
    const preloadTimer = setTimeout(() => {
      // 1. 기존처럼 페이지 코드를 프리로딩합니다.
      customerPagesToPreload.forEach(preloadFunc => preloadFunc());

      // ✅ [추가] 2. 페이지 데이터도 프리페칭합니다.
      // prefetchQuery는 데이터를 미리 가져와 캐시에 저장해둡니다.
      // queryKey는 실제 useQuery에서 사용하는 키와 동일해야 합니다.
      queryClient.prefetchQuery({ queryKey: ['myPageData'], queryFn: fetchMyPageData });
      queryClient.prefetchQuery({ queryKey: ['cart'], queryFn: fetchCartData });

    }, 2000);

    // 컴포넌트가 언마운트될 때 타이머를 정리합니다.
    return () => clearTimeout(preloadTimer);
  }, [queryClient]); // ✅ [수정] 의존성 배열에 queryClient 추가


  return (
    <>
      <Outlet />
      <AppTour steps={tourSteps} tourKey={tourKey} />
    </>
  );
};

export default App;