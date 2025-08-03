// src/context/TutorialContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import type { Step } from 'react-joyride';
import { useAuth } from './AuthContext';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';

interface TutorialContextType {
  isTourRunning: boolean; // ✅ [추가] 튜토리얼 실행 상태
  startTour: (steps: Step[], key?: string) => void;
  stopTour: () => void; // ✅ [추가] 튜토리얼 중지 함수
  runPageTourIfFirstTime: (pageKey: keyof UserTutorialProgress, steps: Step[]) => void;
}

export interface UserTutorialProgress {
    hasCompletedMain?: boolean;
    hasSeenCartPage?: boolean;
    hasSeenDetailPage?: boolean;
    hasSeenCalendarPage?: boolean;
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
  const { user } = useAuth();
  const [tourSteps, setTourSteps] = useState<Step[]>([]);
  const [tourKey, setTourKey] = useState<string>('initial');
  const [userProgress, setUserProgress] = useState<UserTutorialProgress>({});
  const [isTourRunning, setIsTourRunning] = useState(false); // ✅ [추가]

  useEffect(() => {
    const fetchProgress = async () => {
      if (user?.uid) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserProgress(data.tutorialProgress || {});
        }
      }
    };
    fetchProgress();
  }, [user]);

  const startTour = useCallback((steps: Step[], key: string = 'default') => {
    window.scrollTo(0, 0);
    setTourKey(`${key}-${Date.now()}`);
    setTourSteps(steps);
    setIsTourRunning(true); // ✅ [추가] 튜토리얼 시작 시 상태를 true로 설정
  }, []);

  const stopTour = useCallback(() => {
    setTourSteps([]);
    setIsTourRunning(false); // ✅ [추가] 튜토리얼 종료 시 상태를 false로 설정
  }, []);

  const runPageTourIfFirstTime = useCallback(async (
    pageKey: keyof UserTutorialProgress,
    steps: Step[]
  ) => {
    if (user?.uid && !userProgress[pageKey]) {
      startTour(steps, pageKey);
      
      const newProgress = { ...userProgress, [pageKey]: true };
      setUserProgress(newProgress);
      
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          tutorialProgress: newProgress
        });
      } catch (error) {
        console.error("페이지 튜토리얼 진행 상태 업데이트 실패:", error);
      }
    }
  }, [user, userProgress, startTour]);

  const value = { isTourRunning, startTour, stopTour, runPageTourIfFirstTime };

  return (
    <TutorialContext.Provider value={value}>
      {children(tourSteps, tourKey)}
    </TutorialContext.Provider>
  );
};
