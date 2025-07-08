// src/context/CartContext.tsx

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { CartItem } from '../types'; 

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

export const CartProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const storedCartItems = localStorage.getItem('cartItems');
      return storedCartItems ? JSON.parse(storedCartItems) : [];
    } catch (error) {
      console.error('Failed to parse cart items from localStorage', error);
      return [];
    }
  });

  useEffect(() => {
    try {
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
      // 💡 [수정] 상품 ID와 모든 옵션 ID(variantGroupId, itemId)가 일치하는 상품을 찾습니다.
      const existingItemIndex = prevItems.findIndex(
        item => 
          item.productId === newItem.productId && 
          item.roundId === newItem.roundId && // 같은 판매 회차인지도 확인
          item.variantGroupId === newItem.variantGroupId &&
          item.itemId === newItem.itemId
      );

      // 이미 장바구니에 있는 경우
      if (existingItemIndex > -1) {
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        
        // 새로 추가하는 수량과 기존 수량을 합칩니다.
        updatedItems[existingItemIndex] = {
          ...existingItem,
          quantity: existingItem.quantity + newItem.quantity,
        };
        console.log('Cart: Merged item quantity.', updatedItems);
        return updatedItems;
      } else {
        // 장바구니에 없는 새로운 상품인 경우
        console.log('Cart: Added new item.', [...prevItems, newItem]);
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
          ? { ...item, quantity: Math.max(1, quantity) } // 최소 수량은 1로 유지
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