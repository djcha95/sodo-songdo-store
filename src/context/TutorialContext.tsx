// src/context/TutorialContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Step } from 'react-joyride';
import { useAuth } from './AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';
import type { UserTutorialProgress } from '@/types';

interface TutorialContextType {
  isTourRunning: boolean;
  startTour: (steps: Step[], key?: string) => void;
  stopTour: () => void;
  runPageTourIfFirstTime: (pageKey: keyof UserTutorialProgress, steps: Step[]) => void;
}

// ✅ [삭제] UserTutorialProgress 타입 정의를 types.ts로 이전했습니다.

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

interface TutorialProviderProps {
  children: (steps: Step[], tourKey: string) => ReactNode;
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

  const value = { isTourRunning, startTour, stopTour, runPageTourIfFirstTime };

  return (
    <TutorialContext.Provider value={value}>
      {children(tourSteps, tourKey)}
    </TutorialContext.Provider>
  );
};