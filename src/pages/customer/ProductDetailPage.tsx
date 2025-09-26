// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef, useLayoutEffect, startTransition } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { useLaunch } from '@/context/LaunchContext';
import { detailPageTourSteps } from '@/components/customer/AppTour';

import { functions } from '@/firebase';
import { getApp } from 'firebase/app';

import { Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import type { Product, ProductItem, CartItem, LoyaltyTier, StorageType, SalesRound as OriginalSalesRound, OrderItem } from '@/types';
import { getDisplayRound, determineActionState, safeToDate, getDeadlines, getStockInfo, getMaxPurchasableQuantity } from '@/utils/productUtils';
import type { ProductActionState, VariantGroup } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';
import PrepaymentModal from '@/components/common/PrepaymentModal'; // ✅ [추가] 전용 모달 import

import { X, Minus, Plus, ShoppingCart, Lock, Star, Hourglass, Box, Calendar, PackageCheck, Tag, Sun, Snowflake, CheckCircle, Search, Flame, Info, AlertTriangle, Banknote, Inbox, Moon, Clock, Ticket } from 'lucide-react'; // ✅ Ticket 아이콘 추가
import useLongPress from '@/hooks/useLongPress';

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

// ✅ [수정] src/utils/productUtils의 SalesRound가 아닌 src/types의 SalesRound를 사용합니다.
import type { SalesRound } from '@/types';


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

// ✅ [추가] 날짜/시간 포맷 함수
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
const normalizeProduct = (product: Product): Product => {
    if (product && product.salesHistory) {
        product.salesHistory = product.salesHistory.map(round => {
            if (round.variantGroups) {
                round.variantGroups = round.variantGroups.map(vg => {
                    const totalPhysicalStock = vg.totalPhysicalStock === null ? -1 : vg.totalPhysicalStock;
                    return { ...vg, totalPhysicalStock };
                });
            }
            return round;
        });
    }
    return product;
};

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
// ✅ [수정] RAFFLE 추가
type SalesPhase = 'PRIMARY' | 'SECONDARY' | 'ON_SITE' | 'RAFFLE' | 'UNKNOWN';

// ✅ [수정] countdown prop 추가
const ProductInfo: React.FC<{ product: Product; round: SalesRound, actionState: ProductActionState | 'ON_SITE_SALE'; expirationDateInfo: ExpirationDateInfo; salesPhase: SalesPhase; countdown: string | null; }> = React.memo(({ product, round, actionState, expirationDateInfo, salesPhase, countdown }) => {
    const pickupDate = safeToDate(round.pickupDate);
    const arrivalDate = safeToDate(round.arrivalDate);
    const isMultiGroup = round.variantGroups.length > 1;
    // ✅ [수정] 이벤트 상품 여부 확인에 RAFFLE 추가
    const isEventProduct = round.eventType === 'CHUSEOK' || round.eventType === 'RAFFLE';

    return (
        <>
            <div className="product-header-content">
                <h1 className="product-name">{product.groupName}</h1>
                {/* ✅ [수정] 추첨 이벤트는 카운트다운 제외 */}
                {round.eventType !== 'RAFFLE' && countdown && (
                    <div className="countdown-timer-detail">
                        <Clock size={18} />
                        <span>예약 마감까지 <strong>{countdown}</strong></span>
                    </div>
                )}
                <div className="markdown-content">
                    <ReactMarkdown>{product.description || ''}</ReactMarkdown>
                </div>
            </div>

            {product.hashtags && product.hashtags.length > 0 && (
                <div className="product-hashtags">
                    {product.hashtags.map(tag => (
                        <span key={tag} className="hashtag">{`#${tag.replace(/#/g, '')}`}</span>
                    ))}
                </div>
            )}

            <div className="product-key-info" data-tutorial-id="detail-key-info">
                {/* ✅ [추가] 추첨 이벤트 정보 렌더링 */}
                {round.eventType === 'RAFFLE' ? (
                    <>
                        <div className="info-row">
                            <div className="info-label"><Calendar size={16} />응모 마감</div>
                            <div className="info-value">{formatDateTimeWithDay(round.deadlineDate)}</div>
                        </div>
                        <div className="info-row">
                            <div className="info-label"><Ticket size={16} />추첨 예정</div>
                            <div className="info-value">{formatDateTimeWithDay(round.raffleDrawDate)}</div>
                        </div>
                        <div className="info-row">
                            <div className="info-label"><PackageCheck size={16} />총 당첨 인원</div>
                            <div className="info-value">{round.variantGroups[0]?.totalPhysicalStock ?? 0}명</div>
                        </div>
                    </>
                ) : (
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
                                <div className="info-label"><Inbox size={16} />입고일</div>
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
                        {(() => {
                            const tierCount = round.allowedTiers?.length ?? 0;
                            if (tierCount > 0 && tierCount < 4) {
                                return ( <div className="info-row"><div className="info-label"><Lock size={16} />참여 등급</div><div className="info-value"><span className="tier-badge-group">{(round.allowedTiers as LoyaltyTier[]).join(' / ')}</span></div></div> );
                            }
                            return null;
                        })()}
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
                                                stockElement = <span className="sold-out">{actionState === 'WAITLISTABLE' ? '대기 가능' : '품절'}</span>;
                                            }

                                            const displayText = isMultiGroup ? <>{vg.groupName}: {stockElement}</> : stockElement;
                                            return (<div key={vg.id} className="stock-list-item">{displayText}</div>);
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
});

const OptionSelector: React.FC<{
    round: SalesRound;
    selectedVariantGroup: VariantGroup | null;
    onVariantGroupChange: (vg: VariantGroup) => void;
    actionState: ProductActionState | 'ON_SITE_SALE';
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

                    const isDisabled = isSoldOut && actionState !== 'WAITLISTABLE';

                    const representativePrice = vg.items?.[0]?.price;
                    const priceText = typeof representativePrice === 'number'
                        ? ` (${representativePrice.toLocaleString()}원)`
                        : '';

                    const statusText = isSoldOut
                        ? (actionState === 'WAITLISTABLE' ? ' (대기 가능)' : ' (품절)')
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
    actionState: ProductActionState | 'ON_SITE_SALE';
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
                    const isAvailable = actionState === 'WAITLISTABLE' || (item.stockDeductionAmount || 1) <= remainingStock;
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


const QuantityInput: React.FC<{ quantity: number; setQuantity: React.Dispatch<React.SetStateAction<number>>; maxQuantity: number | null; }> = React.memo(({ quantity, setQuantity, maxQuantity }) => {
    const increment = useCallback(() => setQuantity(q => (maxQuantity === null || q < maxQuantity) ? q + 1 : q), [setQuantity, maxQuantity]);
    const decrement = useCallback(() => setQuantity(q => q > 1 ? q - 1 : 1), [setQuantity]);
    const longPressIncrementHandlers = useLongPress(increment, increment, { delay: 200 });
    const longPressDecrementHandlers = useLongPress(decrement, decrement, { delay: 200 });

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseInt(value, 10);
        if (value === '') {
            setQuantity(NaN);
        } else if (!isNaN(numValue) && numValue >= 1) {
            setQuantity(numValue);
        }
    }, [setQuantity]);

    const handleInputBlur = useCallback(() => {
        if (isNaN(quantity) || quantity < 1) {
            setQuantity(1);
        } else if (maxQuantity !== null && quantity > maxQuantity) {
            setQuantity(maxQuantity);
        }
    }, [quantity, maxQuantity, setQuantity]);

    const displayedQuantity = isNaN(quantity) ? '' : quantity;

    return (
        <div className="quantity-controls-fixed" data-tutorial-id="detail-quantity-controls">
            <button {...longPressDecrementHandlers} className="quantity-btn" disabled={quantity <= 1 || isNaN(quantity)}>
                <Minus />
            </button>
            <input
                type="number"
                className="quantity-input"
                value={displayedQuantity}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onClick={(e) => e.stopPropagation()}
            />
            <button {...longPressIncrementHandlers} className="quantity-btn" disabled={maxQuantity !== null && quantity >= maxQuantity}>
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
    onPurchaseAction: (status: 'RESERVATION' | 'WAITLIST' | 'RAFFLE_ENTRY') => void; // ✅ [수정]
    onEncore: () => void;
    isEncoreRequested: boolean;
    isEncoreLoading: boolean;
    isProcessing: boolean;
    isRaffleEntered: boolean; // ✅ [추가]
}> = React.memo(({ actionState, round, selectedVariantGroup, selectedItem, quantity, setQuantity, onPurchaseAction, onEncore, isEncoreRequested, isEncoreLoading, isProcessing, isRaffleEntered }) => {
    const renderContent = () => {
        // ✅ [추가] 추첨 이벤트 로직
        if (round.eventType === 'RAFFLE') {
            const isEnded = dayjs().isAfter(dayjs(safeToDate(round.deadlineDate)));
            if (isEnded) {
                return <button className="add-to-cart-btn-fixed" disabled><Hourglass size={20} /><span>응모 마감</span></button>;
            }
            if (isRaffleEntered) {
                return <button className="add-to-cart-btn-fixed" disabled><CheckCircle size={20} /><span>응모 완료</span></button>;
            }
            return <button onClick={() => onPurchaseAction('RAFFLE_ENTRY')} className="raffle-entry-btn-fixed" data-tutorial-id="detail-action-button" disabled={isProcessing}>{isProcessing ? '처리 중...' : <><Ticket size={20} /><span>무료 응모하기</span></>}</button>;
        }

        switch (actionState) {
            case 'ON_SITE_SALE':
                return <div className="action-notice"><Box size={20} /><div><p><strong>현장 판매 진행 중</strong></p><span>매장에서 직접 구매 가능합니다.</span></div></div>;
            case 'PURCHASABLE':
                if (!selectedItem || !selectedVariantGroup) return <button className="add-to-cart-btn-fixed" disabled><span>구매 가능한 옵션이 없습니다</span></button>;
                // ✅ [수정] null 체크 추가 및 getMaxPurchasableQuantity 함수 사용
                const maxQuantity = selectedVariantGroup && selectedItem ? getMaxPurchasableQuantity(selectedVariantGroup, selectedItem) : null;
                return ( <div className="purchase-action-row"><QuantityInput quantity={quantity} setQuantity={setQuantity} maxQuantity={maxQuantity} /><button onClick={() => onPurchaseAction('RESERVATION')} className="add-to-cart-btn-fixed" data-tutorial-id="detail-action-button" disabled={isProcessing}>{isProcessing ? '처리 중...' : '예약하기'}</button></div> );
            case 'WAITLISTABLE':
                const waitlistMax = selectedItem?.limitQuantity ?? 99;
                return ( <div className="purchase-action-row"><QuantityInput quantity={quantity} setQuantity={setQuantity} maxQuantity={waitlistMax} /><button onClick={() => onPurchaseAction('WAITLIST')} className="waitlist-btn-fixed" data-tutorial-id="detail-action-button" disabled={!selectedItem || isProcessing}>{isProcessing ? '처리 중...' : <><Hourglass size={20} /><span>대기 신청하기</span></>}</button></div> );
            case 'REQUIRE_OPTION': return <button className="add-to-cart-btn-fixed" onClick={() => showToast('info', '페이지 하단에서 옵션을 먼저 선택해주세요!')}><Box size={20} /><span>옵션을 선택해주세요</span></button>;
            case 'ENDED': case 'ENCORE_REQUESTABLE':
                if (isEncoreLoading) return <button className="encore-request-btn-fixed" disabled><Hourglass size={18} className="spinner"/><span>요청 중...</span></button>;
                if (isEncoreRequested) return <button className="encore-request-btn-fixed requested" disabled><CheckCircle size={20}/><span>요청 완료</span></button>;
                return <button onClick={onEncore} className="encore-request-btn-fixed" data-tutorial-id="detail-action-button"><Star size={20} /><span>앵콜 요청하기</span></button>;
            case 'INELIGIBLE': return <div className="action-notice"><Lock size={20} /><div><p><strong>{round.allowedTiers?.join(', ')}</strong> 등급만 참여 가능해요.</p><span>등급을 올리고 다양한 혜택을 만나보세요!</span></div></div>;
            case 'SCHEDULED':
                const publishAt = safeToDate(round.publishAt);
                return <div className="action-notice"><Calendar size={20} /><div><p><strong>판매 예정</strong></p><span>{publishAt ? `${dayjs(publishAt).format('M월 D일 (ddd) HH:mm')}에 공개됩니다.` : ''}</span></div></div>;
            case 'AWAITING_STOCK': return <button className="add-to-cart-btn-fixed" disabled><Hourglass size={20} /><span>재고 준비중</span></button>;
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
    const { user, userDocument, isSuspendedUser } = useAuth();
    const { runPageTourIfFirstTime } = useTutorial();
    const { isPreLaunch, launchDate } = useLaunch();
    const location = useLocation();

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedVariantGroup, setSelectedVariantGroup] = useState<VariantGroup | null>(null);
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isEncoreRequested, setIsEncoreRequested] = useState(false);
    const [isEncoreLoading, setIsEncoreLoading] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxStartIndex, setLightboxStartIndex] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [countdown, setCountdown] = useState<string | null>(null);
    const [isRaffleEntered, setIsRaffleEntered] = useState(false); // ✅ [추가]

    // ✅ [추가] 선입금 모달 상태 관리
    const [isPrepaymentModalOpen, setPrepaymentModalOpen] = useState(false);
    const [prepaymentPrice, setPrepaymentPrice] = useState(0);

    const contentAreaRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);

    const functionsInstance = useMemo(() => getFunctions(getApp(), 'asia-northeast3'), []);
    const getProductByIdWithStock = useMemo(() => httpsCallable(functionsInstance, 'getProductByIdWithStock'), [functionsInstance]);
    const requestEncoreCallable = useMemo(() => httpsCallable(functionsInstance, 'requestEncore'), [functionsInstance]);
    const validateCartCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'validateCart'), [functionsInstance]);
    const submitOrderCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'submitOrder'), [functionsInstance]);
    const addWaitlistEntryCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'addWaitlistEntry'), [functionsInstance]);
    const enterRaffleEventCallable = useMemo(() => httpsCallable<any, any>(functionsInstance, 'enterRaffleEvent'), [functionsInstance]); // ✅ [추가]

    const handleClose = useCallback(() => {
        if (location.key === 'default' || window.history.length <= 1) {
            navigate('/', { replace: true });
        } else {
            navigate(-1);
        }
    }, [navigate, location.key]);


    const displayRound = useMemo(() => {
        if (!product) return null;
        // ✅ [수정] productUtils의 SalesRound가 아닌 types의 SalesRound로 타입 캐스팅
        return getDisplayRound(product) as SalesRound | null;
    }, [product]);

    // ✅ [수정] 이벤트 상품 카운트다운 로직에 RAFFLE 제외
    useEffect(() => {
        if (!displayRound || displayRound.eventType === 'RAFFLE') {
            setCountdown(null);
            return;
        }

        const { primaryEnd } = getDeadlines(displayRound);
        if (!primaryEnd) {
            setCountdown(null);
            return;
        }

        const interval = setInterval(() => {
            const diff = primaryEnd.diff(dayjs(), 'second');
            if (diff <= 0) {
                setCountdown('마감!');
                clearInterval(interval);
                return;
            }
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            setCountdown(`${h}:${m}:${s}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [displayRound]);


    useLayoutEffect(() => {
        const contentElement = contentAreaRef.current;
        const footerElement = footerRef.current;
        if (contentElement && footerElement && displayRound) {
            const observer = new ResizeObserver(entries => {
                const footerHeight = entries[0].contentRect.height;
                contentElement.style.paddingBottom = `${footerHeight + 16}px`;
            });
            observer.observe(footerElement);
            return () => observer.disconnect();
        }
    }, [displayRound]);

    useEffect(() => {
        if (!productId) {
            setError("잘못된 상품 ID입니다.");
            setLoading(false);
            return;
        }
        const fetchProduct = async () => {
            setLoading(true);
            try {
                const result = await getProductByIdWithStock({ productId });
                const productData = (result.data as any)?.product as Product | null;
                if (!productData) {
                    setError("상품을 찾을 수 없습니다.");
                    return;
                }
                const normalized = normalizeProduct(productData);
                setProduct(normalized);
                if (userDocument) {
                    const round = getDisplayRound(normalized);
                    if (round) {
                        // ✅ [추가] 추첨 이벤트 응모 여부 확인
                        setIsRaffleEntered(userDocument.enteredRaffleIds?.includes(round.roundId) || false);
                    }
                    const alreadyRequested = userDocument.encoreRequestedProductIds?.includes(productId) || false;
                    setIsEncoreRequested(alreadyRequested);
                    runPageTourIfFirstTime('hasSeenProductDetailPage', detailPageTourSteps);
                }
            } catch (e: any) {
                console.error("상품 상세 정보 로딩 실패:", e);
                showToast('error', e.message || "상품 정보를 불러오는 데 실패했습니다.");
            } finally {
                setLoading(false);
            }
        };
        fetchProduct();
    }, [productId, userDocument, getProductByIdWithStock, runPageTourIfFirstTime]);


    const expirationDateInfo = useMemo<ExpirationDateInfo>(() => {
        if (!displayRound || displayRound.variantGroups.length === 0) {
            return { type: 'none' };
        }
        const allDates = displayRound.variantGroups.map(vg => {
            const date = vg.items?.[0]?.expirationDate;
            return date ? safeToDate(date)?.getTime() : null;
        }).filter((d): d is number => d !== null);
        if (allDates.length === 0) return { type: 'none' };
        const uniqueDates = [...new Set(allDates)];
        if (uniqueDates.length === 1) {
            return { type: 'single', date: formatExpirationDate(new Date(uniqueDates[0]!)) };
        } else {
            const dateDetails = displayRound.variantGroups
                .map(vg => ({
                    groupName: vg.groupName,
                    date: formatExpirationDate(vg.items?.[0]?.expirationDate),
                }))
                .filter(item => item.date);
            return { type: 'multiple', details: dateDetails };
        }
    }, [displayRound]);

    const originalImageUrls = useMemo(() => {
        return product?.imageUrls?.filter(url => typeof url === 'string' && url.trim() !== '') || [];
    }, [product?.imageUrls]);

    const salesPhase = useMemo<SalesPhase>(() => {
        if (!displayRound) return 'UNKNOWN';
        // ✅ [추가] 추첨 이벤트 페이즈
        if (displayRound.eventType === 'RAFFLE') return 'RAFFLE';
        const { primaryEnd } = getDeadlines(displayRound);
        const pickupEnd = displayRound.pickupDate
            ? dayjs(safeToDate(displayRound.pickupDate)).hour(13).minute(0).second(0)
            : null;

        const now = dayjs();
        if (pickupEnd && now.isAfter(pickupEnd)) return 'ON_SITE';
        if (primaryEnd && now.isAfter(primaryEnd)) return 'SECONDARY';
        return 'PRIMARY';
    }, [displayRound]);

    const actionState = useMemo<ProductActionState | 'ON_SITE_SALE'>(() => {
        if (!displayRound) return 'LOADING';

        if (salesPhase === 'ON_SITE') return 'ON_SITE_SALE';
        // ✅ [추가] 추첨 이벤트는 별도 상태 관리
        if (displayRound.eventType === 'RAFFLE') {
            const isEnded = dayjs().isAfter(dayjs(safeToDate(displayRound.deadlineDate)));
            return isEnded ? 'ENDED' : 'PURCHASABLE'; // 'PURCHASABLE'을 임시로 사용
        }

        const baseState = determineActionState(displayRound, userDocument);

        if (salesPhase === 'SECONDARY' && baseState === 'WAITLISTABLE') {
            return 'ENDED';
        }

        if (baseState === 'REQUIRE_OPTION' && selectedItem) return 'PURCHASABLE';

        if (baseState === 'PURCHASABLE' && !selectedItem) {
            const isAnyItemAvailable = displayRound.variantGroups.some(vg => {
                const stock = getStockInfo(vg);
                return !stock.isLimited || stock.remainingUnits > 0;
            });
            if (!isAnyItemAvailable) {
                return salesPhase === 'PRIMARY' ? 'WAITLISTABLE' : 'ENDED';
            }
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
            return variantGroup.items?.find(item => (item.stockDeductionAmount || 1) <= remainingStock) || null;
        };
        const availableItem = findFirstAvailableItem(vg);
        setSelectedItem(availableItem || vg.items?.[0] || null);
    }, []);

    useEffect(() => {
        if (displayRound && displayRound.variantGroups.length > 0 && !selectedVariantGroup) {
            const initialVg = displayRound.variantGroups[0];
            if (initialVg) {
                setSelectedVariantGroup(initialVg);
                selectInitialItemForVg(initialVg);
            }
        }
    }, [displayRound, selectedVariantGroup, selectInitialItemForVg]);

    const handleOpenLightbox = useCallback((index: number) => { setLightboxStartIndex(index); setIsLightboxOpen(true); }, []);
    const handleCloseLightbox = useCallback(() => { setIsLightboxOpen(false); }, []);

    // ✅ [추가] 추첨 이벤트 응모 함수
    const handleRaffleEntry = async () => {
        if (!user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
        if (isSuspendedUser) { showToast('error', '반복적인 약속 불이행으로 참여가 제한됩니다.'); return; }
        if (isProcessing || !product || !displayRound) return;

        setIsProcessing(true);
        const toastId = toast.loading('응모 처리 중...');
        try {
            await enterRaffleEventCallable({
                productId: product.id,
                roundId: displayRound.roundId,
            });
            toast.dismiss(toastId);
            showToast('success', `${product.groupName} 이벤트 응모가 완료되었습니다!`);
            setIsRaffleEntered(true); // UI 상태 업데이트
        } catch (error: any) {
            toast.dismiss(toastId);
            showToast('error', error.message || '응모 처리 중 오류가 발생했습니다.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImmediateOrder = async () => {
        if (!userDocument || !user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
        if (isSuspendedUser) { showToast('error', '반복적인 약속 불이행으로 참여가 제한됩니다.'); return; }
        if (isProcessing || !product || !displayRound || !selectedVariantGroup || !selectedItem) return;

        setIsProcessing(true);
        const toastId = toast.loading('예약 처리 중...');

        try {
            // ✅ [수정] validateCart 호출 시 variantGroupId를 명시적으로 추가합니다.
            const validationResult = await validateCartCallable({
                items: [{
                    productId: product.id,
                    roundId: displayRound.roundId,
                    variantGroupId: selectedVariantGroup.id, // 👈 이 부분이 핵심 수정 사항입니다.
                    itemId: selectedItem.id,
                    quantity: quantity,
                    ...selectedItem
                }]
            });

            if (!validationResult.data.summary.sufficient) {
                throw new Error(validationResult.data.summary.reason || '재고가 부족하거나 예약할 수 없는 상품입니다.');
            }

            const isWarningUser = userDocument?.loyaltyTier === '주의 요망';
            const prepaymentRequired = isWarningUser || displayRound.isPrepaymentRequired;
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

            await submitOrderCallable(orderPayload);
            toast.dismiss(toastId);

            if (prepaymentRequired) {
                // ✅ [수정] toast.custom 대신 전용 모달 상태 업데이트
                setPrepaymentPrice(totalPrice);
                setPrepaymentModalOpen(true);
            } else {
                showToast('success', `${product.groupName} 예약이 완료되었습니다!`);
            }

        } catch (error: any) {
            toast.dismiss(toastId);
            showToast('error', error.message || '예약 처리 중 오류가 발생했습니다.');
        } finally {
            // ✅ [수정] 모달을 띄우는 경우에도 processing 상태는 해제
            setIsProcessing(false);
        }
    };

    const handleWaitlistRequest = async () => {
        if (!userDocument || !user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); return; }
        if (isSuspendedUser) { showToast('error', '반복적인 약속 불이행으로 참여가 제한됩니다.'); return; }
        if (isProcessing || !product || !displayRound || !selectedVariantGroup || !selectedItem) return;

        setIsProcessing(true);
        const toastId = toast.loading('대기 신청 처리 중...');

        const waitlistPayload = {
            productId: product.id, roundId: displayRound.roundId,
            variantGroupId: selectedVariantGroup.id, itemId: selectedItem.id,
            quantity: quantity,
        };

        try {
            await addWaitlistEntryCallable(waitlistPayload);
            toast.dismiss(toastId);
            showToast('success', `${product.groupName} 대기 신청이 완료되었습니다.`);
        } catch (error: any) {
            toast.dismiss(toastId);
            showToast('error', error.message || '대기 신청 중 오류가 발생했습니다.');
        } finally {
            setIsProcessing(false);
        }
    };

    // ✅ [수정] RAFFLE_ENTRY 추가
    const handlePurchaseAction = useCallback((status: 'RESERVATION' | 'WAITLIST' | 'RAFFLE_ENTRY') => {
        if (isPreLaunch) { showToast('info', `상품 예약은 ${dayjs(launchDate).format('M/D')} 정식 런칭 후 가능해요!`); return; }
        
        // ✅ [추가] 추첨 이벤트 응모 로직
        if (status === 'RAFFLE_ENTRY') {
            handleRaffleEntry();
            return;
        }

        if (!product || !displayRound || !selectedVariantGroup || !selectedItem) {
            showToast('error', '옵션을 선택해주세요.');
            return;
        }

        if (status === 'WAITLIST') {
            toast.custom((t) => showConfirmationToast({
                t,
                title: '대기 신청',
                message: (
                    <>
                        <p>{`${product.groupName} (${selectedItem.name}) ${quantity}개에 대해 대기 신청하시겠습니까?`}</p>
                        <div className="toast-warning-box"><AlertTriangle size={16} /> 재고 확보 시 알림이 발송되며, 선착순으로 예약이 진행됩니다.</div>
                    </>
                ),
                onConfirm: handleWaitlistRequest
            }), { duration: Infinity });
            return;
        }

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
            handleImmediateOrder();
        }
    }, [
        isPreLaunch, launchDate, product, displayRound, selectedVariantGroup,
        selectedItem, quantity, handleImmediateOrder, handleWaitlistRequest, handleRaffleEntry
    ]);

    const handleEncore = useCallback(async () => {
        if (isEncoreLoading || isEncoreRequested) return;
        if (!productId || !userDocument) { showToast('error', "로그인이 필요합니다."); return; }
        setIsEncoreLoading(true);
        try {
            await requestEncoreCallable({ productId });
            showToast('success', '앵콜 요청이 접수되었습니다! 감사합니다.');
            setIsEncoreRequested(true);
        } catch (error: any) {
            console.error("Encore request failed:", error);
            showToast('error', error.message || '앵콜 요청 중 오류가 발생했습니다.');
        } finally { setIsEncoreLoading(false); }
    }, [productId, userDocument, isEncoreRequested, isEncoreLoading, requestEncoreCallable]);

    if (loading || !displayRound) return ( <> <Helmet><title>상품 정보 로딩 중... | 소도몰</title></Helmet><ProductDetailSkeleton /> </>);
    if (error || !product ) return ( <> <Helmet><title>오류 | 소도몰</title><meta property="og:title" content="상품을 찾을 수 없습니다" /></Helmet><div className="product-detail-modal-overlay" onClick={handleClose}><div className="product-detail-modal-content"><div className="error-message-modal"><X className="error-icon"/><p>{error || '상품 정보를 표시할 수 없습니다.'}</p><button onClick={() => navigate('/')} className="error-close-btn">홈으로</button></div></div></div></> );

    const ogTitle = `${product.groupName} - 소도몰`;
    const ogDescription = product.description?.replace(/<br\s*\/?>/gi, ' ').substring(0, 100) + '...' || '소도몰에서 특별한 상품을 만나보세요!';
    const ogImage = originalImageUrls[0] || 'https://www.sodo-songdo.store/sodomall-preview.png';
    const ogUrl = `https://www.sodo-songdo.store/product/${product.id}`;

    // ✅ [수정] RAFFLE 이벤트도 처리하도록 수정
    const isEventProduct = displayRound.eventType === 'CHUSEOK' || displayRound.eventType === 'RAFFLE';
    const modalContentClassName = `product-detail-modal-content ${isEventProduct && displayRound.eventType ? `event-detail-${displayRound.eventType.toLowerCase()}` : ''}`;


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
                                {displayRound.eventType === 'CHUSEOK' && (
                                    <div className="event-banner-chuseok">
                                        <Moon size={18} />
                                        <span>풍성한 한가위 특집</span>
                                        <Moon size={18} />
                                    </div>
                                )}
                                {displayRound.eventType === 'RAFFLE' && (
                                    <div className="event-banner-raffle">
                                        <Ticket size={18} />
                                        <span>주말 특별 추첨 이벤트</span>
                                        <Ticket size={18} />
                                    </div>
                                )}
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
                    <div ref={footerRef} className="product-purchase-footer" data-tutorial-id="detail-purchase-panel">
                        {/* ✅ [수정] 추첨 이벤트는 옵션 선택기 제외 */}
                        {displayRound.eventType !== 'RAFFLE' && (
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
                                            showToast('success', `'${item.name}'으로 변경했어요.`);
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
                            onEncore={handleEncore}
                            isEncoreRequested={isEncoreRequested}
                            isEncoreLoading={isEncoreLoading}
                            isProcessing={isProcessing}
                            isRaffleEntered={isRaffleEntered}
                        />
                    </div>
                </div>
            </div>
            <Lightbox isOpen={isLightboxOpen} onClose={handleCloseLightbox} images={originalImageUrls} startIndex={lightboxStartIndex} />

            {/* ✅ [추가] 전용 모달 렌더링 */}
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