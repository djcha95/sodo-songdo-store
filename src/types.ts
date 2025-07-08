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
 * @param {string} id - 옵션의 고유 ID
 * @param {string} name - 옵션의 이름 (예: '500g')
 * @param {number} price - 옵션의 가격
 * @param {number} stock - 옵션별 재고. -1은 무제한을 의미합니다.
 * @param {number} stockDeductionAmount - 이 옵션 1개 구매 시 차감될 물리적 재고량
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
 * @param {string} id - 옵션 그룹의 고유 ID
 * @param {string} groupName - 옵션 그룹의 이름 (예: '용량')
 * @param {ProductItem[]} items - 이 그룹에 속한 ProductItem 배열
 * @param {number | null} totalPhysicalStock - 그룹 전체가 공유하는 물리적 재고 (예: '원물 100kg 한정')
 * @param {string} stockUnitType - 물리적 재고의 단위 (예: 'kg', '박스')
 */
export interface VariantGroup {
  id: string;
  groupName: string;
  items: ProductItem[];
  totalPhysicalStock: number | null;
  stockUnitType: string;
}

/**
 * @description 하나의 상품에 대한 개별 판매 회차 정보를 담습니다.
 * @param {string} roundId - 판매 회차의 고유 ID
 * @param {string} roundName - 판매 회차의 이름 (예: '1차 공동구매', '앵콜! 감사세일')
 * @param {SalesRoundStatus} status - 현재 판매 회차의 상태
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
}

/**
 * @description 대표 상품의 고유 정보를 담는 최상위 객체입니다.
 * @param {string} groupName - 대표 상품의 이름 (예: '햇살담은 김치')
 * @param {SalesRound[]} salesHistory - 이 상품의 모든 판매 회차 기록
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
 * @param {string} itemName - 사용자가 선택한 옵션의 이름 (예: '500g')
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