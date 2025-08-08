// src/App.tsx (수정 완료)

import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SelectionProvider } from './context/SelectionContext';
import { EncoreRequestProvider } from './context/EncoreRequestContext';
import { NotificationProvider } from './context/NotificationContext';
import { TutorialProvider } from './context/TutorialContext';
import { LaunchProvider } from './context/LaunchContext'; // ✅ [추가] LaunchProvider import
import AppTour from './components/customer/AppTour';
import SodomallLoader from '@/components/common/SodomallLoader';

import './App.css';
import './styles/variables.css';
import './styles/common.css';

const App: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return <SodomallLoader />;
  }

  return (
    <>
      {/* ✅ [추가] LaunchProvider로 전체를 감싸줍니다. */}
      <LaunchProvider>
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
      </LaunchProvider>
    </>
  );
};

export default App;