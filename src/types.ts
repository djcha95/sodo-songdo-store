// src/types.ts

import type { Timestamp, FieldValue } from 'firebase/firestore'; // [수정] FieldValue 타입 추가

/**
 * @description 상품 판매 방식
 */
export type SalesType = 'PRE_ORDER_UNLIMITED' | 'IN_STOCK';

/**
 * @description 상품의 보관 타입
 */
export type StorageType = 'ROOM' | 'CHILLED' | 'FROZEN';

/**
 * @description 상품의 가격 옵션
 */
export interface PricingOption {
  unit: string;
  price: number;
}

/**
 * @description Firestore `products` 컬렉션의 문서 타입
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  pricingOptions: PricingOption[];
  imageUrls: string[];
  category?: string;
  subCategory?: string;
  storageType: StorageType;

  // 판매 및 재고 정보
  salesType: SalesType;
  initialStock: number;
  stock: number;
  reservationStock?: number;
  maxOrderPerPerson?: number | null;
  isAvailableForOnsiteSale?: boolean; // 현장 판매 가능 여부

  // 상태 및 날짜 정보
  status: 'draft' | 'selling' | 'scheduled' | 'sold_out' | 'ended';
  isPublished: boolean;
  publishAt: Timestamp;
  deadlineDate: Timestamp;
  arrivalDate: Timestamp;
  pickupDate?: Timestamp;
  pickupDeadlineDate?: Timestamp | null;
  expirationDate?: Timestamp | null;

  // 메타 정보
  isNew: boolean;
  createdAt: Timestamp;
  specialLabels?: string[];
  // [수정] 앵콜 요청 관련 필드를 메타 정보에 통합
  encoreCount?: number; // 앵콜 요청 횟수
  encoreRequesterIds?: string[]; // 앵콜 요청을 한 사용자들의 ID 목록
}

/**
 * @description 주문 내 포함된 개별 상품 정보
 */
export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
    unit: string;
    category?: string;
    subCategory?: string;
    arrivalDate?: Timestamp;
    expirationDate?: Timestamp;
}

/**
 * @description 장바구니에 담기는 개별 상품 정보
 */
export interface CartItem {
  productId: string;
  productName: string;
  selectedUnit: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string;
  maxOrderPerPerson?: number | null;
  availableStock: number;
  salesType: SalesType;
}

/**
 * @description 주문 상태 타입
 */
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

/**
 * @description Firestore `orders` 컬렉션의 문서 타입
 */
export interface Order {
    id: string;
    userId: string;
    customerName: string;
    items: OrderItem[];
    totalPrice: number;
    orderDate: Timestamp;
    status: OrderStatus;
    pickupDate?: Timestamp;
    pickupDeadlineDate?: Timestamp;
    customerPhoneLast4?: string;
}

/**
 * @description 배너 정보 타입 정의
 */
export interface Banner {
  id: string;
  imageUrl: string;
  linkTo?: string;
  order: number;
  createdAt: Timestamp;
  isActive: boolean;
  productId?: string; // [추가] 배너가 상품으로부터 생성되었을 경우 상품 ID
}

/**
 * @description DailyDashboardModal을 위한 타입 정의
 */
export interface TodayStockItem {
  id: string;
  name: string;
  quantity: number;
}

export interface TodayOrderItem {
  id: string;
  customerName: string;
  productName: string;
  quantity: number;
  status: string;
}

/**
 * @description Firestore `categories` 컬렉션의 문서 타입
 */
export interface Category {
  id: string;
  name: string;
  subCategories: string[];
}

/**
 * @description ProductPreviewModal에 전달될 상품 데이터 타입
 */
export interface PreviewProduct {
  name: string;
  description: string;
  pricingOptions: PricingOption[];
  specialLabels: string[];
  category?: string;
  subCategory?: string;
}

/**
 * @description 매장 정보 타입 정의
 */
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

// [수정] 사용자 문서의 타입 정의 (null 허용)
export interface UserDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  isAdmin: boolean;
  // [추가] 사용자가 앵콜 요청한 상품 ID 목록
  encoreRequestedProductIds?: string[];
  createdAt?: Timestamp | FieldValue; // [수정] FieldValue 타입을 추가
}