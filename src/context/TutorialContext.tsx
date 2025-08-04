// src/context/TutorialContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'; // useEffect 삭제
import type { Step } from 'react-joyride';
import { useAuth } from './AuthContext';
import { doc, updateDoc } from 'firebase/firestore'; // getDoc 삭제
import { db } from '@/firebase/firebaseConfig';

interface TutorialContextType {
  isTourRunning: boolean;
  startTour: (steps: Step[], key?: string) => void;
  stopTour: () => void;
  runPageTourIfFirstTime: (pageKey: keyof UserTutorialProgress, steps: Step[]) => void;
}

export interface UserTutorialProgress {
    hasCompletedMain?: boolean;
    hasSeenCartPage?: boolean;
    hasSeenDetailPage?: boolean;
    hasSeenCalendarPage?: boolean;
    hasSeenCustomerCenterPage?: boolean;
    hasSeenMyPage?: boolean;
    hasSeenOrderHistoryPage?: boolean;
}

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
  const { user, userDocument } = useAuth(); // userDocument를 직접 사용
  const [tourSteps, setTourSteps] = useState<Step[]>([]);
  const [tourKey, setTourKey] = useState<string>('initial');
  const [isTourRunning, setIsTourRunning] = useState(false);

  // AuthContext에서 실시간으로 userDocument를 받으므로, 별도의 fetchProgress 로직 불필요

  const startTour = useCallback((steps: Step[], key: string = 'default') => {
    // 튜토리얼 시작 시 항상 화면을 맨 위로 스크롤
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
    // userDocument가 AuthContext에서 실시간으로 업데이트되므로, userDocument를 직접 사용
    const userProgress = userDocument?.tutorialProgress || {};

    if (user?.uid && !userProgress[pageKey]) {
      setTimeout(() => {
        startTour(steps, pageKey);
      }, 300);
      
      const newProgress = { ...userProgress, [pageKey]: true };
      
      try {
        const userRef = doc(db, 'users', user.uid);
        // Firestore의 tutorialProgress 필드만 업데이트
        await updateDoc(userRef, {
          tutorialProgress: newProgress
        });
      } catch (error) {
        console.error("페이지 튜토리얼 진행 상태 업데이트 실패:", error);
      }
    }
  }, [user, userDocument, startTour]); // 의존성 배열에 userDocument 추가

  const value = { isTourRunning, startTour, stopTour, runPageTourIfFirstTime };

  return (
    <TutorialContext.Provider value={value}>
      {children(tourSteps, tourKey)}
    </TutorialContext.Provider>
  );
};