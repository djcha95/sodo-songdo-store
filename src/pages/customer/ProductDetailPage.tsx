// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import { useAuth } from '@/context/AuthContext';

import { getApp } from 'firebase/app';

// 💡 [수정] getDoc, doc, getFirestore를 import합니다.
import { Timestamp, getFirestore, doc, getDoc } from 'firebase/firestore'; 
import { getFunctions, httpsCallable } from 'firebase/functions';

import type { Product, ProductItem, StorageType, SalesRound as OriginalSalesRound, OrderItem } from '@/shared/types';
import { getDisplayRound, determineActionState, safeToDate, getDeadlines, getStockInfo, getMaxPurchasableQuantity } from '@/utils/productUtils';
import type { ProductActionState, VariantGroup } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import PrepaymentModal from '@/components/common/PrepaymentModal';
import { getMarketingBadges } from '@/utils/productBadges';

import { 
  X, Minus, Plus, ShoppingCart, Hourglass, Box, Calendar, 
  PackageCheck, Tag, Sun, Snowflake, CheckCircle, Search, 
  Flame, AlertTriangle, Clock, Gift, Sparkles // 💡 [추가] Gift, Sparkles 아이콘 추가
} from 'lucide-react';

// 💡 [수정] 주문 내역은 사용자 기준 조회만 사용
import { getUserOrders } from '@/firebase/orderService'; 
// 💡 [추가] 상세 재고/예약수량 오버레이는 Cloud Function 기반으로 안전하게 적용
import { getProductById } from '@/firebase/productService';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Zoom, Thumbs, FreeMode } from 'swiper/modules';
import type { Swiper as SwiperCore } from 'swiper';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/zoom';
import 'swiper/css/thumbs';
import 'swiper/css/free-mode';

import './ProductDetailPage.css';
import toast from 'react-hot-toast';
import { showToast, showConfirmationToast } from '@/utils/toastUtils';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);

import type { SalesRound } from '@/shared/types';
import ConfirmModal from '@/components/common/ConfirmModal';

// --- Helper Functions ---
const toTimestamp = (date: any): Timestamp | null => {
    if (!date) return null;
    if (date instanceof Timestamp) return date;
    if (date instanceof Date) return Timestamp.fromDate(date);
    return null;
};

const formatDateWithDay = (dateInput: Date | Timestamp | null | undefined): string => {
    if (!dateInput) return '미정';
    const date = dayjs(safeToDate(dateInput));
    if (!date.isValid()) return '날짜 오류';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.format('M.D')}(${days[date.day()]})`;
};

/* 💡 [삭제] 사용되지 않는 formatDateTimeWithDay 함수를 제거합니다. */


const formatExpirationDate = (dateInput: Date | Timestamp | null | undefined): string => {
    if (!dateInput) return '';
    const date = dayjs(safeToDate(dateInput));
    if (!date.isValid()) return '날짜 오류';
    if (date.year() > 2098) return '상시';
    return `${date.format('YY.MM.DD')}`;
};

const storageLabels: Record<StorageType, string> = { ROOM: '실온', COLD: '냉장', FROZEN: '냉동', FRESH: '신선' };
const storageIcons: Record<StorageType, React.ReactNode> = { ROOM: <Sun size={16} />, COLD: <Snowflake size={16} />, FROZEN: <Snowflake size={16} />, FRESH: <Tag size={16} /> };

// ✅ 예약수량/픽업수량 오버레이는 Cloud Function(getProductByIdWithStock) 결과로 처리합니다.

// --- Sub Components ---

const Lightbox: React.FC<{
  images: string[];
  startIndex: number;
  isOpen: boolean;
  onClose: () => void;
}> = React.memo(({ images, startIndex, isOpen, onClose }) => {
  // 썸네일 Swiper의 인스턴스를 저장할 state
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperCore | null>(null);

  // 팝업이 열릴 때 초기화 (Swiper가 내부적으로 처리하므로 복잡한 로직 제거)
  useEffect(() => {
    if (!isOpen) {
      setThumbsSwiper(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close-btn" onClick={onClose} aria-label="닫기">
        <X size={32} />
      </button>
      
      <div className="lightbox-content-wrapper" onClick={(e) => e.stopPropagation()}>
        {/* 메인 큰 슬라이더 */}
        <Swiper
          modules={[Pagination, Navigation, Zoom, Thumbs]} // Controller 제거, Thumbs 활용
          thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }} // 💡 핵심 수정: 공식 연동 방식 사용
          initialSlide={startIndex}
          spaceBetween={20}
          slidesPerView={1}
          navigation
          pagination={{ clickable: true, type: 'fraction' }} // 💡 럭셔리 포인트: 점 대신 숫자(1 / 5)로 표시하는 게 더 깔끔함
          zoom={{ maxRatio: 3 }} // 줌 배율 설정
          loop={true} // 루프 활성화
          speed={600} // 🔹 전환 속도를 450 -> 600으로 늘려 더 부드럽게
          grabCursor={true}
          className="lightbox-swiper"
        >
          {images.map((url, index) => (
            <SwiperSlide key={index}>
              <div className="swiper-zoom-container">
                <OptimizedImage
                  originalUrl={url}
                  size="1080x1080"
                  alt={`상세 이미지 ${index + 1}`}
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* 하단 썸네일 */}
        <Swiper
          onSwiper={setThumbsSwiper} // 여기서 인스턴스를 받아 메인에 넘겨줌
          modules={[Thumbs, FreeMode]}
          watchSlidesProgress={true} // 필수 설정
          spaceBetween={10}
          slidesPerView="auto" // 내용물 크기에 맞게
          freeMode={true} // 썸네일은 자유롭게 스크롤
          centerInsufficientSlides={true} // 슬라이드가 적을 때 중앙 정렬
          className="lightbox-thumbs-swiper"
        >
          {images.map((url, index) => (
            <SwiperSlide key={index} className="lightbox-thumb-slide">
              <OptimizedImage
                originalUrl={url}
                size="200x200"
                alt={`썸네일 ${index + 1}`}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
});


const ProductImageSlider: React.FC<{ images: string[]; productName: string; onImageClick: (index: number) => void; }> = React.memo(({ images, productName, onImageClick }) => (<div className="product-swiper-container"><Swiper modules={[Pagination, Navigation]} spaceBetween={0} slidesPerView={1} navigation pagination={{ clickable: true, dynamicBullets: true }} className="product-swiper">{images.map((url, index) => (<SwiperSlide key={index} onClick={() => onImageClick(index)}><OptimizedImage originalUrl={url} size="1080x1080" alt={`${productName} 이미지 ${index + 1}`} /></SwiperSlide>))}</Swiper><div className="image-zoom-indicator"><Search size={16} /><span>클릭해서 크게 보기</span></div></div>));

type ExpirationDateInfo = { type: 'none' } | { type: 'single'; date: string; } | { type: 'multiple'; details: { groupName: string; date: string; }[] };
type SalesPhase = 'PRIMARY' | 'SECONDARY' | 'ON_SITE' | 'UNKNOWN';

const ProductInfo: React.FC<{ 
    product: Product; 
    round: SalesRound, 
    actionState: ProductActionState | 'ON_SITE_SALE'; 
    expirationDateInfo: ExpirationDateInfo; 
    salesPhase: SalesPhase; 
    countdown: string | null;
    themeBadge: React.ReactNode;
    marketingBadges: React.ReactNode;
}> = React.memo(({ product, round, actionState, expirationDateInfo, salesPhase, countdown, themeBadge, marketingBadges }) => {

    const pickupDate = safeToDate(round.pickupDate);
    const arrivalDate: Date | null = safeToDate(round.arrivalDate);
    const isMultiGroup = round.variantGroups.length > 1;
    const isLuxury = round?.eventType === 'PREMIUM';

    // ✨ [추가] 관리자 페이지에서 입력한 새 데이터들
    const categories = (product as any).categories || [];
    const composition = (product as any).composition || '';
    const extraInfo = (product as any).extraInfo || '';

    return (
        <>
            <div className="product-header-content">
                {themeBadge}
                {marketingBadges}

                {/* ✨ [추가] 카테고리 태그 (B&W 럭셔리 스타일) */}
                {categories.length > 0 && (
                    <div className="category-badge-row" style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                        {categories.map((c: string) => (
                            <span key={c} style={{
                                backgroundColor: '#000',
                                color: '#fff',
                                padding: '3px 10px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                borderRadius: '2px',
                                letterSpacing: '-0.02em'
                            }}>{c}</span>
                        ))}
                    </div>
                )}

                {/* 3. 상단 헤더 부분 수정 - 럭셔리 모드일 때 뱃지 노출 */}
                {isLuxury && <div className="luxury-badge">Premium Collection</div>}
                
                <h1 className="product-name">{product.groupName}</h1>
                
                {/* ✨ [추가] 상품 설명 표시 */}
                {product.description && product.description.trim() && (
                    <div className="markdown-content" style={{ marginTop: '0.5rem', marginBottom: '0.8rem' }}>
                        {product.description}
                    </div>
                )}
                
                {countdown && (
                    <div className="countdown-timer-detail">
                        <Clock size={18} />
                        <span>예약 마감까지 <strong>{countdown}</strong></span>
                    </div>
                )}
            </div>

            {/* ✨ [추가] 상세 사양 섹션 (구성 및 참고사항) */}
            <div className="product-specs-container" style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <div className="spec-item" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#000', marginBottom: '8px' }}>상품 구성</h3>
                    <div style={{ 
                        fontSize: '0.85rem', 
                        lineHeight: '1.6', 
                        color: '#444', 
                        whiteSpace: 'pre-wrap', // ✨ 줄바꿈 유지 중요
                        wordBreak: 'break-all'
                    }}>
                        {composition || '상품 구성 정보가 등록되지 않았습니다.'}
                    </div>
                </div>

                {extraInfo && (
                    <div className="spec-item">
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#000', marginBottom: '8px' }}>기타 정보</h3>
                        <div style={{ 
                            fontSize: '0.85rem', 
                            lineHeight: '1.6', 
                            color: '#666', 
                            whiteSpace: 'pre-wrap' 
                        }}>
                            {extraInfo}
                        </div>
                    </div>
                )}
            </div>

            <div className="product-key-info" data-tutorial-id="detail-key-info">
                <>
                    {expirationDateInfo.type === 'single' && (
                        <div className="info-row">
                            <div className="info-label"><Hourglass size={16} />유통기한</div>
                            <div className="info-value">{expirationDateInfo.date}</div>
                        </div>
                    )}
                    {expirationDateInfo.type === 'multiple' && (
                        <div className="info-row expiration-info-row">
                            <div className="info-label"><Hourglass size={16} />유통기한</div>
                            <div className="info-value">
                                <div className="expiration-list">
                                    {expirationDateInfo.details.map((item, index) => (
                                        <div key={index} className="expiration-list-item">
                                            {item.groupName}: {item.date}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {arrivalDate && (
                        <div className="info-row">
                            <div className="info-label"><ShoppingCart size={16} />입고일</div>
                            <div className="info-value">{formatDateWithDay(arrivalDate)}</div>
                        </div>
                    )}

                    <div className="info-row">
                        <div className="info-label"><Calendar size={16} />픽업일</div>
                        <div className="info-value">{pickupDate ? formatDateWithDay(pickupDate) : '미정'}</div>
                    </div>
                    <div className="info-row">
                        <div className="info-label">{storageIcons[product.storageType]}보관 방법</div>
                        <div className={`info-value storage-type-${product.storageType}`}>{storageLabels[product.storageType]}</div>
                    </div>
                    <div className={`info-row stock-info-row ${isMultiGroup ? 'multi-group' : ''}`}>
                        <div className="info-label">
                            {salesPhase === 'ON_SITE' ? <Box size={16}/> : <PackageCheck size={16} />}
                            {salesPhase === 'ON_SITE' ? '판매 정보' : '잔여 수량'}
                        </div>
                        <div className="info-value">
                            {salesPhase === 'ON_SITE' ? (
                                <span className="on-site-sale-info">현장 판매 진행 중</span>
                            ) : (
                                <div className="stock-list">
                                    {round.variantGroups.map(vg => {
                                        const stockInfo = getStockInfo(vg);
                                        let stockElement: React.ReactNode;

                                        if (!stockInfo.isLimited) {
                                            stockElement = <span className="unlimited-stock">무제한</span>;
                                        } else if (stockInfo.remainingUnits > 0) {
                                            const pretty = <>{stockInfo.remainingUnits}개 남음</>;

                                            if (stockInfo.remainingUnits <= 10) {
                                                stockElement = <span className="low-stock"><Flame size={14} /> {pretty} <Flame size={14} /></span>;
                                            } else {
                                                stockElement = <span className="limited-stock">{pretty}</span>;
                                            }
                                        } else {
                                            // ✅ [수정] '대기 가능' -> '전량 마감'
                                            stockElement = <span className="sold-out">전량 마감</span>;
                                        }

                                        const displayText = isMultiGroup ? <>{vg.groupName}: {stockElement}</> : stockElement;
                                        return (<div key={vg.id} className="stock-list-item">{displayText}</div>);
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            </div>
        </>
    );
});

const OptionSelector: React.FC<{
    round: SalesRound;
    selectedVariantGroup: VariantGroup | null;
    onVariantGroupChange: (vg: VariantGroup) => void;
    actionState: ProductActionState | 'ON_SITE_SALE'; // ✅ [수정] actionState 타입에서 'WAITLISTABLE'이 제거됨 (productUtils와 동기화)
}> = React.memo(({ round, selectedVariantGroup, onVariantGroupChange, actionState }) => {
    if (!round.variantGroups || round.variantGroups.length <= 1) return null;
    return (
        <div className="select-wrapper" data-tutorial-id="detail-options">
            <select
                className="price-select"
                value={selectedVariantGroup?.id || ''}
                onChange={(e) => {
                    const selectedId = e.target.value;
                    const newVg = round.variantGroups.find(vg => vg.id === selectedId);
                    if (newVg) onVariantGroupChange(newVg);
                }}
            >
                <option value="" disabled>옵션을 선택해주세요.</option>
                {round.variantGroups.map(vg => {
                    const stockInfo = getStockInfo(vg);
                    const isSoldOut = stockInfo.isLimited && stockInfo.remainingUnits <= 0;

                    // ✅ [수정] 'WAITLISTABLE' 상태 체크 제거
                    const isDisabled = isSoldOut;

                    const representativePrice = vg.items?.[0]?.price;
                    const priceText = typeof representativePrice === 'number'
    ? ` (${representativePrice.toLocaleString()}원)`
    : '';

                    // ✅ [수정] '대기 가능' -> '전량 마감'
                    const statusText = isSoldOut
                        ? ' (전량 마감)'
                        : '';

                    return (
                        <option key={vg.id} value={vg.id} disabled={isDisabled}>
                            {`${vg.groupName}${priceText}${statusText}`}
                        </option>
                    );
                })}
            </select>
        </div>
    );
});


const ItemSelector: React.FC<{
    selectedVariantGroup: VariantGroup;
    selectedItem: ProductItem | null;
    onItemChange: (item: ProductItem) => void;
    actionState: ProductActionState | 'ON_SITE_SALE'; // ✅ [수정] actionState 타입에서 'WAITLISTABLE'이 제거됨
}> = React.memo(({ selectedVariantGroup, selectedItem, onItemChange, actionState }) => {
    if (!selectedVariantGroup.items || selectedVariantGroup.items.length <= 1) {
        return null;
    }

    const totalStock = selectedVariantGroup.totalPhysicalStock;
    let remainingStock = Infinity;

    if (totalStock !== null && totalStock !== -1) {
        const reserved = selectedVariantGroup.reservedCount || 0;
        remainingStock = Math.max(0, totalStock - reserved);
    }

    const basePrice = selectedVariantGroup.items?.[0]?.price ?? 0;

    return (
        <div className="select-wrapper item-selector-wrapper" data-tutorial-id="detail-items">
            <select
                className="price-select"
                value={selectedItem?.id || ''}
                onChange={(e) => {
                    const selectedId = e.target.value;
                    const newItem = selectedVariantGroup.items.find(it => it.id === selectedId);
                    if (newItem) {
                        onItemChange(newItem);
                    }
                }}
            >
                <option value="" disabled>세부 옵션을 선택해주세요.</option>
                {selectedVariantGroup.items.map(item => {
                    // ✅ [수정] 'WAITLISTABLE' 상태 체크 제거
                    const isAvailable = (item.stockDeductionAmount || 1) <= remainingStock;
                    const priceDiff = item.price - basePrice;
                    const priceText = priceDiff > 0 ? ` (+${priceDiff.toLocaleString()}원)` : '';

                    return (
                        <option key={item.id} value={item.id} disabled={!isAvailable}>
                            {item.name}{priceText} {!isAvailable ? '(재고 부족)' : ''}
                        </option>
                    );
                })}
            </select>
        </div>
    );
});


const QuantityInput: React.FC<{
    quantity: number;
    setQuantity: React.Dispatch<React.SetStateAction<number>>;
    maxQuantity: number | null;
    step?: number;
    reservationStatus?: 'idle' | 'processing' | 'success'; // ✅ [추가] reservationStatus prop 추가
}> = React.memo(({ quantity, setQuantity, maxQuantity, step = 1, reservationStatus = 'idle' }) => { // ✅ [수정] reservationStatus 기본값 설정
    const increment = useCallback(() => setQuantity(q => {
        if (isNaN(q)) return 1;
        const nextVal = q + step;
        if (maxQuantity !== null && nextVal > maxQuantity) {
            // 최대 수량보다 크면, 최대 수량으로 설정
            return maxQuantity;
        }
        return nextVal;
    }), [setQuantity, maxQuantity, step]);
    
    const decrement = useCallback(() => setQuantity(q => {
        const nextVal = q - step;
        return nextVal >= 1 ? nextVal : 1;
    }), [setQuantity, step]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseInt(value, 10);
        if (value === '') {
            setQuantity(NaN);
        } else if (!isNaN(numValue) && numValue >= 1) {
            // ✅ [수정] 입력 시에도 최대 수량 제한
            if (maxQuantity !== null && numValue > maxQuantity) {
                setQuantity(maxQuantity);
            } else {
                setQuantity(numValue);
            }
        }
    }, [setQuantity, maxQuantity]);

    const handleInputBlur = useCallback(() => {
        let correctedQuantity = isNaN(quantity) || quantity < 1 ? 1 : Math.floor(quantity);

        if (step > 1) {
            const remainder = (correctedQuantity - 1) % step;
            if (remainder !== 0) {
                // 유효한 수량 단위로 내림하여 보정
                correctedQuantity = correctedQuantity - remainder;
            }
        }
        
        if (correctedQuantity < 1) {
            correctedQuantity = 1;
        }

        if (maxQuantity !== null && correctedQuantity > maxQuantity) {
            correctedQuantity = maxQuantity;
            // 최대 수량에 맞춘 후, 다시 수량 단위에 맞게 보정
            if (step > 1) {
                const remainder = (correctedQuantity - 1) % step;
                if (remainder !== 0) {
                    correctedQuantity = correctedQuantity - remainder;
                }
            }
        }
        
        if (correctedQuantity < 1) {
             correctedQuantity = 1;
        }

        setQuantity(correctedQuantity);
    }, [quantity, maxQuantity, setQuantity, step]);

    const displayedQuantity = isNaN(quantity) ? '' : quantity;
    const isDisabled = reservationStatus !== 'idle'; // ✅ [수정] 예약 상태가 idle이 아닐 경우 비활성화

    return (
        <div className="quantity-controls-fixed" data-tutorial-id="detail-quantity-controls">
            <button
                onClick={decrement} // onClick 추가
                className="quantity-btn"
                disabled={isDisabled || isNaN(quantity) || quantity <= 1}
            >
                <Minus />
            </button>
            <input
                type="number"
                className="quantity-input"
                value={displayedQuantity}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onClick={(e) => e.stopPropagation()}
                disabled={isDisabled} // ✅ [수정] isDisabled 적용
            />
            <button
                onClick={increment} // onClick 추가
                className="quantity-btn"
                disabled={isDisabled || (maxQuantity !== null && !isNaN(quantity) && (quantity + step > maxQuantity))}
            >
                <Plus />
            </button>
        </div>
    );
});

const PurchasePanel: React.FC<{
    actionState: ProductActionState | 'ON_SITE_SALE';
    round: SalesRound;
    selectedVariantGroup: VariantGroup | null;
    selectedItem: ProductItem | null;
    quantity: number;
    setQuantity: React.Dispatch<React.SetStateAction<number>>;
    onPurchaseAction: (status: 'RESERVATION') => void; // ✅ [수정] 'WAITLIST' 제거
    reservationStatus: 'idle' | 'processing' | 'success'; // ✅ [추가] props 받기
    myPurchasedCount: number; // 👈 [추가] 이 줄을 꼭 추가해주세요!
}> = React.memo(({ 
    actionState, round, selectedVariantGroup, selectedItem, 
    quantity, setQuantity, onPurchaseAction, reservationStatus,
    myPurchasedCount // 👈 [추가] 여기서도 받아옵니다.
}) => {
    
    const quantityStep = 1; 

    const renderContent = () => {
        switch (actionState) {
            case 'ON_SITE_SALE':
                return <div className="action-notice"><Box size={20} /><div><p><strong>현장 판매 진행 중</strong></p><span>매장에서 직접 구매 가능합니다.</span></div></div>;
            case 'PURCHASABLE':
                if (!selectedItem || !selectedVariantGroup) return <button className="add-to-cart-btn-fixed" disabled><span>구매 가능한 옵션이 없습니다</span></button>;
                
                // 1. 재고 기준 최대 수량
                const stockMax = getMaxPurchasableQuantity(selectedVariantGroup, selectedItem);

                // 👇 [추가] 1인당 제한 로직 적용
                // ✅ [수정] limitQuantity가 null, undefined, -1이거나 양수가 아닐 때 Infinity로 처리
                const limitSetting = (selectedItem.limitQuantity ?? null) !== null && 
                                     Number.isFinite(selectedItem.limitQuantity) && 
                                     (selectedItem.limitQuantity as number) > 0
                    ? Number(selectedItem.limitQuantity)
                    : Infinity;
                const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);
                
                // 👇 [추가] 이미 한도만큼 샀으면 '구매 완료' 버튼 표시
                if (limitSetting !== Infinity && myRemainingLimit <= 0) {
                    return (
                        <button className="add-to-cart-btn-fixed disabled" disabled>
                            <CheckCircle size={20} />
                            <span>구매 완료 ({limitSetting}개 구매함)</span>
                        </button>
                    );
                }

                // 👇 [추가] 최종 구매 가능 수량 (재고 vs 내 남은 한도 중 작은 값)
                const finalMaxQty = Math.min(stockMax, myRemainingLimit);
                
                const getButtonContent = () => {
                    switch (reservationStatus) {
                        case 'processing': return '처리 중...';
                        case 'success': return <><CheckCircle size={20} /> 예약 완료</>;
                        default: return '예약하기';
                    }
                };

                return (
                    <div className="purchase-action-row">
                        <QuantityInput 
                            quantity={quantity} 
                            setQuantity={setQuantity} 
                            maxQuantity={finalMaxQty} // 👈 [수정] finalMaxQty 전달
                            step={quantityStep} 
                            reservationStatus={reservationStatus}
                        />
                        <button 
                            onClick={() => onPurchaseAction('RESERVATION')} 
                            className={`add-to-cart-btn-fixed ${reservationStatus !== 'idle' ? 'processing' : ''}`}
                            data-tutorial-id="detail-action-button" 
                            // 👈 [수정] finalMaxQty가 0이면 비활성화
                            disabled={reservationStatus !== 'idle' || finalMaxQty === 0} 
                        >
                            {stockMax === 0 ? '재고 없음' : getButtonContent()}
                        </button>
                    </div>
                );
            case 'REQUIRE_OPTION': return <button className="add-to-cart-btn-fixed" onClick={() => showToast('info', '페이지 하단에서 옵션을 먼저 선택해주세요!')}><Box size={20} /><span>옵션을 선택해주세요</span></button>;
            case 'AWAITING_STOCK': return <button className="add-to-cart-btn-fixed" disabled><Hourglass size={20} /><span>재고 준비중</span></button>;
            // ✅ [수정] 'ENDED' 상태일 때 '전량 마감' 표시
            case 'ENDED': return <button className="add-to-cart-btn-fixed" disabled><Hourglass size={20} /><span>전량 마감</span></button>;
            default: return <button className="add-to-cart-btn-fixed" disabled><span>준비 중입니다</span></button>;
        }
    };
    return <>{renderContent()}</>;
});

const ProductDetailSkeleton: React.FC = () => (<div className="product-detail-modal-overlay"><div className="product-detail-modal-content"><div className="modal-scroll-area"><div className="main-content-area skeleton"><div className="image-gallery-wrapper skeleton-box skeleton-image"></div><div className="product-info-area"><div className="skeleton-box skeleton-title" style={{margin: '0 auto'}}></div><div className="skeleton-box skeleton-text" style={{ textAlign: 'center' }}></div><div className="skeleton-box skeleton-text short" style={{ margin: '0.5rem auto', width: '50%' }}></div><div className="skeleton-box skeleton-info-row" style={{marginTop: '1.5rem'}}></div><div className="skeleton-box skeleton-info-row"></div></div></div></div><div className="product-purchase-footer"><div className="skeleton-box" style={{height: '48px', width: '100%'}}></div></div></div></div>);

// --- Main Component ---
const ProductDetailPage: React.FC = () => {
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const { user, userDocument } = useAuth(); 

    const location = useLocation();

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedVariantGroup, setSelectedVariantGroup] = useState<VariantGroup | null>(null);
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxStartIndex, setLightboxStartIndex] = useState(0);
    const [countdown, setCountdown] = useState<string | null>(null);

    const [isPrepaymentModalOpen, setPrepaymentModalOpen] = useState(false);
    const [prepaymentPrice, setPrepaymentPrice] = useState(0);

    // ✅ [추가] 예약 상태를 관리하기 위한 새 state
    const [reservationStatus, setReservationStatus] = useState<'idle' | 'processing' | 'success'>('idle');
    // ✅ [추가] 확인 모달 상태 관리
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    // 👇 [추가] 내가 이미 구매한 수량을 저장할 변수
    const [myPurchasedCount, setMyPurchasedCount] = useState(0);

    const badgeSeed = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

    const contentAreaRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    // ✅ [수정] 예약반영 재고는 Cloud Function 기반으로 백그라운드에서 업데이트
    const overlayPromiseRef = useRef<Promise<void> | null>(null);


    // 💡 [추가] Firestore 인스턴스를 가져옵니다.
    const db = useMemo(() => getFirestore(getApp()), []);

    const functionsInstance = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    const submitOrderCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'submitOrder'), [functionsInstance]);

    const handleClose = useCallback(() => {
        if (location.key === 'default' || window.history.length <= 1) {
            navigate('/', { replace: true });
        } else {
            navigate(-1);
        }
    }, [navigate, location.key]);


    const displayRound = useMemo(() => {
        if (!product) return null;
        return getDisplayRound(product) as SalesRound | null;
    }, [product]);

    // 1. 럭셔리 모드인지 확인
    const isLuxury = displayRound?.eventType === 'PREMIUM'; // 💡 [추가] 럭셔리 모드 확인 로직
    // 💡 [추가] 테마 결정 로직 (eventType에 따라 스타일 클래스 지정)
    const themeClass = useMemo(() => {
        if (!displayRound) return '';
        const type = displayRound.eventType;
        if (type === 'CHRISTMAS') return 'theme-christmas'; // 크리스마스
        if (type === 'SPECIAL') return 'theme-special';     // 기획전/스페셜
        if (type === 'PREMIUM') return 'luxury-mode';       // 기존 럭셔리(유지)
        return '';
    }, [displayRound]);

    // 💡 [추가] 테마별 뱃지/아이콘 설정
    const themeBadge = useMemo(() => {
        if (themeClass === 'theme-christmas') {
            return <div className="theme-banner-badge christmas"><Snowflake size={14} /> MERRY CHRISTMAS</div>;
        }
        if (themeClass === 'theme-special') {
            return <div className="theme-banner-badge special"><Gift size={14} /> SPECIAL EVENT</div>;
        }
        return null;
    }, [themeClass]);

    const marketingBadges = useMemo(() => {
        if (!product || !displayRound) return null;
        const representativeItem = selectedItem ?? (displayRound.variantGroups?.[0]?.items?.[0] ?? null);
        const badges = getMarketingBadges({
            product,
            round: displayRound as any,
            selectedItem: representativeItem as any,
            seed: badgeSeed,
            maxBadges: 3,
        });
        if (badges.length === 0) return null;
        return (
            <div className="marketing-badge-row" aria-label="상품 뱃지">
                {badges.map((b) => (
                    <span key={b.key} className={`marketing-badge key-${b.key} tone-${b.tone}`}>
                        {b.label}
                    </span>
                ))}
            </div>
        );
    }, [product, displayRound, selectedItem, badgeSeed]);

    // ✅ [추가] 예약 성공 후 버튼 상태를 되돌리기 위한 useEffect
    useEffect(() => {
        if (reservationStatus === 'success') {
            const timer = setTimeout(() => {
                setReservationStatus('idle');
                setQuantity(1); // 수량을 1로 리셋
            }, 2000); // 2초 후 '예약하기'로 복귀
            return () => clearTimeout(timer);
        }
    }, [reservationStatus]);

    // 👇 [추가] 옵션(selectedItem)이 바뀔 때마다 내 주문 내역 확인
    useEffect(() => {
        const checkMyHistory = async () => {
            if (!user || !selectedItem || !displayRound) {
                setMyPurchasedCount(0);
                return;
            }

            try {
                const myOrders = await getUserOrders(user.uid);
                const currentRoundId = displayRound.roundId;
                const currentItemId = selectedItem.id;

                // '취소되지 않은' 주문 중에서, '지금 보고 있는 상품'의 수량을 다 더함
                const totalBought = myOrders
                    .filter(o => o.status !== 'CANCELED' && o.status !== 'LATE_CANCELED') // 취소된 건 제외
                    .flatMap(o => o.items)
                    .filter(i => i.roundId === currentRoundId && i.itemId === currentItemId)
                    .reduce((sum, i) => sum + i.quantity, 0);

                setMyPurchasedCount(totalBought);
            } catch (error) {
                console.error("내 주문 내역 확인 중 오류:", error);
            }
        };

        checkMyHistory();
    }, [user, selectedItem, displayRound]); // 아이템을 바꿀 때마다 다시 체크


    useEffect(() => {
        if (!displayRound) {
            setCountdown(null);
            return;
        }

        const { primaryEnd } = getDeadlines(displayRound);
        if (!primaryEnd || dayjs().isAfter(primaryEnd)) { // ✅ [수정] 1차 마감 지났으면 카운트다운 안함
            setCountdown(null);
            return;
        }

        const interval = setInterval(() => {
            const diff = primaryEnd.diff(dayjs(), 'second');
            if (diff <= 0) {
                setCountdown('마감!');
                clearInterval(interval);
                // ✅ [추가] 마감 시 상품 정보 새로고침 (권장)
                // fetchProduct(); // 혹은 상태를 'ENDED'로 강제 업데이트
                return;
            }
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            setCountdown(`${h}:${m}:${s}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [displayRound]); // ✅ [수정] 의존성 배열에서 fetchProduct 제거


    useLayoutEffect(() => {
        const contentElement = contentAreaRef.current;
        const footerElement = footerRef.current;
        if (contentElement && footerElement && displayRound) {
            const observer = new ResizeObserver(entries => {
                // ✅ [수정] footerHeight가 0일 경우 (컴포넌트가 사라질 때) padding을 0으로 설정
                const footerHeight = entries[0]?.contentRect?.height ?? 0;
                contentElement.style.paddingBottom = footerHeight > 0 ? `${footerHeight + 16}px` : '0px';
            });
            observer.observe(footerElement);
            return () => observer.disconnect();
        }
    }, [displayRound]);

    // ✅ [수정] fetchProduct를 useCallback으로 감싸서 useEffect에서 참조할 수 있도록 함
const fetchProduct = useCallback(async () => {
  if (!productId) {
    setError("잘못된 상품 ID입니다.");
    setLoading(false);
    return;
  }

  setError(null);
  setLoading(true);

  try {
    // 1) 상품 정보는 먼저 로딩해서 화면을 빠르게 띄움
    const productRef = doc(db, 'products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      setError("상품을 찾을 수 없습니다.");
      setLoading(false);
      return;
    }

    const productData = { ...productSnap.data(), id: productSnap.id } as Product;

    setProduct(productData);
    setLoading(false);

    // 2) 예약/재고 오버레이는 Cloud Function으로 뒤에서 적용
    //    - 비관리자에서도 안전(orders 직접 조회 없음)
    //    - 실패해도 상품 상세는 계속 표시
    if (!overlayPromiseRef.current) {
      overlayPromiseRef.current = (async () => {
        try {
          const enriched = await getProductById(productId);
          if (!enriched) return;
          setProduct((prev) => {
            if (!prev) return prev;
            if (prev.id !== productData.id) return prev; // 라우팅 변경 안전장치
            return enriched;
          });
        } catch (overlayErr) {
          console.warn("상세 오버레이(Cloud Function) 적용 실패:", overlayErr);
        } finally {
          overlayPromiseRef.current = null;
        }
      })();
    }
  } catch (e: any) {
    console.error("상품 상세 정보 로딩 실패:", e);
    // ✅ DB 직접 조회가 막히거나 네트워크 이슈가 있어도 Cloud Function으로 한번 더 시도
    try {
      const enriched = await getProductById(productId);
      if (!enriched) {
        setError("상품을 찾을 수 없습니다.");
      } else {
        setProduct(enriched);
        setError(null);
      }
    } catch (fallbackErr: any) {
      console.error("상품 상세 Cloud Function 로딩 실패:", fallbackErr);
      showToast('error', fallbackErr?.message || "상품 정보를 불러오는 데 실패했습니다.");
      setError(fallbackErr?.message || "상품 정보를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }
}, [productId, db]);

    useEffect(() => {
        fetchProduct();
    }, [fetchProduct]); // ✅ [수정] fetchProduct를 의존성으로 추가


    const expirationDateInfo = useMemo<ExpirationDateInfo>(() => {
        if (!displayRound || displayRound.variantGroups.length === 0) {
            return { type: 'none' };
        }
        const allDates = displayRound.variantGroups.map(vg => {
            // ✅ [수정] 여기서 먼저 Date 객체로 변환합니다.
            const dateObj = safeToDate(vg.items?.[0]?.expirationDate); 
            return dateObj ? dateObj.getTime() : null; // getTime()으로 숫자 변환
        }).filter((d): d is number => d !== null);

        if (allDates.length === 0) return { type: 'none' };

        const uniqueDates = [...new Set(allDates)];

        if (uniqueDates.length === 1) {
            // ✅ [수정] Date 객체로 다시 변환 후 포맷 함수 호출
            return { type: 'single', date: formatExpirationDate(new Date(uniqueDates[0]!)) };
        } else {
            const dateDetails = displayRound.variantGroups
                .map(vg => ({
                    groupName: vg.groupName,
                    // ✅ [수정] 여기서 먼저 Date 객체로 변환 후 포맷 함수 호출
                    date: formatExpirationDate(safeToDate(vg.items?.[0]?.expirationDate)),
                }))
                .filter(item => item.date); // formatExpirationDate 결과가 빈 문자열이 아닌 것만 필터링
            return { type: 'multiple', details: dateDetails };
        }
    }, [displayRound]);

    const originalImageUrls = useMemo(() => {
        return product?.imageUrls?.filter(url => typeof url === 'string' && url.trim() !== '') || [];
    }, [product?.imageUrls]);

    const salesPhase = useMemo<SalesPhase>(() => {
        if (!displayRound) return 'UNKNOWN';
        const { primaryEnd } = getDeadlines(displayRound);
        // ✅ [수정] 픽업일 13시를 2차 마감 (현장 판매 시작) 기준으로 설정
        const secondaryEnd = safeToDate(displayRound.pickupDate) 
            ? dayjs(safeToDate(displayRound.pickupDate)).hour(13).minute(0).second(0) 
            : null;

        const now = dayjs();
        
        // 1. 현장 판매 수동 설정이 켜져있으면 ON_SITE
        if (displayRound.isManuallyOnsite) return 'ON_SITE';

        // 2. 2차 마감(픽업일 13시)이 지났으면 ON_SITE
        if (secondaryEnd && now.isAfter(secondaryEnd)) return 'ON_SITE';

        // 3. 1차 마감이 지났으면 SECONDARY
        if (primaryEnd && now.isAfter(primaryEnd)) return 'SECONDARY';
        
        // 4. 둘 다 아니면 PRIMARY
        return 'PRIMARY';
    }, [displayRound]);

    const actionState = useMemo<ProductActionState | 'ON_SITE_SALE'>(() => {
        if (!displayRound) return 'LOADING';

        if (salesPhase === 'ON_SITE') return 'ON_SITE_SALE';

        // ✅ [수정] productUtils의 determineActionState를 직접 사용 (타입 오류 해결)
        const baseState = determineActionState(displayRound, userDocument as any);

        // 옵션이 필요한데 아이템이 선택된 경우 (PURCHASABLE로 보정)
        if (baseState === 'REQUIRE_OPTION' && selectedItem) return 'PURCHASABLE';

        // 구매 가능한데 아이템이 선택되지 않은 경우 (REQUIRE_OPTION으로 보정)
        if (baseState === 'PURCHASABLE' && !selectedItem) {
            // (productUtils에서 이 로직을 이미 처리함, 'REQUIRE_OPTION'으로 반환됨)
            return 'REQUIRE_OPTION'; 
        }
        
        return baseState;
    }, [displayRound, userDocument, selectedItem, salesPhase]);

    const selectInitialItemForVg = useCallback((vg: VariantGroup) => {
        const findFirstAvailableItem = (variantGroup: VariantGroup) => {
            const totalStock = variantGroup.totalPhysicalStock;
            if (totalStock === null || totalStock === -1) return variantGroup.items?.[0] || null;
            const reserved = variantGroup.reservedCount || 0;
            const remainingStock = Math.max(0, totalStock - reserved);
            // ✅ [수정] 재고가 0개 초과인 아이템을 찾도록 수정 (1개 이상)
            return variantGroup.items?.find(item => (item.stockDeductionAmount || 1) <= remainingStock) || null;
        };
        const availableItem = findFirstAvailableItem(vg);
        // ✅ [수정] 이용 가능한 아이템이 없으면 null로 설정 (첫 번째 아이템을 강제로 선택하지 않음)
        setSelectedItem(availableItem);
    }, []);


    useEffect(() => {
        if (displayRound && displayRound.variantGroups.length > 0 && !selectedVariantGroup) {
            // ✅ [수정] 첫 번째 옵션 그룹을 기본으로 선택하되,
            // 해당 그룹에서 선택 가능한 아이템이 있는지 확인
            const initialVg = displayRound.variantGroups[0];
            if (initialVg) {
                setSelectedVariantGroup(initialVg);
                // ✅ [수정] 아이템 선택 로직은 selectInitialItemForVg에 맡김
                selectInitialItemForVg(initialVg);
            }
        }
    }, [displayRound, selectedVariantGroup, selectInitialItemForVg]);


    const handleOpenLightbox = useCallback((index: number) => { setLightboxStartIndex(index); setIsLightboxOpen(true); }, []);
    const handleCloseLightbox = useCallback(() => { setIsLightboxOpen(false); }, []);

    // ✅ [수정] handleImmediateOrder 함수 로직 전체 변경 (보안관 역할 추가)
// 1️⃣ [추가] 유효성 검사 및 모달 열기 (버튼 클릭 시 실행)
    const handlePreCheck = () => {
        // 기본 유효성 검사
        if (!userDocument || !user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
        if (reservationStatus !== 'idle' || !product || !displayRound || !selectedVariantGroup || !selectedItem) return;

        // 구매 한도(보안관) 체크
        // ✅ [수정] limitQuantity가 null, undefined, -1이거나 양수가 아닐 때 Infinity로 처리
        const limitSetting = (selectedItem.limitQuantity ?? null) !== null && 
                             Number.isFinite(selectedItem.limitQuantity) && 
                             (selectedItem.limitQuantity as number) > 0
            ? Number(selectedItem.limitQuantity)
            : Infinity;
        const myRemainingLimit = Math.max(0, limitSetting - myPurchasedCount);

        if (quantity > myRemainingLimit) {
             showToast('error', `구매 한도 초과! 최대 ${myRemainingLimit}개만 더 구매 가능합니다.`);
             return;
        }

        // ✅ 모든 검사 통과 시 모달 열기
        setConfirmOpen(true);
    };

    // 2️⃣ [수정] 실제 주문 실행 (모달에서 '네' 눌렀을 때 실행)
    // 기존 handleImmediateOrder의 이름을 executeOrder로 변경하고 로직을 다듬습니다.
    const executeOrder = async () => {
        // 여기서는 user 체크 등을 생략해도 됩니다 (handlePreCheck에서 했으므로)
        // 하지만 안전을 위해 기본적인 변수 존재 여부만 확인
        if (!product || !displayRound || !selectedVariantGroup || !selectedItem || !user) return;

        setReservationStatus('processing'); // 로딩 시작

        try {
            const prepaymentRequired = displayRound.isPrepaymentRequired;
            const totalPrice = selectedItem.price * quantity;

            // ... 기존 주문 데이터 생성 로직 그대로 유지 ...
            const orderItem: OrderItem = {
                id: `order-item-${selectedItem.id}-${Date.now()}`,
                productId: product.id, productName: product.groupName, imageUrl: product.imageUrls?.[0] || '',
                roundId: displayRound.roundId, roundName: displayRound.roundName,
                variantGroupId: selectedVariantGroup.id, variantGroupName: selectedVariantGroup.groupName,
                itemId: selectedItem.id, itemName: selectedItem.name,
                quantity: quantity, unitPrice: selectedItem.price, stock: selectedItem.stock,
                stockDeductionAmount: selectedItem.stockDeductionAmount ?? 1, // ✅ 기본값 1로 fallback
                arrivalDate: displayRound.arrivalDate || null, pickupDate: displayRound.pickupDate,
                deadlineDate: displayRound.deadlineDate,
                isPrepaymentRequired: displayRound.isPrepaymentRequired ?? false,
            };

            const orderPayload = {
                userId: user.uid, items: [orderItem], totalPrice,
                customerInfo: { name: user.displayName || '미상', phone: userDocument?.phone || '' },
                pickupDate: displayRound.pickupDate, wasPrepaymentRequired: prepaymentRequired,
                notes: '상세페이지 즉시 예약'
            };

            const result = await submitOrderCallable(orderPayload);
            const data = result.data as any;

            if (data.updatedOrderIds || data.orderIds) {
                // ✅ 성공 시 처리
                setConfirmOpen(false); // 모달 닫기
                
                if (data.updatedOrderIds?.length > 0) {
                     showToast('success', '기존 예약에 수량이 추가되었습니다.');
                } else {
                     showToast('success', '예약이 완료되었습니다!');
                }

                setReservationStatus('success');
                
                // 선결제 필요 시 모달 띄우기 (기존 로직 유지)
                if (prepaymentRequired && (!data.updatedOrderIds || data.updatedOrderIds.length === 0)) {
                    setPrepaymentPrice(totalPrice);
                    setPrepaymentModalOpen(true);
                }
                
                fetchProduct(); 
                setMyPurchasedCount(prev => prev + quantity);

            } else {
                throw new Error(data.message || '예약 생성 실패');
            }

        } catch (error: any) {
            showToast('error', error.message || '예약 처리 중 오류가 발생했습니다.');
            setReservationStatus('idle'); 
            setConfirmOpen(false); // 에러 발생 시 모달 닫기
            fetchProduct();
        }
    };

    // ✅ [수정] handlePurchaseAction에서 'WAITLIST' 관련 로직 제거
// ✅ [수정] 복잡한 분기 없이 handlePreCheck 호출로 통일
    const handlePurchaseAction = useCallback((status: 'RESERVATION') => {
        if (!product || !displayRound || !selectedVariantGroup || !selectedItem) {
            showToast('error', '옵션을 선택해주세요.');
            return;
        }
        
        // 2차 예약(페널티 경고) 로직도 모달 내 문구로 대체 가능하므로
        // 여기서는 깔끔하게 검사 함수만 호출합니다.
        handlePreCheck();

    }, [product, displayRound, selectedVariantGroup, selectedItem, quantity]); // 의존성 배열 정리
    
    if (loading || !displayRound) return ( <> <Helmet><title>상품 정보 로딩 중... | 소도몰</title></Helmet><ProductDetailSkeleton /> </>);
    if (error || !product ) return ( <> <Helmet><title>오류 | 소도몰</title><meta property="og:title" content="상품을 찾을 수 없습니다" /></Helmet><div className="product-detail-modal-overlay" onClick={handleClose}><div className="product-detail-modal-content"><div className="error-message-modal"><X className="error-icon"/><p>{error || '상품 정보를 표시할 수 없습니다.'}</p><button onClick={() => navigate('/')} className="error-close-btn">홈으로</button></div></div></div></> );

    const ogTitle = `${product.groupName} - 소도몰`;
    const ogDescription = product.description?.replace(/<br\s*\/?>/gi, ' ').substring(0, 100) + '...' || '소도몰에서 특별한 상품을 만나보세요!';
    const ogImage = originalImageUrls[0] || 'https://www.sodo-songdo.store/sodomall-preview.png';
    const ogUrl = `https://www.sodo-songdo.store/product/${product.id}`;

    // 2. 최상위 div 클래스에 조건부 적용
    const modalContentClassName = `product-detail-modal-content ${themeClass}`;


    return (
        <>
            <Helmet><title>{ogTitle}</title><meta property="og:title" content={ogTitle} /><meta property="og:description" content={ogDescription} /><meta property="og:image" content={ogImage} /><meta property="og:url" content={ogUrl} /><meta property="og:type" content="product" /></Helmet>
            <div className="product-detail-modal-overlay" onClick={handleClose}>
                <div className={modalContentClassName} onClick={(e) => e.stopPropagation()}>
                    <button onClick={handleClose} className="modal-close-btn-top"><X /></button>
                    <div className="modal-scroll-area">
                        <div ref={contentAreaRef} className="main-content-area">
                            <div className="image-gallery-wrapper" data-tutorial-id="detail-image-gallery"><ProductImageSlider images={originalImageUrls} productName={product.groupName} onImageClick={handleOpenLightbox} /></div>
                            {themeClass !== '' && themeClass !== 'luxury-mode' && (
                                <div className="theme-decoration-bar">
                                    {themeClass === 'theme-christmas' && <span className="deco-icon"><Sparkles size={16}/></span>}
                                    <span className="deco-text">
                                        {themeClass === 'theme-christmas' ? '송도픽 홀리데이 에디션' : '한정수량 특별 기획전'}
                                    </span>
                                </div>
                            )}

<div className="product-info-area">
  <ProductInfo
    product={product}
    round={displayRound}
    actionState={actionState}
    expirationDateInfo={expirationDateInfo}
    salesPhase={salesPhase}
    countdown={countdown}
    themeBadge={themeBadge}
    marketingBadges={marketingBadges}
  />
</div>
                        </div>
                    </div>
                    {/* 👇 [통합] PurchasePanel (모든 상태를 포함) */}
                    {(actionState === 'PURCHASABLE' || actionState === 'REQUIRE_OPTION' || actionState === 'ON_SITE_SALE' || actionState === 'AWAITING_STOCK' || actionState === 'ENDED') && (
                        <div ref={footerRef} className="product-purchase-footer" data-tutorial-id="detail-purchase-panel">
                            
                            {/* 4. 푸터(구매패널) 부분에서 가격 표시 로직 추가 */}
                            {isLuxury && selectedItem && typeof selectedItem.originalPrice === 'number' && selectedItem.originalPrice > selectedItem.price && (
                                <div className="luxury-price-row" style={{padding: '0 1.25rem'}}>
                                    <span className="luxury-original-price">
                                        {selectedItem.originalPrice.toLocaleString()}원
                                    </span>
                                    <span className="luxury-final-price">
                                        {selectedItem.price.toLocaleString()}원
                                    </span>
                                    <span className="luxury-discount-rate" style={{fontSize:'0.9rem', color:'#b91c1c', marginLeft:'4px'}}>
                                        {/* 할인율 계산: Math.round((1 - price/original)*100)% */}
                                        {Math.round((1 - selectedItem.price / selectedItem.originalPrice) * 100)}% OFF
                                    </span>
                                </div>
                            )}

                            {/* 옵션/아이템 선택 컴포넌트는 ENDED 상태일 때 숨김 */}
                            {actionState !== 'ENDED' && (
                                <>
                                    <OptionSelector
                                        round={displayRound}
                                        selectedVariantGroup={selectedVariantGroup}
                                        onVariantGroupChange={(vg) => {
                                            setSelectedVariantGroup(vg);
                                            selectInitialItemForVg(vg);
                                            setQuantity(1);
                                            showToast('success', `'${vg.groupName}' 옵션을 선택했어요.`);
                                        }}
                                        actionState={actionState}
                                    />
                                    {selectedVariantGroup && (
                                        <ItemSelector
                                            selectedVariantGroup={selectedVariantGroup}
                                            selectedItem={selectedItem}
                                            onItemChange={(item) => {
                                                setSelectedItem(item);
                                                setQuantity(1);
                                                // ✅ [수정] 아이템 변경 토스트는 아이템이 있을 때만
                                                if (item) {
                                                    showToast('success', `'${item.name}'으로 변경했어요.`);
                                                }
                                            }}
                                            actionState={actionState}
                                        />
                                    )}
                                </>
                            )}
                            <PurchasePanel
                                actionState={actionState}
                                round={displayRound}
                                selectedVariantGroup={selectedVariantGroup}
                                selectedItem={selectedItem}
                                quantity={quantity}
                                setQuantity={setQuantity}
                                onPurchaseAction={handlePurchaseAction}
                                reservationStatus={reservationStatus} // ✅ [추가] reservationStatus 전달
                                myPurchasedCount={myPurchasedCount} // 👈 [추가] 값 전달
                            />
                        </div>
                    )}
                </div>
            </div>
            <Lightbox isOpen={isLightboxOpen} onClose={handleCloseLightbox} images={originalImageUrls} startIndex={lightboxStartIndex} />
{/* ✅ [추가] 확인 모달 삽입 */}
            {selectedItem && (
                <ConfirmModal 
                    isOpen={isConfirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    onConfirm={executeOrder} // '네' 버튼 누르면 실제 주문 실행
                    productName={product?.groupName || ''}
                    price={selectedItem.price}
                    quantity={quantity}
                    loading={reservationStatus === 'processing'}
                />
            )}

            <PrepaymentModal
                isOpen={isPrepaymentModalOpen}
                totalPrice={prepaymentPrice}
                onClose={() => setPrepaymentModalOpen(false)}
            />
        </>
    );
};

const ProductDetailPageWrapper: React.FC = () => { return ( <Suspense fallback={<ProductDetailSkeleton />}><ProductDetailPage /></Suspense> ); };
export default ProductDetailPageWrapper;