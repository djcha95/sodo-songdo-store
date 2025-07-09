// src/pages/admin/ProductAddAdminPage.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { addProductWithFirstRound, getCategories } from '@/firebase';
import type { Product, SalesRound, VariantGroup, ProductItem, Category, StorageType, SpecialLabel } from '@/types';
import ProductPreviewModal from './ProductPreviewModal';
import toast from 'react-hot-toast';

// Lucide React 아이콘들
import {
  Edit3, DollarSign, Image as ImageIcon, Tag, Calendar,
  CheckCircle, Clock, Save, PlusCircle, X, Camera, Eye, Check, FileText, Loader, Info
} from 'lucide-react';
import './ProductAddAdminPage.css';

// ==========================================================
// 타입 및 헬퍼 함수 정의
// ==========================================================

interface EditableItem extends Omit<ProductItem, 'id' | 'stock' | 'stockDeductionAmount' | 'limitQuantity' | 'expirationDate'> {
  tempId: number;
}

const salesTypeOptions: { key: 'unlimited' | 'limited'; name: string; description: string; }[] = [
  { key: 'unlimited', name: '일반 예약 판매', description: '수량 제한 없이 기간 내 주문을 받아 판매합니다.' },
  { key: 'limited', name: '재고 한정 예약 판매', description: '설정한 총 재고 수량만큼만 판매합니다.' },
];

const storageTypeOptions: { key: StorageType; name: string; color: string; rgb: string; }[] = [
  { key: 'ROOM', name: '실온', color: '#343a40', rgb: '52, 58, 64' },
  { key: 'FROZEN', name: '냉동', color: '#007bff', rgb: '0, 123, 255' },
  { key: 'COLD', name: '냉장', color: '#dc3545', rgb: '220, 53, 69' },
];

// ✅ [수정] types.ts에 정의된 SpecialLabel 타입과 일치하도록 수정
const availableLabels: SpecialLabel[] = ['수량 한정', '이벤트 특가', '신상품'];

const formatToDateTimeLocal = (date: Date | null): string => {
  if (!date) return '';
  const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return d.toISOString().slice(0, 16);
};

const formatToDate = (date: Date | null): string => {
  if (!date) return '';
  const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return d.toISOString().slice(0, 10);
};

const SectionCard = ({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) => (
  <div className="section-card">
    <div className="section-card-header"><h3>{icon}{title}</h3></div>
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

  // --- 상태 관리 ---
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [roundName, setRoundName] = useState('1차 판매');
  const [items, setItems] = useState<EditableItem[]>([
    { tempId: Date.now(), name: '1팩', price: 10000 }
  ]);
  const [selectedSalesType, setSelectedSalesType] = useState<'unlimited' | 'limited'>('unlimited');
  const [totalPhysicalStock, setTotalPhysicalStock] = useState<number | ''>('');
  const [specialLabels, setSpecialLabels] = useState<SpecialLabel[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [publishOption, setPublishOption] = useState<'draft' | 'now' | 'schedule'>('now');
  const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
  
  const [scheduledAt, setScheduledAt] = useState<Date>(() => new Date());
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(13, 0, 0, 0); return d;
  });
  const [pickupDate, setPickupDate] = useState<Date | null>(() => {
    const d = new Date(); d.setDate(d.getDate() + 14); d.setHours(13, 0, 0, 0); return d;
  });
  const [pickupDeadlineDate, setPickupDeadlineDate] = useState<Date | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // --- useEffect 훅 ---
  useEffect(() => {
    (async () => {
      try {
        const fetchedCategories = await getCategories();
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("카테고리 불러오기 오류:", err);
      }
    })();
  }, []);

  useEffect(() => {
    const category = categories.find(cat => cat.id === selectedMainCategory);
    setAvailableSubCategories(category ? category.subCategories : []);
    setSelectedSubCategory('');
  }, [selectedMainCategory, categories]);
  
  useEffect(() => {
    if (pickupDate) {
      const nextDay = new Date(pickupDate);
      nextDay.setDate(pickupDate.getDate() + 1);
      nextDay.setHours(23, 59, 0, 0);
      setPickupDeadlineDate(nextDay);
    } else {
      setPickupDeadlineDate(null);
    }
  }, [pickupDate]);

  // --- 핸들러 함수 ---
  const handleItemChange = useCallback((tempId: number, field: 'name' | 'price', value: string | number) => {
    setItems(prev => prev.map(item => item.tempId === tempId ? { ...item, [field]: value } : item));
  }, []);

  const addItemOption = useCallback(() => {
    setItems(prev => [...prev, { tempId: Date.now(), name: '', price: 0 }]);
  }, []);

  const removeItemOption = useCallback((tempId: number) => {
    setItems(prev => prev.filter(item => item.tempId !== tempId));
  }, []);
  
  const handleLabelToggle = useCallback((label: SpecialLabel) => {
    setSpecialLabels(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    setImageFiles(prev => [...prev, ...newFiles]);
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));
    setImagePreviews(prev => [...prev, ...newPreviews]);
  }, []);
  
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeImage = useCallback((indexToRemove: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== indexToRemove));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[indexToRemove]);
      return prev.filter((_, i) => i !== indexToRemove);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    if (publishOption !== 'draft') {
      if (!groupName.trim() || !roundName.trim()) { setFormError('상품명과 판매 회차명을 입력해주세요.'); setIsSubmitting(false); return; }
      if (items.some(item => !item.name.trim() || item.price <= 0)) { setFormError('가격 옵션을 올바르게 설정해주세요 (단위와 가격 모두 필수).'); setIsSubmitting(false); return; }
      if (selectedSalesType === 'limited' && (!totalPhysicalStock || totalPhysicalStock <= 0)) { setFormError('재고 한정 상품은 총 재고 수량을 0보다 크게 입력해야 합니다.'); setIsSubmitting(false); return; }
      if (imageFiles.length === 0) { setFormError('상품 이미지를 1개 이상 업로드해주세요.'); setIsSubmitting(false); return; }
      if (!deadlineDate || !pickupDate) { setFormError('예약 마감일과 픽업일을 모두 선택해주세요.'); setIsSubmitting(false); return; }
      if (publishOption === 'schedule' && !scheduledAt) { setFormError('예약 발행 시 발행 시간을 선택해주세요.'); setIsSubmitting(false); return; }
    }

    try {
      const productData: Omit<Product, 'id' | 'createdAt' | 'salesHistory' | 'imageUrls'> = {
        groupName: groupName.trim(),
        description: description.trim(),
        storageType: selectedStorageType,
        isArchived: false,
        category: categories.find(cat => cat.id === selectedMainCategory)?.name,
        subCategory: selectedSubCategory,
        encoreCount: 0,
        encoreRequesterIds: [],
        specialLabels,
      };

      const finalItems: ProductItem[] = items.map(item => ({
        id: `item-${uuidv4()}`,
        name: item.name,
        price: item.price,
        stock: -1,
        stockDeductionAmount: 1,
        limitQuantity: null,
        expirationDate: expirationDate ? Timestamp.fromDate(expirationDate) : null,
      }));

      const variantGroup: VariantGroup = {
        id: `vg-${uuidv4()}`,
        groupName: groupName.trim(),
        items: finalItems,
        totalPhysicalStock: selectedSalesType === 'limited' ? Number(totalPhysicalStock) : -1,
        stockUnitType: '개',
      };

      const firstRoundData: Omit<SalesRound, 'roundId' | 'createdAt' | 'waitlist' | 'waitlistCount'> = {
        roundName: roundName.trim(),
        status: publishOption === 'now' ? 'selling' : (publishOption === 'schedule' ? 'scheduled' : 'draft'),
        variantGroups: [variantGroup],
        publishAt: Timestamp.fromDate(publishOption === 'schedule' ? scheduledAt : new Date()),
        deadlineDate: Timestamp.fromDate(deadlineDate!),
        pickupDate: Timestamp.fromDate(pickupDate!),
        pickupDeadlineDate: pickupDeadlineDate ? Timestamp.fromDate(pickupDeadlineDate) : null,
      };

      await addProductWithFirstRound(productData, firstRoundData, imageFiles);
      
      toast.success(`상품이 성공적으로 ${publishOption === 'draft' ? '임시저장' : '등록'}되었습니다.`);
      setTimeout(() => navigate('/admin/products'), 1500);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      setFormError(`상품 저장 중 오류가 발생했습니다: ${errorMessage}`);
      toast.error(`저장 실패: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isPreviewing && (
        <ProductPreviewModal
          product={{
            groupName, description,
            salesHistory: [{
              variantGroups: [{ items: items.map(i => ({...i, stock: -1, stockDeductionAmount: 1})) }]
            }]
          } as any}
          imagePreviews={imagePreviews}
          onClose={() => setIsPreviewing(false)}
        />
      )}

      <div className="product-add-page-wrapper">
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
                <button type="submit" disabled={isSubmitting} className="common-button button-submit"><Save size={18} />{isSubmitting ? '저장 중...' : '저장하기'}</button>
              </div>
            </header>

            <MessageBanner message={formError} type="error" />

            <main className="main-content-grid">
              <div className="main-content-col">
                <SectionCard icon={<Edit3 size={16} />} title="상품 기본 정보">
                    <div className="form-group">
                        <label htmlFor="product-name">상품명 *</label>
                        <input id="product-name" type="text" value={groupName} onChange={e => setGroupName(e.target.value)} required placeholder="고객에게 보여질 상품명을 입력하세요" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="round-name">판매 회차명 *</label>
                        <input id="round-name" type="text" value={roundName} onChange={e => setRoundName(e.target.value)} required placeholder="예: 1차 공동구매, 앵콜 특가" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="product-desc">상세 설명</label>
                        <textarea id="product-desc" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="상품의 특징, 스토리, 주의사항 등을 자유롭게 작성해주세요." />
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
                    </div>
                    <div className="form-group">
                        <label>카테고리</label>
                        <select value={selectedMainCategory} onChange={e => setSelectedMainCategory(e.target.value)}>
                            <option value="">대분류 선택</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                        <select value={selectedSubCategory} onChange={e => setSelectedSubCategory(e.target.value)} disabled={!selectedMainCategory}>
                            <option value="">하위분류 선택</option>
                            {availableSubCategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                        </select>
                    </div>
                </SectionCard>
                <SectionCard icon={<ImageIcon size={16} />} title="상품 이미지">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{ display: 'none' }} />
                    <button type="button" onClick={handleSelectFileClick} className="common-button add-option-btn"><Camera size={16}/> 이미지 선택</button>
                    <div className="image-previews-grid">
                        {imagePreviews.map((preview, index) =>
                            <div key={preview} className="image-preview-wrapper">
                                <img src={preview} alt={`미리보기 ${index + 1}`} />
                                <button type="button" onClick={() => removeImage(index)} className="remove-image-btn"><X size={14}/></button>
                            </div>
                        )}
                    </div>
                </SectionCard>
              </div> 
              <div className="main-content-col">
                <SectionCard icon={<DollarSign size={16} />} title="가격 및 재고">
                    <div className="form-group">
                        <label>가격 옵션 *</label>
                        {items.map(item => (
                            <div key={item.tempId} className="pricing-option-row">
                                <input type="text" value={item.name} onChange={e => handleItemChange(item.tempId, 'name', e.target.value)} placeholder="단위 (예: 1박스, 500g)" required />
                                <input type="number" value={item.price} onChange={e => handleItemChange(item.tempId, 'price', Number(e.target.value))} placeholder="가격" required min={1} />
                                {items.length > 1 && (<button type="button" onClick={() => removeItemOption(item.tempId)} className="remove-btn"><X size={18}/></button>)}
                            </div>
                        ))}
                        <button type="button" onClick={addItemOption} className="common-button add-option-btn"><PlusCircle size={16}/> 옵션 추가</button>
                    </div>
                    <div className="form-group">
                      <label>판매 방식</label>
                      <div className="sales-type-options">
                        {salesTypeOptions.map(option => (
                            <div key={option.key} className={`sales-type-option ${selectedSalesType === option.key ? 'selected' : ''}`} onClick={() => setSelectedSalesType(option.key)}>
                                <h4>{option.name}</h4><p>{option.description}</p>
                            </div>
                        ))}
                      </div>
                    </div>
                    {selectedSalesType === 'limited' &&
                        <div className="form-group">
                            <label htmlFor="total-stock">총 재고 수량 *</label>
                            <input id="total-stock" type="number" value={totalPhysicalStock} onChange={e => setTotalPhysicalStock(e.target.value === '' ? '' : Number(e.target.value))} required={selectedSalesType === 'limited'} min="1" placeholder="판매할 총 수량을 입력하세요"/>
                        </div>
                    }
                </SectionCard>
                <SectionCard icon={<Calendar size={16} />} title="일정 관리">
                    {publishOption === 'schedule' &&
                        <div className="form-group">
                            <label htmlFor="scheduled-at">발행 예약 시간 *</label>
                            <input id="scheduled-at" type="datetime-local" className="native-date-input" value={formatToDateTimeLocal(scheduledAt)} onChange={(e) => setScheduledAt(e.target.value ? new Date(e.target.value) : new Date())} required />
                        </div>
                    }
                    <div className="form-group">
                        <label htmlFor="deadline-date">예약 마감일 *</label>
                        <input id="deadline-date" type="datetime-local" className="native-date-input" value={formatToDateTimeLocal(deadlineDate)} onChange={(e) => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="pickup-day">픽업일 *</label>
                        <input id="pickup-day" type="date" className="native-date-input" value={formatToDate(pickupDate)} onChange={(e) => setPickupDate(e.target.value ? new Date(e.target.value) : null)} required/>
                    </div>
                    <div className="form-group">
                        <label htmlFor="expiration-date">유통 기한 (선택)</label>
                        <input id="expiration-date" type="date" className="native-date-input" value={formatToDate(expirationDate)} onChange={(e) => setExpirationDate(e.target.value ? new Date(e.target.value) : null)} />
                    </div>
                </SectionCard>
                <SectionCard icon={<Tag size={16} />} title="특별 라벨">
                    <div className="label-options">
                        {availableLabels.map((label) => (
                            <div key={label} className={`label-chip ${specialLabels.includes(label) ? 'selected' : ''}`} onClick={() => handleLabelToggle(label)}>
                                {label}
                                {specialLabels.includes(label) && <Check size={14} className="label-check-icon" />}
                            </div>
                        ))}
                    </div>
                </SectionCard>
              </div>
            </main>
        </form>
        {isSubmitting && <LoadingSpinner />}
      </div>
    </>
  );
};

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default ProductAddAdminPage;
