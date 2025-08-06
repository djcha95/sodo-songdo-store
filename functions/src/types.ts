// functions/src/types.ts

// ✅ 서버 환경에 맞는 'firebase-admin/firestore'에서 타입을 가져옵니다.
import type { Timestamp, FieldValue } from "firebase-admin/firestore";

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = "ROOM" | "COLD" | "FROZEN";
export type SalesRoundStatus = "draft" | "scheduled" | "selling" | "sold_out" | "ended";
export type OrderStatus = "RESERVED" | "PREPAID" | "PICKED_UP" | "CANCELED" | "COMPLETED" | "NO_SHOW";
export type SpecialLabel = "수량 한정" | "이벤트 특가" | "신상품";

export type LoyaltyTier =
  | "공구의 신"
  | "공구왕"
  | "공구요정"
  | "공구새싹"
  | "주의 요망"
  | "참여 제한";

export interface PointLog {
  id?: string;
  amount: number;
  reason: string;
  createdAt: Timestamp | FieldValue;
  orderId?: string;
  expiresAt?: Timestamp | null;
  isExpired?: boolean; // ✅ isExpired 필드를 포함하여 동기화
}

// ✅ [동기화] 프론트엔드와 백엔드의 모든 알림 타입을 통합합니다.
export type NotificationType =
  | "POINTS_EARNED"
  | "POINTS_USED"
  | "WAITLIST_CONFIRMED"
  | "PICKUP_REMINDER"
  | "PICKUP_TODAY"
  | "GENERAL_INFO"
  | "PAYMENT_CONFIRMED"
  | "ORDER_PICKED_UP"
  | "NO_SHOW_WARNING"
  | "PARTICIPATION_RESTRICTED"
  | "TIER_UP"
  | "TIER_DOWN"
  | "success"
  | "error";

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
  order?: number;
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
  reservedCount?: number;
}

export interface WaitlistEntry {
  userId: string;
  quantity: number;
  timestamp: Timestamp;
  variantGroupId: string;
  itemId: string;
  isPrioritized?: boolean;
  prioritizedAt?: Timestamp | null; // ✅ 이 줄을 추가해주세요.
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
  allowedTiers?: LoyaltyTier[];
  preOrderTiers?: LoyaltyTier[]; // ✅ preOrderTiers 필드를 포함하여 동기화
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
  status: "RESERVATION" | "WAITLIST";
  deadlineDate: Timestamp | Date;
  stockDeductionAmount: number;
  isPrepaymentRequired?: boolean;
}

export interface OrderItem extends Omit<CartItem, "status"> {
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
}

// =================================================================
// ⚙️ 기타 애플리케이션 타입
// =================================================================

// ✅ [동기화] 프론트엔드의 UserTutorialProgress 타입을 직접 여기에 정의합니다.
// (별도 파일 import로 인한 복잡성 제거)
export interface UserTutorialProgress {
  hasCompletedMain?: boolean;
  hasSeenProductDetailPage?: boolean;
  hasSeenCartPage?: boolean;
  hasSeenOrderHistoryPage?: boolean;
}

// ✅ [동기화] 프론트엔드와 백엔드의 UserDocument를 완벽하게 일치시킵니다.
export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  photoURL?: string | null;
  role: "master" | "admin" | "customer";
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
  gender?: "male" | "female" | null;
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


// =================================================================
// 🔔 NHN Cloud API 관련 타입
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