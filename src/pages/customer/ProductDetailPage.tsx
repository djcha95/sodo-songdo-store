import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product, PricingOption, CartItem, StorageType } from '@/types';
import { getProductById } from '@/firebase';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
// [추가] useSelection 훅을 import 합니다.
import { useSelection } from '@/context/SelectionContext';
import {
  ShoppingCart,
  ChevronLeft, ChevronRight, X, CalendarDays, Package, Sun, Snowflake, Tags
} from 'lucide-react';
import './ProductDetailPage.css';

const formatPrice = (price: number) => `${price.toLocaleString()}원`;
const formatDate = (date: Date) => date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\s/g, '');
const formatDateWithDay = (date: Date) => {
  const options: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', weekday: 'short' };
  return date.toLocaleDateString('ko-KR', options).replace(/\s/g, '');
};

const storageIcons: Record<StorageType, JSX.Element> = {
  ROOM: <Sun size={16} />,
  CHILLED: <Snowflake size={16} />,
  FROZEN: <Snowflake size={16} />,
};

const storageLabels: Record<StorageType, string> = {
  ROOM: '실온',
  CHILLED: '냉장',
  FROZEN: '냉동',
};

const specialLabelMapping: Record<string, string> = {
  'POPULAR': '인기 상품',
  'LIMITED': '한정판',
  'EVENT': '이벤트',
  'BEST': '베스트',
};

interface ProductDetailPageProps {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ productId, isOpen, onClose }) => {
  const navigate = useNavigate();
  const { cartItems = [], addToCart } = useCart();
  const { user } = useAuth();
  // [추가] SelectionContext의 함수들을 가져옵니다.
  const { getSelectionQuantity, updateSelectionQuantity } = useSelection();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<PricingOption | null>(null);
  // [제거] 로컬 quantity state를 제거합니다.
  // const [quantity, setQuantity] = useState(1);
  const [currentTotalPrice, setCurrentTotalPrice] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  
  // [추가] 현재 선택된 수량을 Context에서 가져옵니다.
  const quantity = (product && selectedOption) 
    ? getSelectionQuantity(product.id, selectedOption.unit) || 1 
    : 1;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!productId) {
        setError('상품 ID가 없습니다.'); setLoading(false); return;
      }
      setLoading(true); setError(null);
      try {
        const fetchedProduct = await getProductById(productId);
        if (fetchedProduct) {
          setProduct(fetchedProduct);
          setCurrentImageIndex(0);
          
          const initialOption = fetchedProduct.pricingOptions[0] || null;
          setSelectedOption(initialOption);
          // [제거] 로컬 quantity state 초기화 로직 제거
        } else {
          setError('상품을 찾을 수 없습니다.');
        }
      } catch (err) {
        console.error('상품 상세 정보 로딩 오류:', err);
        setError('상품 정보를 불러오는 데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    if (productId && isOpen) { fetchProduct(); }
  }, [productId, isOpen]);

  useEffect(() => {
    if (selectedOption) {
      setCurrentTotalPrice(selectedOption.price * quantity);
    } else {
      setCurrentTotalPrice(0);
    }
  }, [selectedOption, quantity]);
  
  const handleQuantityChange = useCallback((amount: number) => {
    if (!product || !selectedOption) return;

    const currentQuantity = getSelectionQuantity(product.id, selectedOption.unit) || 1;
    let newQuantity = currentQuantity + amount;

    if (newQuantity < 1) newQuantity = 1;

    if (product.maxOrderPerPerson != null && newQuantity > product.maxOrderPerPerson) {
      alert(`1인당 최대 구매 수량은 ${product.maxOrderPerPerson}개 입니다.`);
      newQuantity = product.maxOrderPerPerson;
    }

    if (product.salesType === 'IN_STOCK' && product.stock !== -1 && newQuantity > product.stock) {
      alert(`재고가 부족합니다. 현재 남은 수량은 ${product.stock}개 입니다.`);
      newQuantity = product.stock;
    }
    
    updateSelectionQuantity(product.id, selectedOption.unit, newQuantity);
  }, [product, selectedOption, getSelectionQuantity, updateSelectionQuantity]);

  const handleAddToCart = useCallback(() => {
    if (!user) {
      alert("로그인이 필요한 서비스입니다."); onClose(); navigate('/login'); return;
    }
    if (!product || !selectedOption) {
      alert('상품 정보 또는 옵션이 올바르지 않습니다.'); return;
    }

    // [수정] Context에서 최종 수량을 가져옵니다.
    const quantityToUpdate = getSelectionQuantity(product.id, selectedOption.unit) || 1;
    
    const itemInCart = cartItems.find(
        item => item.productId === product.id && item.selectedUnit === selectedOption.unit
    );
    const currentQuantityInCart = itemInCart ? itemInCart.quantity : 0;
    const newTotalQuantity = currentQuantityInCart + quantityToUpdate;
    
    if (product.maxOrderPerPerson != null && newTotalQuantity > product.maxOrderPerPerson) {
        alert(`1인당 최대 구매 수량은 ${product.maxOrderPerPerson}개 입니다. 현재 장바구니에 ${currentQuantityInCart}개 담겨 있습니다.`);
        return;
    }
  
    if (product.salesType === 'IN_STOCK' && product.stock !== -1 && newTotalQuantity > product.stock) {
        alert(`재고가 부족합니다. 현재 남은 수량은 ${product.stock}개이며, 장바구니에 이미 ${currentQuantityInCart}개 있습니다.`);
        return;
    }

    const itemToAdd: CartItem = {
      productId: product.id, productName: product.name, selectedUnit: selectedOption.unit,
      unitPrice: selectedOption.price, quantity: quantityToUpdate,
      imageUrl: product.imageUrls[0] || '', maxOrderPerPerson: product.maxOrderPerPerson ?? null,
      availableStock: product.stock, salesType: product.salesType,
    };
  
    addToCart(itemToAdd);
    alert(`${product.name} 상품이 장바구니에 ${quantityToUpdate}개 추가되었습니다.`);
    onClose();
  }, [product, selectedOption, quantity, addToCart, navigate, user, onClose, cartItems, getSelectionQuantity]);

  const changeImage = (direction: 'prev' | 'next') => {
    if (!product || product.imageUrls.length <= 1) return;
    if (direction === 'next') {
      setCurrentImageIndex(prev => (prev === product.imageUrls.length - 1 ? 0 : prev + 1));
    } else {
      setCurrentImageIndex(prev => (prev === 0 ? product.imageUrls.length - 1 : prev - 1));
    }
  };

  const handleOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSelectedUnit = e.target.value;
    const newOption = product?.pricingOptions.find(opt => opt.unit === newSelectedUnit) || null;
    setSelectedOption(newOption);
    // [제거] 옵션 변경 시 수량을 1로 초기화하는 로직 제거. 이제 각 옵션별 수량이 유지됩니다.
  }
  
  const openImageModal = () => setIsImageModalOpen(true);
  const closeImageModal = () => setIsImageModalOpen(false);

  if (!isOpen) return null;
  if (loading) return <div className="product-detail-modal-overlay"><div className="loading-message-modal">로딩 중...</div></div>;
  if (error || !product) return <div className="product-detail-modal-overlay"><div className="error-message-modal">{error || '상품 정보를 불러올 수 없습니다.'}</div></div>;

  const isSoldOutDisplay = (product.salesType === 'IN_STOCK' && product.stock === 0) || product.status === 'sold_out';

  const showPurchaseControls = !(
    (product.status === 'scheduled' && product.publishAt && product.publishAt.toDate() > new Date()) ||
    product.status === 'ended' || isSoldOutDisplay ||
    (product.deadlineDate && new Date() > product.deadlineDate.toDate() && product.stock === 0 && !['PRE_ORDER_UNLIMITED'].includes(product.salesType))
  );

  const keyDate = product.pickupDate || product.arrivalDate;
  const keyDateLabel = product.pickupDate ? '픽업일' : '입고일';
  const showOptions = product.pricingOptions && product.pricingOptions.length > 1;
  const hasLabels = product.specialLabels && product.specialLabels.length > 0;

  return (
    <div className="product-detail-modal-overlay" onClick={onClose}>
      <div className="product-detail-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn-top" onClick={onClose}><X size={24} /></button>
        
        <div className="main-content-area">
          <div className="image-gallery-wrapper">
            <div className="image-gallery">
              <img key={currentImageIndex} src={product.imageUrls[currentImageIndex]} alt={`${product.name} 이미지 ${currentImageIndex + 1}`} onClick={openImageModal}/>
              {product.imageUrls.length > 1 && (
                <>
                  <button onClick={(e) => {e.stopPropagation(); changeImage('prev')}} className="image-nav-btn prev"><ChevronLeft size={28} /></button>
                  <button onClick={(e) => {e.stopPropagation(); changeImage('next')}} className="image-nav-btn next"><ChevronRight size={28} /></button>
                  <div className="image-indicator">{currentImageIndex + 1} / {product.imageUrls.length}</div>
                </>
              )}
              {isSoldOutDisplay && <div className="sold-out-overlay">SOLD OUT</div>}
            </div>
          </div>

          <div className="product-info-area">
            <div className="product-info-header">
                <h1 className="product-name">{product.name}</h1>
                <p className="product-description">{product.description || "상세 설명이 없습니다."}</p>
            </div>
            
            <div className="product-meta-info">
                {product.isNew && <div className="info-item new-label"><Package size={16} /><span>신상품</span></div>}
                <div className={`info-item storage-type-${product.storageType}`}>{storageIcons[product.storageType]}<span>{storageLabels[product.storageType]}</span></div>
                {product.expirationDate && <div className="info-item"><CalendarDays size={16} /><span>유통기한: {formatDate(product.expirationDate.toDate())}</span></div>}
                {keyDate && <div className="info-item key-date-item"><CalendarDays size={16} /><span>{keyDateLabel}: {formatDateWithDay(keyDate.toDate())}</span></div>}
                {hasLabels && product.specialLabels?.map(label => (<div key={label} className="info-item special-label"><Tags size={16} /><span>{specialLabelMapping[label] || label}</span></div>))}
            </div>

            <hr className="section-divider" />
            
            <div className="purchase-controls-section">
                {showOptions && (
                    <section className="product-purchase-options">
                        <label className="option-label">가격 옵션</label>
                        <div className="select-wrapper">
                            <select className="price-select" value={selectedOption?.unit || ''} onChange={handleOptionChange}>
                            {product.pricingOptions.map((option) => (
                                <option key={option.unit} value={option.unit}>{option.unit} ({formatPrice(option.price)})</option>
                            ))}
                            </select>
                        </div>
                    </section>
                )}
                <div className="product-purchase-footer">
                    {showPurchaseControls && (
                        <>
                        <div className="quantity-controls-footer">
                            <button onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}>-</button>
                            <span>{quantity}</span>
                            <button onClick={() => handleQuantityChange(1)} disabled={
                                (product.salesType === 'IN_STOCK' && product.stock !== -1 && quantity >= product.stock) ||
                                (product.maxOrderPerPerson != null && quantity >= product.maxOrderPerPerson)
                            }>+</button>
                        </div>
                        <div className="price-and-cart-wrapper">
                            <span className="footer-total-price">{formatPrice(currentTotalPrice)}</span>
                            <button className="add-to-cart-btn-main" onClick={handleAddToCart} disabled={!selectedOption || isSoldOutDisplay}>
                                <ShoppingCart size={20} /><span>담기</span>
                            </button>
                        </div>
                        </>
                    )}
                    {!showPurchaseControls && (
                        <button className="sold-out-btn-main" disabled>
                            <span>상품 준비 중 / 판매 종료</span>
                        </button>
                    )}
                </div>
            </div>
          </div>
        </div>
      </div>
      
      {isImageModalOpen && (
        <div className="image-lightbox-overlay" onClick={closeImageModal}>
          <button className="modal-close-btn-lightbox" onClick={closeImageModal}><X size={36} /></button>
          <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={product.imageUrls[currentImageIndex]} alt={`${product.name} 이미지 ${currentImageIndex + 1} (확대)`} />
            {product.imageUrls.length > 1 && (
              <>
                <button onClick={(e) => {e.stopPropagation(); changeImage('prev')}} className="image-nav-btn-lightbox prev"><ChevronLeft size={48} /></button>
                <button onClick={(e) => {e.stopPropagation(); changeImage('next')}} className="image-nav-btn-lightbox next"><ChevronRight size={48} /></button>
              </>
            )}
            <div className="image-indicator-lightbox">{currentImageIndex + 1} / {product.imageUrls.length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetailPage;