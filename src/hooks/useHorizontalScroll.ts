// src/hooks/useHorizontalScroll.ts

import { useState, useRef, useCallback, useEffect } from 'react';

export const useHorizontalScroll = () => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [velocity, setVelocity] = useState(0);
    const animationFrameRef = useRef<number | null>(null);

    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const startInertiaScroll = useCallback(() => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        const animateScroll = () => {
            if (!scrollRef.current || Math.abs(velocity) < 0.5) {
                setVelocity(0);
                if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
                return;
            }
            if (scrollRef.current) scrollRef.current.scrollLeft += velocity;
            setVelocity(prev => prev * 0.92);
            animationFrameRef.current = requestAnimationFrame(animateScroll);
        };
        animationFrameRef.current = requestAnimationFrame(animateScroll);
    }, [velocity]);

    const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollRef.current) return;
        e.preventDefault(); setIsDragging(true);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setStartX(e.pageX - scrollRef.current.offsetLeft);
        setScrollLeft(scrollRef.current.scrollLeft);
        setVelocity(0);
        scrollRef.current.style.cursor = 'grabbing';
    }, []);

    const onMouseLeave = useCallback(() => {
        if (isDragging) { setIsDragging(false); startInertiaScroll(); }
        if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
    }, [isDragging, startInertiaScroll]);

    const onMouseUp = useCallback(() => {
        if (isDragging) { setIsDragging(false); startInertiaScroll(); }
        if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
    }, [isDragging, startInertiaScroll]);

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = x - startX;
        const newScrollLeft = scrollLeft - walk;
        const diff = newScrollLeft - scrollRef.current.scrollLeft;
        scrollRef.current.scrollLeft = newScrollLeft;
        setVelocity(diff * 0.3);
    }, [isDragging, startX, scrollLeft]);

    const scrollByPage = useCallback((direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            const scrollAmount = container.clientWidth * 0.7;
            container.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
        }
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const handleScroll = () => {
            const { scrollLeft, scrollWidth, clientWidth } = container;
            const isScrollable = scrollWidth > clientWidth + 1;
            if (isScrollable) {
                setShowLeftArrow(scrollLeft > 5); // 약간의 여유를 줌
                setShowRightArrow(Math.ceil(scrollLeft) + clientWidth < scrollWidth - 5);
            } else {
                setShowLeftArrow(false); setShowRightArrow(false);
            }
        };
        const observer = new ResizeObserver(handleScroll);
        observer.observe(container);
        container.addEventListener('scroll', handleScroll);
        const initialCheckTimeout = setTimeout(handleScroll, 100); 
        return () => {
            container.removeEventListener('scroll', handleScroll);
            observer.disconnect();
            clearTimeout(initialCheckTimeout);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    return { scrollRef, mouseHandlers: { onMouseDown, onMouseLeave, onMouseUp, onMouseMove }, scrollByPage, showLeftArrow, showRightArrow };
};