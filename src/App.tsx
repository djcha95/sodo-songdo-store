// src/App.tsx (수정 완료)

import React from 'react'; // ✅ [수정] useState, useEffect 제거
import { Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext';
import { TutorialProvider } from './context/TutorialContext';
import AppTour from './components/customer/AppTour';
import SodomallLoader from '@/components/common/SodomallLoader';
// import ReferralCodeModal from '@/components/auth/ReferralCodeModal'; // ✅ [삭제] 더 이상 사용하지 않으므로 import 제거

import './App.css';
import './styles/variables.css';
import './styles/common.css';

const App: React.FC = () => {
  const { loading } = useAuth(); // ✅ [수정] userDocument는 여기서 사용하지 않으므로 제거

  // ✅ [삭제] 추천인 코드 모달을 띄우는 모든 관련 로직(useState, useEffect, handler)을 제거했습니다.

  if (loading) {
    return <SodomallLoader />;
  }

  return (
    <>
      {/* ✅ [삭제] 추천인 코드 입력 모달 렌더링 코드를 제거했습니다. */}

      <TutorialProvider>
        {(tourSteps, tourKey) => (
          <>
            <NotificationProvider>
              <CartProvider>
                  <SelectionProvider>
                    <EncoreRequestProvider>
                      <Outlet />
                    </EncoreRequestProvider>
                  </SelectionProvider>
              </CartProvider>
            </NotificationProvider>

            <AppTour steps={tourSteps} tourKey={tourKey} />
          </>
        )}
      </TutorialProvider>
    </>
  );
};

export default App;