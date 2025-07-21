// src/App.tsx

import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext';
import './App.css';
import './styles/variables.css';
import './styles/common.css';
import SodamallLoader from '@/components/common/SodamallLoader';
import ReferralCodeModal from '@/components/auth/ReferralCodeModal'; // ✨ [신규] 추천인 코드 모달 import

const App: React.FC = () => {
  const { loading, userDocument } = useAuth();
  const [isReferralModalVisible, setIsReferralModalVisible] = useState(false);

  // userDocument가 로드되거나 변경될 때마다 실행
  useEffect(() => {
    // 사용자가 로그인했고, userDocument가 로드되었으며,
    // referredBy 필드가 null인 경우 (아직 코드를 입력하거나 건너뛰지 않은 신규 사용자)
    if (userDocument && userDocument.referredBy === null) {
      // 약간의 딜레이 후 모달을 띄워 사용자 경험을 개선합니다.
      const timer = setTimeout(() => {
        setIsReferralModalVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      // 이미 코드를 입력했거나 건너뛴 사용자의 경우 모달을 닫습니다.
      setIsReferralModalVisible(false);
    }
  }, [userDocument]);

  const handleReferralModalSuccess = () => {
    setIsReferralModalVisible(false);
    // AuthContext가 Firestore의 userDocument를 실시간으로 수신하므로,
    // DB에서 referredBy 필드가 업데이트되면 userDocument가 자동으로 갱신되고
    // useEffect가 다시 실행되어 모달이 더 이상 나타나지 않게 됩니다.
  };

  if (loading) {
    return <SodamallLoader />;
  }

  return (
    <>
      {/* ❗️❗️ [중요] 중복 선언된 Toaster 삭제 ❗️❗️
        프로젝트의 진입점인 'main.tsx'에 이미 Toaster가 있으므로,
        이곳의 Toaster 컴포넌트는 반드시 삭제해야 합니다.
      */}
      
      {/* ✨ [신규] 조건에 맞을 때 추천인 코드 입력 모달 렌더링 */}
      {isReferralModalVisible && (
        <ReferralCodeModal onSuccess={handleReferralModalSuccess} />
      )}

      <NotificationProvider>
        <CartProvider>
            <SelectionProvider>
              <EncoreRequestProvider>
                <Outlet />
              </EncoreRequestProvider>
            </SelectionProvider>
        </CartProvider>
      </NotificationProvider>
    </>
  );
};

export default App;