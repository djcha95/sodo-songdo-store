// src/pages/admin/ProductAddAdminPage.tsx (수정안)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { addProduct, getCategories } from '../../firebase';
import type { Product, PricingOption, SalesType, Category, PreviewProduct, StorageType } from '../../types';
import ProductPreviewModal from './ProductPreviewModal';

// Lucide React 아이콘들
import {
  Edit3, DollarSign, Image as ImageIcon, Tag, Calendar,
  CheckCircle, Clock, Save, PlusCircle, X, Camera, Eye, Check, Minus, FileText, Loader, Info
} from 'lucide-react';
import './ProductAddAdminPage.css';

// ==========================================================
// 헬퍼 함수 및 컴포넌트 정의
// ==========================================================

interface EditablePricingOption extends PricingOption {
  id: number;
}

// [수정] 판매 방식 용어 변경 및 설명 구체화
const salesTypeOptions: { key: SalesType; name: string; description: string; }[] = [
  { key: 'PRE_ORDER_UNLIMITED', name: '일반 예약 판매', description: '수량 제한 없이 기간 내 주문을 받아 판매합니다.' },
  { key: 'IN_STOCK', name: '재고 한정 예약 판매', description: '설정한 예약 가능 수량만큼만 판매합니다.' },
];

const storageTypeOptions: { key: StorageType; name: string; color: string; rgb: string; }[] = [
  { key: 'ROOM', name: '실온', color: '#343a40', rgb: '52, 58, 64' },
  { key: 'FROZEN', name: '냉동', color: '#007bff', rgb: '0, 123, 255' },
  { key: 'CHILLED', name: '냉장', color: '#dc3545', rgb: '220, 53, 69' },
];

const availableLabels = [
  { key: 'LIMITED', name: '수량 한정' },
  { key: 'POPULAR', name: '인기 상품' },
  { key: 'EVENT', name: '이벤트 특가' },
  { key: 'NEW', name: '신상품' },
];

const formatToDateTimeLocal = (date: Date | null): string => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatToDate = (date: Date | null): string => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SectionCard = ({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) => (
  <div className="section-card">
    <div className="section-card-header">
      <h3>{icon}{title}</h3>
    </div>
    <div className="section-card-body">{children}</div>
  </div>
);

const LoadingSpinner = () => (
    <div className="loading-overlay">
        <Loader size={48} className="spin" />
        <p>잠시만 기다려 주세요...</p>
    </div>
);

const MessageBanner = ({ message, type }: { message: string | null, type: 'error' | 'success' | 'info' }) => {
    if (!message) return null;
    return (
        <div className={`message-banner ${type}-message-banner`}>
            {type === 'error' && <X size={16} className="icon"/>}
            {type === 'success' && <Check size={16} className="icon"/>}
            {type === 'info' && <Info size={16} className="icon"/>}
            <span>{message}</span>
        </div>
    );
};

// ==========================================================
// ProductAddAdminPage 메인 컴포넌트
// ==========================================================

const ProductAddAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 상품 정보 상태
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pricingOptions, setPricingOptions] = useState<EditablePricingOption[]>([
    { id: Date.now(), unit: '1개', price: 10000 }
  ]);
  const [selectedSalesType, setSelectedSalesType] = useState<SalesType>('PRE_ORDER_UNLIMITED');
  const [initialStock, setInitialStock] = useState<number | ''>('');
  const [maxOrderPerPerson, setMaxOrderPerPerson] = useState<number | ''>('');
  const [specialLabels, setSpecialLabels] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [publishOption, setPublishOption] = useState<'draft' | 'now' | 'schedule'>('now');
  const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM'); 

  // 날짜/시간 관련 상태
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const now = new Date();
    now.setHours(13, 0, 0, 0);
    return now;
  });

  const [deadlineDate, setDeadlineDate] = useState<Date | null>(() => {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);
    nextDay.setHours(13, 0, 0, 0);
    return nextDay;
  });

  const [pickupDay, setPickupDay] = useState<Date | null>(() => {
    const defaultPickupDate = new Date();
    defaultPickupDate.setDate(defaultPickupDate.getDate() + 7);
    return defaultPickupDate;
  });

  const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);

  // 카테고리 상태
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);

  // UI/로딩/에러 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // 카테고리 데이터 불러오기
  useEffect(() => {
    const fetchCategoriesData = async () => {
      setLoadingCategories(true);
      setCategoryLoadError(null);
      try {
        const fetchedCategories = await getCategories();
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("카테고리 불러오기 오류:", err);
        setCategoryLoadError("카테고리 정보를 불러오는 데 실패했습니다.");
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCategoriesData();
  }, []);

  // 메인 카테고리 선택에 따른 하위 카테고리 업데이트
  useEffect(() => {
    if (selectedMainCategory) {
      const category = categories.find((cat: Category) => cat.id === selectedMainCategory);
      setAvailableSubCategories(category ? category.subCategories : []);
      setSelectedSubCategory('');
    } else {
      setAvailableSubCategories([]);
      setSelectedSubCategory('');
    }
  }, [selectedMainCategory, categories]);

  // 픽업일 변경 시 픽업 마감일 자동 설정
  useEffect(() => {
    if (pickupDay) {
      const nextDay = new Date(pickupDay);
      nextDay.setDate(pickupDay.getDate() + 1);
      nextDay.setHours(23, 59, 0, 0);
      setPickupDeadlineDate(nextDay);
    } else {
      setPickupDeadlineDate(null);
    }
  }, [pickupDay]);

  // 가격 옵션 핸들러
  const handlePriceStep = useCallback((id: number, amount: number) => {
    setPricingOptions(o => o.map((opt: EditablePricingOption) => opt.id === id ? { ...opt, price: Math.max(0, opt.price + amount) } : opt));
  }, []);

  const handlePricingChange = useCallback((id: number, field: 'unit' | 'price', value: string) => {
    setPricingOptions(o => o.map((opt: EditablePricingOption) => {
      if (opt.id === id) {
        return {
          ...opt,
          [field]: field === 'price' ? (value === '' ? 0 : Number(value)) : value
        };
      }
      return opt;
    }));
  }, []);

  const addPricingOption = useCallback(() => {
    setPricingOptions(prev => [...prev, { id: Date.now(), unit: '', price: 0 }]);
  }, []);

  const removePricingOption = useCallback((id: number) => {
    setPricingOptions(prev => prev.filter((opt: EditablePricingOption) => opt.id !== id));
  }, []);

  // 특별 라벨 핸들러
  const handleLabelToggle = useCallback((labelKey: string) => {
    setSpecialLabels(prev => prev.includes(labelKey) ? prev.filter((key: string) => key !== labelKey) : [...prev, labelKey]);
  }, []);

  // 이미지 파일 핸들러
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    const MAX_IMAGE_COUNT = 50;
    if (imageFiles.length + newFiles.length > MAX_IMAGE_COUNT) {
        setFormError(`이미지는 최대 ${MAX_IMAGE_COUNT}개까지 업로드할 수 있습니다.`);
        e.target.value = '';
        return;
    }
    setImageFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)]));
    e.target.value = '';
    setFormError(null);
  }, [imageFiles, imagePreviews]);

  const removeImage = useCallback((indexToRemove: number) => {
    const urlToRemove = imagePreviews[indexToRemove];
    if (!urlToRemove) return;
    setImageFiles(prevFiles => {
      const fileToRemove = prevFiles.find(file => URL.createObjectURL(file) === urlToRemove);
      if (fileToRemove) {
        URL.revokeObjectURL(urlToRemove);
        return prevFiles.filter(file => file !== fileToRemove);
      }
      return prevFiles;
    });
    setImagePreviews(prevPreviews => prevPreviews.filter((_, i) => i !== indexToRemove));
  }, [imagePreviews]);

  // 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setSubmitSuccess(null);

    // 유효성 검사
    if (publishOption !== 'draft') {
      if (!name.trim()) { setFormError('상품명을 입력해주세요.'); setIsSubmitting(false); return; }
      if (pricingOptions.some((opt: EditablePricingOption) => !opt.unit.trim() || opt.price <= 0)) {
        setFormError('가격 정책을 올바르게 설정해주세요 (단위와 가격 모두 필수, 가격은 0원 초과).');
        setIsSubmitting(false);
        return;
      }
      if (selectedSalesType === 'IN_STOCK' && (initialStock === '' || Number(initialStock) <= 0)) {
        setFormError('재고 한정 상품은 총 예약 가능 수량을 0보다 크게 입력해야 합니다.');
        setIsSubmitting(false);
        return;
      }
      if (imageFiles.length === 0) { setFormError('상품 이미지를 최소 1개 이상 업로드해주세요.'); setIsSubmitting(false); return; }
      if (!deadlineDate || !pickupDay || !pickupDeadlineDate) {
        setFormError('예약 마감일, 픽업일, 픽업 마감일을 모두 선택해주세요.');
        setIsSubmitting(false);
        return;
      }
      if (publishOption === 'schedule' && !scheduledAt) {
        setFormError('예약 발행 시 발행 시간을 선택해주세요.');
        setIsSubmitting(false);
        return;
      }
      if (deadlineDate && pickupDay && deadlineDate.getTime() >= pickupDay.getTime()) {
          setFormError('예약 마감일은 픽업일보다 이전이어야 합니다.');
          setIsSubmitting(false);
          return;
      }
      if (pickupDay && pickupDeadlineDate && pickupDay.getTime() > pickupDeadlineDate.getTime()) {
          setFormError('픽업 마감일은 픽업일보다 이후여야 합니다.');
          setIsSubmitting(false);
          return;
      }
    }

    const publicationTime = (publishOption === 'now' || publishOption === 'draft') ? new Date() : scheduledAt;
    const productStatus: Product['status'] =
      publishOption === 'now' ? 'selling' :
      (publishOption === 'schedule' ? 'scheduled' : 'draft');

    try {
      const stockAmount = selectedSalesType === 'IN_STOCK' ? (Number(initialStock) || 0) : 0;
      const productDataToSave: Omit<Product, 'id' | 'createdAt' | 'imageUrls'> = {
        name: name.trim(),
        description: description.trim(),
        salesType: selectedSalesType,
        initialStock: stockAmount,
        stock: stockAmount,
        reservationStock: stockAmount, // [수정] reservationStock에도 동일한 값을 저장
        pricingOptions: pricingOptions.map(({ id, ...rest }) => rest),
        specialLabels,
        maxOrderPerPerson: maxOrderPerPerson !== '' ? Number(maxOrderPerPerson) : null,
        isPublished: productStatus === 'selling',
        status: productStatus,
        publishAt: Timestamp.fromDate(publicationTime),
        deadlineDate: deadlineDate ? Timestamp.fromDate(deadlineDate) : Timestamp.now(),
        arrivalDate: pickupDay ? Timestamp.fromDate(pickupDay) : Timestamp.now(),
        pickupDate: pickupDay ? Timestamp.fromDate(pickupDay) : Timestamp.now(),
        pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : Timestamp.now(),
        expirationDate: expirationDate ? Timestamp.fromDate(expirationDate) : null,
        category: selectedMainCategory ? (categories.find((cat: Category) => cat.id === selectedMainCategory)?.name || '기타') : '',
        subCategory: selectedSubCategory || '',
        storageType: selectedStorageType,
        encoreCount: 0,
        isNew: true,
      };

      await addProduct(productDataToSave, imageFiles);
      setSubmitSuccess(`상품이 성공적으로 ${publishOption === 'draft' ? '임시저장' : '등록'}되었습니다.`);
      setTimeout(() => navigate('/admin/products'), 2000);
    } catch (err) {
      console.error("상품 저장 실패:", err);
      setFormError(`상품 저장 중 오류가 발생했습니다: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSubmitButtonText = () => publishOption === 'draft' ? '임시저장' : (publishOption === 'now' ? '지금 발행' : '예약 발행');

  return (
    <>
      {isPreviewing && (
        <ProductPreviewModal
          product={{
            name,
            description,
            pricingOptions: pricingOptions.map(({ id, ...rest }) => rest),
            specialLabels,
            category: selectedMainCategory ? (categories.find((cat: Category) => cat.id === selectedMainCategory)?.name || '기타') : '',
            subCategory: selectedSubCategory || '',
          } as PreviewProduct}
          imagePreviews={imagePreviews}
          onClose={() => setIsPreviewing(false)}
        />
      )}

      <div className="product-add-page-wrapper">
        <div className="product-add-main-content">
          <form onSubmit={handleSubmit} id="product-add-form">
            <header className="form-top-action-bar">
              <h1>새 상품 등록</h1>
              <div className="publish-options-and-buttons">
                <div className="publish-option-group">
                   <input type="radio" id="publish-draft" value="draft" name="publishOption" checked={publishOption === 'draft'} onChange={() => setPublishOption('draft')} />
                   <label htmlFor="publish-draft" className="radio-label"><FileText size={16} className="icon"/><span>임시저장</span></label>
                   <input type="radio" id="publish-now" value="now" name="publishOption" checked={publishOption === 'now'} onChange={() => setPublishOption('now')} />
                   <label htmlFor="publish-now" className="radio-label"><CheckCircle size={16} className="icon"/><span>지금 발행</span></label>
                   <input type="radio" id="publish-schedule" value="schedule" name="publishOption" checked={publishOption === 'schedule'} onChange={() => setPublishOption('schedule')} />
                   <label htmlFor="publish-schedule" className="radio-label"><Clock size={16} className="icon"/><span>예약 발행</span></label>
                </div>
                <button type="button" onClick={() => setIsPreviewing(true)} className="common-button button-preview"><Eye size={18} />미리보기</button>
                <button type="submit" disabled={isSubmitting} className="common-button button-submit"><Save size={18} />{isSubmitting ? '저장 중...' : getSubmitButtonText()}</button>
              </div>
            </header>

            <main className="main-content-grid">
              <div className="main-content-col">
                <SectionCard icon={<Edit3 size={16} />} title="상품 기본 정보 및 카테고리">
                    <div className="form-group">
                        <label htmlFor="product-name">상품명 *</label>
                        <input id="product-name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="고객에게 보여질 상품명을 입력하세요" />
                        <p className="form-field-info">상품의 이름을 명확하게 작성해주세요. 검색 노출에 중요합니다.</p>
                    </div>
                    <div className="form-group">
                        <label htmlFor="product-desc">상세 설명</label>
                        <textarea id="product-desc" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="상품의 특징, 스토리, 주의사항 등을 자유롭게 작성해주세요." />
                        <p className="form-field-info">상품에 대한 자세한 정보는 고객의 구매 결정에 큰 영향을 줍니다.</p>
                    </div>
                    <div className="form-group">
                        <label htmlFor="expiration-date">유통 기한 (선택)</label>
                        <input id="expiration-date" type="date" className="native-date-input" value={formatToDate(expirationDate)} onChange={(e) => setExpirationDate(e.target.value ? new Date(e.target.value) : null)} />
                        <p className="form-field-info">유통 기한이 있는 신선식품 등에만 입력하세요.</p>
                    </div>
                    <div className="form-group">
                      <label>보관 타입 *</label>
                      <div className="storage-type-options">
                        {storageTypeOptions.map((option) => (
                          <label key={option.key} className={`storage-type-option ${selectedStorageType === option.key ? 'selected' : ''}`} style={{ '--color-accent': option.color, '--color-accent-rgb': option.rgb } as React.CSSProperties}>
                            <input type="radio" name="storageType" value={option.key} checked={selectedStorageType === option.key} onChange={() => setSelectedStorageType(option.key)} />
                            {option.name}
                          </label>
                        ))}
                      </div>
                      <p className="form-field-info">상품의 보관 방식(실온, 냉장, 냉동)을 선택해주세요.</p>
                    </div>
                    <div className="form-group">
                        <label>판매 방식</label>
                        <div className="sales-type-options">
                            {salesTypeOptions.map((option) => (
                                <div key={option.key} className={`sales-type-option ${selectedSalesType === option.key ? 'selected' : ''}`} onClick={() => setSelectedSalesType(option.key)}>
                                    <h4>{option.name}</h4>
                                    <p>{option.description}</p>
                                </div>
                            ))}
                        </div>
                         <p className="form-field-info">상품이 어떤 방식으로 판매될지 선택해주세요.</p>
                    </div>
                    {loadingCategories ? (
                        <p className="loading-message-inline"><Loader size={16} className="spin-inline"/> 카테고리를 불러오는 중...</p>
                    ) : categoryLoadError ? (
                        <MessageBanner message={categoryLoadError} type="error" />
                    ) : (
                        <>
                            <div className="form-group">
                                <label>대분류 카테고리</label>
                                <div className="category-chips-container">
                                    <button type="button" className={`category-chip ${selectedMainCategory === '' ? 'selected' : ''}`} onClick={() => setSelectedMainCategory('')}>선택 안함</button>
                                    {categories.map((cat: Category) => (
                                        <button key={cat.id} type="button" className={`category-chip ${selectedMainCategory === cat.id ? 'selected' : ''}`} onClick={() => setSelectedMainCategory(cat.id)}>{cat.name}</button>
                                    ))}
                                </div>
                                <p className="form-field-info">상품이 속할 대분류 카테고리를 선택합니다.</p>
                            </div>
                            <div className="form-group">
                                <label>하위 카테고리</label>
                                <div className="category-chips-container">
                                    <button type="button" className={`category-chip ${selectedSubCategory === '' ? 'selected' : ''}`} onClick={() => setSelectedSubCategory('')} disabled={!selectedMainCategory}>선택 안함</button>
                                    {availableSubCategories.length > 0 ? (
                                        availableSubCategories.map((subCat: string, index: number) => (
                                            <button key={index} type="button" className={`category-chip ${selectedSubCategory === subCat ? 'selected' : ''}`} onClick={() => setSelectedSubCategory(subCat)} disabled={!selectedMainCategory}>{subCat}</button>
                                        ))
                                    ) : (
                                        <p className="form-field-info no-subcategories">대분류를 선택하거나, 하위 카테고리가 없습니다.</p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </SectionCard>
                <SectionCard icon={<ImageIcon size={16} />} title="상품 이미지">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{ display: 'none' }} />
                    <button type="button" onClick={handleSelectFileClick} className="common-button add-option-btn" style={{width: '100%', justifyContent: 'center'}}><Camera size={16}/> 이미지 선택하기</button>
                    {imagePreviews.length > 0 &&
                        <div className="image-previews-grid">
                            {imagePreviews.map((preview: string, index: number) =>
                                <div key={preview} className="image-preview-wrapper">
                                    <img src={preview} alt={`미리보기 ${index + 1}`} />
                                    <button type="button" onClick={() => removeImage(index)} className="remove-image-btn"><X size={14}/></button>
                                </div>
                            )}
                        </div>
                    }
                     {imagePreviews.length === 0 && <MessageBanner message={`상품 이미지를 1개 이상 업로드해주세요. (최대 ${50}개)`} type="info" />}
                </SectionCard>
              </div> 
              <div className="main-content-col">
                <SectionCard icon={<DollarSign size={16} />} title="가격 및 재고">
                    <div className="form-group">
                        <label>가격 정책 *</label>
                        <div className="pricing-options-container">
                            {pricingOptions.map((option: EditablePricingOption) => (
                                <div key={option.id} className="pricing-option-row">
                                    <div className="form-group unit-group">
                                        <input type="text" value={option.unit} onChange={(e) => handlePricingChange(option.id, 'unit', e.target.value)} placeholder="단위 (예: 1박스, 500g)" required/>
                                    </div>
                                    <div className="form-group price-group">
                                        <div className="price-input-wrapper">
                                            <button type="button" onClick={() => handlePriceStep(option.id, -100)}><Minus size={16}/></button>
                                            <input type="number" value={option.price === 0 ? '' : option.price} onChange={(e) => handlePricingChange(option.id, 'price', e.target.value)} placeholder="가격" required/>
                                            <button type="button" onClick={() => handlePriceStep(option.id, 100)}><PlusCircle size={16}/></button>
                                            <span>원</span>
                                        </div>
                                    </div>
                                    {pricingOptions.length > 1 && (<button type="button" onClick={() => removePricingOption(option.id)} className="remove-btn"><X size={18}/></button>)}
                                </div>
                            ))}
                            <button type="button" onClick={addPricingOption} className="common-button add-option-btn"><PlusCircle size={16}/> 가격 옵션 추가</button>
                        </div>
                        <p className="form-field-info">다양한 옵션(예: 낱개, 묶음)으로 가격을 설정할 수 있습니다. 가격은 0원 초과.</p>
                    </div>
                    {/* [수정] '재고 한정 예약 판매'일 경우에만 재고량 입력 필드 표시 */}
                    {selectedSalesType === 'IN_STOCK' &&
                        <div className="form-group">
                            {/* [수정] 레이블 변경 */}
                            <label htmlFor="initial-stock">총 예약 가능 수량 *</label>
                            <input id="initial-stock" type="number" value={initialStock} onChange={e => setInitialStock(e.target.value === '' ? '' : Number(e.target.value))} required={selectedSalesType === 'IN_STOCK'} min="0" placeholder="0보다 큰 예약 가능 수량을 입력하세요"/>
                            <p className="form-field-info">고객에게 예약 판매할 총 상품 수량입니다.</p>
                        </div>
                    }
                    <div className="form-group">
                        <label htmlFor="max-order">1인당 최대 구매 수량</label>
                        <input id="max-order" type="number" value={maxOrderPerPerson} onChange={e => setMaxOrderPerPerson(e.target.value === '' ? '' : Number(e.target.value))} min="1" placeholder="제한 없으면 비워두세요"/>
                        <p className="form-field-info">한 사람이 최대로 구매할 수 있는 수량을 설정합니다. (제한 없음 시 비워두세요)</p>
                    </div>
                </SectionCard>
                <SectionCard icon={<Calendar size={16} />} title="일정 관리">
                    {publishOption === 'schedule' &&
                        <div className="form-group">
                            <label htmlFor="scheduled-at">발행 예약 시간 *</label>
                            <input id="scheduled-at" type="datetime-local" className="native-date-input" value={formatToDateTimeLocal(scheduledAt)} onChange={(e) => setScheduledAt(e.target.value ? new Date(e.target.value) : new Date())} required />
                             <p className="form-field-info">상품이 자동으로 공개될 날짜와 시간을 설정합니다.</p>
                        </div>
                    }
                    <div className="form-group">
                        <label htmlFor="deadline-date">예약 마감일 *</label>
                        <input id="deadline-date" type="datetime-local" className="native-date-input" value={formatToDateTimeLocal(deadlineDate)} onChange={(e) => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)} required />
                        <p className="form-field-info">상품 주문이 가능한 마지막 날짜와 시간입니다.</p>
                    </div>
                    <div className="pickup-dates-group">
                        <div className="form-group">
                            <label htmlFor="pickup-day">픽업일 *</label>
                            <input id="pickup-day" type="date" className="native-date-input" value={formatToDate(pickupDay)} onChange={(e) => setPickupDay(e.target.value ? new Date(e.target.value) : null)} required/>
                            <p className="form-field-info">상품을 수령할 수 있는 시작 날짜입니다.</p>
                        </div>
                        <div className="form-group">
                            <label htmlFor="pickup-deadline">픽업 마감일 *</label>
                            <input id="pickup-deadline" type="date" className="native-date-input" value={formatToDate(pickupDeadlineDate)} onChange={(e) => setPickupDeadlineDate(e.target.value ? new Date(e.target.value) : null)} required />
                            <p className="form-field-info">상품 픽업이 가능한 마지막 날짜입니다. (픽업일 다음 날로 자동 설정)</p>
                        </div>
                    </div>
                </SectionCard>
                <SectionCard icon={<Tag size={16} />} title="특별 라벨">
                    <div className="label-options">
                        {availableLabels.map((label) => (
                            <div key={label.key} className={`label-chip ${specialLabels.includes(label.key) ? 'selected' : ''}`} onClick={() => handleLabelToggle(label.key)} data-label={label.key} >
                                {label.name}
                                {specialLabels.includes(label.key) && <Check size={14} className="label-check-icon" />}
                            </div>
                        ))}
                    </div>
                    <p className="form-field-info">상품에 특별한 속성을 표시합니다. (예: 한정 수량, 신상품)</p>
                </SectionCard>
              </div>
            </main>
          </form>
        </div>
        {isSubmitting && <LoadingSpinner />}
        {formError && <MessageBanner message={formError} type="error" />}
        {submitSuccess && <MessageBanner message={submitSuccess} type="success" />}
      </div>
    </>
  );
};

export default ProductAddAdminPage;