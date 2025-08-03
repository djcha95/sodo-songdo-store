// src/App.tsx

import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext';
import { TutorialProvider } from './context/TutorialContext'; // ✅ [추가] 튜토리얼 프로바이더
import AppTour from './components/customer/AppTour'; // ✅ [수정] 경로 변경
import SodomallLoader from '@/components/common/SodomallLoader';
import ReferralCodeModal from '@/components/auth/ReferralCodeModal';
import './App.css';
import './styles/variables.css';
import './styles/common.css';

const App: React.FC = () => {
  const { loading, userDocument } = useAuth();
  const [isReferralModalVisible, setIsReferralModalVisible] = useState(false);

  // 추천인 코드 모달을 띄우는 로직 (기존과 동일)
  useEffect(() => {
    if (userDocument && userDocument.referredBy === null) {
      const timer = setTimeout(() => {
        setIsReferralModalVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsReferralModalVisible(false);
    }
  }, [userDocument]);

  const handleReferralModalSuccess = () => {
    setIsReferralModalVisible(false);
  };

  if (loading) {
    return <SodomallLoader />;
  }

  return (
    <>
      {/* 추천인 코드 입력 모달 렌더링 (기존과 동일) */}
      {isReferralModalVisible && (
        <ReferralCodeModal onSuccess={handleReferralModalSuccess} />
      )}

      {/* ✅ [수정] 앱 전체를 TutorialProvider로 감싸 튜토리얼 기능을 활성화합니다. */}
      <TutorialProvider>
        {(tourSteps, tourKey) => ( // ✅ tourKey를 함께 받습니다.
          <>
            <NotificationProvider>
              <CartProvider>
                  <SelectionProvider>
                    <EncoreRequestProvider>
                      {/* Outlet을 통해 현재 라우트에 맞는 페이지가 렌더링됩니다. */}
                      <Outlet />
                    </EncoreRequestProvider>
                  </SelectionProvider>
              </CartProvider>
            </NotificationProvider>

            {/* ✅ [추가] AppTour 컴포넌트가 튜토리얼 오버레이를 화면에 표시합니다. */}
            <AppTour steps={tourSteps} tourKey={tourKey} />
          </>
        )}
      </TutorialProvider>
    </>
  );
};

export default App;
