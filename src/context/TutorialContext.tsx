// src/context/TutorialContext.tsx (수정 완료)

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Step } from 'react-joyride';
import { useAuth } from './AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';
import type { UserTutorialProgress } from '@/types';

// 🔥 1. 컨텍스트 타입에 tourSteps와 tourKey 추가
interface TutorialContextType {
  isTourRunning: boolean;
  startTour: (steps: Step[], key?: string) => void;
  stopTour: () => void;
  runPageTourIfFirstTime: (pageKey: keyof UserTutorialProgress, steps: Step[]) => void;
  tourSteps: Step[];
  tourKey: string;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

// 🔥 2. Provider의 props 타입을 표준 ReactNode로 변경
interface TutorialProviderProps {
  children: ReactNode;
}

export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const { user, userDocument } = useAuth();
  const [tourSteps, setTourSteps] = useState<Step[]>([]);
  const [tourKey, setTourKey] = useState<string>('initial');
  const [isTourRunning, setIsTourRunning] = useState(false);

  const startTour = useCallback((steps: Step[], key: string = 'default') => {
    window.scrollTo(0, 0); 
    setTourKey(`${key}-${Date.now()}`);
    setTourSteps(steps);
    setIsTourRunning(true);
  }, []);

  const stopTour = useCallback(() => {
    setTourSteps([]);
    setIsTourRunning(false);
  }, []);

  const runPageTourIfFirstTime = useCallback(async (
    pageKey: keyof UserTutorialProgress,
    steps: Step[]
  ) => {
    const userProgress = userDocument?.tutorialProgress || {};

    if (user?.uid && !userProgress[pageKey]) {
      setTimeout(() => {
        startTour(steps, pageKey);
      }, 300);
      
      const newProgress = { ...userProgress, [pageKey]: true };
      
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          tutorialProgress: newProgress
        });
      } catch (error) {
        console.error("페이지 튜토리얼 진행 상태 업데이트 실패:", error);
      }
    }
  }, [user, userDocument, startTour]);

  // 🔥 3. Provider가 제공하는 value 객체에 tourSteps와 tourKey 포함
  const value = { 
    isTourRunning, 
    startTour, 
    stopTour, 
    runPageTourIfFirstTime,
    tourSteps,
    tourKey
  };

  return (
    // 🔥 4. 자식을 함수로 호출하는 대신, 받은 그대로 렌더링
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};