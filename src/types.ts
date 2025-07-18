// src/types.ts

import type { Timestamp, FieldValue } from 'firebase/firestore';

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type OrderStatus = 'RESERVED' | 'PREPAID' | 'PICKED_UP' | 'CANCELED' | 'COMPLETED' | 'NO_SHOW';
export type SpecialLabel = '수량 한정' | '이벤트 특가' | '신상품';

export type ProductDisplayStatus = 'ONGOING' | 'ADDITIONAL_RESERVATION' | 'PAST';


export type LoyaltyTier = '조약돌' | '수정' | '에메랄드' | '다이아몬스';

export interface PointLog {
  id: string;
  amount: number;
  reason: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export type NotificationType =
  | 'GENERAL'
  | 'WAITLIST_CONFIRMED'
  | 'PICKUP_REMINDER'
  | 'PICKUP_TODAY'
  | 'NEW_INTERACTION'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

export interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  timestamp: Timestamp;
  link?: string;
  type: NotificationType;
}


// =================================================================
// 📌 상품 및 판매 관련 타입
// =================================================================

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  stock: number; // -1은 무제한
  limitQuantity?: number | null; // 1인당 최대 구매 가능 수량 (null 허용)
  stockDeductionAmount: number;
  expirationDate?: Timestamp | null;
}

export interface VariantGroup {
  id: string;
  groupName: string;
  items: ProductItem[];
  totalPhysicalStock: number | null; // 그룹 전체가 공유하는 물리적 재고, null이면 개별 재고 사용
  stockUnitType: string;
}

export interface WaitlistEntry {
  userId: string;
  quantity: number;
  timestamp: Timestamp;
  variantGroupId: string;
  itemId: string;
}

export interface SalesRound {
  roundId: string;
  roundName:string;
  status: SalesRoundStatus;
  variantGroups: VariantGroup[];
  publishAt: Timestamp;
  deadlineDate: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  arrivalDate?: Timestamp | null;
  createdAt: Timestamp;
  waitlist?: WaitlistEntry[];
  waitlistCount?: number;
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
}


// =================================================================
// 🛒 장바구니 및 주문 관련 타입
// =================================================================

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
}

export interface OrderItem extends Omit<CartItem, 'status'> {
  arrivalDate: Timestamp | Date | null;
  pickupDeadlineDate: Timestamp | Date | null;
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

// =================================================================
// ⚙️ 기타 애플리케이션 타입
// =================================================================
export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  photoURL?: string | null;
  role: 'admin' | 'customer';
  encoreRequestedProductIds?: string[];
  createdAt?: Timestamp | FieldValue;
  loyaltyPoints: number;
  pickupCount: number;
  noShowCount: number;
  lastLoginDate: string;
  isRestricted?: boolean;
  gender?: 'male' | 'female' | null;
  ageRange?: string | null;
  loyaltyTier?: string;
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

export interface Category {
  id: string;
  name: string;
  order: number;
  subCategories?: Category[];
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

// =================================================================
// 📊 대시보드 관련 타입
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

export interface WaitlistItem {
  productId: string;
  productName: string;
  itemName: string;
  quantity: number;
  imageUrl: string;
  timestamp: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phone?: string;
  isAdmin?: boolean;
  loyaltyPoints?: number;
  loyaltyTier?: string;
  createdAt: Timestamp;
  lastLogin: Timestamp;
  encoreRequestedProductIds?: string[];
}

export interface LoyaltyLog {
  id: string;
  change: number;
  reason: string;
  timestamp: Timestamp;
  orderId?: string;
}