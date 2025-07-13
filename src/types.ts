// src/types.ts

import type { Timestamp, FieldValue } from 'firebase/firestore';

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type OrderStatus = 'RESERVED' | 'PREPAID' | 'PICKED_UP' | 'CANCELED' | 'COMPLETED' | 'NO_SHOW';
export type SpecialLabel = '수량 한정' | '이벤트 특가' | '신상품';
export type ProductStatus = 'ONGOING' | 'ADDITIONAL_RESERVATION' | 'PAST';

// ✅ [추가] 신뢰도 등급 타입
export type LoyaltyTier = '조약돌' | '수정' | '에메랄드' | '다이아몬드';

// ✅ [추가] 포인트 내역 타입
export interface PointLog {
  id: string;
  amount: number;
  reason: string;
  createdAt: Timestamp;
  expiresAt: Timestamp; // 소멸 예정일
}

// ✅ [추가] 헤더에서 사용할 알림의 종류를 명확하게 정의합니다.
export type NotificationType =
  | 'GENERAL'             // 일반 알림
  | 'WAITLIST_CONFIRMED'  // 대기 예약 확정
  | 'PICKUP_REMINDER'     // 픽업 D-1 등 미리 알림
  | 'PICKUP_TODAY'        // 픽업 당일 알림
  | 'NEW_INTERACTION';    // 찜, 댓글 등 (미래 확장용)

export interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  timestamp: Timestamp;
  link?: string;
  // ✅ [추가] 알림 종류를 구분하기 위한 type 속성
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
  // ✅ [수정] deadlineDate를 필수로 변경하여 예약 마감 후 취소 로직에 사용
  deadlineDate: Timestamp;
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
  prepaidAt?: Timestamp; // ✅ [추가] 선입금 처리 시각
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
  role: 'admin' | 'customer';
  encoreRequestedProductIds?: string[];
  createdAt?: Timestamp | FieldValue;

  // ✅ [수정] 신뢰도 시스템 관련 필드
  loyaltyPoints: number;      // 현재 신뢰도 점수
  pickupCount: number;        // 누적 픽업 횟수
  noShowCount: number;        // 누적 노쇼 횟수
  lastLoginDate: string;      // 마지막 로그인 날짜 (YYYY-MM-DD 형식)
  isRestricted?: boolean;     // 이용 제한 여부
}

export interface Banner {
  id: string;
  imageUrl: string;
  linkTo?: string;
  order: number;
  createdAt: Timestamp;
  isActive: boolean;
  productId?: string;
  // ✅ [되돌리기] 텍스트 관련 필드를 다시 제거합니다.
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
  // ✅ [추가] 위도와 경도 필드를 추가합니다 (타입은 number).
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