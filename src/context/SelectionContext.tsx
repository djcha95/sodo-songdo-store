// src/context/SelectionContext.tsx

import { createContext, useState, useContext, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

// [수정] productId, variantGroupId, itemId를 조합하여 고유한 키를 생성합니다.
const createSelectionKey = (productId: string, variantGroupId: string, itemId: string) => 
  `${productId}-${variantGroupId}-${itemId}`;

// Context가 가지게 될 값들의 타입 정의
interface SelectionContextType {
  // Map을 사용하여 각 항목의 선택 수량을 저장합니다. Key: "productId-variantGroupId-itemId", Value: quantity
  selections: Map<string, number>;
  // [수정] 특정 항목의 수량을 업데이트하는 함수 (인수 추가)
  updateSelectionQuantity: (productId: string, variantGroupId: string, itemId: string, quantity: number) => void;
  // [수정] 특정 항목의 현재 선택 수량을 가져오는 함수 (인수 추가)
  getSelectionQuantity: (productId: string, variantGroupId: string, itemId: string) => number;
  // 모든 선택 항목을 초기화하는 함수
  clearSelections: () => void;
}

// Context 생성 (초기값은 undefined)
const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

// Context Provider 컴포넌트
export const SelectionProvider = ({ children }: { children: ReactNode }) => {
  const [selections, setSelections] = useState<Map<string, number>>(new Map());

  // [수정] 수량 업데이트 함수 (인수 추가 및 키 생성 변경)
  const updateSelectionQuantity = useCallback((productId: string, variantGroupId: string, itemId: string, quantity: number) => {
    const key = createSelectionKey(productId, variantGroupId, itemId);
    setSelections(prevSelections => {
      const newSelections = new Map(prevSelections);
      if (quantity > 0) {
        newSelections.set(key, quantity);
      } else {
        // 수량이 0 이하면 맵에서 제거
        newSelections.delete(key);
      }
      return newSelections;
    });
  }, []);
  
  // [수정] 수량 조회 함수 (인수 추가 및 키 생성 변경)
  const getSelectionQuantity = useCallback((productId: string, variantGroupId: string, itemId: string): number => {
    const key = createSelectionKey(productId, variantGroupId, itemId);
    return selections.get(key) || 0;
  }, [selections]);

  // 선택 초기화 함수
  const clearSelections = useCallback(() => {
    setSelections(new Map());
  }, []);

  // Context 값 메모이제이션
  const value = useMemo(() => ({
    selections,
    updateSelectionQuantity,
    getSelectionQuantity,
    clearSelections,
  }), [selections, updateSelectionQuantity, getSelectionQuantity, clearSelections]);

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
};

// Custom Hook으로 쉽게 Context 사용하기
export const useSelection = (): SelectionContextType => {
  const context = useContext(SelectionContext);
  if (context === undefined) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
};