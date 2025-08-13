// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
// ✅ useLocation을 추가로 import합니다.
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useTutorial } from '@/context/TutorialContext';
import { useLaunch } from '@/context/LaunchContext';
import { detailPageTourSteps } from '@/components/customer/AppTour';

import { getProductById, functions, db } from '@/firebase';
import { getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import type { Product, ProductItem, CartItem, LoyaltyTier, StorageType, Order, OrderItem } from '@/types';
import { getDisplayRound, determineActionState, safeToDate } from '@/utils/productUtils';
import type { ProductActionState, SalesRound, VariantGroup } from '@/utils/productUtils';
import OptimizedImage from '@/components/common/OptimizedImage';

import { X, Minus, Plus, ShoppingCart, Lock, Star, Hourglass, Box, Calendar, PackageCheck, Tag, Sun, Snowflake, CheckCircle, Search, Flame } from 'lucide-react';
import useLongPress from '@/hooks/useLongPress';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Zoom } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/zoom';

import ReactMarkdown from 'react-markdown';
import './ProductDetailPage.css';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// --- Helper Functions & Types ---
const toTimestamp = (date: any): Timestamp | null => {
    const d = safeToDate(date);
    return d ? Timestamp.fromDate(d) : null;
};
const formatDateWithDay = (date: Date | Timestamp | null | undefined): string => {
  const d = safeToDate(date);
  if (!d) return '날짜 미정';
  return dayjs(d).format('MM.DD(ddd)');
};

const formatExpirationDate = (date: Date | Timestamp | null | undefined): string => {
    const d = safeToDate(date);
    if (!d) return ''; 
    return dayjs(d).format('YYYY.MM.DD');
};

const storageLabels: Record<StorageType, string> = { ROOM: '상온', COLD: '냉장', FROZEN: '냉동' };
const storageIcons: Record<StorageType, React.ReactNode> = { ROOM: <Sun size={16} />, COLD: <Snowflake size={16} />, FROZEN: <Snowflake size={16} /> };
const normalizeProduct = (product: Product): Product => {
    if ((!product.salesHistory || product.salesHistory.length === 0) && (product as any).price) {
        const legacyProduct = product as any;
        const legacyRound: SalesRound = {
            roundId: 'legacy-round-01', roundName: '이전 판매', status: legacyProduct.status || 'ended',
            variantGroups: [{
                id: 'legacy-vg-01', groupName: product.groupName, totalPhysicalStock: legacyProduct.stock, stockUnitType: '개',
                items: [{
                    id: 'legacy-item-01', name: product.groupName, price: legacyProduct.price, stock: legacyProduct.stock,
                    limitQuantity: legacyProduct.limitQuantity || null, expirationDate: toTimestamp(legacyProduct.expirationDate), stockDeductionAmount: 1,
                }],
            }],
            createdAt: toTimestamp(legacyProduct.createdAt)!, publishAt: toTimestamp(legacyProduct.createdAt)!,
            deadlineDate: toTimestamp(legacyProduct.deadlineDate)!, pickupDate: toTimestamp(legacyProduct.pickupDate)!,
            pickupDeadlineDate: toTimestamp(legacyProduct.pickupDeadlineDate), allowedTiers: [],
        };
        return { ...product, salesHistory: [legacyRound] };
    }
    return product;
};

// --- Sub Components ---

const Lightbox: React.FC<{ images: string[]; startIndex: number; isOpen: boolean; onClose: () => void; }> = React.memo(({ images, startIndex, isOpen, onClose }) => { if (!isOpen) return null; return (<div className="lightbox-overlay" onClick={onClose}><button className="lightbox-close-btn" onClick={onClose} aria-label="닫기"><X size={32} /></button><div className="lightbox-content" onClick={(e) => e.stopPropagation()}><Swiper modules={[Pagination, Navigation, Zoom]} initialSlide={startIndex} spaceBetween={20} slidesPerView={1} navigation pagination={{ clickable: true }} zoom={true} className="lightbox-swiper">{images.map((url, index) => (<SwiperSlide key={index}><div className="swiper-zoom-container"><OptimizedImage originalUrl={url} size="1080x1080" alt={`이미지 ${index + 1}`} /></div></SwiperSlide>))}</Swiper></div></div>); });
const ProductImageSlider: React.FC<{ images: string[]; productName: string; onImageClick: (index: number) => void; }> = React.memo(({ images, productName, onImageClick }) => (<div className="product-swiper-container"><Swiper modules={[Pagination, Navigation]} spaceBetween={0} slidesPerView={1} navigation pagination={{ clickable: true, dynamicBullets: true }} className="product-swiper">{images.map((url, index) => (<SwiperSlide key={index} onClick={() => onImageClick(index)}><OptimizedImage originalUrl={url} size="1080x1080" alt={`${productName} 이미지 ${index + 1}`} /></SwiperSlide>))}</Swiper><div className="image-zoom-indicator"><Search size={16} /><span>클릭해서 크게 보기</span></div></div>));

type ExpirationDateInfo = { type: 'none' } | { type: 'single'; date: string; } | { type: 'multiple'; details: { groupName: string; date: string; }[] };
const ProductInfo: React.FC<{ product: Product; round: SalesRound, actionState: ProductActionState; expirationDateInfo: ExpirationDateInfo; }> = React.memo(({ product, round, actionState, expirationDateInfo }) => {
    const pickupDate = safeToDate(round.pickupDate);
    const isMultiGroup = round.variantGroups.length > 1;
    return (
        <>
            <h1 className="product-name">{product.groupName}</h1>
            
            {product.hashtags && product.hashtags.length > 0 && (
                <div className="product-hashtags">
                    {product.hashtags.map(tag => (
                        <span key={tag} className="hashtag">{tag}</span>
                    ))}
                </div>
            )}

            <div className="markdown-content">
              <ReactMarkdown>{product.description || ''}</ReactMarkdown>
            </div>
            <div className="product-key-info" data-tutorial-id="detail-key-info">
                {expirationDateInfo.type === 'single' && (
                    <div className="info-row">
                        <div className="info-label"><Hourglass size={16} />유통기한</div>
                        <div className="info-value">{expirationDateInfo.date}</div>
                    </div>
                )}
                {expirationDateInfo.type === 'multiple' && (
                    <div className="info-row expiration-info-row">
                        <div className="info-label"><Hourglass size={16} />옵션별 유통기한</div>
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
                    <div className="info-label"><PackageCheck size={16} />잔여 수량</div>
                    <div className="info-value">
                        <div className="stock-list">
                            {round.variantGroups.map(vg => {
                                const totalStock = vg.totalPhysicalStock;
                                let stockElement: React.ReactNode;

                                if (totalStock === null || totalStock === -1) {
                                    stockElement = <span className="unlimited-stock">수량 제한 없음</span>;
                                } else {
                                    const reserved = (vg as VariantGroup).reservedCount || 0;
                                    const remainingStock = Math.max(0, totalStock - reserved);
                                    
                                    if (remainingStock > 0) {
                                        if (remainingStock <= 10) { stockElement = <span className="low-stock"><Flame size={14} /> {remainingStock}개 남음! <Flame size={14} /></span>;
                                        } else { stockElement = <span className="limited-stock">{remainingStock}개 남음</span>; }
                                    } else {
                                        stockElement = <span className="sold-out">{actionState === 'WAITLISTABLE' ? '대기 가능' : '품절'}</span>;
                                    }
                                }
                                
                                const displayText = isMultiGroup ? <>{vg.groupName}: {stockElement}</> : stockElement;
                                return (<div key={vg.id} className="stock-list-item">{displayText}</div>);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
});

const OptionSelector: React.FC<{ round: SalesRound; selectedVariantGroup: VariantGroup | null; onVariantGroupChange: (vg: VariantGroup) => void; }> = React.memo(({ round, selectedVariantGroup, onVariantGroupChange }) => { if (!round.variantGroups || round.variantGroups.length <= 1) return null; return (<div className="select-wrapper" data-tutorial-id="detail-options"><select className="price-select" value={selectedVariantGroup?.id || ''} onChange={(e) => { const selectedId = e.target.value; const newVg = round.variantGroups.find(vg => vg.id === selectedId); if (newVg) onVariantGroupChange(newVg); }}><option value="" disabled>옵션을 선택해주세요.</option>{round.variantGroups.map(vg => (<option key={vg.id} value={vg.id}>{vg.groupName} - {vg.items[0]?.price.toLocaleString()}원</option>))}</select></div>); });
const QuantityInput: React.FC<{ quantity: number; setQuantity: (fn: (q: number) => number) => void; maxQuantity: number | null; }> = React.memo(({ quantity, setQuantity, maxQuantity }) => { const increment = useCallback(() => setQuantity(q => (maxQuantity === null || q < maxQuantity) ? q + 1 : q), [setQuantity, maxQuantity]); const decrement = useCallback(() => setQuantity(q => q > 1 ? q - 1 : 1), [setQuantity]); const longPressIncrementHandlers = useLongPress(increment, increment, { delay: 200 }); const longPressDecrementHandlers = useLongPress(decrement, decrement, { delay: 200 }); return (<div className="quantity-controls-fixed" data-tutorial-id="detail-quantity-controls"><button {...longPressDecrementHandlers} className="quantity-btn" disabled={quantity <= 1}><Minus /></button><span className="quantity-display-fixed">{quantity}</span><button {...longPressIncrementHandlers} className="quantity-btn" disabled={maxQuantity !== null && quantity >= maxQuantity}><Plus /></button></div>); });

const PurchasePanel: React.FC<{ actionState: ProductActionState; round: SalesRound; selectedVariantGroup: VariantGroup | null; selectedItem: ProductItem | null; quantity: number; setQuantity: (fn: (q: number) => number) => void; onCartAction: (status: 'RESERVATION' | 'WAITLIST') => void; onEncore: () => void; isEncoreRequested: boolean; isEncoreLoading: boolean; }> = React.memo(({ actionState, round, selectedVariantGroup, selectedItem, quantity, setQuantity, onCartAction, onEncore, isEncoreRequested, isEncoreLoading }) => {
    const renderContent = () => {
        switch (actionState) {
            case 'PURCHASABLE':
                if (!selectedItem || !selectedVariantGroup) return <button className="add-to-cart-btn-fixed" disabled><span>옵션 정보를 불러올 수 없습니다</span></button>;
                const stock = selectedVariantGroup.totalPhysicalStock, reserved = selectedVariantGroup.reservedCount || 0, limit = selectedItem.limitQuantity;
                const stockValue = (typeof stock === 'number' && stock !== -1) ? stock : null, limitValue = (typeof limit === 'number') ? limit : null;
                const effectiveStock = stockValue === null ? Infinity : stockValue - reserved, effectiveLimit = limitValue === null ? Infinity : limitValue;
                const max = Math.floor(Math.min(effectiveStock / (selectedItem.stockDeductionAmount || 1), effectiveLimit)), maxQuantity = isFinite(max) ? max : null;
                return ( <div className="purchase-action-row"><QuantityInput quantity={quantity} setQuantity={setQuantity} maxQuantity={maxQuantity} /><button onClick={() => onCartAction('RESERVATION')} className="add-to-cart-btn-fixed" data-tutorial-id="detail-action-button"><ShoppingCart size={20} /><span>{selectedItem ? `${(selectedItem.price * quantity).toLocaleString()}원 담기` : ''}</span></button></div> );
            case 'WAITLISTABLE':
                const waitlistMax = selectedItem?.limitQuantity ?? 99;
                return ( <div className="purchase-action-row"><QuantityInput quantity={quantity} setQuantity={setQuantity} maxQuantity={waitlistMax} /><button onClick={() => onCartAction('WAITLIST')} className="waitlist-btn-fixed" data-tutorial-id="detail-action-button"><Hourglass size={20} /><span>{selectedItem ? `${(selectedItem.price * quantity).toLocaleString()}원 대기` : '대기 신청'}</span></button></div> );
            case 'REQUIRE_OPTION': return <button className="add-to-cart-btn-fixed" onClick={() => toast('페이지 상단에서 옵션을 먼저 선택해주세요!')}><Box size={20} /><span>위에서 옵션을 선택해주세요</span></button>;
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
    // ✅ useLocation 훅을 사용하여 location 객체를 가져옵니다.
    const location = useLocation(); 
    const { userDocument } = useAuth();
    const { addToCart } = useCart();
    const { runPageTourIfFirstTime } = useTutorial();
    const { isPreLaunch, launchDate } = useLaunch();

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reservedQuantities, setReservedQuantities] = useState<Map<string, number>>(new Map());
    const [selectedVariantGroup, setSelectedVariantGroup] = useState<VariantGroup | null>(null);
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isEncoreRequested, setIsEncoreRequested] = useState(false);
    const [isEncoreLoading, setIsEncoreLoading] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxStartIndex, setLightboxStartIndex] = useState(0);

    const requestEncoreCallable = useMemo(() => httpsCallable(functions, 'requestEncore'), []);

    // ✅ [추가] 닫기 버튼 핸들러
    const handleClose = useCallback(() => {
        // 현재 페이지가 기록 스택의 첫 번째 항목인지(예: 새 탭에서 열었을 때) 확인합니다.
        // 첫 페이지일 경우, 뒤로 가기 대신 메인 상품 목록 페이지로 이동시킵니다.
        // react-router-dom에서 히스토리 스택의 첫 항목의 location.key는 'default' 값을 가집니다.
        if (location.key === 'default') {
            navigate('/');
        } else {
            navigate(-1);
        }
    }, [navigate, location.key]);

    useEffect(() => {
        if (!productId) { setError("잘못된 상품 ID입니다."); setLoading(false); return; }
        const fetchProductAndReservations = async () => {
            try {
                const productData = await getProductById(productId);
                if (!productData) { setError("상품을 찾을 수 없습니다."); return; }
                const normalized = normalizeProduct(productData);
                setProduct(normalized);
                const ordersCollectionRef = collection(db, 'orders');
                const q = query(ordersCollectionRef, where('status', 'in', ['RESERVED', 'PREPAID']));
                const reservationSnapshot = await getDocs(q);
                const newReservedMap = new Map<string, number>();
                reservationSnapshot.forEach(doc => {
                    const order = doc.data() as Order;
                    (order.items || []).forEach((item: OrderItem) => {
                        if (item.productId === productId) {
                            const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
                            const currentCount = newReservedMap.get(key) || 0;
                            newReservedMap.set(key, currentCount + item.quantity);
                        }
                    });
                });
                setReservedQuantities(newReservedMap);
                if (userDocument) {
                    const alreadyRequested = userDocument.encoreRequestedProductIds?.includes(productId) || false;
                    setIsEncoreRequested(alreadyRequested);
                    runPageTourIfFirstTime('hasSeenProductDetailPage', detailPageTourSteps);
                }
            } catch (e) {
                console.error("상품 상세 정보 및 예약 정보 로딩 실패:", e);
                setError("상품 정보를 불러오는 데 실패했습니다.");
            } finally { setLoading(false); }
        };
        fetchProductAndReservations();
    }, [productId, userDocument, runPageTourIfFirstTime]);

    const enrichedDisplayRound = useMemo(() => {
        if (!product) return null;
        const round = getDisplayRound(product) as SalesRound | null;
        if (!round) return null;
        const enrichedVariantGroups = round.variantGroups.map(vg => {
            const key = `${product.id}-${round.roundId}-${vg.id}`;
            const reservedCount = reservedQuantities.get(key) || 0;
            return { ...vg, reservedCount };
        });
        return { ...round, variantGroups: enrichedVariantGroups };
    }, [product, reservedQuantities]);

    const expirationDateInfo = useMemo<ExpirationDateInfo>(() => {
        if (!enrichedDisplayRound || enrichedDisplayRound.variantGroups.length === 0) {
            return { type: 'none' };
        }

        const allDates = enrichedDisplayRound.variantGroups.map(vg => {
            const date = vg.items?.[0]?.expirationDate;
            return date ? safeToDate(date)?.getTime() : null;
        }).filter((d): d is number => d !== null);

        if (allDates.length === 0) return { type: 'none' };

        const uniqueDates = [...new Set(allDates)];

        if (uniqueDates.length === 1) {
            return { type: 'single', date: formatExpirationDate(new Date(uniqueDates[0]!)) };
        } else {
            const dateDetails = enrichedDisplayRound.variantGroups
                .map(vg => ({
                    groupName: vg.groupName,
                    date: formatExpirationDate(vg.items?.[0]?.expirationDate),
                }))
                .filter(item => item.date);
            return { type: 'multiple', details: dateDetails };
        }
    }, [enrichedDisplayRound]);

    const originalImageUrls = useMemo(() => {
        return product?.imageUrls?.filter(url => typeof url === 'string' && url.trim() !== '') || [];
    }, [product?.imageUrls]);


    useEffect(() => {
        if (enrichedDisplayRound?.variantGroups?.[0]) {
            if(!selectedVariantGroup) {
                const firstVg = enrichedDisplayRound.variantGroups[0];
                setSelectedVariantGroup(firstVg);
                if (firstVg.items?.[0]) setSelectedItem(firstVg.items[0]);
            }
        }
    }, [enrichedDisplayRound, selectedVariantGroup]);

    const handleOpenLightbox = useCallback((index: number) => { setLightboxStartIndex(index); setIsLightboxOpen(true); }, []);
    const handleCloseLightbox = useCallback(() => { setIsLightboxOpen(false); }, []);

    const actionState = useMemo<ProductActionState>(() => {
        if (!enrichedDisplayRound) return 'LOADING';
        return determineActionState(enrichedDisplayRound, userDocument, selectedVariantGroup);
    }, [enrichedDisplayRound, userDocument, selectedVariantGroup]);

    const handleCartAction = useCallback((status: 'RESERVATION' | 'WAITLIST') => {
        if (isPreLaunch) { toast(`상품 예약은 ${dayjs(launchDate).format('M/D')} 정식 런칭 후 가능해요!\n 그 전까지는 카카오톡으로 예약주세요!`, { icon: '🗓️', position: "top-center", duration: 4000 }); return; }
        if (!product || !enrichedDisplayRound || !selectedVariantGroup || !selectedItem) return;
        const cartItem: CartItem = { id: `${product.id}-${enrichedDisplayRound.roundId}-${selectedVariantGroup.id}-${selectedItem.id}`, productId: product.id, productName: product.groupName, roundId: enrichedDisplayRound.roundId, roundName: enrichedDisplayRound.roundName, variantGroupId: selectedVariantGroup.id, variantGroupName: selectedVariantGroup.groupName, itemId: selectedItem.id, itemName: selectedItem.name, quantity, unitPrice: selectedItem.price, stock: selectedItem.stock, imageUrl: product.imageUrls?.[0] || '', status: status, stockDeductionAmount: selectedItem.stockDeductionAmount, deadlineDate: enrichedDisplayRound.deadlineDate, pickupDate: enrichedDisplayRound.pickupDate, isPrepaymentRequired: enrichedDisplayRound.isPrepaymentRequired || false };
        addToCart(cartItem);
        if (status === 'RESERVATION') toast.success(`${quantity}개를 담았어요!`);
        else toast.success(`대기 상품으로 ${quantity}개를 담았어요.`);
        // ✅ navigate(-1) 대신 새로운 handleClose 함수 사용
        handleClose();
     }, [isPreLaunch, launchDate, product, enrichedDisplayRound, selectedVariantGroup, selectedItem, quantity, addToCart, handleClose]);

    const handleEncore = useCallback(async () => {
        if (isEncoreLoading || isEncoreRequested) return;
        if (!productId || !userDocument) { toast.error("로그인이 필요합니다."); return; }
        setIsEncoreLoading(true);
        try {
            await requestEncoreCallable({ productId });
            toast.success('앵콜 요청이 접수되었습니다! 감사합니다.');
            setIsEncoreRequested(true);
        } catch (error: any) {
            console.error("Encore request failed:", error);
            toast.error(error.message || '앵콜 요청 중 오류가 발생했습니다.');
        } finally { setIsEncoreLoading(false); }
    }, [productId, userDocument, isEncoreRequested, isEncoreLoading, requestEncoreCallable]);

    if (loading) return ( <> <Helmet><title>상품 정보 로딩 중... | 소도몰</title></Helmet><ProductDetailSkeleton /> </>);
    // ✅ 에러 발생 시 닫기 핸들러도 handleClose로 변경
    if (error || !product || !enrichedDisplayRound) return ( <> <Helmet><title>오류 | 소도몰</title><meta property="og:title" content="상품을 찾을 수 없습니다" /></Helmet><div className="product-detail-modal-overlay" onClick={handleClose}><div className="product-detail-modal-content"><div className="error-message-modal"><X className="error-icon"/><p>{error || '상품 정보를 표시할 수 없습니다.'}</p><button onClick={() => navigate('/')} className="error-close-btn">홈으로</button></div></div></div></> );

    const ogTitle = `${product.groupName} - 소도몰`;
    const ogDescription = product.description?.replace(/<br\s*\/?>/gi, ' ').substring(0, 100) + '...' || '소도몰에서 특별한 상품을 만나보세요!';
    const ogImage = originalImageUrls[0] || 'https://www.sodo-songdo.store/sodomall-preview.png';
    const ogUrl = `https://www.sodo-songdo.store/product/${product.id}`;

    return (
        <>
            <Helmet><title>{ogTitle}</title><meta property="og:title" content={ogTitle} /><meta property="og:description" content={ogDescription} /><meta property="og:image" content={ogImage} /><meta property="og:url" content={ogUrl} /><meta property="og:type" content="product" /></Helmet>
            {/* ✅ 모달 오버레이 클릭 시 handleClose 호출 */}
            <div className="product-detail-modal-overlay" onClick={handleClose}>
                <div className="product-detail-modal-content" onClick={(e) => e.stopPropagation()}>
                    {/* ✅ 상단 닫기 버튼 클릭 시 handleClose 호출 */}
                    <button onClick={handleClose} className="modal-close-btn-top"><X /></button>
                    <div className="modal-scroll-area">
                        <div className="main-content-area">
                            <div className="image-gallery-wrapper" data-tutorial-id="detail-image-gallery"><ProductImageSlider images={originalImageUrls} productName={product.groupName} onImageClick={handleOpenLightbox} /></div>
                            <div className="product-info-area">
                                <ProductInfo product={product} round={enrichedDisplayRound} actionState={actionState} expirationDateInfo={expirationDateInfo} />
                                <OptionSelector round={enrichedDisplayRound} selectedVariantGroup={selectedVariantGroup} onVariantGroupChange={(vg) => { setSelectedVariantGroup(vg); setSelectedItem(vg.items[0] || null); setQuantity(1); toast.success(`'${vg.groupName}' 옵션을 선택했어요.`); }} />
                            </div>
                        </div>
                    </div>
                    <div className="product-purchase-footer" data-tutorial-id="detail-purchase-panel"><PurchasePanel actionState={actionState} round={enrichedDisplayRound} selectedVariantGroup={selectedVariantGroup} selectedItem={selectedItem} quantity={quantity} setQuantity={setQuantity} onCartAction={handleCartAction} onEncore={handleEncore} isEncoreRequested={isEncoreRequested} isEncoreLoading={isEncoreLoading}/></div>
                </div>
            </div>
            <Lightbox isOpen={isLightboxOpen} onClose={handleCloseLightbox} images={originalImageUrls} startIndex={lightboxStartIndex} />
        </>
    );
};

const ProductDetailPageWrapper: React.FC = () => { return ( <Suspense fallback={<ProductDetailSkeleton />}><ProductDetailPage /></Suspense> ); };
export default ProductDetailPageWrapper;