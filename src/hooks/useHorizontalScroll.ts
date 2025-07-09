// src/hooks/useHorizontalScroll.ts

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * @description 수평 스크롤 컨테이너의 스크롤 상태와 제어 함수를 제공하는 커스텀 훅.
 * 드래그 스크롤, 화살표 버튼, 동적 컨텐츠 변경에 대응합니다.
 */
export const useHorizontalScroll = () => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    // ✅ [개선] 스크롤 화살표 표시 여부를 안정적으로 업데이트하는 함수
    const checkArrows = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;

        // 컨텐츠의 전체 너비가 컨테이너의 보이는 너비보다 큰지 확인 (스크롤 가능 여부)
        const isScrollable = el.scrollWidth > el.clientWidth;

        if (isScrollable) {
            // 스크롤 위치가 맨 왼쪽에서 조금이라도 벗어났는지 확인
            setShowLeftArrow(el.scrollLeft > 1);
            // 스크롤 위치가 맨 오른쪽 끝에서 조금이라도 떨어져 있는지 확인
            setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
        } else {
            // 스크롤이 불가능하면 양쪽 화살표 모두 숨김
            setShowLeftArrow(false);
            setShowRightArrow(false);
        }
    }, []);

    // ✅ [개선] 컨테이너의 크기 변경이나 자식 요소의 변경을 감지하여 화살표 상태를 업데이트
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        // 컴포넌트 마운트 시 초기 화살표 상태 확인
        // setTimeout을 사용하여 자식 요소들이 렌더링될 시간을 줍니다.
        const initialCheckTimeout = setTimeout(checkArrows, 100);

        // 스크롤 이벤트 발생 시 화살표 상태 업데이트
        el.addEventListener('scroll', checkArrows);

        // 컨테이너의 크기가 변경될 때 화살표 상태 업데이트
        const resizeObserver = new ResizeObserver(checkArrows);
        resizeObserver.observe(el);

        // 컨테이너의 자식 요소(상품 카드)가 추가/제거될 때 화살표 상태 업데이트
        const mutationObserver = new MutationObserver(checkArrows);
        mutationObserver.observe(el, { childList: true, subtree: true });

        // 클린업 함수
        return () => {
            clearTimeout(initialCheckTimeout);
            el.removeEventListener('scroll', checkArrows);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
        };
    }, [checkArrows]);


    // --- 드래그 스크롤 로직 ---
    const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - scrollRef.current.offsetLeft);
        setScrollLeft(scrollRef.current.scrollLeft);
        scrollRef.current.style.cursor = 'grabbing';
    }, []);

    const onMouseLeaveOrUp = useCallback(() => {
        setIsDragging(false);
        if (scrollRef.current) {
            scrollRef.current.style.cursor = 'grab';
        }
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = x - startX; // 마우스가 이동한 거리
        scrollRef.current.scrollLeft = scrollLeft - walk;
    }, [isDragging, startX, scrollLeft]);


    // --- 페이지 단위 스크롤 함수 ---
    const scrollByPage = useCallback((direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            // 컨테이너 너비의 80%만큼 부드럽게 스크롤
            const scrollAmount = container.clientWidth * 0.8;
            container.scrollBy({
                left: direction === 'right' ? scrollAmount : -scrollAmount,
                behavior: 'smooth'
            });
        }
    }, []);

    return {
        scrollRef,
        mouseHandlers: {
            onMouseDown,
            onMouseLeave: onMouseLeaveOrUp,
            onMouseUp: onMouseLeaveOrUp,
            onMouseMove
        },
        scrollByPage,
        showLeftArrow,
        showRightArrow
    };
};
