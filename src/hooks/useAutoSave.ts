// src/hooks/useAutoSave.ts - 자동 저장 훅

import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

interface AutoSaveOptions {
  key: string;
  data: any;
  interval?: number; // ms
  onSave?: (data: any) => void;
  enabled?: boolean;
}

export const useAutoSave = ({
  key,
  data,
  interval = 30000, // 30초
  onSave,
  enabled = true,
}: AutoSaveOptions) => {
  const lastSavedRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveToLocalStorage = useCallback((dataToSave: any) => {
    try {
      const serialized = JSON.stringify(dataToSave);
      if (serialized !== lastSavedRef.current) {
        localStorage.setItem(`autosave_${key}`, serialized);
        lastSavedRef.current = serialized;
        onSave?.(dataToSave);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Auto-save failed:', error);
      return false;
    }
  }, [key, onSave]);

  // 주기적 자동 저장
  useEffect(() => {
    if (!enabled) return;

    const save = () => {
      saveToLocalStorage(data);
    };

    saveTimeoutRef.current = setInterval(save, interval);

    return () => {
      if (saveTimeoutRef.current) {
        clearInterval(saveTimeoutRef.current);
      }
    };
  }, [data, interval, enabled, saveToLocalStorage]);

  // 언마운트 시 최종 저장
  useEffect(() => {
    return () => {
      if (enabled) {
        saveToLocalStorage(data);
      }
    };
  }, []);

  // 수동 저장 함수
  const manualSave = useCallback(() => {
    const saved = saveToLocalStorage(data);
    if (saved) {
      toast.success('자동 저장되었습니다', { duration: 2000, icon: '💾' });
    }
    return saved;
  }, [data, saveToLocalStorage]);

  // 저장된 데이터 복구
  const restore = useCallback(() => {
    try {
      const saved = localStorage.getItem(`autosave_${key}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Restore failed:', error);
    }
    return null;
  }, [key]);

  // 저장된 데이터 삭제
  const clear = useCallback(() => {
    localStorage.removeItem(`autosave_${key}`);
    lastSavedRef.current = '';
  }, [key]);

  return {
    manualSave,
    restore,
    clear,
  };
};

