// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  Product,
  ProductItem,
  CartItem,
  StorageType,
  LoyaltyTier
} from '@/types';
import { Timestamp } from 'firebase/firestore';
import { getProductById } from '@/firebase';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useEncoreRequest } from '@/context/EncoreRequestContext';
import { useTutorial } from '@/context/TutorialContext'; // ✅ [신규] useTutorial 훅 import
import { detailPageTourSteps } from '@/components/customer/AppTour'; // ✅ [신규] 튜토리얼 스텝 import
import {
  ShoppingCart, ChevronLeft, ChevronRight, X, CalendarDays, Sun, Snowflake,
  Tag, AlertCircle, PackageCheck, Hourglass, ShieldX, ShieldCheck // ✅ [신규] HelpCircle 아이콘 import
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
import { getDisplayRound, determineActionState, safeToDate, type VariantGroup, type SalesRound } from '@/utils/productUtils';
import type { ProductActionState } from '@/utils/productUtils';
import { showToast, showPromiseToast } from '@/utils/toastUtils';

// --- 유틸리티 및 헬퍼 함수 ---
dayjs.extend(isBetween);

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
  const { runPageTourIfFirstTime } = useTutorial(); // ✅ [수정] runPageTourIfFirstTime 추가

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
  const swiperRef = useRef<any>(null);
  const lightboxSwiperRef = useRef<any>(null);
  
  // ✅ [추가] 페이지 첫 방문 시 튜토리얼 자동 실행
  useEffect(() => {
    // 모달이 열리고, 메인 튜토리얼을 마친 사용자에게만 페이지별 튜토리얼을 보여줍니다.
    if (isOpen && userDocument?.hasCompletedTutorial) {
      runPageTourIfFirstTime('hasSeenDetailPage', detailPageTourSteps);
    }
  }, [isOpen, userDocument, runPageTourIfFirstTime]);


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
    if (loading || !displayRound || !product) {
      return 'LOADING';
    }
    
    const state = determineActionState(
      displayRound,
      userDocument,
      selectedVariantGroup
    );

    if (state === 'PURCHASABLE' && allAvailableOptions.length > 1 && (!selectedVariantGroup || !selectedItem)) {
      return 'REQUIRE_OPTION';
    }

    return state;
  }, [loading, displayRound, product, selectedVariantGroup, selectedItem, userDocument, allAvailableOptions.length]);
  
  // --- 데이터 로딩 및 상태 업데이트 로직 (useEffect) ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);

      try {
        const productData = await getProductById(productId);

        if (!productData) {
          setError('상품 정보를 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        const latestRound = getDisplayRound(productData);
        if (!latestRound) {
          setError('판매 정보를 찾을 수 없습니다.');
          setLoading(false);
          return;
        }
        
        const roundWithStockData: SalesRound = {
            ...latestRound,
            variantGroups: latestRound.variantGroups.map(vg => {
                return {
                    ...vg,
                    reservedCount: (vg as VariantGroup).reservedCount || 0
                };
            })
        };

        setProduct(productData);
        setDisplayRound(roundWithStockData);
        setCurrentImageIndex(0);
        
        const firstVg = roundWithStockData.variantGroups?.[0];
        const firstItem = firstVg?.items?.[0];

        if (firstVg) {
          setSelectedVariantGroup(firstVg);
        }
        if (firstItem) {
          setSelectedItem(firstItem);
        }

      } catch (e) {
        console.error("Error fetching product data:", e);
        if ((e as any).code === 'permission-denied' || (e as any).code === 'PERMISSION_DENIED') {
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
    if (!user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (isSuspendedUser) {
      showToast('error', '반복적인 약속 불이행으로 공동구매 참여가 제한되었습니다.');
      return;
    }
    if (!product || !displayRound || !selectedVariantGroup || !selectedItem) { showToast('error', '상품 또는 옵션이 올바르지 않습니다.'); return; }
    if (productActionState !== 'PURCHASABLE') { showToast('error', '지금은 예약할 수 없는 상품입니다.'); return; }
    if (quantity < 1) { showToast('error', '1개 이상 선택해주세요.'); return; }

    const reserved = selectedVariantGroup.reservedCount || 0;
    const totalGroupStock = selectedVariantGroup.totalPhysicalStock;
    const remainingStock = (totalGroupStock === null || totalGroupStock === -1) ? Infinity : totalGroupStock - reserved;

    if (quantity * (selectedItem.stockDeductionAmount || 1) > remainingStock) {
      showToast('error', `죄송합니다. 재고가 부족합니다. (현재 ${Math.floor(remainingStock / (selectedItem.stockDeductionAmount || 1) )}개 예약 가능)`);
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
    showToast('success', `${product.groupName} ${quantity}개를 장바구니에 담았습니다.`);
    onClose();
  }, [product, displayRound, selectedVariantGroup, selectedItem, quantity, addToCart, navigate, user, onClose, productActionState, isSuspendedUser, userDocument]);

  const handleEncoreRequest = useCallback(async () => {
    if (!user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (isSuspendedUser) {
      showToast('error', '현재 등급에서는 앵콜 요청을 할 수 없습니다.');
      return;
    }
    if (!product) return;
    if (userAlreadyRequestedEncore) { showToast('info', '이미 앵콜을 요청한 상품입니다.'); return; }

    const promise = requestEncore(product.id);

    showPromiseToast(promise, {
      loading: '앵콜 요청 중...',
      success: '앵콜 요청이 접수되었습니다!',
      error: '앵콜 요청에 실패했습니다.',
    });
  }, [product, user, userAlreadyRequestedEncore, requestEncore, navigate, onClose, isSuspendedUser]);

  const handleAddToWaitlist = useCallback(async () => {
    if (!user) { showToast('error', '로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (isSuspendedUser) {
      showToast('error', '반복적인 약속 불이행으로 대기 신청이 제한되었습니다.');
      return;
    }
    if (!product || !displayRound || !selectedVariantGroup || !selectedItem) return;
    if (productActionState !== 'WAITLISTABLE') { showToast('error', '지금은 대기 신청을 할 수 없습니다.'); return; }
    
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
      
      showToast('success', '대기 신청이 완료되었습니다!');
      onClose();
    } catch (error) {
      const err = error as Error;
      showToast('error', err.message || '대기 신청에 실패했습니다.');
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
          <div className="image-gallery-wrapper" data-tutorial-id="detail-image-gallery"> {/* ✅ [신규] data-tutorial-id 추가 */}
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
            
            {productActionState === 'AWAITING_STOCK' && (
              <div className="product-detail-overlay-badge">
                <Hourglass size={32} />
                <p>재고 준비중</p>
              </div>
            )}
          </div>
          <div className="product-info-area">
            <div className="product-info-header">
              <h2 className="product-name">{product.groupName}</h2>
            </div>
            <p className="product-description">{product.description}</p>

            <div className="product-key-info" data-tutorial-id="detail-key-info"> {/* ✅ [신규] data-tutorial-id 추가 */}
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
              
              {(() => {
                const tierCount = displayRound.allowedTiers?.length ?? 0;
                if (tierCount > 0 && tierCount < 4) {
                  return (
                    <div className="info-row">
                      <div className="info-label"><ShieldCheck size={16} />참여 등급</div>
                      <div className="info-value">
                        <span className="tier-badge-group">
                          {(displayRound.allowedTiers as LoyaltyTier[]).map((tier, index) => (
                            <React.Fragment key={tier}>
                              <span className="tier-badge">{tier}</span>
                              {index < (displayRound.allowedTiers as LoyaltyTier[]).length - 1 && <span className="tier-separator"> / </span>}
                            </React.Fragment>
                          ))}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className={`info-row stock-info-row ${isMultiGroup ? 'multi-group' : ''}`}>
                <div className="info-label">
                    <PackageCheck size={16} />잔여 수량
                </div>
                <div className="info-value">
                  <div className="stock-list">
                    {displayRound.variantGroups.map(vg => {
                        const totalStock = vg.totalPhysicalStock;
                        const reserved = (vg as VariantGroup).reservedCount || 0;
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
    
    if (productActionState === 'INELIGIBLE') {
      return (
        <div className="product-purchase-footer">
          <button className="sold-out-btn-fixed" disabled>
            <ShieldX size={16} /> 참여 등급이 아닙니다
          </button>
        </div>
      );
    }
    
    if (productActionState === 'AWAITING_STOCK') {
      return (
        <div className="product-purchase-footer">
          <button className="sold-out-btn-fixed" disabled>
            <Hourglass size={16} /> 재고 준비중
          </button>
        </div>
      );
    }
    
    const showQuantityControls = productActionState === 'PURCHASABLE' || productActionState === 'WAITLISTABLE';
    
    return (
        <div className="product-purchase-footer">
            {allAvailableOptions.length > 1 && (
              <div className="select-wrapper" data-tutorial-id="detail-options"> {/* ✅ [신규] data-tutorial-id 추가 */}
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
            
            <div className="purchase-action-row" data-tutorial-id="detail-action-button"> {/* ✅ [신규] data-tutorial-id 추가 */}
              {showQuantityControls && (
                <>
                  <div className="quantity-controls-fixed" data-tutorial-id="detail-quantity-controls" onClick={(e) => e.stopPropagation()}> {/* ✅ [신규] data-tutorial-id 추가 */}
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