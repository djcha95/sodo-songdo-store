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


export type LoyaltyTier = '조약돌' | '수정' | '에메랄드' | '다이아몬드';

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
  | 'NEW_INTERACTION';

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
  arrivalDate?: Timestamp | null; // arrivalDate도 null 허용
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
  category?: string;
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
  deadlineDate: Timestamp;
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
  deadlineDate: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  totalQuantity?: number;
  totalPrice?: number;
  category?: string;
  arrivalDate?: Timestamp | null; // arrivalDate도 null 허용
  expirationDate?: Timestamp | null;
  stockDeductionAmount?: number;
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
  pickupDeadlineDate?: Timestamp | null;
  customerInfo: {
    name: string;
    phone: string;
    phoneLast4?: string;
  };
  pickedUpAt?: Timestamp | null;
  prepaidAt?: Timestamp | null;
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
}

export interface Banner {
  id:string;
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
  order: number;
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

// ✅ [신규] 그룹화된 주문 데이터를 위한 타입 추가
export interface AggregatedOrderGroup {
  groupKey: string; // 고객명-상품ID-아이템ID 등으로 구성된 고유 키
  customerInfo: Order['customerInfo'];
  item: OrderItem; // 대표 상품 정보
  totalQuantity: number;
  totalPrice: number;
  status: OrderStatus; // 그룹의 대표 상태 (모두 픽업완료 등)
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  
  // 이 그룹에 포함된 원본 주문들의 정보
  originalOrders: {
    orderId: string;
    quantity: number;
    status: OrderStatus; // 개별 주문의 상태
  }[];
}