// src/context/CartContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { CartItem } from '@/types';
import { Timestamp } from 'firebase/firestore';

interface CartContextType {
  allItems: CartItem[];
  reservationItems: CartItem[];
  waitlistItems: CartItem[];
  addToCart: (item: CartItem) => void;
  updateCartItemQuantity: (itemId: string, newQuantity: number) => void;
  removeItems: (itemIds: string[]) => void;
  removeReservedItems: () => void;
  clearCart: () => void;
  reservationTotal: number;
  reservationItemCount: number;
  waitlistItemCount: number;
  totalItemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [allItems, setAllItems] = useState<CartItem[]>(() => {
    try {
      const storedItems = localStorage.getItem('cartItems');
      if (storedItems) {
        const parsedItems = JSON.parse(storedItems);
        return parsedItems.map((item: any) => ({
          ...item,
          // Timestamp 객체로 변환
          pickupDate: item.pickupDate && item.pickupDate.seconds !== undefined ? new Timestamp(item.pickupDate.seconds, item.pickupDate.nanoseconds) : item.pickupDate,
          deadlineDate: item.deadlineDate && item.deadlineDate.seconds !== undefined ? new Timestamp(item.deadlineDate.seconds, item.deadlineDate.nanoseconds) : item.deadlineDate,
        }));
      }
      return [];
    } catch (error) {
      console.error('Failed to parse cart items from localStorage', error);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cartItems', JSON.stringify(allItems));
    } catch (error) {
      console.error("장바구니 저장 실패:", error);
    }
  }, [allItems]);

  // [개선] 예약 아이템만 필터링
  const reservationItems = useMemo(() =>
    allItems.filter(item => item.status === 'RESERVATION'),
    [allItems]
  );

  // [개선] 대기 아이템만 필터링
  const waitlistItems = useMemo(() =>
    allItems.filter(item => item.status === 'WAITLIST'),
    [allItems]
  );

  const reservationTotal = useMemo(() =>
    reservationItems.reduce((total, item) => total + (item.unitPrice * item.quantity), 0),
    [reservationItems]
  );

  const reservationItemCount = useMemo(() =>
    reservationItems.reduce((count, item) => count + item.quantity, 0),
    [reservationItems]
  );

  // [추가] 대기 상품 수량 계산
  const waitlistItemCount = useMemo(() =>
    waitlistItems.reduce((count, item) => count + item.quantity, 0),
    [waitlistItems]
  );

  const totalItemCount = useMemo(() => allItems.length, [allItems]); // totalItemCount 추가

  const addToCart = useCallback((newItem: CartItem) => {
    setAllItems(prevItems => {
      // 대기 상품은 항상 새 항목으로 추가 (합산 X)
      if (newItem.status === 'WAITLIST') {
        // 기존 대기 아이템 중 동일한 id가 있는지 확인하여 중복 추가 방지
        if (prevItems.some(item => item.id === newItem.id && item.status === 'WAITLIST')) {
            return prevItems; // 이미 존재하면 추가하지 않음
        }
        return [...prevItems, newItem];
      }

      // 예약 상품은 기존에 있으면 수량만 더함 (id가 아닌 productId, itemId로 식별)
      const existingItemIndex = prevItems.findIndex(
        item => item.status === 'RESERVATION' &&
                item.productId === newItem.productId &&
                item.itemId === newItem.itemId
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        updatedItems[existingItemIndex] = {
          ...existingItem,
          quantity: existingItem.quantity + newItem.quantity,
          // status는 'RESERVATION'으로 고정 (addToCart의 로직에서)
        };
        return updatedItems;
      } else {
        return [...prevItems, newItem];
      }
    });
  }, []);

  // ✅ [수정] 고유 ID를 기준으로 수량을 변경하는 함수
  const updateCartItemQuantity = useCallback((itemId: string, newQuantity: number) => {
    setAllItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId
          ? { ...item, quantity: Math.max(1, newQuantity) } // 수량은 최소 1
          : item
      )
    );
  }, []);

  // ✅ [수정] 고유 ID 목록을 기준으로 항목을 제거하는 함수
  const removeItems = useCallback((itemIds: string[]) => {
    const idSet = new Set(itemIds);
    setAllItems(prevItems => prevItems.filter(item => !idSet.has(item.id)));
  }, []);

  const removeReservedItems = useCallback(() => {
    setAllItems(prevItems => prevItems.filter(item => item.status !== 'RESERVATION'));
  }, []);

  const clearCart = useCallback(() => {
    setAllItems([]);
  }, []);

  const value = useMemo(() => ({
    allItems,
    reservationItems,
    waitlistItems,
    addToCart,
    updateCartItemQuantity,
    removeItems,
    removeReservedItems,
    clearCart,
    reservationTotal,
    reservationItemCount,
    waitlistItemCount,
    totalItemCount,
  }), [
    allItems, reservationItems, waitlistItems,
    addToCart, updateCartItemQuantity, removeItems,
    removeReservedItems, clearCart,
    reservationTotal, reservationItemCount, waitlistItemCount, totalItemCount
  ]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};