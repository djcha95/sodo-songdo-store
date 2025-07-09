// src/types.ts

import type { Timestamp, FieldValue } from 'firebase/firestore';

// =================================================================
// 📌 공통 사용 타입 별칭 (Type Aliases)
// =================================================================

export type StorageType = 'ROOM' | 'COLD' | 'FROZEN';
export type ProductStatus = 'ONGOING' | 'ADDITIONAL_RESERVATION' | 'PAST';
export type SalesRoundStatus = 'draft' | 'scheduled' | 'selling' | 'sold_out' | 'ended';
export type OrderStatus = 'RESERVED' | 'PICKED_UP' | 'CANCELED' | 'COMPLETED' | 'NO_SHOW';
export type SpecialLabel = '수량 한정' | '이벤트 특가' | '신상품';


// =================================================================
// 📌 상품 및 판매 관련 타입
// =================================================================

/**
 * @description 상품의 개별 옵션 또는 단위를 나타냅니다. (예: '500g', '매운맛')
 */
export interface ProductItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  limitQuantity?: number | null;
  stockDeductionAmount: number;
  expirationDate?: Timestamp | null;
}

/**
 * @description 상품 내 옵션 그룹을 나타냅니다. (예: '용량', '맛')
 */
export interface VariantGroup {
  id: string;
  groupName: string;
  items: ProductItem[];
  totalPhysicalStock: number | null;
  stockUnitType: string;
}

/**
 * ✅ [추가] 대기 명단에 등록된 사용자 정보를 나타냅니다.
 * @param {string} userId - 대기 신청한 사용자의 ID
 * @param {number} quantity - 대기 신청한 수량
 * @param {Timestamp} timestamp - 대기 신청 시각
 */
export interface WaitlistEntry {
  userId: string;
  quantity: number;
  timestamp: Timestamp;
}

/**
 * @description 하나의 상품에 대한 개별 판매 회차 정보를 담습니다.
 */
export interface SalesRound {
  roundId: string;
  roundName:string;
  status: SalesRoundStatus;
  variantGroups: VariantGroup[];
  publishAt: Timestamp;
  deadlineDate: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  createdAt: Timestamp;
  // ✅ [추가] 대기 명단 기능 지원을 위한 속성
  waitlist: WaitlistEntry[];
  waitlistCount: number;
}

/**
 * @description 대표 상품의 고유 정보를 담는 최상위 객체입니다.
 */
export interface Product {
  id: string;
  groupName: string;
  description: string;
  imageUrls: string[];
  storageType: StorageType;
  salesHistory: SalesRound[];
  isArchived: boolean;
  category?: string;
  subCategory?: string;
  encoreCount?: number;
  encoreRequesterIds?: string[];
  createdAt: Timestamp;
  limitedStockAmount?: number;
  specialLabels?: SpecialLabel[];
}


// =================================================================
// 🛒 장바구니 및 주문 관련 타입
// =================================================================

/**
 * @description 장바구니에 담긴 개별 상품 항목을 나타냅니다.
 */
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
  stock: number;
  pickupDate: Timestamp;
}

/**
 * @description 주문 내역에 포함될 상품 정보. CartItem의 일부 속성을 사용합니다.
 */
export type OrderItem = Pick<
  CartItem,
  'productId' | 
  'roundId' | 
  'roundName' |
  'variantGroupId' | 
  'itemId' | 
  'productName' |
  'variantGroupName' | 
  'itemName' |
  'imageUrl' | 
  'unitPrice' | 
  'quantity'
>;

/**
 * @description 사용자의 한 건의 주문 정보를 나타냅니다.
 */
export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  items: OrderItem[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: Timestamp;
  pickupDate: Timestamp;
  pickupDeadlineDate?: Timestamp;
  customerInfo: {
    name: string;
    phone: string;
  };
}


// =================================================================
// ⚙️ 기타 애플리케이션 타입
// =================================================================
export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  isAdmin: boolean;
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
  subCategories: string[];
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
