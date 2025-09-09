// src/hooks/useLongPress.ts

import { useCallback, useRef, useEffect } from 'react';

const useLongPress = (
  longPressCallback: () => void,
  clickCallback: () => void,
  { delay = 100, initialDelay = 400 } = {}
) => {
  const longPressCallbackRef = useRef(longPressCallback);
  const clickCallbackRef = useRef(clickCallback);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    longPressCallbackRef.current = longPressCallback;
    clickCallbackRef.current = clickCallback;
  }, [longPressCallback, clickCallback]);

  const start = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (event.type === 'mousedown' && event.cancelable) {
      event.preventDefault();
    }
    longPressTriggeredRef.current = false;

    timeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      longPressCallbackRef.current();
      
      intervalRef.current = setInterval(() => {
        longPressCallbackRef.current();
      }, delay);
    }, initialDelay);
  }, [delay, initialDelay]);

  // ✅ [수정] 타이머만 취소하는 별도의 함수를 만듭니다.
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  // ✅ [수정] 마우스를 뗄 때만 클릭을 판정하는 함수입니다.
  const handleStop = useCallback(() => {
    // 롱클릭이 발동되기 전에 손을 뗐다면, 짧은 클릭으로 간주
    if (longPressTriggeredRef.current === false) {
      clickCallbackRef.current();
    }
    // 모든 타이머 정리
    cancel();
  }, [cancel]); // cancel 함수에 의존합니다.

  useEffect(() => {
    // 컴포넌트가 사라질 때 타이머 정리
    return cancel;
  }, [cancel]);

  return {
    onMouseDown: start,
    onTouchStart: start,
    // ✅ [핵심 수정] 이벤트 핸들러를 올바르게 분리합니다.
    onMouseUp: handleStop,      // 마우스 버튼을 뗄 때
    onTouchEnd: handleStop,     // 터치를 뗄 때
    onMouseLeave: cancel,       // 마우스가 요소 밖으로 나갈 때 (타이머만 취소)
  };
};

export default useLongPress;