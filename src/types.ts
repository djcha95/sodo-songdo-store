// src/types.ts

import type { Timestamp, FieldValue, DocumentData } from 'firebase/firestore';

// =================================================================
// 📌 [수정] 신뢰도 포인트 시스템 최종 기획 반영
// =================================================================
// 1. LoyaltyTier를 기획서의 등급명으로 최종 수정
// 2. UserDocument에 isRestricted -> isSuspended로 명칭 변경 및 등급 필드 추가
// 3. Notification의 isRead -> read로 필드명 변경 (다른 파일들과의 통일성)
// =================================================================


// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type OrderStatus = 'RESERVED' | 'PREPAID' | 'PICKED_UP' | 'CANCELED' | 'COMPLETED' | 'NO_SHOW';
export type SpecialLabel = '수량 한정' | '이벤트 특가' | '신상품';

export type ProductDisplayStatus = 'ONGOING' | 'ADDITIONAL_RESERVATION' | 'PAST';

// ✅ [수정] 기획서의 등급 체계를 정확히 반영
export type LoyaltyTier =
  | '공구의 신'
  | '공구왕'
  | '공구요정'
  | '공구새싹'
  | '주의 요망'
  | '참여 제한';

export interface PointLog {
  id?: string;
  amount: number;
  reason: string;
  createdAt: Timestamp | FieldValue;
  orderId?: string;
  expiresAt?: Timestamp | null; // null을 허용하여 포인트 차감 내역과 구분
}

export type NotificationType =
  | 'POINTS_EARNED'
  | 'POINTS_USED'
  | 'WAITLIST_CONFIRMED'
  | 'PICKUP_REMINDER'
  | 'PICKUP_TODAY'
  | 'GENERAL_INFO'
  | 'PAYMENT_CONFIRMED' // ✅ [추가] 선입금(결제) 확인 타입
  | 'success'
  | 'error';

export interface Notification {
  id: string;
  message: string;
  read: boolean; // ✅ [수정] isRead -> read
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
  id:string;
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
  isPrioritized?: boolean; // ✨ [신규] 대기 순번 상승권 사용 여부
}

export interface SalesRound {
  roundId: string;
  roundName:string;
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
  allowedTiers?: LoyaltyTier[]; // ✅ 통합된 참여 조건 필드
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
  // ✅ [수정] Cloud Function이 계산한 예약 수량을 저장할 필드 추가
  reservedQuantities?: { [key: string]: number };
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
  isPrepaymentRequired?: boolean; // ✅ [추가] 장바구니 상품의 선입금 필수 여부
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
  wasPrepaymentRequired?: boolean; // ✅ [추가] 주문 생성 시 선입금이 필요했는지 여부 기록
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
  // ✨ [수정] master 역할을 추가하여 권한 세분화
  role: 'master' | 'admin' | 'customer'; 
  encoreRequestedProductIds?: string[];
  createdAt?: Timestamp | FieldValue;
  points: number;
  pointHistory?: PointLog[];
  loyaltyTier: LoyaltyTier;
  pickupCount: number;
  noShowCount: number;
  lastLoginDate: string;
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

// =================================================================
// 🚀 페이지네이션 관련 타입
// =================================================================
export interface PaginatedProductsResponse {
  products: Product[];
  lastVisible: DocumentData | null;
}

