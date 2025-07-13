// src/context/CartContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { CartItem } from '../types'; 
import { Timestamp } from 'firebase/firestore';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string, variantGroupId: string, itemId: string) => void;
  updateCartItemQuantity: (productId: string, variantGroupId: string, itemId: string, quantity: number) => void;
  clearCart: () => void;
  removeReservedItems: () => void;
  // ✅ [추가] 새로운 함수들의 타입 정의
  removeItems: (itemKeys: string[]) => void;
  updateItemsStatus: (itemKeys: string[], newStatus: 'RESERVATION') => void; // 'RESERVATION'으로 한정
  cartTotal: number;
  cartItemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const storedCartItems = localStorage.getItem('cartItems');
      if (storedCartItems) {
        const parsedItems = JSON.parse(storedCartItems);
        // Firestore Timestamp 객체로 변환하여 저장된 날짜 정보를 올바르게 복원
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
    localStorage.setItem('cartItems', JSON.stringify(cartItems));
  }, [cartItems]);

  const cartTotal = useMemo(() => 
    cartItems
      .filter(item => item.status === 'RESERVATION')
      .reduce((total, item) => total + (item.unitPrice * item.quantity), 0), 
    [cartItems]
  );
  
  const cartItemCount = useMemo(() => 
    cartItems
      .filter(item => item.status === 'RESERVATION')
      .reduce((count, item) => count + item.quantity, 0), 
    [cartItems]
  );

  const addToCart = useCallback((newItem: CartItem) => {
    setCartItems(prevItems => {
      const existingItemIndex = prevItems.findIndex(
        item => 
          item.productId === newItem.productId && 
          item.itemId === newItem.itemId
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        
        const isNewItemReservation = newItem.status === 'RESERVATION';
        // 새로 추가되는 아이템의 상태가 'RESERVATION'이면 무조건 'RESERVATION'으로, 아니면 기존 상태 유지
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
    setCartItems(prevItems => prevItems.filter(
      item => !(item.productId === productId && item.variantGroupId === variantGroupId && item.itemId === itemId)
    ));
  }, []);

  const updateCartItemQuantity = useCallback((productId: string, variantGroupId: string, itemId: string, quantity: number) => {
    setCartItems(prevItems => 
      prevItems.map(item =>
        (item.productId === productId && item.variantGroupId === variantGroupId && item.itemId === itemId)
          ? { ...item, quantity: Math.max(1, quantity) } // 수량은 최소 1
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const removeReservedItems = useCallback(() => {
    setCartItems(prevItems => prevItems.filter(item => item.status !== 'RESERVATION'));
  }, []);

  // ✅ [추가] 여러 아이템을 한 번에 제거하는 함수
  const removeItems = useCallback((itemKeys: string[]) => {
    setCartItems(prev => prev.filter(item => {
      const key = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      return !itemKeys.includes(key);
    }));
  }, []);

  // ✅ [추가] 여러 아이템의 상태를 한 번에 변경하는 함수
  const updateItemsStatus = useCallback((itemKeys: string[], newStatus: 'RESERVATION') => {
    setCartItems(prev => prev.map(item => {
      const key = `${item.productId}-${item.variantGroupId}-${item.itemId}`;
      if (itemKeys.includes(key)) {
        return { ...item, status: newStatus };
      }
      return item;
    }));
  }, []);

  const value = useMemo(() => ({
    cartItems,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
    removeReservedItems,
    removeItems, // ✅ Context에 추가
    updateItemsStatus, // ✅ Context에 추가
    cartTotal,
    cartItemCount,
  }), [cartItems, addToCart, removeFromCart, updateCartItemQuantity, clearCart, removeReservedItems, removeItems, updateItemsStatus, cartTotal, cartItemCount]);

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