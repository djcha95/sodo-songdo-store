// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import { useAuth } from '@/context/AuthContext';

import { getApp } from 'firebase/app';

// 💡 [수정] getDoc, doc, getFirestore를 import합니다.
import { Timestamp, getFirestore, doc, getDoc } from 'firebase/firestore'; 
import { getFunctions, httpsCallable } from 'firebase/functions';

// 💡 [수정] OriginalVariantGroup 타입을 추가로 import합니다.
import type { Product, ProductItem, StorageType, SalesRound as OriginalSalesRound, OrderItem, VariantGroup as OriginalVariantGroup } from '@/shared/types';
import { getDisplayRound, determineActionState, safeToDate, getDeadlines, getStockInfo, getMaxPurchasableQuantity } from '@/utils/productUtils';
import type { ProductActionState, VariantGroup } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import PrepaymentModal from '@/components/common/PrepaymentModal';

import { X, Minus, Plus, ShoppingCart, Hourglass, Box, Calendar, PackageCheck, Tag, Sun, Snowflake, CheckCircle, Search, Flame, AlertTriangle, Clock } from 'lucide-react';

// 💡 [추가] 예약 수량을 가져오기 위한 import
import { getReservedQuantitiesMap } from '@/firebase/orderService';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Zoom, Thumbs, FreeMode } from 'swiper/modules';
import type { Swiper as SwiperCore } from 'swiper';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/zoom';
import 'swiper/css/thumbs';
import 'swiper/css/free-mode';

import ReactMarkdown from 'react-markdown';
import './ProductDetailPage.css';
import toast from 'react-hot-toast';
import { showToast, showConfirmationToast } from '@/utils/toastUtils';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);

import type { SalesRound } from '@/shared/types';


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

const formatDateTimeWithDay = (dateInput: Date | Timestamp | null | undefined): string => {
    if (!dateInput) return '미정';
    const date = dayjs(safeToDate(dateInput));
    if (!date.isValid()) return '날짜 오류';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.format('M.D(ddd) HH:mm')}`;
};


const formatExpirationDate = (dateInput: Date | Timestamp | null | undefined): string => {
    if (!dateInput) return '';
    const date = dayjs(safeToDate(dateInput));
    if (!date.isValid()) return '날짜 오류';
    if (date.year() > 2098) return '상시';
    return `${date.format('YY.MM.DD')}`;
};

const storageLabels: Record<StorageType, string> = { ROOM: '상온', COLD: '냉장', FROZEN: '냉동', FRESH: '신선' };
const storageIcons: Record<StorageType, React.ReactNode> = { ROOM: <Sun size={16} />, COLD: <Snowflake size={16} />, FROZEN: <Snowflake size={16} />, FRESH: <Tag size={16} /> };

// 💡 [추가] productService.ts에서 가져온 헬퍼 함수
// (productService.ts를 수정하지 않고 이 파일만 수정하기 위해 여기에 복제합니다)
function overlayKey(productId: string, roundId: string, vgId: string) {
  return `${productId}-${roundId}-${vgId}`;
}

function applyReservedOverlay(product: Product, reservedMap: Map<string, number>): Product {
  // 💡 [수정] productUtils와 동일하게 Array.isArray 방어 코드 적용
  if (!Array.isArray(product?.salesHistory)) return product; 
  
  product.salesHistory = product.salesHistory.map((round) => {
    // 💡 [수정] round.variantGroups가 없을 경우 빈 배열로 처리
    const vgs = (round.variantGroups || []).map((vg) => {
      // 💡 [수정] 타입 호환성을 위해 vg를 OriginalVariantGroup으로 캐스팅
      const originalVg = vg as OriginalVariantGroup; 
      const key = overlayKey(product.id, round.roundId, originalVg.id);
      const reserved = reservedMap.get(key) || 0;
      return { ...vg, reservedCount: reserved };
    });
    return { ...round, variantGroups: vgs };
  });
  return product;
}

// --- Sub Components ---

const Lightbox: React.FC<{
    images: string[];
    startIndex: number;
    isOpen: boolean;
    onClose: () => void;
}> = React.memo(({ images, startIndex, isOpen, onClose }) => {
    const [mainSwiper, setMainSwiper] = useState<SwiperCore | null>(null);
    const [thumbsSwiper, setThumbsSwiper] = useState<SwiperCore | null>(null);
    const [activeIndex, setActiveIndex] = useState(startIndex);

    useEffect(() => {
        if (isOpen) {
            setActiveIndex(startIndex);
            if (mainSwiper && !mainSwiper.destroyed) {
                mainSwiper.slideToLoop(startIndex, 0);
            }
            if (thumbsSwiper && !thumbsSwiper.destroyed) {
                thumbsSwiper.slideToLoop(startIndex, 0);
            }
        }
    }, [isOpen, startIndex, mainSwiper, thumbsSwiper]);

    useEffect(() => {
        if (mainSwiper && !mainSwiper.destroyed) {
            const handleSlideChange = () => {
                setActiveIndex(mainSwiper.realIndex);
                if (thumbsSwiper && !thumbsSwiper.destroyed) {
                    thumbsSwiper.slideToLoop(mainSwiper.realIndex);
                }
            };
            mainSwiper.on('slideChange', handleSlideChange);
            return () => {
                mainSwiper.off('slideChange', handleSlideChange);
            };
        }
    }, [mainSwiper, thumbsSwiper]);

    useEffect(() => {
        if (thumbsSwiper && !thumbsSwiper.destroyed && mainSwiper && !mainSwiper.destroyed) {
            const handleThumbsSlideChange = () => {
                if (mainSwiper.realIndex !== thumbsSwiper.realIndex) {
                    mainSwiper.slideToLoop(thumbsSwiper.realIndex);
                }
            };
            thumbsSwiper.on('slideChange', handleThumbsSlideChange);
            return () => {
                thumbsSwiper.off('slideChange', handleThumbsSlideChange);
            };
        }
    }, [mainSwiper, thumbsSwiper]);


    if (!isOpen) return null;

    return (
        <div className="lightbox-overlay" onClick={onClose}>
            <button className="lightbox-close-btn" onClick={onClose} aria-label="닫기">
                <X size={32} />
            </button>
            <div className="lightbox-content-wrapper" onClick={(e) => e.stopPropagation()}>
                <Swiper
                    onSwiper={setMainSwiper}
                    modules={[Pagination, Navigation, Zoom, Thumbs]}
                    initialSlide={startIndex}
                    spaceBetween={20}
                    slidesPerView={1}
                    navigation
                    pagination={{ clickable: true }}
                    zoom
                    loop={true}
                    className="lightbox-swiper"
                >
                    {images.map((url, index) => (
                        <SwiperSlide key={index}>
                            <div className="swiper-zoom-container">
                                <OptimizedImage originalUrl={url} size="1080x1080" alt={`이미지 ${index + 1}`} />
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>

                <Swiper
                    onSwiper={setThumbsSwiper}
                    modules={[Thumbs, FreeMode]}
                    slidesPerView="auto"
                    spaceBetween={5}
                    centeredSlides={true}
                    watchSlidesProgress={true}
                    loop={true}
                    initialSlide={startIndex}
                    className="lightbox-thumbs-swiper"
                    freeMode={true}
                >
                    {images.map((url, index) => (
                        <SwiperSlide
                            key={index}
                            className={`lightbox-thumb-slide ${activeIndex === index ? 'is-active' : ''}`}
                            onClick={() => {
                                if (mainSwiper && !mainSwiper.destroyed) {
                                    mainSwiper.slideToLoop(index);
                                }
                            }}
                        >
                            <OptimizedImage originalUrl={url} size="200x200" alt={`썸네일 ${index + 1}`} />
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

const ProductInfo: React.FC<{ product: Product; round: SalesRound, actionState: ProductActionState | 'ON_SITE_SALE'; expirationDateInfo: ExpirationDateInfo; salesPhase: SalesPhase; countdown: string | null; }> = React.memo(({ product, round, actionState, expirationDateInfo, salesPhase, countdown }) => {
    const pickupDate = safeToDate(round.pickupDate);
    const arrivalDate: Date | null = safeToDate(round.arrivalDate);
    const isMultiGroup = round.variantGroups.length > 1;

    return (
        <>
            <div className="product-header-content">
                <h1 className="product-name">{product.groupName}</h1>
                {countdown && (
                    <div className="countdown-timer-detail">
                        <Clock size={18} />
                        <span>예약 마감까지 <strong>{countdown}</strong></span>
                    </div>
                )}
                <div className="markdown-content">
                    <ReactMarkdown>{product.description || ''}</ReactMarkdown>
                </div>
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
}> = React.memo(({ actionState, round, selectedVariantGroup, selectedItem, quantity, setQuantity, onPurchaseAction, reservationStatus }) => { // ✅ [수정] isProcessing 제거
    
    // ❌ [제거] isMobile state 제거 (사용되지 않음)
    // const [isMobile, setIsMobile] = useState(false);
    // useEffect(() => {
    //     const mobileCheck = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    //     setIsMobile(mobileCheck);
    // }, []);

    const quantityStep = 1; // 모바일/데스크탑 구분 없이 항상 1씩 증가/감소

    const renderContent = () => {
        switch (actionState) {
            case 'ON_SITE_SALE':
                return <div className="action-notice"><Box size={20} /><div><p><strong>현장 판매 진행 중</strong></p><span>매장에서 직접 구매 가능합니다.</span></div></div>;
            case 'PURCHASABLE':
                if (!selectedItem || !selectedVariantGroup) return <button className="add-to-cart-btn-fixed" disabled><span>구매 가능한 옵션이 없습니다</span></button>;
                const maxQuantity = selectedVariantGroup && selectedItem ? getMaxPurchasableQuantity(selectedVariantGroup, selectedItem) : null;
                
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
                            maxQuantity={maxQuantity} 
                            step={quantityStep} 
                            reservationStatus={reservationStatus} // ✅ [추가] reservationStatus 전달
                        />
                        <button 
                            onClick={() => onPurchaseAction('RESERVATION')} 
                            className={`add-to-cart-btn-fixed ${reservationStatus !== 'idle' ? 'processing' : ''}`}
                            data-tutorial-id="detail-action-button" 
                            disabled={reservationStatus !== 'idle' || maxQuantity === 0} // ✅ [수정] reservationStatus 및 maxQuantity 0일때 비활성화
                        >
                            {maxQuantity === 0 ? '재고 없음' : getButtonContent()}
                        </button>
                    </div>
                );
            // ❌ [제거] 'WAITLISTABLE' case 제거
            // case 'WAITLISTABLE': ...
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
    // ❌ [제거] isProcessing 제거
    const [countdown, setCountdown] = useState<string | null>(null);

    const [isPrepaymentModalOpen, setPrepaymentModalOpen] = useState(false);
    const [prepaymentPrice, setPrepaymentPrice] = useState(0);

    // ✅ [추가] 예약 상태를 관리하기 위한 새 state
    const [reservationStatus, setReservationStatus] = useState<'idle' | 'processing' | 'success'>('idle');

    const contentAreaRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);

    // 💡 [추가] Firestore 인스턴스를 가져옵니다.
    const db = useMemo(() => getFirestore(getApp()), []);

    const functionsInstance = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    // ❌ [제거] 5초 '콜드 스타트'의 원인인 Cloud Function을 제거합니다.
    // const getProductByIdWithStock = useMemo(() => httpsCallable(functionsInstance, 'getProductByIdWithStock'), [functionsInstance]);
    const submitOrderCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'submitOrder'), [functionsInstance]);
    // ❌ [제거] addWaitlistEntryCallable 제거
    // const addWaitlistEntryCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'addWaitlistEntry'), [functionsInstance]);

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
        
        setLoading(true);
        try {
            // 💡 [수정] 5초 콜드 스타트 해결을 위해 Cloud Function 대신 DB에서 직접 조회합니다.
            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) {
                setError("상품을 찾을 수 없습니다.");
                return;
            }
            const productData = { ...productSnap.data(), id: productSnap.id } as Product;

            // 💡 [추가] 예약 수량 맵을 가져와서 재고 오버레이를 적용합니다.
            // (SimpleOrderPage와 동일한 로직)
            const reservedMap = await getReservedQuantitiesMap();
            const productWithOverlay = applyReservedOverlay(productData, reservedMap);

            setProduct(productWithOverlay);
        } catch (e: any) {
            console.error("상품 상세 정보 로딩 실패:", e);
            showToast('error', e.message || "상품 정보를 불러오는 데 실패했습니다. (DB 직접 조회 오류)");
        } finally {
            setLoading(false);
        }
    }, [productId, db]); // ✅ [수정] 의존성 배열

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

        // ✅ [수정] productUtils에서 WAITLISTABLE이 제거되었으므로, 관련 로직 수정
        
        // 옵션이 필요한데 아이템이 선택된 경우 (PURCHASABLE로 보정)
        if (baseState === 'REQUIRE_OPTION' && selectedItem) return 'PURCHASABLE';

        // 구매 가능한데 아이템이 선택되지 않은 경우 (REQUIRE_OPTION으로 보정)
        if (baseState === 'PURCHASABLE' && !selectedItem) {
            // (productUtils에서 이 로직을 이미 처리함, 'REQUIRE_OPTION'으로 반환됨)
            // 하지만 방어적으로 코드를 유지하거나, productUtils를 신뢰하고 baseState를 그대로 반환
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

    // ✅ [수정] handleImmediateOrder 함수 로직 전체 변경
    const handleImmediateOrder = async () => {
        if (!userDocument || !user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
        if (reservationStatus !== 'idle' || !product || !displayRound || !selectedVariantGroup || !selectedItem) return;

        setReservationStatus('processing'); // '처리 중...'으로 변경

        try {
            const prepaymentRequired = displayRound.isPrepaymentRequired;
            const totalPrice = selectedItem.price * quantity;

            const orderItem: OrderItem = {
                id: `order-item-${selectedItem.id}-${Date.now()}`,
                productId: product.id, productName: product.groupName, imageUrl: product.imageUrls?.[0] || '',
                roundId: displayRound.roundId, roundName: displayRound.roundName,
                variantGroupId: selectedVariantGroup.id, variantGroupName: selectedVariantGroup.groupName,
                itemId: selectedItem.id, itemName: selectedItem.name,
                quantity: quantity, unitPrice: selectedItem.price, stock: selectedItem.stock,
                stockDeductionAmount: selectedItem.stockDeductionAmount,
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
            
            // ✅ [수정] 백엔드 응답을 확인하여 분기 처리
            const data = result.data as { orderIds?: string[], updatedOrderIds?: string[], message?: string };

            if (data.updatedOrderIds && data.updatedOrderIds.length > 0) {
                // --- (A) 수량 추가 성공 ---
                showToast('success', '기존 예약에 수량이 추가되었습니다.');
                setReservationStatus('success'); // '예약 완료' 버튼을 잠시 보여줌 (피드백)
                // (useEffect가 2초 후 idle로 돌리고 수량 1로 리셋할 것임)
                // ✅ [추가] 재고가 변경되었으므로 상품 정보 새로고침
                fetchProduct();

            } else if (data.orderIds && data.orderIds.length > 0) {
                // --- (B) 신규 예약 성공 ---
                showToast('success', '예약이 완료되었습니다!'); // ✅ [수정] 성공 토스트 추가
                setReservationStatus('success'); // '예약 완료' 버튼
                if (prepaymentRequired) {
                    setPrepaymentPrice(totalPrice);
                    setPrepaymentModalOpen(true);
                }
                // (useEffect가 2초 후 idle로 돌리고 수량 1로 리셋할 것임)
                // ✅ [추가] 재고가 변경되었으므로 상품 정보 새로고침
                fetchProduct();

            } else {
                // --- (C) 실패 (재고 부족 등) ---
                throw new Error(data.message || '예약 생성에 실패했습니다. (재고 부족 또는 유효성 검사 실패)');
            }

        } catch (error: any) {
            showToast('error', error.message || '예약 처리 중 오류가 발생했습니다.');
            setReservationStatus('idle'); // 에러 발생 시 idle로 복귀
            setQuantity(1);
            // ✅ [추가] 실패 시에도 최신 재고 반영을 위해 새로고침
            fetchProduct();
        }
    };

    // ❌ [제거] handleWaitlistRequest 함수 제거
    // const handleWaitlistRequest = async () => { ... };

    // ✅ [수정] handlePurchaseAction에서 'WAITLIST' 관련 로직 제거
    const handlePurchaseAction = useCallback((status: 'RESERVATION') => {
        if (!product || !displayRound || !selectedVariantGroup || !selectedItem) {
            showToast('error', '옵션을 선택해주세요.');
            return;
        }

        // ❌ [제거] status === 'WAITLIST' 분기 제거
        // if (status === 'WAITLIST') { ... }

        // status가 'RESERVATION'일 때의 로직만 남김
        const { primaryEnd } = getDeadlines(displayRound);
        const isSecondarySale = primaryEnd ? dayjs().isAfter(primaryEnd) : false;

        if (isSecondarySale) {
            toast.custom((t) => showConfirmationToast({
                t,
                title: '2차 예약 확정',
                message: (
                    <>
                        <p>{`${product.groupName} (${selectedItem.name}) ${quantity}개를 예약하시겠습니까?`}</p>
                        <div className="toast-warning-box">
                            <AlertTriangle size={16} />
                            2차 예약 기간에는 확정 후 취소 시 페널티가 부과될 수 있습니다.
                        </div>
                    </>
                ),
                onConfirm: handleImmediateOrder
            }), { duration: Infinity });
        } else {
            // 1차 예약은 컨펌 없이 즉시 진행
            handleImmediateOrder();
        }
    }, [
        product, displayRound, selectedVariantGroup,
        selectedItem, quantity, handleImmediateOrder, 
        // ❌ [제거] handleWaitlistRequest 의존성 제거
    ]);

    
    if (loading || !displayRound) return ( <> <Helmet><title>상품 정보 로딩 중... | 소도몰</title></Helmet><ProductDetailSkeleton /> </>);
    if (error || !product ) return ( <> <Helmet><title>오류 | 소도몰</title><meta property="og:title" content="상품을 찾을 수 없습니다" /></Helmet><div className="product-detail-modal-overlay" onClick={handleClose}><div className="product-detail-modal-content"><div className="error-message-modal"><X className="error-icon"/><p>{error || '상품 정보를 표시할 수 없습니다.'}</p><button onClick={() => navigate('/')} className="error-close-btn">홈으로</button></div></div></div></> );

    const ogTitle = `${product.groupName} - 소도몰`;
    const ogDescription = product.description?.replace(/<br\s*\/?>/gi, ' ').substring(0, 100) + '...' || '소도몰에서 특별한 상품을 만나보세요!';
    const ogImage = originalImageUrls[0] || 'https://www.sodo-songdo.store/sodomall-preview.png';
    const ogUrl = `https://www.sodo-songdo.store/product/${product.id}`;

    const modalContentClassName = `product-detail-modal-content`;


    return (
        <>
            <Helmet><title>{ogTitle}</title><meta property="og:title" content={ogTitle} /><meta property="og:description" content={ogDescription} /><meta property="og:image" content={ogImage} /><meta property="og:url" content={ogUrl} /><meta property="og:type" content="product" /></Helmet>
            <div className="product-detail-modal-overlay" onClick={handleClose}>
                <div className={modalContentClassName} onClick={(e) => e.stopPropagation()}>
                    <button onClick={handleClose} className="modal-close-btn-top"><X /></button>
                    <div className="modal-scroll-area">
                        <div ref={contentAreaRef} className="main-content-area">
                            <div className="image-gallery-wrapper" data-tutorial-id="detail-image-gallery"><ProductImageSlider images={originalImageUrls} productName={product.groupName} onImageClick={handleOpenLightbox} /></div>
                            <div className="product-info-area">
                                <ProductInfo
                                    product={product}
                                    round={displayRound}
                                    actionState={actionState}
                                    expirationDateInfo={expirationDateInfo}
                                    salesPhase={salesPhase}
                                    countdown={countdown}
                                />
                            </div>
                        </div>
                    </div>
                    {/* ✅ [수정] actionState가 'ENDED'나 'LOADING' 등이 아닐 때만 하단 패널 렌더링 */}
                    {(actionState === 'PURCHASABLE' || actionState === 'REQUIRE_OPTION' || actionState === 'ON_SITE_SALE' || actionState === 'AWAITING_STOCK') && (
                        <div ref={footerRef} className="product-purchase-footer" data-tutorial-id="detail-purchase-panel">
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
                            <PurchasePanel
                                actionState={actionState}
                                round={displayRound}
                                selectedVariantGroup={selectedVariantGroup}
                                selectedItem={selectedItem}
                                quantity={quantity}
                                setQuantity={setQuantity}
                                onPurchaseAction={handlePurchaseAction}
                                reservationStatus={reservationStatus} // ✅ [추가] reservationStatus 전달
                            />
                        </div>
                    )}
                    {/* ✅ [추가] 'ENDED' 상태일 때 '전량 마감' 푸터 표시 */}
                    {actionState === 'ENDED' && (
                        <div ref={footerRef} className="product-purchase-footer" data-tutorial-id="detail-purchase-panel">
                            <PurchasePanel
                                actionState={actionState}
                                round={displayRound}
                                selectedVariantGroup={selectedVariantGroup}
                                selectedItem={selectedItem}
                                quantity={quantity}
                                setQuantity={setQuantity}
                                onPurchaseAction={handlePurchaseAction}
                                reservationStatus={reservationStatus}
                            />
                        </div>
                    )}
                </div>
            </div>
            <Lightbox isOpen={isLightboxOpen} onClose={handleCloseLightbox} images={originalImageUrls} startIndex={lightboxStartIndex} />

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