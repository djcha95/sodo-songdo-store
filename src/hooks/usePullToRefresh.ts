import { useState, useEffect, useCallback, useRef } from 'react';

export const PULL_THRESHOLD = 80; // 새로고침이 트리거되는 당기기 거리 (px)
const MAX_PULL_DISTANCE = 110; // 시각적으로 당겨지는 최대 거리 (px)

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
}

export const usePullToRefresh = ({ onRefresh }: UsePullToRefreshOptions) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isThresholdReached, setIsThresholdReached] = useState(false);
  const touchStartY = useRef(0);
  const isTouching = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0 && e.touches[0]) {
      touchStartY.current = e.touches[0].clientY;
      isTouching.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTouching.current || !e.touches[0]) return;
    
    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY.current;

    if (distance > 0) {
      // 스크롤이 최상단일 때 아래로 당기면 브라우저 기본 동작 방지
      if (window.scrollY === 0) {
        e.preventDefault();
      }

      // 고무줄 효과: 당길수록 저항이 생기도록 처리
      const rubberBandDistance = Math.min(
        MAX_PULL_DISTANCE,
        PULL_THRESHOLD + (distance - PULL_THRESHOLD) * 0.4
      );

      setPullDistance(rubberBandDistance);
      setIsThresholdReached(rubberBandDistance > PULL_THRESHOLD + 5);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!isTouching.current) return;
    
    isTouching.current = false;
    
    if (isThresholdReached) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
    
    // 터치가 끝나면 모든 상태 초기화
    setPullDistance(0);
    setIsThresholdReached(false);

  }, [isThresholdReached, onRefresh]);

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing, isThresholdReached };
};