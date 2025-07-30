// functions/src/types.ts

import type { Timestamp, FieldValue } from "firebase-admin/firestore";

export interface PointLog {
  amount: number;
  reason: string;
  createdAt: Timestamp;
  orderId?: string;
  expiresAt?: Timestamp | null;
  isExpired?: boolean;
}

export interface UserDocument {
  uid: string;
  displayName: string | null;
  phone?: string | null; // ✨ [추가] 이 줄을 추가하여 오류를 해결합니다.
  points: number;
  pickupCount?: number;
  noShowCount?: number; 
  referredBy?: string | null;
  referralCode?: string;
  pointHistory?: PointLog[];
  loyaltyTier?: string;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  phoneLast4?: string;
}

export interface OrderItem {
  productId: string;
  roundId: string;
  variantGroupId: string;
  quantity: number;
  unitPrice: number;
  productName?: string;
  imageUrl?: string;
  itemId?: string;
  itemName?: string;
  pickupDate?: Timestamp;
  deadlineDate?: Timestamp;
}

export interface Order {
  id?: string;
  userId: string;
  customerInfo: CustomerInfo;
  items: OrderItem[];
  totalPrice: number;
  orderNumber?: string;
  status: "RESERVED" | "PREPAID" | "PICKED_UP" | "COMPLETED" | "NO_SHOW" | "CANCELED" | "confirmed" | "cancelled";
  createdAt?: Timestamp | FieldValue;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  notes?: string;
  isBookmarked?: boolean;
  wasPrepaymentRequired?: boolean;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  variantGroupName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  stock: number | null;
  pickupDate: Timestamp;
  status: 'RESERVATION' | 'WAITLIST';
  deadlineDate: Timestamp;
  stockDeductionAmount: number; 
  isPrepaymentRequired?: boolean;
}

export interface WaitlistInfo {
  productId: string;
  productName: string;
  roundId: string;
  roundName: string;
  variantGroupId: string;
  itemId: string;
  itemName: string;
  imageUrl: string;
  quantity: number;
  timestamp: Timestamp;
  isPrioritized: boolean;
}