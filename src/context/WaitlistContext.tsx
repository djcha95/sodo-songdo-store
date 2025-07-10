// src/context/WaitlistContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { WaitlistItem } from '../types';
import { Timestamp } from 'firebase/firestore';

interface WaitlistContextType {
  waitlistItems: WaitlistItem[];
  addToWaitlist: (items: WaitlistItem[]) => void;
  removeFromWaitlist: (productId: string, itemName: string) => void;
  clearWaitlist: () => void;
}

const WaitlistContext = createContext<WaitlistContextType | undefined>(undefined);

export const WaitlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [waitlistItems, setWaitlistItems] = useState<WaitlistItem[]>(() => {
    try {
      const storedItems = localStorage.getItem('waitlistItems');
      if (storedItems) {
        const parsedItems = JSON.parse(storedItems);
        return parsedItems.map((item: any) => ({
          ...item,
          timestamp: new Timestamp(item.timestamp.seconds, item.timestamp.nanoseconds),
        }));
      }
      return [];
    } catch (error) {
      console.error('Failed to parse waitlist items from localStorage', error);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('waitlistItems', JSON.stringify(waitlistItems));
  }, [waitlistItems]);

  const addToWaitlist = (newItems: WaitlistItem[]) => {
    setWaitlistItems(prevItems => {
      const updatedItems = [...prevItems];
      newItems.forEach(newItem => {
        const existingIndex = updatedItems.findIndex(
          item => item.productId === newItem.productId && item.itemName === newItem.itemName
        );
        if (existingIndex > -1) {
          // 이미 대기중인 상품이면 수량만 더함
          updatedItems[existingIndex].quantity += newItem.quantity;
        } else {
          updatedItems.push(newItem);
        }
      });
      return updatedItems;
    });
  };

  const removeFromWaitlist = (productId: string, itemName: string) => {
    setWaitlistItems(prevItems =>
      prevItems.filter(item => !(item.productId === productId && item.itemName === itemName))
    );
  };

  const clearWaitlist = () => {
    setWaitlistItems([]);
  };

  return (
    <WaitlistContext.Provider value={{ waitlistItems, addToWaitlist, removeFromWaitlist, clearWaitlist }}>
      {children}
    </WaitlistContext.Provider>
  );
};

export const useWaitlist = () => {
  const context = useContext(WaitlistContext);
  if (!context) {
    throw new Error('useWaitlist must be used within a WaitlistProvider');
  }
  return context;
};