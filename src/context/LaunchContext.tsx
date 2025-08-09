// src/context/LaunchContext.tsx

import React, { createContext, useContext, ReactNode } from 'react';

// isPreLaunch: true이면 사전 런칭(둘러보기) 모드, false이면 정식 런칭 모드
const LAUNCH_CONFIG = {
  isPreLaunch: true, 
  launchDate: '2025-08-11',
};

interface LaunchContextType {
  isPreLaunch: boolean;
  launchDate: string;
}

const LaunchContext = createContext<LaunchContextType | undefined>(undefined);

export const LaunchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <LaunchContext.Provider value={LAUNCH_CONFIG}>
      {children}
    </LaunchContext.Provider>
  );
};

export const useLaunch = (): LaunchContextType => {
  const context = useContext(LaunchContext);
  if (context === undefined) {
    throw new Error('useLaunch must be used within a LaunchProvider');
  }
  return context;
};