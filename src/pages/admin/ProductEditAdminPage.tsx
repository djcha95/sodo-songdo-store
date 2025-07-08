import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { getProductById, updateProduct, getCategories } from '../../firebase';
import type { Product, Category, StorageType } from '../../types';
import toast from 'react-hot-toast';

import {
  Image as ImageIcon, CheckCircle, Clock, Save, PlusCircle, X, Camera, FileText, Loader, Package, Trash2, LayoutGrid, SlidersHorizontal, HelpCircle, Box
} from 'lucide-react';
import './ProductAddAdminPage.css';

// --- 타입 및 상수 정의 ---
interface ProductItemUI {
  id: string;
  name: string;
  price: number | '';
  stock: number | '';
  limitQuantity: number | '';
  expirationDate: Date | null;
  expirationDateInput: string;
  deductionAmount: number | '';
  isBundleOption?: boolean;
}

interface VariantGroupUI {
  id: string;
  groupName: string;
  totalPhysicalStock: number | '';
  stockUnitType: string;
  items: ProductItemUI[];
}

const storageTypeOptions: { key: StorageType; name:string; }[] = [
  { key: 'ROOM', name: '실온' }, { key: 'FROZEN', name: '냉동' }, { key: 'CHILLED', name: '냉장' },
];
const availableLabels = ['수량 한정', '인기 상품', '이벤트 특가', '신상품'];
const commonStockUnits = ['개', '병', '묶음', '박스', '팩', '봉지', 'kg', 'g', '리터', '장', '통', '회'];
const singleUnitKeywords = ['개', '병', '잔', '포', '장', '통', '회', 'g', 'kg', 'ml', 'l', '낱개']; 
const bundleUnitKeywords = ['묶음', '박스', '곽', '세트', '팩', '봉지'];

// --- 헬퍼 함수 및 컴포넌트 ---
const generateUniqueId = () => Math.random().toString(36).substring(2, 11);

const formatToDateTimeLocal = (date: Date | null): string => {
  if (!date) return '';
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const formatToDate = (date: Date | null): string => {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
};

const parseDateString = (dateString: string): Date | null => { 
  if (!dateString) return null;
  const cleaned = dateString.replace(/[^0-9]/g, '');
  if (cleaned.length === 6) {
    const year = parseInt(cleaned.substring(0, 2), 10) + 2000;
    const month = parseInt(cleaned.substring(2, 4), 10) - 1;
    const day = parseInt(cleaned.substring(4, 6), 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date;
  } else if (cleaned.length === 8) {
    const year = parseInt(cleaned.substring(0, 4), 10);
    const month = parseInt(cleaned.substring(4, 6), 10) - 1;
    const day = parseInt(cleaned.substring(6, 8), 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date;
  }
  return null;
};

const formatDateToYYYYMMDD = (date: Date | null): string => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear().toString();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const Tooltip = ({ text }: { text: string }) => (
  <div className="tooltip-wrapper"> <HelpCircle size={14} /> <div className="tooltip-content">{text}</div> </div>
);

const LoadingSpinner = () => (
    <div className="loading-overlay"> <Loader size={48} className="spin" /> <p>잠시만 기다려 주세요...</p> </div>
);

// --- 메인 컴포넌트 ---
const ProductEditAdminPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [productType, setProductType] = useState<'single' | 'group'>('single');
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
  const [variantGroups, setVariantGroups] = useState<VariantGroupUI[]>([]);

  const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  
  const [publishOption, setPublishOption] = useState<'draft' | 'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState<Date>(new Date());
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [pickupDay, setPickupDay] = useState<Date | null>(null);
  const [specialLabels, setSpecialLabels] = useState<string[]>([]);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      if (!productId) { toast.error("상품 ID가 없습니다."); navigate('/admin/products'); return; }
      setIsLoading(true);
      try {
        const [fetchedProduct, fetchedCategories] = await Promise.all([ getProductById(productId), getCategories() ]);
        if (fetchedProduct) {
          setProduct(fetchedProduct);
          setCategories(fetchedCategories);
          setGroupName(fetchedProduct.groupName);
          setDescription(fetchedProduct.description);
          setSelectedStorageType(fetchedProduct.storageType || 'ROOM');
          
          // [FIXED] 타입 변환을 명시적으로 처리하여 오류 해결
          let mappedVGs: VariantGroupUI[] = (fetchedProduct.variantGroups || []).map(vg => ({
            id: vg.id || generateUniqueId(),
            groupName: vg.groupName,
            totalPhysicalStock: vg.totalPhysicalStock === null ? '' : Number(vg.totalPhysicalStock),
            stockUnitType: vg.stockUnitType,
            items: (vg.items || []).map(item => ({
              id: item.id || generateUniqueId(),
              name: item.name,
              price: Number(item.price),
              stock: item.stock === -1 ? '' : Number(item.stock),
              limitQuantity: item.limitQuantity === null ? '' : Number(item.limitQuantity),
              expirationDate: item.expirationDate?.toDate() || null,
              expirationDateInput: item.expirationDate ? formatDateToYYYYMMDD(item.expirationDate.toDate()) : '',
              deductionAmount: Number(item.stockDeductionAmount),
              isBundleOption: item.stockDeductionAmount !== 1,
            }))
          }));

          if (mappedVGs.length === 0) {
            toast.error("하위 상품 정보가 없습니다. 기본값을 생성합니다.");
            mappedVGs.push({ id: generateUniqueId(), groupName: fetchedProduct.groupName, totalPhysicalStock: '', stockUnitType: '개', items: [{ id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: 1, isBundleOption: false }] });
          }
          setVariantGroups(mappedVGs);

          setProductType(mappedVGs.length > 1 ? 'group' : 'single');
          setInitialImageUrls(fetchedProduct.imageUrls || []);
          setCurrentImageUrls(fetchedProduct.imageUrls || []);
          setImagePreviews(fetchedProduct.imageUrls || []);
          setPublishOption(fetchedProduct.status === 'selling' ? 'now' : (fetchedProduct.status === 'scheduled' ? 'schedule' : 'draft'));
          setScheduledAt(fetchedProduct.publishAt?.toDate() || new Date());
          setDeadlineDate(fetchedProduct.deadlineDate?.toDate() || null);
          setPickupDay(fetchedProduct.pickupDate?.toDate() || null);
          setSpecialLabels((fetchedProduct.specialLabels || []).map((l: any) => typeof l === 'object' ? l.key : l));
          const mainCat = fetchedCategories.find(c => c.name === fetchedProduct.category);
          if (mainCat) {
            setSelectedMainCategory(mainCat.id);
            if(fetchedProduct.subCategory && mainCat.subCategories.includes(fetchedProduct.subCategory)) setSelectedSubCategory(fetchedProduct.subCategory);
          }
        } else {
          toast.error("상품을 찾을 수 없습니다."); navigate('/admin/products');
        }
      } catch (err) { toast.error("상품 정보를 불러오는 데 실패했습니다."); console.error(err);
      } finally { setIsLoading(false); setLoadingCategories(false); }
    };
    fetchData();
  }, [productId, navigate]);

  useEffect(() => {
    const category = categories.find(cat => cat.id === selectedMainCategory);
    setAvailableSubCategories(category ? category.subCategories : []);
    if(category && !category.subCategories.includes(selectedSubCategory)) setSelectedSubCategory('');
  }, [selectedMainCategory, categories, selectedSubCategory]);

  const handleProductTypeChange = (newType: 'single' | 'group') => {
    if (productType === newType) return;

    if (productType === 'group' && newType === 'single') {
      toast(
        (t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px' }}>
            <span style={{ fontWeight: 500 }}>
              그룹 상품을 단일 상품으로 변경하시겠습니까?
              <br />
              <span style={{ color: '#c92a2a', fontSize: '14px' }}>첫 번째 하위 그룹을 제외한 나머지 정보는 삭제됩니다.</span>
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="toast-button confirm"
                onClick={() => {
                  setVariantGroups((prev) => prev.slice(0, 1));
                  setProductType(newType);
                  toast.dismiss(t.id);
                  toast.success('단일 상품으로 변경되었습니다.');
                }}
              >
                확인
              </button>
              <button className="toast-button" onClick={() => toast.dismiss(t.id)}>
                취소
              </button>
            </div>
          </div>
        ),
        { duration: Infinity, style: { maxWidth: '450px' } }
      );
    } else {
      setProductType(newType);
      toast.success('그룹 상품으로 변경되었습니다.');
    }
  };
  
  const addNewVariantGroup = useCallback(() => { setVariantGroups(prev => [...prev, { id: generateUniqueId(), groupName: '', totalPhysicalStock: '', stockUnitType: '개', items: [{ id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: 1, isBundleOption: false }] }]); }, []);
  const removeVariantGroup = useCallback((variantGroupId: string) => { setVariantGroups(prev => { if (prev.length > 1) return prev.filter(vg => vg.id !== variantGroupId); toast.error("하위 상품 그룹은 최소 1개 이상 존재해야 합니다."); return prev; }); }, []);
  const handleVariantGroupChange = useCallback((variantGroupId: string, field: keyof VariantGroupUI, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === variantGroupId ? { ...vg, [field]: field === 'totalPhysicalStock' ? (value === '' ? '' : Number(value)) : value } : vg)); }, []);
  const addNewSingleItem = useCallback((variantGroupId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === variantGroupId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: 1, isBundleOption: false }] } : vg)); }, []);
  const addNewBundleItem = useCallback((variantGroupId: string) => { setVariantGroups(prev => prev.map(vg => vg.id === variantGroupId ? { ...vg, items: [...vg.items, { id: generateUniqueId(), name: '', price: '', stock: '', limitQuantity: '', expirationDate: null, expirationDateInput: '', deductionAmount: '', isBundleOption: true }] } : vg)); }, []);
  const removeItem = useCallback((variantGroupId: string, itemId: string) => { setVariantGroups(prev => prev.map(vg => { if (vg.id === variantGroupId) { if (vg.items.length > 1) return { ...vg, items: vg.items.filter(item => item.id !== itemId) }; toast.error("품목은 최소 1개 이상 존재해야 합니다."); } return vg; })); }, []);
  const handleItemChange = useCallback((variantGroupId: string, itemId: string, field: keyof Omit<ProductItemUI, 'expirationDate' | 'expirationDateInput' | 'isBundleOption'>, value: any) => { setVariantGroups(prev => prev.map(vg => vg.id === variantGroupId ? { ...vg, items: vg.items.map(item => { if (item.id === itemId) { if (field === 'name') { const isBundle = bundleUnitKeywords.some(kw => value.toLowerCase().includes(kw)) || !singleUnitKeywords.some(kw => value.toLowerCase().includes(kw)); return { ...item, [field]: value, deductionAmount: isBundle ? item.deductionAmount : 1, isBundleOption: isBundle }; } if (['price', 'stock', 'limitQuantity', 'deductionAmount'].includes(field)) return { ...item, [field]: value === '' ? '' : Number(value) }; return { ...item, [field]: value }; } return item; }) } : vg)); }, []);
  const handleExpirationDateInputChange = useCallback((variantGroupId: string, itemId: string, value: string) => { setVariantGroups(prev => prev.map(vg => vg.id === variantGroupId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDateInput: value.replace(/[^0-9]/g, '').substring(0, 8) } : item) } : vg)); }, []);
  const handleExpirationDateKeyDown = useCallback((variantGroupId: string, itemId: string, e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); const parsedDate = parseDateString((e.target as HTMLInputElement).value); if (parsedDate) setVariantGroups(prev => prev.map(vg => vg.id === variantGroupId ? { ...vg, items: vg.items.map(item => item.id === itemId ? { ...item, expirationDate: parsedDate, expirationDateInput: formatDateToYYYYMMDD(parsedDate) } : item) } : vg)); else toast.error('유효하지 않은 날짜 형식입니다.'); } }, []);
  useEffect(() => { setVariantGroups(prev => prev.map(vg => ({...vg, items: vg.items.map(item => ({...item, expirationDate: parseDateString(item.expirationDateInput)}))}))); }, [variantGroups.map(vg => vg.items.map(item => item.expirationDateInput)).flat().join(',')]);
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files) return; const files = Array.from(e.target.files); setNewImageFiles(prev => [...prev, ...files]); files.forEach(file => setImagePreviews(prev => [...prev, URL.createObjectURL(file)])); e.target.value = ''; }, []);
  const removeImage = useCallback((indexToRemove: number) => { const url = imagePreviews[indexToRemove]; if (!url) return; if (url.startsWith('blob:')) { URL.revokeObjectURL(url); setNewImageFiles(prev => prev.filter(f => URL.createObjectURL(f) !== url)); } else { setCurrentImageUrls(prev => prev.filter(u => u !== url)); } setImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove)); }, [imagePreviews]);
  const handleLabelToggle = useCallback((label: string) => { setSpecialLabels(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]); }, []);

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) { toast.error("상품 ID가 없습니다."); return; }
    
    const finalGroupName = productType === 'group' ? groupName : (variantGroups[0]?.groupName || '단일 상품');
    
    if (publishOption !== 'draft') {
      if (!finalGroupName.trim()) { toast.error('상품(그룹)명을 입력해주세요.'); return; }
      if (imagePreviews.length === 0) { toast.error('대표 이미지를 1개 이상 업로드해주세요.'); return; }
      for (const vg of variantGroups) {
            if (!vg.groupName.trim()) { toast.error('모든 하위 상품 그룹명을 입력해주세요.'); return; }
            if (vg.totalPhysicalStock !== '' && (isNaN(Number(vg.totalPhysicalStock)) || Number(vg.totalPhysicalStock) < 0)) { toast.error(`'${vg.groupName}'의 총 재고를 0 이상 숫자로 입력하거나 비워두세요.`); return; }
            if (!vg.stockUnitType.trim()) { toast.error(`'${vg.groupName}'의 총 재고 단위를 입력해주세요.`); return; }
            if (vg.items.length === 0) { toast.error(`'${vg.groupName}'에 최소 1개 품목을 추가해주세요.`); return; }
            for (const item of vg.items) {
                if (!item.name.trim() || item.price === '') { toast.error(`'${vg.groupName}'의 품목 정보(선택지, 가격)를 입력해주세요.`); return; }
                if (item.isBundleOption) {
                    if (item.deductionAmount === '' || isNaN(Number(item.deductionAmount)) || Number(item.deductionAmount) <= 0) { toast.error(`묶음 품목 '${item.name}'의 '단위당 기준 재고'를 1 이상 숫자로 입력해주세요.`); return; }
                } else {
                    if (Number(item.deductionAmount) !== 1) { toast.error(`낱개 품목 '${item.name}'의 '단위당 기준 재고'는 '1'이어야 합니다.`); return; }
                }
                if (item.expirationDateInput && !item.expirationDate) { toast.error(`'${item.name}'의 유통기한 형식이 유효하지 않습니다.`); return; }
            }
        }
      if (!deadlineDate || !pickupDay) { toast.error('예약 마감일과 픽업일을 선택해주세요.'); return; }
    }
    
    setIsSaving(true);
    try {
        const status: Product['status'] = publishOption === 'now' ? 'selling' : (publishOption === 'schedule' ? 'scheduled' : 'draft');
        const productDataToUpdate: Partial<Omit<Product, 'id' | 'createdAt' | 'imageUrls'>> = {
            groupName: finalGroupName.trim(),
            description: description.trim(),
            storageType: selectedStorageType,
            category: categories.find(c => c.id === selectedMainCategory)?.name || '',
            subCategory: selectedSubCategory || '',
            variantGroups: variantGroups.map(vg => ({ 
              groupName: vg.groupName,
              totalPhysicalStock: vg.totalPhysicalStock === '' ? null : Number(vg.totalPhysicalStock),
              stockUnitType: vg.stockUnitType,
              items: vg.items.map(item => ({
                name: item.name, price: Number(item.price) || 0,
                stock: item.stock === '' ? -1 : Number(item.stock),
                limitQuantity: item.limitQuantity === '' ? null : Number(item.limitQuantity),
                expirationDate: item.expirationDate ? Timestamp.fromDate(item.expirationDate) : null,
                stockDeductionAmount: Number(item.deductionAmount) || 1,
              }))
            })),
            specialLabels, status, isPublished: status === 'selling',
            publishAt: Timestamp.fromDate(publishOption === 'schedule' ? scheduledAt : new Date()),
            deadlineDate: Timestamp.fromDate(deadlineDate!),
            pickupDate: Timestamp.fromDate(pickupDay!),
            pickupDeadlineDate: product?.pickupDeadlineDate || null,
        };

        await updateProduct(productId, productDataToUpdate, newImageFiles, currentImageUrls, initialImageUrls);
        toast.success(`상품이 성공적으로 수정되었습니다.`);
        setTimeout(() => navigate('/admin/products'), 1500);
    } catch (err) {
      console.error("상품 수정 실패:", err);
      toast.error(`상품 수정 중 오류가 발생했습니다: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoading) return <LoadingSpinner />;
  if (!product) return <div>상품 정보를 찾을 수 없습니다.</div>;

  return (
    <>
      <div className="product-add-page-wrapper smart-form">
        <form onSubmit={handleUpdateProduct} id="product-edit-form">
          <main className="main-content-grid-3-col">
            <div className="form-column col-left">
              <div className="form-section">
                <h3 className="form-section-title"><ImageIcon size={18} /> 대표 이미지 *</h3>
                <div className="image-upload-box">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" style={{ display: 'none' }} />
                  {imagePreviews.length > 0 ? (
                    <div className="image-previews-grid-new">
                      {imagePreviews.map((preview, index) => (
                        <div key={preview+index} className="image-preview-item">
                          <img src={preview} alt={`미리보기 ${index + 1}`} />
                          <button type="button" onClick={() => removeImage(index)} className="remove-image-btn-new"><X size={12}/></button>
                        </div>
                      ))}
                      {imagePreviews.length < 10 && (<button type="button" onClick={() => fileInputRef.current?.click()} className="add-image-btn"><PlusCircle size={24} /></button>)}
                    </div>
                  ) : ( <div className="image-dropzone" onClick={() => fileInputRef.current?.click()}> <Camera size={48} /> <span>클릭하여 이미지 추가</span></div> )}
                </div>
              </div>
            </div>

            <div className="form-column col-center">
              <div className="form-section">
                <div className="product-type-toggle">
                  <button type="button" className={productType === 'single' ? 'active' : ''} onClick={() => handleProductTypeChange('single')}> <Package size={16} /> 단일 상품 </button>
                  <button type="button" className={productType === 'group' ? 'active' : ''} onClick={() => handleProductTypeChange('group')}> <LayoutGrid size={16} /> 그룹 상품 </button>
                </div>
              </div>
              <div className="form-section">
                {productType === 'group' && (
                  <div className="form-group compact">
                    <label htmlFor="group-name">그룹명 *</label>
                    <input id="group-name" type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="예: 동원 차 세트" /> 
                  </div>
                )}
                <div className="form-group compact">
                  <label htmlFor="product-desc">상세 설명</label>
                  <textarea id="product-desc" value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="상품의 특징, 스토리, 주의사항 등을 작성해주세요." />
                </div>
                {loadingCategories ? <p>카테고리 로딩 중...</p> : (
                  <div className="form-group compact">
                    <label>카테고리</label>
                    <div className="category-select-wrapper">
                      <select value={selectedMainCategory} onChange={e => setSelectedMainCategory(e.target.value)}>
                        <option value="">대분류 선택</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                      <select value={selectedSubCategory} onChange={e => setSelectedSubCategory(e.target.value)} disabled={!selectedMainCategory || availableSubCategories.length === 0}>
                        <option value="">소분류 선택</option>
                        {availableSubCategories.map((sub, i) => <option key={i} value={sub}>{sub}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="form-section">
                <h3 className="form-section-title"><Box size={18} /> 하위 상품 그룹 정보 *
                  <Tooltip text="이 최상위 그룹 상품 안에 포함될 개별 상품들을 설정합니다." />
                </h3>
                <div className="items-list-container">
                  {variantGroups.map((vg) => ( 
                    <div className="item-card-new" key={vg.id} style={{ marginBottom: '24px', border: '1px solid #d0d7de', backgroundColor: '#fdfdfe' }}>
                      <div className="form-group compact" style={{ borderBottom: '1px solid #e9ecef', paddingBottom: '16px', marginBottom: '16px' }}>
                        <label>하위 상품 그룹명 *</label>
                        <input type="text" value={vg.groupName} onChange={e => handleVariantGroupChange(vg.id, 'groupName', e.target.value)} placeholder={productType === 'single' ? "단일 상품명" : "예: 동원 결명자차"} required /> 
                      </div>
                      <div className="form-group compact">
                        <label>총 재고 관리 * <Tooltip text={`이 하위 상품 그룹의 총 물리적 재고 수량입니다. 비워두면 무제한.`} /> </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input type="number" value={vg.totalPhysicalStock} onChange={e => handleVariantGroupChange(vg.id, 'totalPhysicalStock', e.target.value)} placeholder="총 재고 수량 (비워두면 무제한)" style={{ flex: 1 }} />
                          <input list="common-stock-units" type="text" value={vg.stockUnitType} onChange={e => handleVariantGroupChange(vg.id, 'stockUnitType', e.target.value)} placeholder="단위 (예: 병)" style={{ width: '100px' }} />
                          <datalist id="common-stock-units">{commonStockUnits.map(unit => <option key={unit} value={unit} />)}</datalist>
                        </div>
                      </div>
                      <h4 style={{ fontSize: '15px', fontWeight: 500, margin: '24px 0 12px 0', borderTop: '1px dashed #e9ecef', paddingTop: '20px' }}>
                        하위 품목 (옵션) 정보 * <Tooltip text="판매될 낱개, 묶음 등의 옵션 품목을 설정합니다."/>
                      </h4>
                      {vg.items.map((item) => (
                        <div className="item-card-new" key={item.id} style={{ border: '1px solid #f1f3f5', padding: '16px', marginBottom: '12px', position: 'relative' }}>
                           <div className="item-grid-2rows"> 
                            <div className="form-group-grid item-name"><label>선택지</label><input type="text" value={item.name} onChange={e => handleItemChange(vg.id, item.id, 'name', e.target.value)} placeholder={item.isBundleOption ? "예: 20개 묶음" : "예: 1개"} required /></div>
                            <div className="form-group-grid item-price"><label>가격</label><div className="price-input-wrapper"><input type="number" value={item.price} onChange={e => handleItemChange(vg.id, item.id, 'price', e.target.value)} placeholder="가격" required /><span>원</span></div></div>
                            <div className="form-group-grid item-expiry"><label>유통기한</label><input type="text" value={item.expirationDateInput} onChange={e => handleExpirationDateInputChange(vg.id, item.id, e.target.value)} onKeyDown={e => handleExpirationDateKeyDown(vg.id, item.id, e)} placeholder="YYMMDD" maxLength={8}/></div>
                            <div className="form-group-grid item-stock"><label><span>재고</span> <Tooltip text="품목별 재고. 비워두면 무제한." /></label><input type="number" value={item.stock} onChange={e => handleItemChange(vg.id, item.id, 'stock', e.target.value)} placeholder="비워두면 무제한" /></div>
                            <div className="form-group-grid item-deduction-amount"><label><span>단위당 기준 재고</span> <Tooltip text={`1개 판매 시, 그룹 총 재고에서 차감될 수량.`} /></label><input type="number" value={item.deductionAmount} onChange={e => handleItemChange(vg.id, item.id, 'deductionAmount', e.target.value)} placeholder={item.isBundleOption ? "예: 20" : "1"} required /></div>
                            <div className="form-group-grid item-limit"><label><span>1인 구매 제한</span> <Tooltip text="고객 1명당 구매 최대 수량." /></label><input type="number" value={item.limitQuantity} onChange={e => handleItemChange(vg.id, item.id, 'limitQuantity', e.target.value)} placeholder="없음" /></div>
                          </div>
                          {vg.items.length > 1 && (<button type="button" onClick={() => removeItem(vg.id, item.id)} className="remove-item-btn-new"><Trash2 size={14} /></button>)}
                        </div>
                      ))}
                      {vg.items.length < 10 && (<div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}><button type="button" onClick={() => addNewSingleItem(vg.id)} className="add-item-btn-new" style={{ flex: 1, borderStyle: 'dashed' }}><PlusCircle size={16}/> 낱개 옵션 추가</button><button type="button" onClick={() => addNewBundleItem(vg.id)} className="add-item-btn-new" style={{ flex: 1, borderStyle: 'dashed' }}><PlusCircle size={16}/> 묶음 옵션 추가</button></div>)}
                      {productType === 'group' && variantGroups.length > 1 && (<button type="button" onClick={() => removeVariantGroup(vg.id)} className="remove-item-btn-new" style={{ top: '8px', right: '8px' }}><X size={14} /></button> )}
                    </div>
                  ))}
                  {productType === 'group' && variantGroups.length < 5 && (<button type="button" onClick={addNewVariantGroup} className="add-item-btn-new" style={{ borderStyle: 'solid', marginTop: '20px' }}><PlusCircle size={18}/> 하위 상품 그룹 추가</button>)}
                </div>
              </div>
            </div>

            <div className="form-column col-right">
              <div className="form-section sticky-section">
                <h3 className="form-section-title"><SlidersHorizontal size={18} /> 발행 및 설정</h3>
                <div className="form-group compact"><label>발행 옵션</label><div className="publish-option-group-new"><label><input type="radio" value="now" checked={publishOption === 'now'} onChange={() => setPublishOption('now')}/><span><CheckCircle size={14}/> 즉시 발행</span></label><label><input type="radio" value="schedule" checked={publishOption === 'schedule'} onChange={() => setPublishOption('schedule')}/><span><Clock size={14}/> 예약</span></label><label><input type="radio" value="draft" checked={publishOption === 'draft'} onChange={() => setPublishOption('draft')}/><span><FileText size={14}/> 임시저장</span></label></div></div>
                {publishOption === 'schedule' && (<div className="form-group compact"><label>발행 예약 시간</label><input type="datetime-local" className="compact" value={formatToDateTimeLocal(scheduledAt)} onChange={(e) => setScheduledAt(e.target.value ? new Date(e.target.value) : new Date())} /></div>)}
                <div className="form-group compact"><label>공구 마감 *</label><input type="datetime-local" className="compact" value={formatToDateTimeLocal(deadlineDate)} onChange={(e) => setDeadlineDate(e.target.value ? new Date(e.target.value) : null)} /></div>
                <div className="form-group compact"><label>입고일 (픽업 시작일) *</label><input type="date" className="compact" value={pickupDay ? formatToDate(pickupDay) : ''} onChange={(e) => setPickupDay(e.target.value ? new Date(e.target.value) : null)} /></div>
                <div className="form-group compact"><label>특별 라벨</label><div className="label-chips-container">{availableLabels.map(label => (<button key={label} type="button" className={`label-chip-new ${specialLabels.includes(label) ? 'active' : ''}`} onClick={() => handleLabelToggle(label)}>{label}</button>))}</div></div>
                <div className="form-group compact"><label>보관 타입</label><div className="storage-type-select">{storageTypeOptions.map(opt => (<button key={opt.key} type="button" className={`storage-type-option ${selectedStorageType === opt.key ? 'active' : ''}`} onClick={() => setSelectedStorageType(opt.key)}>{opt.name}</button>))}</div></div>
                <button type="submit" disabled={isSaving} className="save-button"> {isSaving ? <Loader size={18} className="spin"/> : <Save size={18} />} {isSaving ? '수정 중...' : '상품 정보 수정'} </button>
              </div>
            </div>
          </main>
        </form>
        {isSaving && <LoadingSpinner />}
      </div>
    </>
  );
};

export default ProductEditAdminPage;