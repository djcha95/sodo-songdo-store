// src/hooks/useLongPress.ts

import { useCallback, useRef, useEffect } from 'react';

/**
 * ✅ [버그 수정] Stale Closure 문제를 해결하기 위해, callback을 ref로 관리합니다.
 * 이를 통해 렌더링이 반복되어도 항상 최신 콜백 함수를 참조하여 기능이 멈추지 않습니다.
 */
const useLongPress = (
  callback: () => void,
  { delay = 100, initialDelay = 400 } = {}
) => {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 매 렌더링마다 최신 콜백 함수를 ref에 저장
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const start = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    // ref에 저장된 최신 콜백을 즉시 실행
    callbackRef.current();

    // 초기 딜레이 후 반복 시작
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        // ref에 저장된 최신 콜백을 반복적으로 실행
        callbackRef.current();
      }, delay);
    }, initialDelay);
  }, [delay, initialDelay]);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 컴포넌트 언마운트 시 클린업
  useEffect(() => {
    return stop;
  }, [stop]);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
  };
};

export default useLongPress;