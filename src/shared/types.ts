// src/shared/types.ts (✅ 진짜 최종 완성본)

// 1. 서버용과 클라이언트용 Firebase 타입을 각각 다른 이름으로 import 합니다.
import type { Timestamp as AdminTimestamp, FieldValue as AdminFieldValue } from 'firebase-admin/firestore';
import type { Timestamp as ClientTimestamp, FieldValue as ClientFieldValue } from 'firebase/firestore';
export type { Timestamp as AdminTimestamp, FieldValue as AdminFieldValue } from 'firebase-admin/firestore';

// 2. 두 타입을 모두 포함하는 새로운 '범용 타입'을 정의합니다.
export type UniversalTimestamp = AdminTimestamp | ClientTimestamp;
export type UniversalFieldValue = AdminFieldValue | ClientFieldValue;

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN' | 'FRESH';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type SourceType = 'SODOMALL' | 'SONGDOPICK_ONLY';
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
export type LoyaltyTier = '공구의 신' | '공구왕' | '공구요정' | '공구새싹' | '공구초보' | '공구제한';
export type UserRole = 'master' | 'admin' | 'customer';

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
  createdAt: UniversalTimestamp; // 범용 타입 사용
  orderId?: string;
  expiresAt?: UniversalTimestamp | null; // 범용 타입 사용
  isExpired?: boolean;
}

export interface Notification {
  id: string;
  message: string;
  read: boolean;
  timestamp: UniversalTimestamp; // 범용 타입 사용
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
  originalPrice?: number;
  stock: number;
  limitQuantity?: number | null;
  stockDeductionAmount: number;
  expirationDate?: UniversalTimestamp | null; // 범용 타입 사용
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
  timestamp: UniversalTimestamp; // 범용 타입 사용
  variantGroupId: string;
  itemId: string;
  isPrioritized?: boolean;
  prioritizedAt?: UniversalTimestamp | null; // 범용 타입 사용
}

export interface SalesRound {
  roundId: string;
  roundName: string;
  status: SalesRoundStatus;
  variantGroups: VariantGroup[];
  publishAt: UniversalTimestamp; // 범용 타입 사용
  deadlineDate: UniversalTimestamp; // 범용 타입 사용
  pickupDate: UniversalTimestamp; // 범용 타입 사용
  pickupDeadlineDate: UniversalTimestamp | null; // 범용 타입 사용
  arrivalDate?: UniversalTimestamp | null; // 범용 타입 사용
  createdAt: UniversalTimestamp; // 범용 타입 사용
  waitlist?: WaitlistEntry[];
  waitlistCount?: number;
  isPrepaymentRequired?: boolean;
  allowedTiers?: LoyaltyTier[];
  preOrderTiers?: LoyaltyTier[];
  manualStatus?: SalesRoundStatus | null;
  isManuallyOnsite?: boolean;
  eventType?: string | null;
  sourceType?: SourceType;
  // entryCount 제거
}

export interface Product {
  id: string;
  groupName: string;
  description: string;
  imageUrls: string[];
  storageType: StorageType;
  salesHistory: SalesRound[];
  isArchived: boolean;
  createdAt: UniversalTimestamp; // 범용 타입 사용
  isVisible?: boolean;
  category?: string;
  encoreCount?: number;
  encoreRequesterIds?: string[];
  limitedStockAmount?: number;
  specialLabels?: SpecialLabel[];
  subCategory?: string;
  updatedAt?: UniversalTimestamp; // 범용 타입 사용
  tags?: string[];
  hashtags?: string[];
  reservedQuantities?: { [key: string]: number };
  isOnsite?: boolean;
  categories?: string[];     // 예: ["식품"]
composition?: string;      // 구성(필수급)
extraInfo?: string | null; // 기타정보(선택)
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
  pickupDate: UniversalTimestamp | Date; // 범용 타입 사용
  status: 'RESERVATION' | 'WAITLIST';
  deadlineDate: UniversalTimestamp | Date; // 범용 타입 사용
  stockDeductionAmount: number;
  isPrepaymentRequired?: boolean;
}

export interface OrderItem extends Omit<CartItem, 'status'> {
  arrivalDate: UniversalTimestamp | Date | null; // 범용 타입 사용
  pickupDeadlineDate?: UniversalTimestamp | Date | null; // 범용 타입 사용
  expirationDate?: UniversalTimestamp | Date | null; // 범용 타입 사용
}

export interface CustomerInfo {
  name: string;
  phone: string;
  phoneLast4?: string;
}

// ✅ 1단계: Order 인터페이스 바로 위에 이 코드를 추가하세요.
export type StockStatsMeta = {
  v: 1; // version
  // 주문이 RESERVED/PREPAID로 "재고 점유(claimed)"가 반영되었는지
  claimedApplied?: boolean;

  // 취소/노쇼/부분픽업(미수령분)으로 claimed를 해제한 시각
  claimedReleasedAt?: any | null;

  // 픽업 완료/부분픽업으로 pickedUp을 반영한 시각
  pickedUpAppliedAt?: any | null;
};

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: UniversalTimestamp | UniversalFieldValue; // 범용 타입 사용
  pickupDate: UniversalTimestamp | Date; // 범용 타입 사용
  pickupDeadlineDate?: UniversalTimestamp | Date | null; // 범용 타입 사용
  customerInfo: CustomerInfo;
  pickedUpAt?: UniversalTimestamp | null; // 범용 타입 사용
  prepaidAt?: UniversalTimestamp | null; // 범용 타입 사용
  notes?: string;
  isBookmarked?: boolean;
  canceledAt?: UniversalTimestamp; // 범용 타입 사용
  wasPrepaymentRequired?: boolean;
  splitFrom?: string;
  eventId?: string;
  noShowAt?: any | null;       // 노쇼 처리 시각
  stockStats?: StockStatsMeta; // 칠판 적용 중복 방지용 메타
  stockStatsV1Managed?: boolean; // ✅ stockStats_v1 컬렉션이 서버에서 직접 관리됨을 표시 (트리거 중복 반영 방지)
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

export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  phoneLast4?: string;
  photoURL?: string | null;
  role: UserRole;
  encoreRequestedProductIds?: string[];
  createdAt?: UniversalTimestamp | UniversalFieldValue; // 범용 타입 사용
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

// =================================================================
// 📌 리뷰 시스템 타입
// =================================================================

export interface Review {
  id: string;
  productId: string | null; // 연결된 상품 ID (선택사항)
  productName?: string; // 상품명 (캐시용)
  userId?: string; // 작성자 ID (관리자가 등록한 경우 null)
  userName?: string; // 작성자 이름 (카카오톡에서 가져온 경우)
  userNickname?: string; // 작성자 닉네임
  phoneLast4?: string; // 전화번호 뒷자리 (표시용)
  content: string; // 리뷰 내용
  images?: string[]; // 리뷰 이미지 URL 배열
  rating?: number; // 평점 (1-5, 선택사항)
  isFromKakao?: boolean; // 카카오톡에서 가져온 리뷰인지 여부
  isVerified?: boolean; // 관리자 검증 여부
  isFeatured?: boolean; // 베스트 리뷰 여부
  likeCount?: number; // 좋아요 수
  createdAt: UniversalTimestamp;
  updatedAt?: UniversalTimestamp;
  // 이벤트 관련
  eventMonth?: string; // 이벤트 월 (예: "2025-01")
  rewardType?: 'CRACKER_7500' | string; // 실물 보상 종류 (나중에 다른 보상 타입 추가 가능)
  rewardValueKrw?: number; // 보상 금액(원)
  rewardStatus?: 'PENDING' | 'FULFILLED'; // 지급 대기/지급 완료
  rewardFulfilledAt?: UniversalTimestamp; // 지급 완료 시점
}

export interface ReviewStats {
  totalReviews: number;
  averageRating?: number;
  featuredReviews: number;
  thisMonthReviews: number;
  rewardFulfilledTotal: number;
  topReviewers: Array<{
    key: string; // userId가 없을 수 있어, name 기반 키도 허용
    name: string;
    reviewCount: number;
    rewardFulfilledCount: number;
  }>;
}

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

export interface Banner {
  id: string;
  imageUrl: string;
  linkTo: string;
  description: string;
  isActive: boolean;
  createdAt: UniversalTimestamp; // 범용 타입 사용
}

// ✅ [신규 추가] 프론트엔드 집계용 타입 (QuickCheck 등에서 사용)
// CustomerFocusView.tsx 오류 해결을 위해 이곳에 정의합니다.
export interface AggregatedOrderGroup {
  groupKey: string;
  customerInfo: CustomerInfo;
  item: OrderItem;
  totalQuantity: number;
  totalPrice: number;
  status: OrderStatus;
  pickupDate: UniversalTimestamp | Date;
  pickupDeadlineDate?: UniversalTimestamp | Date | null;
  // 원래 어떤 주문들이 합쳐졌는지 추적 (기존 데이터 호환성 및 개별 취소 대비)
  originalOrders: { orderId: string; quantity: number; status: OrderStatus }[];
}

