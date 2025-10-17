// functions/src/types.ts

// 백엔드용 import
import type { Timestamp, FieldValue } from "firebase-admin/firestore";

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN' | 'FRESH';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended' | 'DRAW_COMPLETED';
export type OrderStatus =
  | 'RESERVED'
  | 'PREPAID'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELED'
  | 'NO_SHOW'
  | 'LATE_CANCELED';
export type SpecialLabel = '수량 한정' | '이벤트 특가' | '신상품';
export type ProductDisplayStatus = 'ONGOING' | 'ADDITIONAL_RESERVATION' | 'PAST';

export type LoyaltyTier =
  | '공구의 신'
  | '공구왕'
  | '공구요정'
  | '공구새싹'
  | '주의 요망'
  | '참여 제한';

export type NotificationType =
  | 'POINTS_EARNED'
  | 'POINTS_USED'
  | 'WAITLIST_CONFIRMED'
  | 'PICKUP_REMINDER'
  | 'PICKUP_TODAY'
  | 'GENERAL_INFO'
  | 'PAYMENT_CONFIRMED'
  | 'ORDER_PICKED_UP'
  | 'NO_SHOW_WARNING'
  | 'PARTICIPATION_RESTRICTED'
  | 'TIER_UP'
  | 'TIER_DOWN'
  | 'ENCORE_AVAILABLE'
  | 'PRODUCT_UPDATE'
  | 'success'
  | 'error';

export type UserRole = 'master' | 'admin' | 'customer';


// =================================================================
// 📌 공통 문서 구조 (Interfaces)
// =================================================================

export interface PointLog {
  id: string;
  amount: number;
  reason: string;
  createdAt: Timestamp | FieldValue;
  orderId?: string;
  expiresAt?: Timestamp | null;
  isExpired?: boolean;
}

export interface Notification {
  id: string;
  message: string;
  read: boolean;
  timestamp: Timestamp;
  link?: string;
  type: NotificationType;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  order: number;
  subCategories?: Category[];
}

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

export interface WaitlistEntry {
  userId: string;
  quantity: number;
  timestamp: Timestamp;
  variantGroupId: string;
  itemId: string;
  isPrioritized?: boolean;
  prioritizedAt?: Timestamp | null;
}

// ✅ [수정] 관리자 페이지에 필요한 모든 속성을 포함한 완전한 SalesRound 인터페이스
export interface SalesRound {
  roundId: string;
  roundName: string;
  status: SalesRoundStatus;
  variantGroups: VariantGroup[];
  publishAt: Timestamp;
  deadlineDate: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate: Timestamp | null; // ✅ [복원]
  arrivalDate?: Timestamp | null; // ✅ [복원]
  createdAt: Timestamp;
  waitlist?: WaitlistEntry[];
  waitlistCount?: number;
  isPrepaymentRequired?: boolean;
  allowedTiers?: LoyaltyTier[];
  preOrderTiers?: LoyaltyTier[];
  manualStatus?: SalesRoundStatus | null; // ✅ [복원]
  isManuallyOnsite?: boolean; // ✅ [복원]
  eventType?: string | null; // ✅ [복원]
  entryCount?: number; // ✅ [복원]
}

// ✅ [수정] 관리자 페이지에 필요한 모든 속성을 포함한 완전한 Product 인터페이스
export interface Product {
  id: string;
  groupName: string;
  description: string;
  imageUrls: string[];
  storageType: StorageType;
  salesHistory: SalesRound[];
  isArchived: boolean;
  createdAt: Timestamp;
  isVisible?: boolean; // ✅ [복원]
  category?: string; // ✅ [복원]
  encoreCount?: number;
  encoreRequesterIds?: string[];
  limitedStockAmount?: number;
  specialLabels?: SpecialLabel[];
  subCategory?: string;
  updatedAt?: Timestamp; // ✅ [복원]
  tags?: string[]; // ✅ [복원]
  hashtags?: string[];
  reservedQuantities?: { [key: string]: number };
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
  pickupDate: Timestamp | Date;
  status: 'RESERVATION' | 'WAITLIST';
  deadlineDate: Timestamp | Date;
  stockDeductionAmount: number;
  isPrepaymentRequired?: boolean;
}

export interface OrderItem extends Omit<CartItem, 'status'> {
  arrivalDate: Timestamp | Date | null;
  pickupDeadlineDate?: Timestamp | Date | null;
  expirationDate?: Timestamp | Date | null;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  phoneLast4?: string;
}

// ✅ [수정] 모든 속성을 포함한 완전한 Order 인터페이스
export interface Order {
  id: string;
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
  isBookmarked?: boolean;
  canceledAt?: Timestamp;
  wasPrepaymentRequired?: boolean;
  splitFrom?: string;
  eventId?: string;
}

export interface UserTutorialProgress {
    hasCompletedMain?: boolean;
    hasSeenProductDetailPage?: boolean;
    hasSeenCartPage?: boolean;
    hasSeenOrderHistoryPage?: boolean;
    hasSeenCustomerCenterPage?: boolean;
    hasSeenMyPage?: boolean;
    hasSeenCalendarPage?: boolean;
}

// ✅ [수정] 모든 속성을 포함한 완전한 UserDocument 인터페이스
export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  phoneLast4?: string;
  photoURL?: string | null;
  role: UserRole;
  encoreRequestedProductIds?: string[];
  createdAt?: Timestamp | FieldValue;
  points: number;
  pointHistory?: PointLog[];
  loyaltyTier: LoyaltyTier;
  pickupCount: number;
  noShowCount: number;
  lastLoginDate: string;
  consecutiveLoginDays?: number;
  isSuspended?: boolean;
  gender?: 'male' | 'female' | null;
  ageRange?: string | null;
  totalOrders?: number;
  pickedUpOrders?: number;
  pickupRate?: number;
  totalPriceSum?: number;
  referralCode?: string;
  referredBy?: string | null;
  nickname?: string;
  nicknameChanged?: boolean;
  manualTier?: LoyaltyTier | null;
  hasCompletedTutorial?: boolean;
  tutorialProgress?: UserTutorialProgress;
  completedMissions?: { [key: string]: boolean };
  enteredRaffleIds?: string[];
}


// ✅ [수정] NHN Alimtalk API 응답 타입을 정의합니다.
export interface NhnAlimtalkResponse {
  header: {
    isSuccessful: boolean;
    resultCode: number;
    resultMessage: string;
  };
  body?: {
    data: {
      requestId: string;
      requestTime: string;
      statusCode: string;
      senderKey: string;
      recipientList: {
        recipientNo: string;
        messageId: string;
        recipientSeq: number;
        resultCode: string;
        resultMessage: string;
      }[];
    };
  };
}
