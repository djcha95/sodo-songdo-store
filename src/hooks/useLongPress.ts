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
  
  // ✅ "꾹 누르기"가 발동되었는지 추적하는 플래그
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    longPressCallbackRef.current = longPressCallback;
    clickCallbackRef.current = clickCallback;
  }, [longPressCallback, clickCallback]);

  // 마우스를 누르기 시작할 때
  const start = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    // ✅ [수정] passive listener 경고를 해결하기 위해 'mousedown' 이벤트에만 preventDefault를 적용합니다.
    // 이렇게 하면 터치 이벤트에서 발생하는 경고를 피하면서, 데스크톱에서 꾹 누를 때 텍스트가 선택되는 현상을 방지할 수 있습니다.
    if (event.type === 'mousedown' && event.cancelable) {
      event.preventDefault();
    }
    
    // 플래그 초기화
    longPressTriggeredRef.current = false;

    // 꾹 누르기 타이머 설정
    timeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true; // 플래그 세우기
      longPressCallbackRef.current(); // 꾹 누르기 콜백 첫 실행
      
      // 반복 실행 설정
      intervalRef.current = setInterval(() => {
        longPressCallbackRef.current();
      }, delay);
    }, initialDelay);
  }, [delay, initialDelay]);

  // 마우스를 떼거나, 버튼 밖으로 나갔을 때
  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  // ✅ "짧은 클릭"을 처리할 onClick 핸들러
  const handleClick = useCallback(() => {
    // 꾹 누르기가 발동되지 않았을 때만 짧은 클릭으로 간주
    if (!longPressTriggeredRef.current) {
      clickCallbackRef.current();
    }
  }, []);

  useEffect(() => {
    // 컴포넌트 언마운트 시 모든 타이머 정리
    return stop;
  }, [stop]);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
    onClick: handleClick, // ✅ onClick 핸들러를 반환
  };
};

export default useLongPress;