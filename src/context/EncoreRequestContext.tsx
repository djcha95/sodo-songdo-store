// src/context/EncoreRequestContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { updateEncoreRequest } from '../firebase';

interface EncoreRequestContextType {
  hasRequestedEncore: (productId: string) => boolean;
  requestEncore: (productId: string) => Promise<void>;
  loading: boolean;
}

const EncoreRequestContext = createContext<EncoreRequestContextType | undefined>(undefined);

export const EncoreRequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ✅ [수정] userDocument와 함께 refresh 함수를 가져옵니다.
  const { user, userDocument, refreshUserDocument } = useAuth();
  const [loading, setLoading] = useState(false);

  // ✅ [삭제] userDocument와 중복되는 로컬 상태(useState, useEffect)를 모두 제거합니다.

  // ✅ [수정] 실시간으로 동기화되는 userDocument에서 직접 데이터를 읽어 상태를 확인합니다.
  const hasRequestedEncore = useCallback((productId: string): boolean => {
    return userDocument?.encoreRequestedProductIds?.includes(productId) || false;
  }, [userDocument]);

  const requestEncore = useCallback(async (productId: string) => {
    if (!user || !userDocument) {
      throw new Error("앵콜 요청을 하려면 로그인이 필요합니다.");
    }
    if (hasRequestedEncore(productId)) {
      return; // 이미 요청된 경우 함수 종료
    }

    setLoading(true);
    try {
      await updateEncoreRequest(productId, user.uid);
      // ✅ [수정] 클라이언트 상태를 직접 업데이트하는 대신, AuthContext를 통해 최신 사용자 문서를 다시 불러옵니다.
      // 이렇게 하면 실시간 데이터와 UI가 항상 일치하게 됩니다.
      await refreshUserDocument();
    } catch (error) {
      console.error("앵콜 요청 실패:", error);
      throw new Error("앵콜 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [user, userDocument, hasRequestedEncore, refreshUserDocument]);

  // ✅ [개선] Context value를 useMemo로 감싸 불필요한 리렌더링을 방지합니다.
  const value = useMemo(() => ({
    hasRequestedEncore,
    requestEncore,
    loading,
  }), [hasRequestedEncore, requestEncore, loading]);

  return <EncoreRequestContext.Provider value={value}>{children}</EncoreRequestContext.Provider>;
};

export const useEncoreRequest = () => {
  const context = useContext(EncoreRequestContext);
  if (context === undefined) {
    throw new Error('useEncoreRequest must be used within a EncoreRequestProvider');
  }
  return context;
};