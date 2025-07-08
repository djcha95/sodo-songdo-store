// src/pages/customer/ProductDetailPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Product, ProductItem, CartItem, StorageType, VariantGroup, SalesRound, SalesRoundStatus } from '@/types';
import type { Timestamp } from 'firebase/firestore';
import { getProductById, checkProductAvailability } from '@/firebase';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useEncoreRequest } from '@/context/EncoreRequestContext';
import {
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarDays,
  Sun,
  Snowflake,
  Volume2,
  Archive,
  Tag,
  AlertTriangle,
  Infinity as InfinityIcon,
  AlertCircle,
} from 'lucide-react';
import './ProductDetailPage.css';
import { getOptimizedImageUrl } from '@/utils/imageUtils';

// --- 유틸리티 및 헬퍼 함수 ---
const formatPrice = (price: number) => `${price.toLocaleString()}원`;
const formatDateWithDay = (date: Date) => date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' }).replace(/\s/g, '');
const formatDateWithYear = (date: Date) => date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).replace(/\s/g, '');
const storageIcons: Record<StorageType, JSX.Element> = { ROOM: <Sun size={16} />, CHILLED: <Snowflake size={16} />, FROZEN: <Snowflake size={16} /> };
const storageLabels: Record<StorageType, string> = { ROOM: '실온 보관', CHILLED: '냉장 보관', FROZEN: '냉동 보관' };

const getLatestRoundFromHistory = (product: Product | null): SalesRound | null => {
    if (!product || !product.salesHistory || product.salesHistory.length === 0) {
        return null;
    }
    const sortedRounds = [...product.salesHistory].filter(r => r.status !== 'draft').sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    return sortedRounds[0] || null;
};

// 로딩 스켈레톤 컴포넌트
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
  const { cartItems = [], addToCart } = useCart();
  const { user } = useAuth();
  const { hasRequestedEncore, requestEncore, loading: encoreLoading } = useEncoreRequest();

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
  const [encoreCount, setEncoreCount] = useState<number>(0);
  const [availableForPurchase, setAvailableForPurchase] = useState(false);

  const isSingleItemProduct = useMemo(() => {
    if (!displayRound?.variantGroups) return false;
    return displayRound.variantGroups.length === 1 && displayRound.variantGroups[0].items.length === 1;
  }, [displayRound]);
  
  const isScheduled = useMemo<boolean>(() => {
    if (!displayRound || displayRound.status !== 'scheduled' || !displayRound.publishAt) return false;
    return new Date() < displayRound.publishAt.toDate();
  }, [displayRound]);

  const showEncoreRequestButton = useMemo<boolean>(() => {
    if (!displayRound) return false;
    return displayRound.status === 'ended' || displayRound.status === 'sold_out';
  }, [displayRound]);

  const userAlreadyRequestedEncore = !!(user && product && hasRequestedEncore(product.id));

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

  useEffect(() => {
    if (isOpen && productId) {
      const fetchProduct = async () => {
        setLoading(true); setError(null); setProduct(null); setDisplayRound(null); setSelectedVariantGroup(null);
        setSelectedItem(null); setCurrentImageIndex(0); setQuantity(1);
        try {
          const fetchedProductDoc = await getProductById(productId);
          if (fetchedProductDoc) {
            let productData: Product, roundToDisplay: SalesRound | null = null;
            if ('salesHistory' in fetchedProductDoc && Array.isArray(fetchedProductDoc.salesHistory)) {
                productData = fetchedProductDoc as Product;
                roundToDisplay = getLatestRoundFromHistory(productData);
            } else {
                const legacyData = fetchedProductDoc as any;
                roundToDisplay = {
                    roundId: legacyData.id, roundName: legacyData.roundName || '1차 판매',
                    status: legacyData.status as SalesRoundStatus, variantGroups: legacyData.variantGroups || [],
                    publishAt: legacyData.publishAt as Timestamp, deadlineDate: legacyData.deadlineDate as Timestamp,
                    pickupDate: legacyData.pickupDate as Timestamp, pickupDeadlineDate: legacyData.pickupDeadlineDate as Timestamp | null,
                    createdAt: legacyData.createdAt as Timestamp,
                };
                productData = {
                    id: legacyData.id, groupName: legacyData.groupName, description: legacyData.description,
                    imageUrls: legacyData.imageUrls, storageType: legacyData.storageType, isArchived: legacyData.isArchived,
                    createdAt: legacyData.createdAt, salesHistory: [roundToDisplay], encoreCount: legacyData.encoreCount || 0,
                    encoreRequesterIds: legacyData.encoreRequesterIds || [], category: legacyData.category || '', subCategory: legacyData.subCategory || '',
                };
            }
            setProduct(productData);
            setEncoreCount(productData.encoreCount || 0);
            setDisplayRound(roundToDisplay);
            if (roundToDisplay && roundToDisplay.variantGroups?.length > 0) {
              const defaultVg = roundToDisplay.variantGroups[0];
              setSelectedVariantGroup(defaultVg);
              if (defaultVg.items?.length > 0) setSelectedItem(defaultVg.items[0]);
            } else { setError('판매 정보가 없는 상품입니다.'); }
          } else { setError('상품을 찾을 수 없습니다.'); }
        } catch (err) { console.error("Error fetching product details:", err); setError('상품 정보를 불러오는 데 실패했습니다.');
        } finally { setLoading(false); }
      };
      fetchProduct();
    }
  }, [isOpen, productId]);

  useEffect(() => { if (selectedItem) { setCurrentTotalPrice(selectedItem.price * quantity); } else { setCurrentTotalPrice(0); } }, [selectedItem, quantity]);

  useEffect(() => {
    const checkAvailability = async () => {
      if (!product || !displayRound || !selectedVariantGroup || !selectedItem) {
        setAvailableForPurchase(false); return;
      }
      const now = new Date();
      const deadlineDate = displayRound.deadlineDate?.toDate();
      const pickupDeadlineDate = displayRound.pickupDeadlineDate?.toDate();
      const isMainSale = deadlineDate && now <= deadlineDate;
      const isAdditionalSale = deadlineDate && pickupDeadlineDate && now > deadlineDate && now < pickupDeadlineDate;
      const isSaleActive = displayRound.status === 'selling' && (isMainSale || isAdditionalSale);
      if (!isSaleActive) { setAvailableForPurchase(false); return; }
      const isStockAvailable = await checkProductAvailability(product.id, displayRound.roundId, selectedVariantGroup.id!, selectedItem.id!);
      setAvailableForPurchase(isStockAvailable || false);
    };
    checkAvailability();
  }, [selectedVariantGroup, selectedItem, product, displayRound]);

  const handleQuantityChange = useCallback((amount: number) => {
    if (!selectedItem) return;
    setQuantity(prevQuantity => {
      let newQuantity = prevQuantity + amount;
      if (newQuantity < 1) newQuantity = 1;
      if (selectedItem.limitQuantity != null && newQuantity > selectedItem.limitQuantity) {
        toast.error(`1인당 최대 ${selectedItem.limitQuantity}개 구매 가능합니다.`);
        newQuantity = selectedItem.limitQuantity;
      }
      return newQuantity;
    });
  }, [selectedItem]);

  const handleAddToCart = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (!product || !displayRound || !selectedVariantGroup || !selectedItem) { toast.error('상품 또는 옵션이 올바르지 않습니다.'); return; }
    const quantityToAdd = quantity;
    const itemInCart = cartItems.find(item => item.productId === product.id && item.roundId === displayRound.roundId && item.variantGroupId === selectedVariantGroup.id! && item.itemId === selectedItem.id!);
    const currentQuantityInCart = itemInCart ? itemInCart.quantity : 0;
    const newTotalQuantity = currentQuantityInCart + quantityToAdd;
    if (selectedItem.limitQuantity != null && newTotalQuantity > selectedItem.limitQuantity) {
      toast.error(`1인당 최대 구매 수량은 ${selectedItem.limitQuantity}개 입니다.\n현재 장바구니에 ${currentQuantityInCart}개 담겨 있습니다.`); return;
    }
    if (selectedItem.stock !== -1 && newTotalQuantity > selectedItem.stock) {
      toast.error(`재고가 부족합니다. 현재 ${selectedItem.stock}개만 구매 가능합니다.`); return;
    }
    const isStockAvailable = await checkProductAvailability(product.id, displayRound.roundId, selectedVariantGroup.id!, selectedItem.id!);
    if (!isStockAvailable) {
      toast.error(`재고가 부족하여 장바구니에 담을 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.`); return;
    }
    const itemToAdd: CartItem = {
      productId: product.id, productName: product.groupName, roundId: displayRound.roundId,
      variantGroupId: selectedVariantGroup.id!, variantGroupName: selectedVariantGroup.groupName, itemId: selectedItem.id!,
      selectedUnit: selectedItem.name, unitPrice: selectedItem.price, quantity: quantityToAdd, imageUrl: product.imageUrls?.[0] ?? '',
      maxOrderPerPerson: selectedItem.limitQuantity ?? null, availableStock: selectedItem.stock,
      salesType: (selectedVariantGroup.totalPhysicalStock === null || selectedVariantGroup.totalPhysicalStock === -1) ? 'PRE_ORDER_UNLIMITED' : 'IN_STOCK',
      stockDeductionAmount: selectedItem.stockDeductionAmount, totalPhysicalStock: selectedVariantGroup.totalPhysicalStock, stockUnitType: selectedVariantGroup.stockUnitType
    };
    addToCart(itemToAdd);
    toast.success(`${product.groupName} ${quantityToAdd}개를 장바구니에 담았습니다.`);
    onClose();
  }, [product, displayRound, selectedVariantGroup, selectedItem, quantity, cartItems, addToCart, navigate, user, onClose]);

  const handleEncoreRequest = useCallback(async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); navigate('/login'); onClose(); return; }
    if (!product) return;
    if (userAlreadyRequestedEncore) { toast('이미 앵콜을 요청한 상품입니다.', { icon: '👏' }); return; }
    await toast.promise(requestEncore(product.id).then(() => { setEncoreCount(prev => prev + 1); }), { loading: '앵콜 요청 중...', success: '앵콜 요청이 접수되었습니다!', error: '앵콜 요청에 실패했습니다.', });
  }, [product, user, userAlreadyRequestedEncore, requestEncore, navigate, onClose]);

  const changeImage = useCallback((direction: 'prev' | 'next') => {
    if (!product?.imageUrls || product.imageUrls.length <= 1) return;
    const totalImages = product.imageUrls.length;
    setCurrentImageIndex(prev => (direction === 'next' ? (prev + 1) % totalImages : (prev - 1 + totalImages) % totalImages));
  }, [product]);

  const handleOptionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
    const [vgIndexStr, itemIndexStr] = e.target.value.split(':');
    const vgIndex = parseInt(vgIndexStr, 10);
    const itemIndex = parseInt(itemIndexStr, 10);

    if (displayRound?.variantGroups && !isNaN(vgIndex) && !isNaN(itemIndex)) {
        const foundVg = displayRound.variantGroups[vgIndex];
        if (foundVg) {
            const foundItem = foundVg.items[itemIndex];
            if (foundItem) {
                setSelectedVariantGroup(foundVg);
                setSelectedItem(foundItem);
                setQuantity(1);
                toast(`${foundItem.name} 옵션으로 변경되었습니다.`, { icon: '✨', duration: 2000 });
            }
        }
    }
  }, [displayRound]);

  const openImageModal = () => setIsImageModalOpen(true);
  const closeImageModal = () => setIsImageModalOpen(false);

  if (!isOpen) return null;
  
  const renderContent = () => {
    if (loading) {
      return <ProductDetailSkeleton />;
    }
    
    if (error || !product || !displayRound) {
      return (
        <div className="error-message-modal">
          <AlertCircle className="error-icon" />
          <p>{error ?? '상품 정보를 불러올 수 없습니다.'}</p>
          <button onClick={onClose} className="error-close-btn">닫기</button>
        </div>
      );
    }
    
    const soldOutMessage = displayRound.status === 'sold_out' ? '품절' : '판매 종료';
    
    const currentOptionData = allAvailableOptions.find(opt => opt.vg === selectedVariantGroup && opt.item === selectedItem);
    const selectedValue = currentOptionData ? `${currentOptionData.vgIndex}:${currentOptionData.itemIndex}` : '';

    const isStockLimited = selectedItem?.stock !== -1;
    const isStockExceeded = isStockLimited && quantity >= (selectedItem?.stock ?? 0);
    const isLimitReached = selectedItem?.limitQuantity != null && quantity >= selectedItem.limitQuantity;
    const isPlusButtonDisabled = isStockExceeded || isLimitReached;

    return (
      <>
        <div className="main-content-area">
          <div className="image-gallery-wrapper">
            <div className="image-gallery">
              <img src={getOptimizedImageUrl(product.imageUrls[currentImageIndex] || `https://placehold.co/1080x1080?text=No+Image`, '1080x1080')} alt={`${product.groupName} 이미지 ${currentImageIndex + 1}`} onClick={openImageModal} />
              {product.imageUrls.length > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); changeImage('prev'); }} className="image-nav-btn prev"><ChevronLeft size={28} /></button>
                  <button onClick={(e) => { e.stopPropagation(); changeImage('next'); }} className="image-nav-btn next"><ChevronRight size={28} /></button>
                  <div className="image-indicator">{currentImageIndex + 1} / {product.imageUrls.length}</div>
                </>
              )}
            </div>
          </div>
          <div className="product-info-area">
            <div className="product-info-header">
              <h1 className="product-name">{product.groupName}</h1>
              {product.description && <p className="product-description">{product.description}</p>}
            </div>
            <div className="product-key-info">
              <div className="info-row">
                <span className="info-label"><Tag size={14}/> 판매 회차</span>
                <div className="info-value"><span className="round-name-badge">{displayRound.roundName}</span></div>
              </div>
              {displayRound.pickupDate && 
                <div className="info-row">
                  <span className="info-label"><CalendarDays size={14}/> 픽업 시작</span>
                  <div className="info-value">{formatDateWithDay(displayRound.pickupDate.toDate())}</div>
                </div>
              }
              {selectedItem?.expirationDate && 
                <div className="info-row">
                  <span className="info-label"><AlertTriangle size={14}/> 유통 기한</span>
                  <div className="info-value expiration-date">{formatDateWithYear(selectedItem.expirationDate.toDate())}</div>
                </div>
              }
              <div className="info-row">
                <span className="info-label">{storageIcons[product.storageType]} 보관 방법</span>
                <div className={`info-value storage-type-${product.storageType}`}>{storageLabels[product.storageType]}</div>
              </div>
              {isSingleItemProduct && selectedItem && selectedItem.stockDeductionAmount === 1 && (
                <div className="info-row">
                  <span className="info-label"><Archive size={14}/> 남은 수량</span>
                  {selectedItem.stock === -1 ? (
                      <div className="info-value unlimited-stock"><InfinityIcon size={16} /> 재고 무제한</div>
                  ) : (
                      <div className="info-value limited-stock-value">🔥 {selectedItem.stock} {selectedVariantGroup?.stockUnitType}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="purchase-controls-section">
          {!isSingleItemProduct && (
            <section className="product-purchase-options">
              <div className="select-wrapper">
                <select className="price-select" value={selectedValue} onChange={handleOptionChange}>
                  {allAvailableOptions.map(option => {
                      let stockText = '';
                      if (option.item.stockDeductionAmount === 1) {
                          if (option.item.stock === -1 || option.item.stock === null) {
                              stockText = ' (재고 무제한)';
                          } else {
                              stockText = ` (잔여: ${option.item.stock}개)`;
                          }
                      }
                      return (<option key={`${option.vgIndex}-${option.itemIndex}`} value={`${option.vgIndex}:${option.itemIndex}`}>
                          {`${option.vg.groupName} - ${option.item.name} (${formatPrice(option.item.price)})`}{stockText}
                      </option>);
                  })}
                </select>
              </div>
            </section>
          )}
          <div className="product-purchase-footer">
            {availableForPurchase ? (
              <>
                <div className="quantity-controls-footer">
                  <button onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}>-</button>
                  <span>{quantity}</span>
                  <button onClick={() => handleQuantityChange(1)} disabled={isPlusButtonDisabled}>+</button>
                </div>
                <div className="price-and-cart-wrapper">
                  <span className="footer-total-price">{formatPrice(currentTotalPrice)}</span>
                  <button className="add-to-cart-btn-main" onClick={handleAddToCart}><ShoppingCart size={20} /><span>담기</span></button>
                </div>
              </>
            ) : showEncoreRequestButton ? (
                <div className="encore-wrapper">
                  <span className="encore-request-count"><Volume2 size={16} /> 앵콜 요청 {encoreCount}건</span>
                  <button className="encore-request-btn" onClick={handleEncoreRequest} disabled={userAlreadyRequestedEncore || encoreLoading}>
                    {encoreLoading ? '요청 중...' : userAlreadyRequestedEncore ? '앵콜 요청 완료' : '앵콜 요청'}
                  </button>
                </div>
            ) : (
              <button className="sold-out-btn-main" disabled><span>{isScheduled ? '상품 준비 중' : soldOutMessage}</span></button>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="product-detail-modal-overlay" onClick={onClose}>
        <div className="product-detail-modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close-btn-top" onClick={onClose}><X size={24} /></button>
          {renderContent()}
        </div>
        {!loading && !error && product && isImageModalOpen && (
          <div className="image-lightbox-overlay" onClick={closeImageModal}>
            <button className="modal-close-btn-lightbox" onClick={closeImageModal}><X size={36} /></button>
            <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
                <img src={getOptimizedImageUrl(product.imageUrls[currentImageIndex] || '', '1080x1080')} alt={`${product.groupName} 이미지 ${currentImageIndex + 1} (확대)`} />
                {product.imageUrls.length > 1 && (
                  <>
                      <button onClick={(e) => { e.stopPropagation(); changeImage('prev'); }} className="image-nav-btn-lightbox prev"><ChevronLeft size={48} /></button>
                      <button onClick={(e) => { e.stopPropagation(); changeImage('next'); }} className="image-nav-btn-lightbox next"><ChevronRight size={48} /></button>
                      <div className="image-indicator-lightbox">{currentImageIndex + 1} / {product.imageUrls.length}</div>
                  </>
                )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ProductDetailPage;