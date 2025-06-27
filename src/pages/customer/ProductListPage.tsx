// src/pages/customer/ProductListPage.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Timestamp } from 'firebase/firestore';
import isEqual from 'lodash.isequal';
import { ShoppingCart, Plus, Minus, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import './ProductListPage.css';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import Header from '@/components/Header';
import BannerSlider from '@/components/BannerSlider';
import ProductDetailPage from './ProductDetailPage';
import type { Product, CartItem, Banner, SalesType } from '@/types';
// import brandLogo from '@/assets/Sodomall_Logo.png'; // 로고 이미지 import 제거

type ProductStatus = 'ONSITE_SALE' | 'ONGOING' | 'ADDITIONAL_RESERVATION' | 'PAST';

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const areProductCardPropsEqual = (prevProps: any, nextProps: any) => {
    return isEqual(prevProps.product, nextProps.product) &&
           prevProps.quantity === nextProps.quantity &&
           prevProps.status === nextProps.status;
};

const MemoizedProductCard = React.memo(({
    product,
    status,
    quantity,
    onQuantityChange,
    onAddToCart,
    onCardClick
}: {
    product: Product;
    status: ProductStatus;
    quantity: number;
    onQuantityChange: (productId: string, amount: number) => void;
    onAddToCart: (product: Product) => void;
    onCardClick: (productId: string) => void;
}) => {
    // [수정] 재고 상태 표시 로직
    const getStockDisplay = useCallback((product: Product, status: ProductStatus) => {
        // '마감' 상태를 최우선으로 처리
        if (status === 'PAST' || product.status === 'sold_out' || product.stock === 0) {
            return '마감';
        }

        // '예약가능' 상태 처리
        if (product.salesType === 'PRE_ORDER_UNLIMITED') {
            return '예약가능';
        }

        // '남은 재고' 상태 처리
        if (product.salesType === 'IN_STOCK' && product.stock > 0) {
            return `${product.stock.toLocaleString()}개 남음`;
        }
        
        return ''; // 기타 경우
    }, []);

    const isBuyable = status === 'ONSITE_SALE' || status === 'ONGOING' || status === 'ADDITIONAL_RESERVATION';
    const isSoldOutForDisplay = product.salesType === 'IN_STOCK' && (product.stock === 0 || product.status === 'sold_out');
    const isPastOrEnded = status === 'PAST' || isSoldOutForDisplay;

    const handleLocalQuantityChange = (e: React.MouseEvent, amount: number) => {
        e.stopPropagation();
        onQuantityChange(product.id, amount);
    };
    
    const handleAddToCartClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onAddToCart(product);
    };

    const getStockColorClass = (stock: number, salesType: SalesType, status: ProductStatus) => {
        if (status === 'PAST' || status === 'ADDITIONAL_RESERVATION' || stock === 0) return 'past-stock';
        if (salesType === 'PRE_ORDER_UNLIMITED') return 'pre-order-unlimited';
        if (stock < 10) return 'stock-color-low';
        if (stock < 50) return 'stock-color-medium';
        return ''; // stock-color-high 대신 기본 스타일 사용
    };

    const formatPickupDateAndDay = (timestamp: Timestamp | undefined | null) => {
        if (!timestamp) return null;
        const date = timestamp.toDate();
        const month = (date.getMonth() + 1);
        const day = date.getDate();
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = dayNames[date.getDay()];
        return `${month}/${day}(${dayOfWeek})`;
    };
    
    // [수정] 마감된 상품도 상세 페이지로 이동 가능하도록 onClick 이벤트 수정
    const handleCardClick = () => {
        onCardClick(product.id);
    };

    return (
        <div className={`product-card-wrapper ${status === 'PAST' ? 'past-product-card' : ''}`}>
            <div className="product-card" onClick={handleCardClick}>
                <div className="product-image-wrapper">
                    <img src={product.imageUrls?.[0] || `https://placehold.co/400x400?text=${product.name}`} alt={product.name} className="product-image" />
                    {isPastOrEnded && <span className="product-badge sold-out">마감</span>}
                    {/* [삭제] 보관 유형 뱃지 제거 */}
                </div>
                {/* [수정] 카드 컨텐츠 영역의 여백 최소화 */}
                <div className="product-content">
                    {/* [수정] 픽업일과 재고 정보를 한 줄에 좌우로 배치 */}
                    <div className="product-details-summary">
                        <span className="product-pickup-info">
                            픽업: <span className="pickup-info-value">{formatPickupDateAndDay(product.pickupDate) || '미정'}</span>
                        </span>
                        <span className={`product-stock-info ${getStockColorClass(product.stock, product.salesType, status)}`}>
                            {getStockDisplay(product, status)}
                        </span>
                    </div>
                    {isBuyable && (
                        <div className="quantity-control-and-cart-actions">
                            <div className="quantity-control">
                                <button onClick={(e) => handleLocalQuantityChange(e, -1)} className="quantity-button" disabled={quantity <= 1}>
                                    <Minus size={14} />
                                </button>
                                <span className="quantity-display">{quantity}</span>
                                <button onClick={(e) => handleLocalQuantityChange(e, 1)} className="quantity-button" disabled={product.salesType === 'IN_STOCK' && quantity >= product.stock}>
                                    <Plus size={14} />
                                </button>
                            </div>
                            {/* [수정] 담기 버튼이 잘리지 않도록 flex-grow 적용 */}
                            <button onClick={handleAddToCartClick} className="add-to-cart-button" disabled={isPastOrEnded}>
                                <ShoppingCart size={16} />
                                <span>담기</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}, areProductCardPropsEqual);

const useHorizontalScroll = () => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [velocity, setVelocity] = useState(0);
    const animationFrameRef = useRef<number | null>(null);

    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const startInertiaScroll = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const animateScroll = () => {
            if (!scrollRef.current || Math.abs(velocity) < 0.5) {
                setVelocity(0);
                if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
                return;
            }

            if (scrollRef.current) {
                scrollRef.current.scrollLeft += velocity;
            }
            setVelocity(prev => prev * 0.92);
            animationFrameRef.current = requestAnimationFrame(animateScroll);
        };

        animationFrameRef.current = requestAnimationFrame(animateScroll);
    }, [velocity]);

    const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollRef.current) return;
        e.preventDefault();
        setIsDragging(true);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        setStartX(e.pageX - scrollRef.current.offsetLeft);
        setScrollLeft(scrollRef.current.scrollLeft);
        setVelocity(0);
        scrollRef.current.style.cursor = 'grabbing';
    }, []);

    const onMouseLeave = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            startInertiaScroll();
        }
        if (scrollRef.current) {
            scrollRef.current.style.cursor = 'grab';
        }
    }, [isDragging, startInertiaScroll]);

    const onMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            startInertiaScroll();
        }
        if (scrollRef.current) {
            scrollRef.current.style.cursor = 'grab';
        }
    }, [isDragging, startInertiaScroll]);

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = x - startX;
        const newScrollLeft = scrollLeft - walk;

        const currentScroll = scrollRef.current.scrollLeft;
        const diff = newScrollLeft - currentScroll;

        scrollRef.current.scrollLeft = newScrollLeft;
        setVelocity(diff);
    }, [isDragging, startX, scrollLeft]);

    const scrollByPage = useCallback((direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            const scrollAmount = container.clientWidth * 0.8;
            container.scrollBy({
                left: direction === 'right' ? scrollAmount : -scrollAmount,
                behavior: 'smooth',
            });
        }
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollLeft, scrollWidth, clientWidth } = container;
            const isScrollable = scrollWidth > clientWidth;
            
            if (isScrollable) {
                const isAtStart = scrollLeft <= 1;
                const isAtEnd = Math.ceil(scrollLeft) + clientWidth >= scrollWidth - 1;
                
                setShowLeftArrow(!isAtStart);
                setShowRightArrow(!isAtEnd);
            } else {
                setShowLeftArrow(false);
                setShowRightArrow(false);
            }
        };
        
        const observer = new ResizeObserver(handleScroll);
        observer.observe(container);

        container.addEventListener('scroll', handleScroll);
        
        const initialCheck = setTimeout(handleScroll, 100);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            observer.disconnect();
            clearTimeout(initialCheck);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    const mouseHandlers = { onMouseDown, onMouseLeave, onMouseUp, onMouseMove };

    return { scrollRef, mouseHandlers, scrollByPage, showLeftArrow, showRightArrow };
};


const ProductListPage = () => {
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [activeBanners, setActiveBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { addToCart } = useCart();
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [productQuantities, setProductQuantities] = useState<{ [productId: string]: number }>({});
    const [countdown, setCountdown] = useState<Countdown | null>(null);
    const [showCartSuccessModal, setShowCartSuccessModal] = useState(false); // [추가] 모달 표시 상태

    const onSiteSaleScroll = useHorizontalScroll();
    const ongoingScroll = useHorizontalScroll();
    const additionalReservationScroll = useHorizontalScroll();
    const pastProductsScroll = useHorizontalScroll();

    useEffect(() => {
        const fetchAllData = async () => {
            if (!user) {
                setLoading(false);
                setAllProducts([]);
                setActiveBanners([]);
                return;
            }

            setLoading(true);
            try {
                const { db, getActiveBanners } = await import('@/firebase');
                const { collection, getDocs, query, orderBy, where } = await import('firebase/firestore');

                const bannersPromise = getActiveBanners();
                const productsQuery = query(
                    collection(db, 'products'),
                    where('isPublished', '==', true),
                    orderBy('publishAt', 'desc')
                );
                const productsPromise = getDocs(productsQuery);

                const [banners, productSnapshot] = await Promise.all([bannersPromise, productsPromise]);

                setActiveBanners(prev => isEqual(prev, banners) ? prev : banners);

                const productList = productSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                } as Product));

                setAllProducts(prevProducts => {
                    if (!isEqual(prevProducts, productList)) {
                        return productList;
                    }
                    return prevProducts;
                });

                // [수정] 옵셔널 체이닝 할당 오류 수정
                setProductQuantities(prevQuantities => {
                    const newQuantities: { [productId: string]: number } = { ...prevQuantities };
                    productList.forEach(p => {
                        if (newQuantities[p.id] === undefined) {
                             newQuantities[p.id] = 1;
                        }
                    });
                    return newQuantities;
                });

            } catch (error) {
                console.error("데이터 로딩 중 오류 발생:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, [user]);

    const { onSiteSaleProducts, ongoingProducts, additionalReservationProducts, pastProducts } = useMemo(() => {
        const now = new Date();
        const onsite: Product[] = [];
        const ongoing: Product[] = [];
        const additional: Product[] = [];
        const past: Product[] = [];

        allProducts.forEach(p => {
            if (p.status === 'draft' || (p.status === 'scheduled' && p.publishAt && p.publishAt.toDate() > now)) return;

            const deadline = p.deadlineDate?.toDate();
            const pickupDeadline = p.pickupDeadlineDate?.toDate();

            if (p.isAvailableForOnsiteSale && p.stock > 0) {
                onsite.push(p);
            }
            else if (p.status === 'selling' && deadline && now < deadline) {
                ongoing.push(p);
            }
            else if (deadline && pickupDeadline && now > deadline && now < pickupDeadline && p.stock > 0) {
                additional.push(p);
            }
            else {
                past.push(p);
            }
        });
        return { onSiteSaleProducts: onsite, ongoingProducts: ongoing, additionalReservationProducts: additional, pastProducts: past };
    }, [allProducts]);

    const fastestDeadline = useMemo(() => {
        if (ongoingProducts.length === 0) return null;
        return Math.min(...ongoingProducts.map(p => p.deadlineDate?.toMillis() || Infinity));
    }, [ongoingProducts]);

    useEffect(() => {
        if (!fastestDeadline || fastestDeadline === Infinity) {
            setCountdown(null);
            return;
        }
        const interval = setInterval(() => {
            const now = new Date().getTime();
            const distance = fastestDeadline - now;
            if (distance < 0) {
                clearInterval(interval);
                setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            } else {
                setCountdown({
                    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
                    seconds: Math.floor((distance % (1000 * 60)) / 1000)
                });
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [fastestDeadline]);

    const handleQuantityChange = useCallback((productId: string, amount: number) => {
        const product = allProducts.find(p => p.id === productId);
        if (!product) return;

        setProductQuantities(prev => {
            const currentQuantity = prev[productId] || 1;
            let newQuantity = currentQuantity + amount;
            if (newQuantity < 1) newQuantity = 1;
            if (product.salesType === 'IN_STOCK' && newQuantity > product.stock) newQuantity = product.stock;
            if (product.maxOrderPerPerson && newQuantity > product.maxOrderPerPerson) newQuantity = product.maxOrderPerPerson;
            return { ...prev, [productId]: newQuantity };
        });
    }, [allProducts]);

    const handleAddToCart = useCallback((product: Product) => {
        const quantity = productQuantities[product.id] || 1;
        const item: CartItem = {
            productId: product.id, productName: product.name,
            selectedUnit: product.pricingOptions?.[0]?.unit || '',
            unitPrice: product.pricingOptions?.[0]?.price || 0,
            quantity: quantity, imageUrl: product.imageUrls?.[0] || 'https://via.placeholder.com/150',
            maxOrderPerPerson: product.maxOrderPerPerson, availableStock: product.stock,
            salesType: product.salesType,
        };
        addToCart(item);
        // alert(`${product.name} ${quantity}개를 장바구니에 담았습니다.`); // 기존 alert 대신 모달 사용
        
        // [추가] 모달 표시 및 2초 후 숨기기
        setShowCartSuccessModal(true);
        setTimeout(() => {
            setShowCartSuccessModal(false);
        }, 2000); // 2초 후 자동으로 사라짐
        
    }, [addToCart, productQuantities]);

    const handleCardClick = useCallback((productId: string) => {
        setSelectedProductId(productId);
        setIsDetailModalOpen(true);
    }, []);

    const formatCountdown = (cd: Countdown | null) => {
        if (!cd) return null;
        if (cd.days === 0 && cd.hours === 0 && cd.minutes === 0 && cd.seconds === 0) {
            return <span className="countdown-ended">마감!</span>;
        }
        return (
            <span className="countdown-active">
                {cd.days > 0 && `${cd.days}일 `}
                {`${String(cd.hours).padStart(2, '0')}:${String(cd.minutes).padStart(2, '0')}:${String(cd.seconds).padStart(2, '0')}`}
            </span>
        );
    };

    if (loading) return <div className="loading-spinner">상품 목록을 불러오는 중...</div>;
    if (!user) return <div className="login-prompt">로그인하시면 상품 목록을 보실 수 있습니다.</div>;

    const renderProductSection = (
        title: string,
        products: Product[],
        status: ProductStatus,
        horizontal: boolean,
        scrollHook?: ReturnType<typeof useHorizontalScroll>,
        countdownTimer?: Countdown | null
    ) => {
        if (products.length === 0 && status !== 'PAST') return null;

        return (
            <section className="product-section">
                <h2 className={`section-title ${status === 'ONGOING' ? 'ongoing' : ''} ${status === 'ADDITIONAL_RESERVATION' ? 'additional' : ''}`}>
                    <span className="title-text">
                         {status === 'ONGOING' && <span className="section-icon ongoing-icon">🔥</span>}
                         {status === 'ADDITIONAL_RESERVATION' && <span className="section-icon additional-icon">✨</span>}
                         {title}
                    </span>
                    {countdownTimer && <span className="countdown-timer">{formatCountdown(countdownTimer)}</span>}
                </h2>
                {products.length > 0 ? (
                    <div className="horizontal-scroll-container">
                        {horizontal && (
                            <button className={`scroll-arrow left-arrow ${scrollHook?.showLeftArrow ? 'visible' : ''}`} onClick={() => scrollHook?.scrollByPage('left')}>
                                <ChevronLeft size={28} />
                            </button>
                        )}
                        <div
                            className={`product-grid ${horizontal ? 'horizontal-scroll' : 'general-grid'}`}
                            ref={horizontal ? scrollHook?.scrollRef : undefined}
                            {...(horizontal && scrollHook ? scrollHook.mouseHandlers : {})}
                        >
                            {products.map(product => (
                                <MemoizedProductCard
                                    key={product.id} product={product} status={status}
                                    quantity={productQuantities[product.id] || 1}
                                    onQuantityChange={handleQuantityChange}
                                    onAddToCart={handleAddToCart}
                                    onCardClick={handleCardClick}
                                />
                            ))}
                        </div>
                        {horizontal && (
                            <button className={`scroll-arrow right-arrow ${scrollHook?.showRightArrow ? 'visible' : ''}`} onClick={() => scrollHook?.scrollByPage('right')}>
                                <ChevronRight size={28} />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="empty-section-text">
                         {status === 'PAST' ? '종료된 공동구매 상품이 없습니다.' : '현재 해당 상품이 없습니다.'}
                    </div>
                )}
            </section>
        );
    };

    return (
        <>
            <Header currentUserName={user?.displayName ?? '고객님'} brandName="소도몰" storeName="송도랜드마크점" />
            <div className="customer-page-container">
                <BannerSlider banners={activeBanners} className="banner-slider-container" />
                
                {renderProductSection('지금 바로 구매!', onSiteSaleProducts, 'ONSITE_SALE', true, onSiteSaleScroll)}
                
                {renderProductSection(
                    '공동구매 진행 중', 
                    ongoingProducts, 'ONGOING', true, ongoingScroll,
                    countdown
                )}
                
                {renderProductSection('마감 임박! 추가 예약', additionalReservationProducts, 'ADDITIONAL_RESERVATION', true, additionalReservationScroll)}
                
                {renderProductSection('지난 공동구매', pastProducts, 'PAST', true, pastProductsScroll)}
            </div>

            {isDetailModalOpen && selectedProductId && (
                <ProductDetailPage
                    productId={selectedProductId}
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                />
            )}
            
            {/* [추가] 장바구니 담기 성공 모달 팝업 */}
            {showCartSuccessModal && (
                <div className={`cart-success-modal ${showCartSuccessModal ? 'visible' : ''}`}>
                    <CheckCircle size={48} className="modal-icon"/>
                    <span>장바구니에 담았습니다!</span>
                </div>
            )}
        </>
    );
};

export default ProductListPage;