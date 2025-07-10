// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Product, ProductItem, CartItem, StorageType, VariantGroup, SalesRound } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { getProductById, checkProductAvailability, addWaitlistEntry } from '@/firebase/productService';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useEncoreRequest } from '@/context/EncoreRequestContext';
import { useWaitlist } from '@/context/WaitlistContext';
import {
  ShoppingCart, ChevronLeft, ChevronRight, X, CalendarDays, Sun, Snowflake,
  Tag, AlertCircle, Loader2
} from 'lucide-react';
import './ProductDetailPage.css';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import useLongPress from '@/hooks/useLongPress';
import dayjs from 'dayjs';

// --- 유틸리티 및 헬퍼 함수 (변경 없음) ---
const formatPrice = (price: number) => `${price.toLocaleString()}원`;
const formatDateWithDay = (date: Date) => date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' }).replace(/\s/g, '');
const storageIcons: Record<StorageType, JSX.Element> = { ROOM: <Sun size={16} />, COLD: <Snowflake size={16} />, FROZEN: <Snowflake size={16} /> };
const storageLabels: Record<StorageType, string> = { ROOM: '실온 보관', COLD: '냉장 보관', FROZEN: '냉동 보관' };
const getLatestRoundFromHistory = (product: Product | null): SalesRound | null => {
  if (!product || !product.salesHistory || product.salesHistory.length === 0) return null;
  const sortedRounds = [...product.salesHistory]
    .filter(r => r.status !== 'draft')
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  return sortedRounds?.[0] || null;
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
  const location = useLocation();
  const { addToCart } = useCart();
  const { user } = useAuth();
  const { hasRequestedEncore, requestEncore, loading: encoreLoading } = useEncoreRequest();
  const { addToWaitlist: addItemsToWaitlistContext } = useWaitlist();

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
  const [availableForPurchase, setAvailableForPurchase] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [isQuantityEditing, setIsQuantityEditing] = useState(false);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // --- 메모이제이션(useMemo) 로직 ---
  const isScheduled = useMemo(() => displayRound?.status === 'scheduled' && displayRound.publishAt && new Date() < displayRound.publishAt.toDate(), [displayRound]);

  const showWaitlistButton = useMemo(() => {
    if (!displayRound) return false;
    const now = new Date();
    const firstRoundDeadline = displayRound.createdAt ? dayjs(displayRound.createdAt.toDate()).add(1, 'day').set('hour', 13).set('minute', 0).set('second', 0) : null;
    return displayRound.status === 'sold_out' && firstRoundDeadline && now < firstRoundDeadline.toDate();
  }, [displayRound]);

  const showEncoreRequestButton = useMemo(() => {
    if (availableForPurchase || showWaitlistButton || !displayRound) return false;
    return displayRound.status === 'ended' || displayRound.status === 'sold_out';
  }, [availableForPurchase, showWaitlistButton, displayRound]);

  const userAlreadyRequestedEncore = !!(user && product && hasRequestedEncore(product.id));
  const userAlreadyWaitlisted = useMemo(() => !!(user && displayRound?.waitlist?.some(entry => entry.userId === user.uid)), [displayRound, user]);

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

  // --- 데이터 로딩 및 상태 업데이트 로직 (useEffect) ---
  useEffect(() => {
    const fetchProductData = async () => {
      setLoading(true);
      setError(null);
      try {
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

        // 😊 수정 후: 조건문 없이 항상 최신 데이터로 상태를 설정합니다.
        setProduct(productData);
        setDisplayRound(latestRound);

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
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && productId) {
      fetchProductData();
    }
  }, [isOpen, productId]);

  useEffect(() => {
    setCurrentTotalPrice((selectedItem?.price ?? 0) * quantity);
  }, [selectedItem, quantity]);

  useEffect(() => {
    const checkAvailability = async () => {
      if (!product || !displayRound || !selectedVariantGroup || !selectedItem) {
        setAvailableForPurchase(false);
        return;
      }

      const isAvailable = await checkProductAvailability(
        product.id,
        displayRound.roundId,
        selectedVariantGroup.id,
        selectedItem.id
      );

      const now = new Date();
      const deadline = displayRound.deadlineDate?.toDate();
      const pickupDeadline = displayRound.pickupDeadlineDate?.toDate();
      const firstRoundDeadline = displayRound.createdAt ? dayjs(displayRound.createdAt.toDate()).add(1, 'day').set('hour', 13).set('minute', 0).set('second', 0) : null;

      let isPurchasable = false;
      if (displayRound.status === 'selling' && isAvailable) {
        if (deadline && now <= deadline) {
          isPurchasable = true;
        } else if (pickupDeadline && now < pickupDeadline) {
          isPurchasable = true;
        }
      }
      if (showWaitlistButton && displayRound.status === 'sold_out' && firstRoundDeadline && now < firstRoundDeadline.toDate()) {
        isPurchasable = false;
      }

      setAvailableForPurchase(isPurchasable);
    };

    checkAvailability();
  }, [selectedVariantGroup, selectedItem, product, displayRound, showWaitlistButton]);

  // --- 핸들러 함수들 ---
  const createQuantityUpdater = (delta: number) => () => {
    setQuantity(prev => {
      const newQuantity = prev + delta;
      const max = selectedItem?.limitQuantity || 999;
      return Math.max(1, Math.min(newQuantity, max));
    });
  };

  const decrementHandlers = useLongPress(createQuantityUpdater(-1), createQuantityUpdater(-1));
  const incrementHandlers = useLongPress(createQuantityUpdater(1), createQuantityUpdater(1));

  const handleQuantityInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    // 😊 수정 후: value >= 0 을 value > 0 으로 변경합니다.
    if (!isNaN(value) && value > 0 && (!selectedItem?.limitQuantity || value <= selectedItem.limitQuantity)) {
      setQuantity(value);
    }
  }, [selectedItem?.limitQuantity]);

  const handleQuantityInputBlur = useCallback(() => {
    setIsQuantityEditing(false);
    if (isNaN(quantity) || quantity < 1) {
      setQuantity(1);
    }
  }, [quantity]);

  const handleAddToCart = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (!product || !displayRound || !selectedVariantGroup || !selectedItem) { toast.error('상품 또는 옵션이 올바르지 않습니다.'); return; }

    if (quantity < 1) { toast.error('1개 이상 선택해주세요.'); return; }

    const isAvailable = await checkProductAvailability(product.id, displayRound.roundId, selectedVariantGroup.id, selectedItem.id);
    if (!isAvailable) { toast.error('선택하신 상품의 재고가 부족합니다.'); return; }

    const itemToAdd: CartItem = {
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
    };

    addToCart(itemToAdd);
    toast.success(`${product.groupName} ${quantity}개를 장바구니에 담았습니다.`);
    onClose();
  }, [product, displayRound, selectedVariantGroup, selectedItem, quantity, addToCart, navigate, user, onClose, location]); // location 추가

  const handleEncoreRequest = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (!product) return;
    if (userAlreadyRequestedEncore) { toast('이미 앵콜을 요청한 상품입니다.', { icon: '👏' }); return; }

    const promise = requestEncore(product.id).then(() => {
    });

    toast.promise(promise, {
      loading: '앵콜 요청 중...',
      success: '앵콜 요청이 접수되었습니다!',
      error: '앵콜 요청에 실패했습니다.',
    });
  }, [product, user, userAlreadyRequestedEncore, requestEncore, navigate, onClose, location]); // location 추가

  const handleAddToWaitlist = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (!product || !displayRound || !selectedItem) return;
    if (userAlreadyWaitlisted) { toast.error('이미 대기 신청한 상품입니다.'); return; }
    setWaitlistLoading(true);

    const promise = addWaitlistEntry(product.id, displayRound.roundId, user.uid, quantity)
      .then(() => {
        const waitlistItem = {
          productId: product.id,
          productName: selectedVariantGroup?.groupName || product.groupName,
          itemName: selectedItem.name,
          quantity: quantity,
          imageUrl: product.imageUrls?.[0] ?? '',
          timestamp: Timestamp.now(),
        };
        addItemsToWaitlistContext([waitlistItem]);
        setDisplayRound(prev => prev ? ({
          ...prev,
          waitlist: [...(prev.waitlist || []), { userId: user.uid, quantity, timestamp: Timestamp.now() }],
          waitlistCount: (prev.waitlistCount || 0) + quantity
        }) : null);
      });

    toast.promise(promise, {
      loading: '대기 명단 등록 중...',
      success: '대기 신청이 완료되었습니다!',
      error: (err) => (err as Error).message || '대기 신청에 실패했습니다.',
    }).finally(() => {
      setWaitlistLoading(false);
    });
  }, [product, displayRound, user, quantity, userAlreadyWaitlisted, addItemsToWaitlistContext, navigate, onClose, selectedItem, selectedVariantGroup, location]); // location 추가

  const changeImage = useCallback((direction: 'prev' | 'next') => {
    if (!product?.imageUrls) return;
    const totalImages = product.imageUrls.length;
    setCurrentImageIndex(prevIndex => {
      if (direction === 'next') return (prevIndex + 1) % totalImages;
      if (direction === 'prev') return (prevIndex - 1 + totalImages) % totalImages;
      return prevIndex;
    });
  }, [product]);

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

  if (!isOpen) return null;

  const renderContent = () => {
    if (loading) return <ProductDetailSkeleton />;
    if (error || !product || !displayRound) {
      return (
        <div className="error-message-modal">
          <AlertCircle className="error-icon" />
          <p>{error || '상품 정보를 불러올 수 없습니다.'}</p>
          <button onClick={onClose} className="error-close-btn">닫기</button>
        </div>
      );
    }

    return (
      <>
        <div className="main-content-area">
          <div className="image-gallery-wrapper">
            <div className="image-gallery">
              <img
                src={getOptimizedImageUrl(product.imageUrls?.[currentImageIndex], "1080x1080")}
                alt={`${product.groupName} 이미지 ${currentImageIndex + 1}`}
                onClick={openImageModal}
                fetchPriority="high"
              />
              {product.imageUrls?.length > 1 && (
                <>
                  <button onClick={() => changeImage('prev')} className="image-nav-btn prev"><ChevronLeft /></button>
                  <button onClick={() => changeImage('next')} className="image-nav-btn next"><ChevronRight /></button>
                  <div className="image-indicator">{currentImageIndex + 1} / {product.imageUrls.length}</div>
                </>
              )}
            </div>
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
                <div className="info-value">{displayRound.deadlineDate?.toDate() ? formatDateWithDay(displayRound.deadlineDate.toDate()) + ' 13:00' : '미정'}</div>
              </div>
              <div className="info-row">
                <div className="info-label"><CalendarDays size={16} />픽업일</div>
                <div className="info-value">{displayRound.pickupDate?.toDate() ? formatDateWithDay(displayRound.pickupDate.toDate()) : '미정'}</div>
              </div>
              <div className="info-row">
                <div className="info-label">{storageIcons?.[product.storageType]}보관 방법</div>
                <div className={`info-value storage-type-${product.storageType}`}>{storageLabels?.[product.storageType]}</div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="product-detail-modal-overlay" onClick={onClose}>
      {/* 1. 모달 컨텐츠가 전체 레이아웃을 담당합니다. */}
      <div className="product-detail-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn-top" onClick={onClose}><X size={20} /></button>

        {/* 2. 스크롤이 필요한 부분만 별도의 div로 감싸줍니다. */}
        <div className="modal-scroll-area">
          {renderContent()}
        </div>

        {/* 3. 하단 구매 영역을 스크롤 영역과 형제 레벨로 배치합니다. */}
        {displayRound && (
          <div className="product-purchase-footer">
            {allAvailableOptions.length > 0 && (
              <div className="select-wrapper">
                <select className="price-select" onChange={handleOptionChange} value={allAvailableOptions.findIndex(opt => opt.item.id === selectedItem?.id)}>
                  {allAvailableOptions.map((opt, index) => (
                    <option key={`${opt.vg.id}-${opt.item.id}-${index}`} value={index}>
                      {opt.vg.groupName} - {opt.item.name} ({formatPrice(opt.item.price)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="purchase-action-row">
              {(availableForPurchase || showWaitlistButton) ? (
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
                      <button {...incrementHandlers} disabled={!!(selectedItem?.limitQuantity && quantity >= selectedItem.limitQuantity)} className="quantity-btn">+</button>
                  </div>
                  <span className="footer-total-price-fixed">{formatPrice(currentTotalPrice)}</span>

                  {availableForPurchase ? (
<button className="add-to-cart-btn-fixed" onClick={handleAddToCart}>
  <ShoppingCart size={18} />
</button>
                  ) : (
                    <button className="waitlist-btn-fixed" onClick={handleAddToWaitlist} disabled={userAlreadyWaitlisted || waitlistLoading}>
                      {waitlistLoading ? <Loader2 className="spinner-icon-small" /> : userAlreadyWaitlisted ? '대기 완료' : '대기 신청'}
                    </button>
                  )}
                </>
              ) : showEncoreRequestButton ? (
                <button className="encore-request-btn-fixed" onClick={handleEncoreRequest} disabled={userAlreadyRequestedEncore || encoreLoading}>
                  {encoreLoading ? <Loader2 className="spinner-icon-small" /> : userAlreadyRequestedEncore ? '요청 완료' : '앵콜 요청'}
                </button>
              ) : (
                <button className="sold-out-btn-fixed" disabled>
                  {isScheduled ? '준비중' : '판매 종료'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 이미지 라이트박스는 그대로 둡니다 */}
      {isImageModalOpen && product && (
         <div className="image-lightbox-overlay" onClick={closeImageModal}>
            <button className="modal-close-btn-lightbox" onClick={closeImageModal}><X size={28} /></button>
            <img src={getOptimizedImageUrl(product.imageUrls[currentImageIndex], "1080x1080")} alt="확대 이미지" />
            {product.imageUrls.length > 1 && (<>
                <button onClick={(e) => { e.stopPropagation(); changeImage('prev'); }} className="image-nav-btn-lightbox prev"><ChevronLeft /></button>
                <button onClick={(e) => { e.stopPropagation(); changeImage('next'); }} className="image-nav-btn-lightbox next"><ChevronRight /></button>
                <div className="image-indicator-lightbox">{currentImageIndex + 1} / {product.imageUrls.length}</div>
            </>)}
        </div>
      )}
    </div>
  );
};

export default ProductDetailPage;