// src/pages/admin/ProductCoreInfoEditPage.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProductById, updateProductCoreInfo, getCategories } from '../../firebase';
import type { Product, Category, StorageType } from '../../types';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Save, PlusCircle, X, Camera, Loader, Package } from 'lucide-react';
import './ProductAddAdminPage.css'; // 기존 스타일 재사용

const storageTypeOptions: { key: StorageType; name:string; }[] = [
  { key: 'ROOM', name: '실온' }, { key: 'FROZEN', name: '냉동' }, { key: 'CHILLED', name: '냉장' },
];

const LoadingSpinner = () => (<div className="loading-overlay"><Loader size={48} className="spin" /> <p>잠시만 기다려 주세요...</p></div>);

const ProductCoreInfoEditPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 상태 선언 ---
  const [initialProduct, setInitialProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // 대표 상품 정보 상태
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [selectedStorageType, setSelectedStorageType] = useState<StorageType>('ROOM');
  
  // 이미지 관련 상태
  const [initialImageUrls, setInitialImageUrls] = useState<string[]>([]);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);
  
  // --- 데이터 로딩 ---
  useEffect(() => {
    const fetchData = async () => {
      if (!productId) {
        toast.error("상품 ID가 없습니다.");
        navigate('/admin/products');
        return;
      }
      setIsLoading(true);
      try {
        const [fetchedProduct, fetchedCategories] = await Promise.all([
          getProductById(productId), 
          getCategories()
        ]);

        if (fetchedProduct) {
          setInitialProduct(fetchedProduct);
          setCategories(fetchedCategories);
          
          setGroupName(fetchedProduct.groupName);
          setDescription(fetchedProduct.description);
          setSelectedStorageType(fetchedProduct.storageType || 'ROOM');
          
          setInitialImageUrls(fetchedProduct.imageUrls || []);
          setCurrentImageUrls(fetchedProduct.imageUrls || []);
          setImagePreviews(fetchedProduct.imageUrls || []);
          
          const mainCat = fetchedCategories.find(c => c.name === fetchedProduct.category);
          if (mainCat) {
            setSelectedMainCategory(mainCat.id);
            if(fetchedProduct.subCategory && mainCat.subCategories.includes(fetchedProduct.subCategory)) {
              setSelectedSubCategory(fetchedProduct.subCategory);
            }
          }
        } else {
          toast.error("상품을 찾을 수 없습니다.");
          navigate('/admin/products');
        }
      } catch (err) {
        toast.error("상품 정보를 불러오는 데 실패했습니다.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [productId, navigate]);

  useEffect(() => {
    const category = categories.find(cat => cat.id === selectedMainCategory);
    setAvailableSubCategories(category ? category.subCategories : []);
    if(category && !category.subCategories.includes(selectedSubCategory)) {
        setSelectedSubCategory('');
    }
  }, [selectedMainCategory, categories, selectedSubCategory]);

  // --- 핸들러 ---
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setNewImageFiles(prev => [...prev, ...files]);
    files.forEach(file => {
        const previewUrl = URL.createObjectURL(file);
        setImagePreviews(prev => [...prev, previewUrl]);
    });
    e.target.value = '';
  }, []);

  const removeImage = useCallback((indexToRemove: number) => {
    const urlToRemove = imagePreviews[indexToRemove];
    if (!urlToRemove) return;

    // 미리보기에서 제거
    setImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
    
    if (urlToRemove.startsWith('blob:')) {
      // 새로 추가된 파일(blob URL) 제거
      setNewImageFiles(prev => prev.filter(f => URL.createObjectURL(f) !== urlToRemove));
      URL.revokeObjectURL(urlToRemove);
    } else {
      // 기존 이미지 URL 제거
      setCurrentImageUrls(prev => prev.filter(u => u !== urlToRemove));
    }
  }, [imagePreviews]);

  // --- 제출 핸들러 ---
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;

    if (!groupName.trim()) { toast.error('대표 상품명을 입력해주세요.'); return; }
    if (imagePreviews.length === 0) { toast.error('대표 이미지를 1개 이상 등록해주세요.'); return; }
    
    setIsSaving(true);
    try {
        const productDataToUpdate: Partial<Omit<Product, 'id' | 'salesHistory'>> = {
            groupName: groupName.trim(),
            description: description.trim(),
            storageType: selectedStorageType,
            category: categories.find(c => c.id === selectedMainCategory)?.name || '',
            subCategory: selectedSubCategory || '',
        };

        await updateProductCoreInfo(
            productId,
            productDataToUpdate,
            newImageFiles,
            currentImageUrls,
            initialImageUrls
        );

        toast.success('상품 정보가 성공적으로 수정되었습니다.');
        navigate('/admin/products');

    } catch (err) {
      console.error("상품 수정 실패:", err);
      toast.error(`상품 수정 중 오류가 발생했습니다: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoading) return <LoadingSpinner />;
  if (!initialProduct) return <div>상품 정보를 찾을 수 없습니다.</div>;

  return (
    <div className="product-add-page-wrapper smart-form">
      <form onSubmit={handleUpdate}>
        <header className="product-add-header">
            <h1>대표 상품 정보 수정</h1>
            <button type="submit" disabled={isSaving} className="save-button">
                {isSaving ? <Loader size={18} className="spin"/> : <Save size={18} />}
                {isSaving ? '저장 중...' : '수정 내용 저장'}
            </button>
        </header>
        <main className="main-content-grid-1-col">
            <div className="form-column">
              <div className="form-section">
                <h3 className="form-section-title"><Package size={18}/> 기본 정보</h3>
                <div className="form-group">
                  <label>대표 상품명 *</label>
                  <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>상세 설명</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}/>
                </div>
              </div>

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

              <div className="form-section">
                <h3 className="form-section-title">분류 및 보관</h3>
                <div className="form-group">
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
                <div className="form-group">
                    <label>보관 타입</label>
                    <div className="storage-type-select">
                        {storageTypeOptions.map(opt => (
                        <button key={opt.key} type="button" className={`storage-type-option ${selectedStorageType === opt.key ? 'active' : ''}`} onClick={() => setSelectedStorageType(opt.key)}>{opt.name}</button>
                        ))}
                    </div>
                </div>
              </div>
            </div>
        </main>
      </form>
    </div>
  );
};

export default ProductCoreInfoEditPage;