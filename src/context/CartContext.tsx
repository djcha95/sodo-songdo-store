// src/context/CartContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { CartItem } from '../types'; 
// ✅ Timestamp 객체를 직접 사용하기 위해 import 합니다.
import { Timestamp } from 'firebase/firestore';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string, variantGroupId: string, itemId: string) => void;
  updateCartItemQuantity: (productId: string, variantGroupId: string, itemId: string, quantity: number) => void;
  clearCart: () => void;
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
        // ✅ [수정] localStorage에서 불러온 데이터의 날짜 형식을 복구합니다.
        return parsedItems.map((item: any) => ({
          ...item,
          // Firestore Timestamp 객체를 다시 생성합니다.
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
    try {
      // ✅ Timestamp 객체도 올바르게 JSON으로 변환되므로, 저장 로직은 그대로 둡니다.
      localStorage.setItem('cartItems', JSON.stringify(cartItems));
    } catch (error) {
      console.error('Failed to save cart items to localStorage', error);
    }
  }, [cartItems]);

  const cartTotal = useMemo(() => 
    cartItems.reduce((total, item) => total + (item.unitPrice * item.quantity), 0), 
    [cartItems]
  );

  const cartItemCount = useMemo(() => 
    cartItems.reduce((count, item) => count + item.quantity, 0), 
    [cartItems]
  );

  const addToCart = useCallback((newItem: CartItem) => {
    setCartItems(prevItems => {
      const existingItemIndex = prevItems.findIndex(
        item => 
          item.productId === newItem.productId && 
          item.roundId === newItem.roundId &&
          item.variantGroupId === newItem.variantGroupId &&
          item.itemId === newItem.itemId
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        
        updatedItems[existingItemIndex] = {
          ...existingItem,
          quantity: existingItem.quantity + newItem.quantity,
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

  const value = useMemo(() => ({
    cartItems,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
    cartTotal,
    cartItemCount,
  }), [cartItems, addToCart, removeFromCart, updateCartItemQuantity, clearCart, cartTotal, cartItemCount]);

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