// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
// [수정] 타입 import 방식 변경 및 로컬 타입 정의 추가
import type { 
  Product, 
  ProductItem, 
  CartItem, 
  StorageType, 
  VariantGroup as OriginalVariantGroup, 
  SalesRound as OriginalSalesRound 
} from '@/types';
import { Timestamp } from 'firebase/firestore';
import { getProductById } from '@/firebase/productService';
// [수정] getReservedQuantitiesMap 임포트 제거
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useEncoreRequest } from '@/context/EncoreRequestContext';
import {
  ShoppingCart, ChevronLeft, ChevronRight, X, CalendarDays, Sun, Snowflake,
  Tag, AlertCircle, PackageCheck, Hourglass, ShieldX
} from 'lucide-react';

// Swiper React components
import { Swiper, SwiperSlide } from 'swiper/react';
// Swiper modules
import { Pagination, Navigation } from 'swiper/modules';

// Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';


import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import './ProductDetailPage.css';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

// [수정] 로컬에서 타입 확장하여 'reservedCount' 문제 해결
interface VariantGroup extends OriginalVariantGroup {
  reservedCount?: number;
}

interface SalesRound extends OriginalSalesRound {
    variantGroups: VariantGroup[];
}

// --- 유틸리티 및 헬퍼 함수 ---
dayjs.extend(isBetween);

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn("Unsupported date format in ProductDetailPage:", date);
  return null;
};

const formatDateWithDay = (date: Date | Timestamp | null | undefined): string => {
  const d = safeToDate(date);
  if (!d) return '날짜 미정';
  return dayjs(d).format('MM.DD(ddd)');
};

const formatPrice = (price: number) => {
  return price.toLocaleString('ko-KR') + '원';
};

const storageLabels: Record<StorageType, string> = {
  ROOM: '상온',
  COLD: '냉장',
  FROZEN: '냉동',
};

const storageIcons: Record<StorageType, React.ReactNode> = {
  ROOM: <Sun size={16} />,
  COLD: <Snowflake size={16} />,
  FROZEN: <Snowflake size={16} />,
};

// [수정] Linter 경고 해결 및 가독성/안정성 향상을 위해 getLatestRoundFromHistory 함수 리팩토링
const getLatestRoundFromHistory = (product: Product | null): SalesRound | null => {
  if (!product || !product.salesHistory || product.salesHistory.length === 0) return null;

  // 1. 현재 판매 중인 라운드 (최신 생성 순)
  const sellingRounds = product.salesHistory.filter(r => r.status === 'selling');
  if (sellingRounds.length > 0) {
    return sellingRounds.sort((roundA, roundB) => {
      const timeA = safeToDate(roundA.createdAt)?.getTime() ?? 0;
      const timeB = safeToDate(roundB.createdAt)?.getTime() ?? 0;
      return timeB - timeA; // 내림차순 (최신순)
    })[0] as SalesRound;
  }
  
  const now = new Date();

  // 2. 현재 시간이 판매 시작 시간 이후인 '판매 예정' 라운드 (가장 최근에 시작된 순)
  const nowSellingScheduled = product.salesHistory
    .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! <= now)
    .sort((roundA, roundB) => {
      const timeA = safeToDate(roundA.publishAt)?.getTime() ?? 0;
      const timeB = safeToDate(roundB.publishAt)?.getTime() ?? 0;
      return timeB - timeA; // 내림차순 (가장 최근에 시작된 순)
    });
  if (nowSellingScheduled.length > 0) return nowSellingScheduled[0] as SalesRound;
  
  // 3. 아직 시작되지 않은 '판매 예정' 라운드 (가장 빨리 시작될 순)
  const futureScheduledRounds = product.salesHistory
    .filter(r => r.status === 'scheduled' && safeToDate(r.publishAt) && safeToDate(r.publishAt)! > now)
    .sort((roundA, roundB) => {
      const timeA = safeToDate(roundA.publishAt)?.getTime() ?? 0;
      const timeB = safeToDate(roundB.publishAt)?.getTime() ?? 0;
      return timeA - timeB; // 오름차순 (가장 빨리 시작될 순)
    });
  if (futureScheduledRounds.length > 0) return futureScheduledRounds[0] as SalesRound;

  // 4. 종료된 라운드 (가장 최근에 마감된 순)
  const pastRounds = product.salesHistory
    .filter(r => r.status === 'ended' || r.status === 'sold_out')
    .sort((roundA, roundB) => {
      const timeA = safeToDate(roundA.deadlineDate)?.getTime() ?? 0;
      const timeB = safeToDate(roundB.deadlineDate)?.getTime() ?? 0;
      return timeB - timeA; // 내림차순 (최신 마감순)
    });
  if (pastRounds.length > 0) return pastRounds[0] as SalesRound;

  // 5. 위 모든 조건에 해당하지 않을 경우, 임시저장이 아닌 라운드 중 최신 라운드 반환
  const nonDraftRounds = product.salesHistory
    .filter(r => r.status !== 'draft')
    .sort((roundA, roundB) => {
      const timeA = safeToDate(roundA.createdAt)?.getTime() ?? 0;
      const timeB = safeToDate(roundB.createdAt)?.getTime() ?? 0;
      return timeB - timeA; // 내림차순 (최신순)
    });

  return (nonDraftRounds[0] as SalesRound) || null;
};


const ProductDetailSkeleton = () => (
    <div className="main-content-area skeleton">
        <div className="image-gallery-wrapper">
            <div className="skeleton-box skeleton-image"></div>
        </div>
        <div className="product-info-area">
            <div className="skeleton-box skeleton-title"></div>
            <div className="skeleton-box skeleton-text"></div>
            <div className="skeleton-box skeleton-text short"></div>
            <div className="product-key-info">
                <div className="skeleton-box skeleton-info-row"></div>
                <div className="skeleton-box skeleton-info-row"></div>
                <div className="skeleton-box skeleton-info-row"></div>
            </div>
        </div>
    </div>
);

type ProductActionState = 'LOADING' | 'PURCHASABLE' | 'WAITLISTABLE' | 'ENCORE_REQUESTABLE' | 'SCHEDULED' | 'ENDED';


interface ProductDetailPageProps {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ productId, isOpen, onClose }) => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user, userDocument, isSuspendedUser } = useAuth();
  const { hasRequestedEncore, requestEncore, loading: encoreLoading } = useEncoreRequest();

  // --- 상태(State) 선언 ---
  const [product, setProduct] = useState<Product | null>(null);
  const [displayRound, setDisplayRound] = useState<SalesRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariantGroup, setSelectedVariantGroup] = useState<VariantGroup | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [currentTotalPrice, setCurrentTotalPrice] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [isQuantityEditing, setIsQuantityEditing] = useState(false);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  // [수정] reservedQuantities 및 stockLoading 상태 제거
  const swiperRef = useRef<any>(null); // Swiper 인스턴스를 위한 ref
  const lightboxSwiperRef = useRef<any>(null); // Lightbox Swiper 인스턴스를 위한 ref

  // --- 메모이제이션(useMemo) 로직 ---
  
  const allAvailableOptions = useMemo(() => {
    if (!displayRound) return [];
    const options: { vg: VariantGroup, item: ProductItem, vgIndex: number, itemIndex: number }[] = [];
    (displayRound.variantGroups || []).forEach((vg, vgIndex) => {
      (vg.items || []).forEach((item, itemIndex) => {
        options.push({ vg, item, vgIndex, itemIndex });
      });
    });
    return options;
  }, [displayRound]);
  
  const userAlreadyRequestedEncore = !!(user && product && hasRequestedEncore(product.id));
  
  const productActionState = useMemo<ProductActionState>(() => {
    // [수정] stockLoading 조건 제거
    if (loading || !displayRound || !product || !selectedVariantGroup || !selectedItem) {
      return 'LOADING';
    }

    const now = dayjs();
    const publishAtDate = safeToDate(displayRound.publishAt);

    if (displayRound.status === 'scheduled' && publishAtDate && now.isBefore(publishAtDate)) {
      return 'SCHEDULED';
    }
    
    const pickupDate = safeToDate(displayRound.pickupDate);
    const finalSaleDeadline = pickupDate ? dayjs(pickupDate).hour(13).minute(0).second(0) : null;

    if (finalSaleDeadline && now.isAfter(finalSaleDeadline)) {
        return 'ENDED';
    }

    // [수정] reservedQuantities.get 대신 selectedVariantGroup.reservedCount 사용
    const reserved = selectedVariantGroup.reservedCount || 0;
    const totalStock = selectedVariantGroup.totalPhysicalStock;
    const remainingStock = (totalStock === null || totalStock === -1) ? Infinity : totalStock - reserved;
    const isSoldOut = remainingStock < (selectedItem?.stockDeductionAmount || 1);
    
    // ProductListPage와 동일한 로직으로 '오늘의 공동구매' 기간을 계산합니다.
    let salesStart, salesEnd;
    const today1pm = now.clone().hour(13).minute(0).second(0);
    let lastSat1pm = now.clone().day(6).hour(13).minute(0).second(0).millisecond(0);
    if (lastSat1pm.isAfter(now)) {
        lastSat1pm = lastSat1pm.subtract(1, 'week');
    }
    const weekendCycleEnd = lastSat1pm.add(2, 'days');
    if (now.isAfter(lastSat1pm) && now.isBefore(weekendCycleEnd)) {
        salesStart = lastSat1pm;
        salesEnd = weekendCycleEnd;
    } else {
        if (now.isBefore(today1pm)) {
            salesStart = today1pm.subtract(1, 'day');
            salesEnd = today1pm;
        } else {
            salesStart = today1pm;
            salesEnd = today1pm.add(1, 'day');
        }
    }
    const createdAt = dayjs(safeToDate(displayRound.createdAt));
    const isTodaysProduct = createdAt.isBetween(salesStart, salesEnd, null, '[)');

    const isActuallySelling = displayRound.status === 'selling' || (displayRound.status === 'scheduled' && publishAtDate && now.isAfter(publishAtDate));

    if (isActuallySelling) {
      if (!isSoldOut) {
        return 'PURCHASABLE';
      } else {
        // 품절 시, '오늘의 공동구매' 상품이면 '대기 가능', 아니면 '앵콜 요청'
        if (isTodaysProduct) {
          return 'WAITLISTABLE';
        } else {
          return 'ENCORE_REQUESTABLE';
        }
      }
    }
    
    if (displayRound.status === 'ended' || displayRound.status === 'sold_out') {
      return 'ENCORE_REQUESTABLE';
    }

    return 'ENDED';

  }, [loading, displayRound, product, selectedVariantGroup, selectedItem]); // [수정] 의존성 배열에서 reservedQuantities, stockLoading 제거

  // --- 데이터 로딩 및 상태 업데이트 로직 (useEffect) ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);

      try {
        // [수정] getReservedQuantitiesMap() 호출 제거
        const productData = await getProductById(productId);

        if (!productData) {
          setError('상품 정보를 찾을 수 없습니다.');
          return;
        }

        const latestRound = getLatestRoundFromHistory(productData);
        if (!latestRound) {
          setError('판매 정보를 찾을 수 없습니다.');
          return;
        }

        setProduct(productData);
        setDisplayRound(latestRound);
        setCurrentImageIndex(0);

        const firstVg = latestRound.variantGroups?.[0];
        const firstItem = firstVg?.items?.[0];
        if (firstVg) {
            setSelectedVariantGroup(firstVg);
        }
        if (firstItem) {
            setSelectedItem(firstItem);
        }

      } catch (e) {
        console.error("Error fetching product data:", e);
        if ((e as any).code === 'permission-denied') {
            setError('상품 정보를 불러올 권한이 없습니다. 관리자에게 문의하세요.');
        } else {
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && productId) {
      fetchInitialData();
    }
  }, [isOpen, productId]);

  useEffect(() => {
    setCurrentTotalPrice((selectedItem?.price ?? 0) * quantity);
  }, [selectedItem, quantity]);
  
  useEffect(() => {
    if (isImageModalOpen && lightboxSwiperRef.current) {
        lightboxSwiperRef.current.swiper.slideTo(currentImageIndex, 0);
    }
  }, [isImageModalOpen, currentImageIndex]);


  // --- 핸들러 함수들 ---
  const createQuantityUpdater = (delta: number) => () => {
    if (!selectedItem || !selectedVariantGroup || !product || !displayRound) return;
    
    setQuantity(prev => {
      const newQuantity = prev + delta;
      
      // [수정] reservedQuantities 대신 variantGroup.reservedCount 사용
      const reserved = selectedVariantGroup.reservedCount || 0;
      const totalGroupStock = selectedVariantGroup.totalPhysicalStock;
      const remainingStock = (totalGroupStock === null || totalGroupStock === -1) ? Infinity : totalGroupStock - reserved;
      
      const maxPurchasable = Math.floor(remainingStock / (selectedItem.stockDeductionAmount || 1));
      
      const limitByItem = selectedItem.limitQuantity || 999;
      const limitByStock = productActionState === 'WAITLISTABLE' ? 999 : (maxPurchasable === Infinity ? 999 : maxPurchasable);

      return Math.max(1, Math.min(newQuantity, limitByItem, limitByStock));
    });
  };

  const decrementHandlers = useLongPress(createQuantityUpdater(-1), createQuantityUpdater(-1));
  const incrementHandlers = useLongPress(createQuantityUpdater(1), createQuantityUpdater(1));

  const handleQuantityInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedItem || !selectedVariantGroup || !product || !displayRound) return;

    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      // [수정] reservedQuantities 대신 variantGroup.reservedCount 사용
      const reserved = selectedVariantGroup.reservedCount || 0;
      const totalGroupStock = selectedVariantGroup.totalPhysicalStock;
      const remainingStock = (totalGroupStock === null || totalGroupStock === -1) ? Infinity : totalGroupStock - reserved;
      const maxPurchasable = Math.floor(remainingStock / (selectedItem.stockDeductionAmount || 1));
      
      const limitByItem = selectedItem.limitQuantity || 999;
      const limitByStock = productActionState === 'WAITLISTABLE' ? 999 : (maxPurchasable === Infinity ? 999 : maxPurchasable);
      
      setQuantity(Math.min(value, limitByItem, limitByStock));
    }
  }, [product, displayRound, selectedVariantGroup, selectedItem, productActionState]);

  const handleQuantityInputBlur = useCallback(() => {
    setIsQuantityEditing(false);
    if (isNaN(quantity) || quantity < 1) {
      setQuantity(1);
    }
  }, [quantity]);

  const handleAddToCart = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    if (!product || !displayRound || !selectedVariantGroup || !selectedItem) { toast.error('상품 또는 옵션이 올바르지 않습니다.'); return; }
    if (productActionState !== 'PURCHASABLE') { toast.error('지금은 예약할 수 없는 상품입니다.'); return; }
    if (quantity < 1) { toast.error('1개 이상 선택해주세요.'); return; }

    // [수정] reservedQuantities 대신 variantGroup.reservedCount 사용
    const reserved = selectedVariantGroup.reservedCount || 0;
    const totalGroupStock = selectedVariantGroup.totalPhysicalStock;
    const remainingStock = (totalGroupStock === null || totalGroupStock === -1) ? Infinity : totalGroupStock - reserved;

    if (quantity * (selectedItem.stockDeductionAmount || 1) > remainingStock) {
      toast.error(`죄송합니다. 재고가 부족합니다. (현재 ${Math.floor(remainingStock / (selectedItem.stockDeductionAmount || 1) )}개 예약 가능)`);
      return;
    }

    const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
    const prepaymentRequired = isWarningUser || (displayRound.isPrepaymentRequired ?? false);

    const itemToAdd: CartItem = {
      id: `reservation-${Date.now()}`,
      productId: product.id,
      productName: product.groupName,
      imageUrl: product.imageUrls?.[0] ?? '',
      roundId: displayRound.roundId,
      roundName: displayRound.roundName,
      variantGroupId: selectedVariantGroup.id,
      variantGroupName: selectedVariantGroup.groupName,
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      quantity: quantity,
      unitPrice: selectedItem.price,
      stock: selectedItem.stock,
      pickupDate: displayRound.pickupDate,
      status: 'RESERVATION',
      deadlineDate: displayRound.deadlineDate,
      stockDeductionAmount: selectedItem.stockDeductionAmount,
      isPrepaymentRequired: prepaymentRequired,
    };

    addToCart(itemToAdd);
    toast.success(`${product.groupName} ${quantity}개를 장바구니에 담았습니다.`);
    onClose();
  }, [product, displayRound, selectedVariantGroup, selectedItem, quantity, addToCart, navigate, user, onClose, productActionState, isSuspendedUser, userDocument]);

  const handleEncoreRequest = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (isSuspendedUser) {
      toast.error('현재 등급에서는 앵콜 요청을 할 수 없습니다.');
      return;
    }
    if (!product) return;
    if (userAlreadyRequestedEncore) { toast('이미 앵콜을 요청한 상품입니다.', { icon: '👏' }); return; }

    const promise = requestEncore(product.id);

    toast.promise(promise, {
      loading: '앵콜 요청 중...',
      success: '앵콜 요청이 접수되었습니다!',
      error: '앵콜 요청에 실패했습니다.',
    });
  }, [product, user, userAlreadyRequestedEncore, requestEncore, navigate, onClose, isSuspendedUser]);

  const handleAddToWaitlist = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (isSuspendedUser) {
      toast.error('반복적인 약속 불이행으로 대기 신청이 제한되었습니다.');
      return;
    }
    if (!product || !displayRound || !selectedVariantGroup || !selectedItem) return;
    if (productActionState !== 'WAITLISTABLE') { toast.error('지금은 대기 신청을 할 수 없습니다.'); return; }
    
    setWaitlistLoading(true);

    try {
      const uniqueId = `waitlist-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const itemToWaitlist: CartItem = {
        id: uniqueId,
        productId: product.id,
        productName: product.groupName,
        imageUrl: product.imageUrls?.[0] ?? '',
        roundId: displayRound.roundId,
        roundName: displayRound.roundName,
        variantGroupId: selectedVariantGroup.id,
        variantGroupName: selectedVariantGroup.groupName,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        quantity: quantity,
        unitPrice: selectedItem.price,
        stock: selectedItem.stock,
        pickupDate: displayRound.pickupDate,
        status: 'WAITLIST',
        deadlineDate: displayRound.deadlineDate,
        stockDeductionAmount: selectedItem.stockDeductionAmount,
      };

      addToCart(itemToWaitlist);
      
      toast.success('대기 신청이 완료되었습니다!');
      onClose();
    } catch (error) {
      const err = error as Error;
      toast.error(err.message || '대기 신청에 실패했습니다.');
    } finally {
      setWaitlistLoading(false);
    }
  }, [product, displayRound, selectedVariantGroup, selectedItem, quantity, addToCart, user, navigate, onClose, productActionState, isSuspendedUser]);

  const handleOptionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
    const selectedIndex = parseInt(e.target.value, 10);
    const selected = allAvailableOptions?.[selectedIndex];
    if (selected) {
      setSelectedVariantGroup(selected.vg);
      setSelectedItem(selected.item);
      setQuantity(1);
    }
  }, [allAvailableOptions]);

  const openImageModal = () => setIsImageModalOpen(true);
  const closeImageModal = () => setIsImageModalOpen(false);

  const isIncrementDisabled = useMemo(() => {
    if (!selectedItem || !selectedVariantGroup || !product || !displayRound) return true;
    
    if (productActionState === 'WAITLISTABLE') {
        return quantity >= (selectedItem.limitQuantity || 999);
    }
  
    // [수정] reservedQuantities 대신 variantGroup.reservedCount 사용
    const reserved = selectedVariantGroup.reservedCount || 0;
    const totalGroupStock = selectedVariantGroup.totalPhysicalStock;
    const remainingStock = (totalGroupStock === null || totalGroupStock === -1) ? Infinity : totalGroupStock - reserved;
    const maxPurchasable = Math.floor(remainingStock / (selectedItem.stockDeductionAmount || 1));
  
    if (quantity >= maxPurchasable) return true;
    if (selectedItem.limitQuantity && quantity >= selectedItem.limitQuantity) return true;
  
    return false;
  }, [quantity, selectedItem, selectedVariantGroup, product, displayRound, productActionState]);


  if (!isOpen) return null;

  const renderContent = () => {
    if (loading) return <ProductDetailSkeleton />;
    if (error || !product || !displayRound) {
      return (
        <div className="error-message-modal">
          <AlertCircle className="error-icon" /><p>{error || '상품 정보를 불러올 수 없습니다.'}</p><button onClick={onClose} className="error-close-btn">닫기</button>
        </div>
      );
    }

    const deadlineDate = safeToDate(displayRound.deadlineDate);
    const pickupDate = safeToDate(displayRound.pickupDate);
    const isMultiGroup = displayRound.variantGroups.length > 1;

    return (
      <>
        <div className="main-content-area">
          <div className="image-gallery-wrapper">
            <Swiper
              ref={swiperRef}
              modules={[Pagination, Navigation]}
              spaceBetween={0}
              slidesPerView={1}
              pagination={{
                clickable: true,
                dynamicBullets: true,
              }}
              onSlideChange={(swiper) => setCurrentImageIndex(swiper.activeIndex)}
              className="product-swiper"
            >
              {(product.imageUrls ?? []).map((url, index) => (
                <SwiperSlide key={index} onClick={openImageModal}>
                  <img
                    src={getOptimizedImageUrl(url, "1080x1080")}
                    alt={`${product.groupName} 이미지 ${index + 1}`}
                    fetchpriority={index === 0 ? "high" : "auto"}
                  />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
          <div className="product-info-area">
            <div className="product-info-header">
              <h2 className="product-name">{product.groupName}</h2>
            </div>
            <p className="product-description">{product.description}</p>

            <div className="product-key-info">
              <div className="info-row">
                <div className="info-label"><Tag size={16} />판매 회차</div>
                <div className="info-value"><span className="round-name-badge">{displayRound.roundName}</span></div>
              </div>
              <div className="info-row">
                <div className="info-label"><CalendarDays size={16} />마감일</div>
                <div className="info-value">{deadlineDate ? formatDateWithDay(deadlineDate) + ' 13:00' : '미정'}</div>
              </div>
              <div className="info-row">
                <div className="info-label"><CalendarDays size={16} />픽업일</div>
                <div className="info-value">{pickupDate ? formatDateWithDay(pickupDate) : '미정'}</div>
              </div>
              <div className="info-row">
                <div className="info-label">{storageIcons?.[product.storageType]}보관 방법</div>
                <div className={`info-value storage-type-${product.storageType}`}>{storageLabels?.[product.storageType]}</div>
              </div>
              <div className={`info-row stock-info-row ${isMultiGroup ? 'multi-group' : ''}`}>
                <div className="info-label">
                    <PackageCheck size={16} />잔여 수량
                </div>
                <div className="info-value">
                  <div className="stock-list">
                    {displayRound.variantGroups.map(vg => {
                        const totalStock = vg.totalPhysicalStock;
                        const reserved = vg.reservedCount || 0;
                        const remainingStock = totalStock === null || totalStock === -1 ? Infinity : Math.max(0, totalStock - reserved);
                        const stockText = remainingStock === Infinity ? '무제한' : remainingStock > 0 ? `${remainingStock}개` : '품절';
                        
                        const displayText = isMultiGroup ? `${vg.groupName}: ${stockText}` : stockText;
                        
                        return (
                            <div key={vg.id} className="stock-list-item">{displayText}</div>
                        );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };  
  
  const renderFooter = () => {
    if (loading ||!product || !displayRound || !selectedItem) {
        return null;
    }
    
    if (isSuspendedUser) {
      return (
        <div className="product-purchase-footer">
          <button className="sold-out-btn-fixed" disabled>
            <ShieldX size={16} /> 참여 제한
          </button>
        </div>
      );
    }
    
    const showQuantityControls = productActionState === 'PURCHASABLE' || productActionState === 'WAITLISTABLE';
    
    return (
        <div className="product-purchase-footer">
            {allAvailableOptions.length > 1 && (
              <div className="select-wrapper">
                <select className="price-select" onChange={handleOptionChange} value={allAvailableOptions.findIndex(opt => opt.item.id === selectedItem?.id)}>
                  {allAvailableOptions.map((opt, index) => {
                    const isSingleVg = displayRound.variantGroups.length === 1;
                    const optionText = isSingleVg 
                      ? `${opt.item.name} (${formatPrice(opt.item.price)})`
                      : `${opt.vg.groupName} - ${opt.item.name} (${formatPrice(opt.item.price)})`;

                    return (
                      <option key={`${opt.vg.id}-${opt.item.id}-${index}`} value={index}>
                        {optionText}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            
            <div className="purchase-action-row">
              {showQuantityControls && (
                <>
                  <div className="quantity-controls-fixed" onClick={(e) => e.stopPropagation()}>
                      <button {...decrementHandlers} disabled={quantity <= 1} className="quantity-btn">-</button>
                      {isQuantityEditing ? (
                        <input
                          ref={quantityInputRef}
                          type="number"
                          className="quantity-input-fixed"
                          value={quantity}
                          onChange={handleQuantityInputChange}
                          onBlur={handleQuantityInputBlur}
                          onKeyDown={(e) => e.key === 'Enter' && handleQuantityInputBlur()}
                        />
                      ) : (
                        <span className="quantity-display-fixed" onClick={() => setIsQuantityEditing(true)}>{quantity}</span>
                      )}
                      <button {...incrementHandlers} disabled={isIncrementDisabled} className="quantity-btn">+</button>
                  </div>
                  <span className="footer-total-price-fixed">{formatPrice(currentTotalPrice)}</span>
                </>
              )}

              {productActionState === 'PURCHASABLE' && (
                 <button className="add-to-cart-btn-fixed" onClick={handleAddToCart}>
                    <ShoppingCart size={18} />
                 </button>
              )}
              {productActionState === 'WAITLISTABLE' && (
                  <button className="waitlist-btn-fixed" onClick={handleAddToWaitlist} disabled={waitlistLoading}>
                      {waitlistLoading ? <InlineSodomallLoader /> : <><Hourglass size={14} />&nbsp;대기</>}
                  </button>
              )}
              {productActionState === 'ENCORE_REQUESTABLE' && (
                 <button className="encore-request-btn-fixed" onClick={handleEncoreRequest} disabled={userAlreadyRequestedEncore || encoreLoading}>
                    {encoreLoading ? <InlineSodomallLoader /> : userAlreadyRequestedEncore ? '요청 완료' : '앵콜 요청'}
                 </button>
              )}
              {(productActionState === 'SCHEDULED' || productActionState === 'ENDED') && (
                  <button className="sold-out-btn-fixed" disabled>
                      {productActionState === 'SCHEDULED' ? '판매 예정' : '판매 종료'}
                  </button>
              )}
            </div>
        </div>
    );
  }

  return (
    <div className="product-detail-modal-overlay" onClick={onClose}>
      <div className="product-detail-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn-top" onClick={onClose}><X size={20} /></button>
        <div className="modal-scroll-area">
          {renderContent()}
        </div>
        
        {renderFooter()}

      </div>

      {isImageModalOpen && product && (
        <div className="image-lightbox-overlay" onClick={closeImageModal}>
          <button className="modal-close-btn-lightbox" onClick={closeImageModal}><X size={28} /></button>
          {/* ✨ [개선] Lightbox에도 Swiper 적용 */}
          <Swiper
            ref={lightboxSwiperRef}
            modules={[Pagination, Navigation]}
            initialSlide={currentImageIndex}
            navigation={{
              nextEl: '.image-nav-btn-lightbox.next',
              prevEl: '.image-nav-btn-lightbox.prev',
            }}
            pagination={{
              type: 'fraction',
              el: '.image-indicator-lightbox'
            }}
            onSlideChange={(swiper) => setCurrentImageIndex(swiper.activeIndex)}
            className="lightbox-swiper"
          >
            {(product.imageUrls ?? []).map((url, index) => (
              <SwiperSlide key={index}>
                <img src={getOptimizedImageUrl(url, "1080x1080")} alt={`확대 이미지 ${index + 1}`} />
              </SwiperSlide>
            ))}
          </Swiper>
          
          {/* Swiper 외부의 커스텀 네비게이션 버튼 및 인디케이터 */}
          {(product.imageUrls?.length ?? 0) > 1 && (
            <>
              <button onClick={(e) => e.stopPropagation()} className="image-nav-btn-lightbox prev"><ChevronLeft /></button>
              <button onClick={(e) => e.stopPropagation()} className="image-nav-btn-lightbox next"><ChevronRight /></button>
              <div className="image-indicator-lightbox"></div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductDetailPage;