// src/types.ts

// ✅ 프론트엔드용 import (src/types.ts 에서 사용)
import type { Timestamp, FieldValue, DocumentData } from 'firebase/firestore';

/*
// ✅ 백엔드용 import (functions/src/types.ts 에서 사용)
import type { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { DocumentData } from "firebase/firestore"; // DocumentData는 클라이언트 SDK에서 가져오는 것이 유용할 때가 있습니다.
*/


// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
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
  waitlist?: WaitlistEntry[];
  waitlistCount?: number;
  isPrepaymentRequired?: boolean;
  allowedTiers?: LoyaltyTier[];
  preOrderTiers?: LoyaltyTier[];
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
  encoreCount?: number;
  encoreRequesterIds?: string[];
  createdAt: Timestamp;
  limitedStockAmount?: number;
  specialLabels?: SpecialLabel[];
  subCategory?: string;
  updatedAt?: Timestamp;
  tags?: string[];
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

export type UserRole = 'master' | 'admin' | 'customer';

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
}


// =================================================================
// 📌 프론트엔드 전용 타입 (Client-Side Only)
// =================================================================

// ✅ [신규] 선입금 관리 페이지 테이블 뷰를 위한 타입
export interface AggregatedProductInfo {
  id: string; // Map key: productId-variantGroupId
  productName: string;
  variantName: string;
  totalQuantity: number;
  customers: {
    name: string;
    phoneLast4: string;
    quantity: number;
  }[];
}

// ✅ [신규] 그룹화된 선입금 데이터 타입
export interface GroupedPrepaidData {
  groupKey: string; // 픽업일 또는 상품명 등
  orders: Order[]; // 그룹에 속한 모든 원본 주문
  products: AggregatedProductInfo[]; // '픽업일별' 집계 시 사용될 데이터
}

export interface AggregatedOrderGroup {
  groupKey: string;
  customerInfo: Order['customerInfo'];
  item: OrderItem;
  totalQuantity: number;
  totalPrice: number;
  status: OrderStatus;
  pickupDate: Timestamp | Date;
  pickupDeadlineDate?: Timestamp | Date | null;
  originalOrders: {
    orderId: string;
    quantity: number;
    status: OrderStatus;
  }[];
}

export interface Banner {
  id:string;
  imageUrl: string;
  linkTo?: string;
  order: number;
  createdAt: Timestamp;
  isActive: boolean;
  productId?: string;
  title?: string;
}

export interface GuideItem {
  id: string;
  title: string;
  content: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface StoreInfo {
  name: string;
  businessNumber: string;
  representative: string;
  address: string;
  phoneNumber: string;
  email: string;
  operatingHours: string[];
  description: string;
  kakaotalkChannelId?: string;
  usageGuide?: GuideItem[];
  faq?: FaqItem[];
  latitude?: number;
  longitude?: number;
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
  isPrioritized?: boolean;
  waitlistOrder?: number;
  prioritizedAt?: Timestamp | null;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phone?: string;
  isAdmin?: boolean;
  points?: number;
  loyaltyTier?: string;
  createdAt: Timestamp;
  lastLogin: Timestamp;
  encoreRequestedProductIds?: string[];
}

export interface PaginatedProductsResponse {
  products: Product[];
  lastVisible: DocumentData | null;
}

// =================================================================
// 📌 대시보드 관련 타입 (Dashboard - Client-Side)
// =================================================================
export interface TodayStockItem {
    id: string;
    variantGroupId: string;
    name: string;
    quantity: number | null;
    unitType: string;
}
export interface TodayOrderItem {
    id:string;
    customerName: string;
    productName: string;
    quantity: number;
    status: string;
}
export interface TodayPickupItem {
    id: string;
    name: string;
    pickupDeadlineDate: Timestamp;
    optionsSummary: {
        variantGroupName: string;
        unit: string;
        currentStock: number;
    }[];
}
export interface TodayOngoingProductSummary {
    id:string;
    name: string;
    deadlineDate: Timestamp;
    pickupDate: Timestamp;
    pickupDeadlineDate?: Timestamp | null;
    variantGroupsSummary: {
        variantGroupId: string;
        variantGroupName: string;
        totalPhysicalStock: number | null;
        stockUnitType: string;
        itemsSummary: {
            itemId: string;
            itemName: string;
            currentStock: number;
            stockDeductionAmount: number;
        }[];
    }[];
    totalReservedQuantity: number;
}


// =================================================================
// 📌 백엔드 전용 타입 (Server-Side Only)
// =================================================================

export interface NhnAlimtalkResponse {
  header: {
    resultCode: number;
    resultMessage: string;
    isSuccessful: boolean;
  };
  body?: {
    data: {
      requestId: string;
      requestDate: string;
      senderGroupingKey: string;
      messages: {
        messageId: string;
        recipientSeq: number;
        recipientNo: string;
        resultCode: string;
        resultMessage: string;
      }[];
    };
  };
}