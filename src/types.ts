// src/types.ts

import type { Timestamp, FieldValue } from 'firebase/firestore';

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type OrderStatus = 'RESERVED' | 'PREPAID' | 'PICKED_UP' | 'CANCELED' | 'COMPLETED' | 'NO_SHOW';
export type SpecialLabel = '수량 한정' | '이벤트 특가' | '신상품';

export interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  timestamp: Timestamp;
  link?: string;
}


// =================================================================
// 📌 상품 및 판매 관련 타입
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
}

export interface WaitlistEntry {
  userId: string;
  quantity: number;
  timestamp: Timestamp;
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
  arrivalDate?: Timestamp;
  createdAt: Timestamp;
  waitlist: WaitlistEntry[];
  waitlistCount: number;
}

export interface Product {
  id: string;
  groupName: string;
  description: string;
  imageUrls: string[];
  storageType: StorageType;
  salesHistory: SalesRound[];
  isArchived: boolean;
  category?: string; // ✅ 하위 카테고리 제거됨
  encoreCount?: number;
  encoreRequesterIds?: string[];
  createdAt: Timestamp;
  limitedStockAmount?: number;
  specialLabels?: SpecialLabel[];
}


// =================================================================
// 🛒 장바구니 및 주문 관련 타입
// =================================================================

export interface CartItem {
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
}

export type OrderItem = Pick<
  CartItem,
  | 'productId'
  | 'roundId'
  | 'roundName'
  | 'variantGroupId'
  | 'itemId'
  | 'productName'
  | 'variantGroupName'
  | 'itemName'
  | 'imageUrl'
  | 'unitPrice'
  | 'quantity'
  | 'stock'
> & {
  deadlineDate?: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  totalQuantity?: number;
  totalPrice?: number;
  category?: string; // ✅ 하위 카테고리 제거됨
  arrivalDate?: Timestamp;
  expirationDate?: Timestamp;
};

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: Timestamp | FieldValue;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp;
  customerInfo: {
    name: string;
    phone: string;
  };
  pickedUpAt?: Timestamp;
  notes?: string;
  isBookmarked?: boolean;
}


// =================================================================
// ⚙️ 기타 애플리케이션 타입
// =================================================================
export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone?: string | null;
  photoURL?: string | null;
  role: 'admin' | 'customer'; // ✅ isAdmin을 role로 통일
  encoreRequestedProductIds?: string[];
  createdAt?: Timestamp | FieldValue;
}

export interface Banner {
  id: string;
  imageUrl: string;
  linkTo?: string;
  order: number;
  createdAt: Timestamp;
  isActive: boolean;
  productId?: string;
}

export interface Category {
  id: string;
  name: string;
  order: number; // ✅ subCategories 필드 제거됨
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
    id: string;
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