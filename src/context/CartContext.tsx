// src/context/CartContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { CartItem } from '../types'; 
import { Timestamp } from 'firebase/firestore';

interface CartContextType {
  // [개선] 명확성을 위해 변수명 변경 및 추가
  allItems: CartItem[]; // 예약 + 대기 모든 아이템
  reservationItems: CartItem[]; // 예약 상태 아이템
  waitlistItems: CartItem[]; // 대기 상태 아이템
  
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string, variantGroupId: string, itemId: string) => void;
  updateCartItemQuantity: (productId: string, variantGroupId: string, itemId: string, quantity: number) => void;
  clearCart: () => void;
  removeReservedItems: () => void;
  
  // 기존 일괄 처리 함수
  removeItems: (itemKeys: string[]) => void;
  updateItemsStatus: (itemKeys: string[], newStatus: 'RESERVATION') => void;

  // [개선] 예약/대기 별로 분리된 값 제공
  reservationTotal: number; // 예약 총액
  reservationItemCount: number; // 예약 상품 수량
  waitlistItemCount: number; // 대기 상품 수량
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [allItems, setAllItems] = useState<CartItem[]>(() => {
    try {
      const storedItems = localStorage.getItem('cartItems'); // 키는 'cartItems' 그대로 사용
      if (storedItems) {
        const parsedItems = JSON.parse(storedItems);
        return parsedItems.map((item: any) => ({
          ...item,
          pickupDate: new Timestamp(item.pickupDate.seconds, item.pickupDate.nanoseconds),
        }));
      }
      return [];
    } catch (error) {
      console.error('Failed to parse cart items from localStorage', error);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('cartItems', JSON.stringify(allItems));
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

  const addToCart = useCallback((newItem: CartItem) => {
    setAllItems(prevItems => {
      const existingItemIndex = prevItems.findIndex(
        item => item.productId === newItem.productId && item.itemId === newItem.itemId
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        
        const isNewItemReservation = newItem.status === 'RESERVATION';
        const finalStatus = isNewItemReservation ? 'RESERVATION' : existingItem.status;

        updatedItems[existingItemIndex] = {
          ...existingItem,
          quantity: existingItem.quantity + newItem.quantity,
          status: finalStatus,
        };
        return updatedItems;
      } else {
        return [...prevItems, newItem];
      }
    });
  }, []);

  const removeFromCart = useCallback((productId: string, variantGroupId: string, itemId: string) => {
    setAllItems(prevItems => prevItems.filter(
      item => !(item.productId === productId && item.variantGroupId === variantGroupId && item.itemId === itemId)
    ));
  }, []);

  const updateCartItemQuantity = useCallback((productId: string, variantGroupId: string, itemId: string, quantity: number) => {
    setAllItems(prevItems => 
      prevItems.map(item =>
        (item.productId === productId && item.variantGroupId === variantGroupId && item.itemId === itemId)
          ? { ...item, quantity: Math.max(1, quantity) }
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setAllItems([]);
  }, []);

  const removeReservedItems = useCallback(() => {
    setAllItems(prevItems => prevItems.filter(item => item.status !== 'RESERVATION'));
  }, []);

  const removeItems = useCallback((itemKeys: string[]) => {
    setAllItems(prev => prev.filter(item => {
      const key = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      return !itemKeys.includes(key);
    }));
  }, []);

  const updateItemsStatus = useCallback((itemKeys: string[], newStatus: 'RESERVATION') => {
    setAllItems(prev => prev.map(item => {
      const key = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      if (itemKeys.includes(key)) {
        return { ...item, status: newStatus };
      }
      return item;
    }));
  }, []);

  const value = useMemo(() => ({
    allItems,
    reservationItems,
    waitlistItems,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
    removeReservedItems,
    removeItems,
    updateItemsStatus,
    reservationTotal,
    reservationItemCount,
    waitlistItemCount,
  }), [
    allItems, reservationItems, waitlistItems, 
    addToCart, removeFromCart, updateCartItemQuantity, 
    clearCart, removeReservedItems, removeItems, updateItemsStatus, 
    reservationTotal, reservationItemCount, waitlistItemCount
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