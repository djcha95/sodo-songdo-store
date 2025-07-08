// src/context/EncoreRequestContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { updateEncoreRequest } from '../firebase';
// ✅ [수정] 오류의 원인이 된 useLocation import와 사용 코드를 완전히 제거합니다.
// import { useLocation } from 'react-router-dom';

interface EncoreRequestContextType {
  hasRequestedEncore: (productId: string) => boolean;
  requestEncore: (productId: string) => Promise<void>;
  loading: boolean;
}

const EncoreRequestContext = createContext<EncoreRequestContextType | undefined>(undefined);

export const EncoreRequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [requestedProductIds, setRequestedProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // ✅ [수정] 오류의 원인이 된 useLocation() 호출을 제거합니다.
  // useLocation();

  // [수정] 사용자의 요청 기록을 Firestore 데이터로 초기화
  useEffect(() => {
    if (user?.encoreRequestedProductIds) {
      setRequestedProductIds(user.encoreRequestedProductIds);
    } else {
      setRequestedProductIds([]); // 로그아웃 시 또는 데이터 없을 때 초기화
    }
  }, [user]);

  // '공구 요청' 상태 확인 함수
  const hasRequestedEncore = useCallback((productId: string): boolean => {
    return requestedProductIds.includes(productId);
  }, [requestedProductIds]);

  // '공구 요청' 실행 함수
  const requestEncore = useCallback(async (productId: string) => {
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