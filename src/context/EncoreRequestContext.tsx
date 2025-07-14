// src/context/EncoreRequestContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { updateEncoreRequest } from '../firebase';

interface EncoreRequestContextType {
  hasRequestedEncore: (productId: string) => boolean;
  requestEncore: (productId: string) => Promise<void>;
  loading: boolean;
}

const EncoreRequestContext = createContext<EncoreRequestContextType | undefined>(undefined);

export const EncoreRequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // [수정] user와 함께 userDocument를 useAuth()로부터 가져옵니다.
  const { user, userDocument } = useAuth();
  const [requestedProductIds, setRequestedProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // [수정] 사용자의 요청 기록을 user가 아닌 userDocument에서 가져와 초기화합니다.
  useEffect(() => {
    if (userDocument?.encoreRequestedProductIds) { // [수정]
      setRequestedProductIds(userDocument.encoreRequestedProductIds); // [수정]
    } else {
      setRequestedProductIds([]); // 로그아웃 시 또는 데이터 없을 때 초기화
    }
  }, [userDocument]); // [수정] 의존성 배열을 userDocument로 변경합니다.

  // '공구 요청' 상태 확인 함수
  const hasRequestedEncore = useCallback((productId: string): boolean => {
    return requestedProductIds.includes(productId);
  }, [requestedProductIds]);

  // '공구 요청' 실행 함수
  const requestEncore = useCallback(async (productId: string) => {
    // user 객체는 uid 확인을 위해 여전히 필요합니다.
    if (!user) {
      return;
    }
    if (hasRequestedEncore(productId)) {
      return;
    }

    setLoading(true);
    try {
      // 1. Firestore 업데이트: encoreCount 증가 및 사용자 ID 추가
      await updateEncoreRequest(productId, user.uid);
      
      // 2. 클라이언트 상태 업데이트
      setRequestedProductIds(prev => [...prev, productId]);

    } catch (error) {
      console.error("앵콜 요청 실패:", error);
      throw new Error("앵콜 요청에 실패했습니다. 다시 시도해 주세요."); // 모달 처리를 위해 에러를 던짐
    } finally {
      setLoading(false);
    }
  }, [user, hasRequestedEncore]);

  const value = {
    hasRequestedEncore,
    requestEncore,
    loading,
  };

  return <EncoreRequestContext.Provider value={value}>{children}</EncoreRequestContext.Provider>;
};

export const useEncoreRequest = () => {
  const context = useContext(EncoreRequestContext);
  if (context === undefined) {
    throw new Error('useEncoreRequest must be used within a EncoreRequestProvider');
  }
  return context;
};