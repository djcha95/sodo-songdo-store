// src/types.ts

import type { Timestamp, FieldValue } from 'firebase/firestore';

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN' | 'FRESH';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type OrderStatus =
  | 'RESERVED'
  | 'PREPAID'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELED'
  | 'NO_SHOW'
  | 'LATE_CANCELED';
export type UserRole = 'master' | 'admin' | 'customer';

// ❌ [제거] LoyaltyTier, SpecialLabel, ProductDisplayStatus, NotificationType 등 제거

// =================================================================
// 📌 공통 문서 구조 (Interfaces)
// =================================================================

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  limitQuantity?: number | null;
  stockDeductionAmount: number;
  expirationDate?: Timestamp | null;
}

export interface VariantGroup {
  id: string;
  groupName: string;
  items: ProductItem[];
  totalPhysicalStock: number | null;
  stockUnitType: string;
  reservedCount?: number;
  pickedUpCount?: number;
}

export interface SalesRound {
  roundId: string;
  roundName: string;
  status: SalesRoundStatus;
  variantGroups: VariantGroup[];
  publishAt: Timestamp;
  deadlineDate: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate: Timestamp | null;
  arrivalDate?: Timestamp | null;
  createdAt: Timestamp;
  isPrepaymentRequired?: boolean;
  manualStatus?: SalesRoundStatus | null;
  isManuallyOnsite?: boolean;
}

export interface Product {
  id: string;
  groupName: string;
  description: string;
  imageUrls: string[];
  storageType: StorageType;
  salesHistory: SalesRound[];
  isArchived: boolean;
  category?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  tags?: string[];
}

export interface OrderItem {
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
  pickupDate: Timestamp | Date;
  deadlineDate: Timestamp | Date;
  stockDeductionAmount: number;
  isPrepaymentRequired?: boolean;
  arrivalDate: Timestamp | Date | null;
  pickupDeadlineDate?: Timestamp | Date | null;
  expirationDate?: Timestamp | Date | null;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  phoneLast4?: string;
}

export interface Order {
  id:string;
  userId: string;
  orderNumber: string;
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: Timestamp | FieldValue;
  pickupDate: Timestamp | Date;
  pickupDeadlineDate?: Timestamp | Date | null;
  customerInfo: CustomerInfo;
  pickedUpAt?: Timestamp | null;
  prepaidAt?: Timestamp | null;
  notes?: string;
  canceledAt?: Timestamp;
  wasPrepaymentRequired?: boolean;
}

export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  phoneLast4?: string;
  photoURL?: string | null;
  role: UserRole;
  createdAt?: Timestamp | FieldValue;
  lastLoginDate: string;
  nickname?: string;
}