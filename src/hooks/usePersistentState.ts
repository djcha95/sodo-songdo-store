// src/hooks/usePersistentState.ts

import { useState, useEffect } from 'react';

/**
 * useState와 유사하지만, 상태를 localStorage에 자동으로 저장하고,
 * 페이지 로딩 시 저장된 값을 불러오는 커스텀 훅입니다.
 * @param key localStorage에 저장될 키
 * @param defaultValue 초기값
 * @returns [상태, 상태 설정 함수]
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      // 저장된 값이 있으면 그 값을 파싱해서 사용하고, 없으면 초기값을 사용합니다.
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      // 상태(state)가 변경될 때마다 localStorage에 자동으로 저장합니다.
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, state]);

  return [state, setState];
}