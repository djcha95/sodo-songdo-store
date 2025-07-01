// src/pages/customer/ProductDetailPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product, PricingOption, CartItem, StorageType } from '@/types';
import { getProductById } from '@/firebase';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useSelection } from '@/context/SelectionContext';
import { useEncoreRequest } from '@/context/EncoreRequestContext';
import {
  ShoppingCart,
  ChevronLeft, ChevronRight, X, CalendarDays, Package, Sun, Snowflake, Tags, Volume2,
} from 'lucide-react';
import './ProductDetailPage.css';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/firebase';
import NotificationModal from '@/components/NotificationModal';


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
  const { getSelectionQuantity, updateSelectionQuantity } = useSelection();
  const { hasRequestedEncore, requestEncore, loading: encoreLoading } = useEncoreRequest();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<PricingOption | null>(null);
  const [currentTotalPrice, setCurrentTotalPrice] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [encoreCount, setEncoreCount] = useState<number>(0);
  
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState({ title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

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
          setEncoreCount(fetchedProduct.encoreCount || 0);

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
      setNotificationMessage({ title: '수량 초과', message: `1인당 최대 구매 수량은 ${product.maxOrderPerPerson}개 입니다.`, type: 'error' });
      setIsNotificationModalOpen(true);
      newQuantity = product.maxOrderPerPerson;
    }

    if (product.salesType === 'IN_STOCK' && product.stock !== -1 && newQuantity > product.stock) {
      setNotificationMessage({ title: '재고 부족', message: `재고가 부족합니다. 현재 남은 수량은 ${product.stock}개 입니다.`, type: 'error' });
      setIsNotificationModalOpen(true);
      newQuantity = product.stock;
    }
    
    updateSelectionQuantity(product.id, selectedOption.unit, newQuantity);
  }, [product, selectedOption, getSelectionQuantity, updateSelectionQuantity]);

  const handleAddToCart = useCallback(() => {
    if (!user) {
      setNotificationMessage({ title: '로그인 필요', message: '로그인이 필요한 서비스입니다.\n로그인 페이지로 이동합니다.', type: 'info' });
      setIsNotificationModalOpen(true);
      setTimeout(() => { onClose(); navigate('/login'); }, 1500);
      return;
    }
    if (!product || !selectedOption) {
      setNotificationMessage({ title: '오류', message: '상품 정보 또는 옵션이 올바르지 않습니다.', type: 'error' });
      setIsNotificationModalOpen(true);
      return;
    }

    const quantityToUpdate = getSelectionQuantity(product.id, selectedOption.unit) || 1;
    
    const itemInCart = cartItems.find(
        item => item.productId === product.id && item.selectedUnit === selectedOption.unit
    );
    const currentQuantityInCart = itemInCart ? itemInCart.quantity : 0;
    const newTotalQuantity = currentQuantityInCart + quantityToUpdate;
    
    if (product.maxOrderPerPerson != null && newTotalQuantity > product.maxOrderPerPerson) {
        setNotificationMessage({ title: '수량 초과', message: `1인당 최대 구매 수량은 ${product.maxOrderPerPerson}개 입니다.\n현재 장바구니에 ${currentQuantityInCart}개 담겨 있습니다.`, type: 'error' });
        setIsNotificationModalOpen(true);
        return;
    }
  
    if (product.salesType === 'IN_STOCK' && product.stock !== -1 && newTotalQuantity > product.stock) {
        setNotificationMessage({ title: '재고 부족', message: `재고가 부족합니다.\n현재 남은 수량은 ${product.stock}개이며, 장바구니에 이미 ${currentQuantityInCart}개 있습니다.`, type: 'error' });
        setIsNotificationModalOpen(true);
        return;
    }

    const itemToAdd: CartItem = {
      productId: product.id, productName: product.name, selectedUnit: selectedOption.unit,
      unitPrice: product.pricingOptions?.[0]?.price || 0, // [수정] selectedOption 대신 product.pricingOptions 사용 (selectedOption이 null일 가능성 대비)
      quantity: quantityToUpdate,
      imageUrl: product.imageUrls[0] || '', maxOrderPerPerson: product.maxOrderPerPerson ?? null,
      availableStock: product.stock, salesType: product.salesType,
    };
  
    addToCart(itemToAdd);
    setNotificationMessage({ title: '장바구니 추가 완료', message: `${product.name} 상품이 장바구니에 ${quantityToUpdate}개 추가되었습니다.`, type: 'success' });
    setIsNotificationModalOpen(true);
    onClose();
  }, [product, selectedOption, quantity, addToCart, navigate, user, onClose, cartItems, getSelectionQuantity]); // [수정] selectedOption을 의존성 배열에 추가

  const handleEncoreRequest = useCallback(async () => {
      if (!user) {
        setNotificationMessage({ title: '로그인 필요', message: '앵콜 요청을 위해 로그인이 필요합니다.\n로그인 페이지로 이동합니다.', type: 'info' });
        setIsNotificationModalOpen(true);
        setTimeout(() => { onClose(); navigate('/login'); }, 1500);
        return;
      }
      if (!product) return;
      if (hasRequestedEncore(product.id)) {
        setNotificationMessage({ title: '이미 요청됨', message: '이미 이 상품에 대한 앵콜을 요청했습니다.', type: 'info' });
        setIsNotificationModalOpen(true);
        return;
      }
      try {
          await requestEncore(product.id);
          // 요청 성공 시, Firestore에서 최신 encoreCount를 다시 불러와 UI 업데이트
          const updatedProductDoc = await getDoc(doc(db, 'products', product.id));
          if (updatedProductDoc.exists()) {
              setEncoreCount(updatedProductDoc.data().encoreCount || 0);
          }
          setNotificationMessage({ title: '요청 완료!', message: '앵콜 요청이 성공적으로 접수되었습니다. 감사합니다!', type: 'success' });
          setIsNotificationModalOpen(true);
      } catch (error) {
          setNotificationMessage({ title: '요청 실패', message: '앵콜 요청에 실패했습니다. 다시 시도해 주세요.', type: 'error' });
          setIsNotificationModalOpen(true);
      }
  }, [product, user, hasRequestedEncore, requestEncore, navigate, onClose]);


  const changeImage = useCallback((direction: 'prev' | 'next') => {
    if (!product || !product.imageUrls || product.imageUrls.length <= 1) return;
    const totalImages = product.imageUrls.length;
    if (direction === 'next') {
      setCurrentImageIndex(prev => (prev === totalImages - 1 ? 0 : prev + 1));
    } else {
      setCurrentImageIndex(prev => (prev === 0 ? totalImages - 1 : prev - 1));
    }
  }, [product]);

  const handleOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSelectedUnit = e.target.value;
    const newOption = product?.pricingOptions.find(opt => opt.unit === newSelectedUnit) || null;
    setSelectedOption(newOption);
  }
  
  const openImageModal = () => setIsImageModalOpen(true);
  const closeImageModal = () => setIsImageModalOpen(false);

  if (!isOpen) return null;
  if (loading) return <div className="product-detail-modal-overlay"><div className="loading-message-modal">로딩 중...</div></div>;
  if (error || !product) return <div className="product-detail-modal-overlay"><div className="error-message-modal">{error || '상품 정보를 불러올 수 없습니다.'}</div></div>;

  const isSoldOutDisplay = (product.salesType === 'IN_STOCK' && product.stock === 0) || product.status === 'sold_out';
  const isPurchaseEnded = product.status === 'ended' || (product.deadlineDate && new Date() > product.deadlineDate.toDate());
  const isScheduled = product.status === 'scheduled' && product.publishAt && product.publishAt.toDate() > new Date();
  
  const showPurchaseControls = !isScheduled && !isPurchaseEnded && !isSoldOutDisplay;
  const showEncoreRequestButton = isPurchaseEnded || isSoldOutDisplay;
  const userHasRequestedEncore = user ? hasRequestedEncore(product.id) : false;

  const keyDate = product.pickupDate || product.arrivalDate;
  const keyDateLabel = product.pickupDate ? '픽업일' : '입고일';
  const showOptions = product.pricingOptions && product.pricingOptions.length > 1;
  const hasLabels = product.specialLabels && product.specialLabels.length > 0;

  return (
    <>
      <div className="product-detail-modal-overlay" onClick={onClose}>
        <div className="product-detail-modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close-btn-top" onClick={onClose}><X size={24} /></button>
          
          <div className="main-content-area">
            <div className="image-gallery-wrapper">
              <div className="image-gallery">
                {/* [수정] 이미지 전환 애니메이션을 위해 key 속성 제거 또는 CSS transition 활용 */}
                {/* ProductDetailPage.css에서 opacity transition이 이미 적용되어 있으므로 별도의 key는 불필요 */}
                <img src={product.imageUrls[currentImageIndex]} alt={`${product.name} 이미지 ${currentImageIndex + 1}`} onClick={openImageModal}/>
                {product.imageUrls.length > 1 && (
                  <>
                    {/* [수정] onClick에 e.stopPropagation() 추가 및 changeImage 호출 */}
                    <button onClick={(e) => {e.stopPropagation(); changeImage('prev')}} className="image-nav-btn prev"><ChevronLeft size={28} /></button>
                    <button onClick={(e) => {e.stopPropagation(); changeImage('next')}} className="image-nav-btn next"><ChevronRight size={28} /></button>
                    <div className="image-indicator">{currentImageIndex + 1} / {product.imageUrls.length}</div>
                  </>
                )}
                {/* [삭제] 상품 이미지 위에 'SOLD OUT' 또는 '마감' 오버레이 표시 로직 제거 */}
                {/* isSoldOutDisplay && <div className="sold-out-overlay">SOLD OUT</div> */}
                {/* isPurchaseEnded && !isSoldOutDisplay && <div className="sold-out-overlay">마감</div> */}
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
                      {showPurchaseControls ? (
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
                      ) : (
                          showEncoreRequestButton ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                  <div style={{ textAlign: 'center' }}>
                                      <span className="encore-request-count">
                                          <Volume2 size={16} style={{ color: '#d92529' }} /> 앵콜 요청 {encoreCount}건
                                      </span>
                                  </div>
                                  <button
                                      className="encore-request-btn"
                                      onClick={handleEncoreRequest}
                                      disabled={userHasRequestedEncore || encoreLoading}
                                  >
                                      {encoreLoading ? '요청 중...' : (userHasRequestedEncore ? '앵콜 요청 완료' : <><Volume2 size={20} /><span>앵콜 요청</span></>)}
                                  </button>
                              </div>
                          ) : (
                              <button className="sold-out-btn-main" disabled>
                                  <span>{isScheduled ? '상품 준비 중' : '판매 종료'}</span>
                              </button>
                          )
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
              {/* [수정] 이미지 전환 애니메이션을 위해 key 속성 제거 또는 CSS transition 활용 */}
              {/* ProductDetailPage.css에서 opacity transition이 이미 적용되어 있으므로 별도의 key는 불필요 */}
              <img src={product.imageUrls[currentImageIndex]} alt={`${product.name} 이미지 ${currentImageIndex + 1} (확대)`} />
              {product.imageUrls.length > 1 && (
                <>
                  {/* [수정] onClick에 e.stopPropagation() 추가 및 changeImage 호출 */}
                  <button onClick={(e) => {e.stopPropagation(); changeImage('prev')}} className="image-nav-btn-lightbox prev"><ChevronLeft size={48} /></button>
                  <button onClick={(e) => {e.stopPropagation(); changeImage('next')}} className="image-nav-btn-lightbox next"><ChevronRight size={48} /></button>
                </>
              )}
              <div className="image-indicator-lightbox">{currentImageIndex + 1} / {product.imageUrls.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* [추가] NotificationModal 컴포넌트 렌더링 */}
      <NotificationModal 
        isOpen={isNotificationModalOpen}
        title={notificationMessage.title}
        message={notificationMessage.message}
        type={notificationMessage.type}
        onClose={() => setIsNotificationModalOpen(false)}
      />
    </>
  );
};

export default ProductDetailPage;