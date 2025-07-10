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
  removeReservedItems: () => void; // ✅ [추가] 예약 상품 제거 함수 타입
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
        
        // ✅ [개선] 상태 병합 로직 개선
        const isNewItemReservation = newItem.status === 'RESERVATION';
        
        // 새로 추가하는 아이템이 '예약'이면, 기존 아이템의 상태도 '예약'으로 승격시킵니다.
        // 새로 추가하는 아이템이 '대기'이면, 기존 아이템의 상태를 그대로 유지합니다.
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
          ? { ...item, quantity: Math.max(1, quantity) }
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  // ✅ [추가] '예약' 상태의 상품만 장바구니에서 제거하는 함수
  const removeReservedItems = useCallback(() => {
    setCartItems(prevItems => prevItems.filter(item => item.status !== 'RESERVATION'));
  }, []);

  const value = useMemo(() => ({
    cartItems,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
    removeReservedItems, // ✅ Context에 함수 추가
    cartTotal,
    cartItemCount,
  }), [cartItems, addToCart, removeFromCart, updateCartItemQuantity, clearCart, removeReservedItems, cartTotal, cartItemCount]);

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