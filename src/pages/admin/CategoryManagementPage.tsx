// src/pages/admin/CategoryManagementPage.tsx

import { useState, useEffect } from 'react';
// ✅ [수정] getProductsCountByCategory 임포트
import { addCategory, getCategories, updateCategory, deleteCategory, updateCategoriesOrder, getProductsCountByCategory } from '../../firebase';
import type { Category } from '../../types';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';
import { PlusCircle, Edit, Trash2, X, Check, Loader, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import './CategoryManagementPage.css';

const CategoryManagementPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  // ✅ [추가] 상품 개수를 저장할 state
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newSubCategoryName, setNewSubCategoryName] =useState<string>('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingSubCategory, setEditingSubCategory] = useState<{ categoryId: string; oldName: string; } | null>(null);
  const [currentEditingName, setCurrentEditingName] = useState<string>('');
  const [selectedCategoryIdForSub, setSelectedCategoryIdForSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);
  
  // ✅ [수정] 카테고리와 상품 개수를 함께 불러오는 함수로 변경
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 두 데이터를 동시에 병렬로 요청
      const [fetchedCategories, counts] = await Promise.all([
        getCategories(),
        getProductsCountByCategory()
      ]);
      
      setCategories(fetchedCategories);
      // 대분류와 하위분류 카운트를 하나로 합쳐서 state에 저장
      setProductCounts({ ...counts.mainCategoryCounts, ...counts.subCategoryCounts });

    } catch (err) {
      console.error("데이터 불러오기 오류:", err);
      setError("카테고리 및 상품 정보를 불러오는 데 실패했습니다.");
      toast.error("데이터를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      toast.error('대분류 카테고리 이름을 입력해주세요.');
      return;
    }
    
    if (categories.some(cat => cat.name === trimmedName)) {
        toast.error('이미 존재하는 대분류 카테고리 이름입니다.');
        return;
    }

    const promise = new Promise<void>(async (resolve, reject) => {
        try {
            const newCategory: Omit<Category, 'id'> = {
                name: trimmedName,
                subCategories: [],
                order: categories.length, 
            };
            await addCategory(newCategory);
            setNewCategoryName('');
            await fetchData(); // [수정] 전체 데이터 다시 로드
            resolve();
        } catch (err) {
            console.error("카테고리 추가 오류:", err);
            reject(err);
        }
    });

    toast.promise(promise, {
        loading: '카테고리 추가 중...',
        success: `'${trimmedName}' 카테고리가 성공적으로 추가되었습니다.`,
        error: '카테고리 추가에 실패했습니다.',
    });
  };


  const handleDeleteCategory = async (categoryId: string) => {
    const categoryToDelete = categories.find(c => c.id === categoryId);
    if (!categoryToDelete) return;

    const confirmMessage = categoryToDelete.subCategories.length > 0
      ? `이 대분류 카테고리와 포함된 모든 하위 카테고리(${categoryToDelete.subCategories.length}개)를 삭제하시겠습니까?\n관련된 상품들의 카테고리 정보도 직접 수정해야 합니다.`
      : '이 대분류 카테고리를 삭제하시겠습니까?';

    if (!window.confirm(confirmMessage)) return;

    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        await deleteCategory(categoryId);
        // 삭제 후 상태 업데이트 로직 단순화 (fetchData 호출로 대체)
        await fetchData();
        setEditingCategoryId(null);
        setSelectedCategoryIdForSub(null);
        resolve();
      } catch (err) {
        console.error("카테고리 삭제 오류:", err);
        reject(err);
      }
    });

    toast.promise(promise, {
      loading: '카테고리 삭제 중...',
      success: '카테고리가 성공적으로 삭제되었습니다.',
      error: "카테고리 삭제에 실패했습니다.",
    });
  };

  const handleAddSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSubName = newSubCategoryName.trim();
    if (!selectedCategoryIdForSub || !trimmedSubName) {
      toast.error('하위 카테고리 이름을 입력해주세요.');
      return;
    }

    const categoryToUpdate = categories.find((cat: Category) => cat.id === selectedCategoryIdForSub);
    if (!categoryToUpdate) return;
    
    if (categoryToUpdate.subCategories.includes(trimmedSubName)) {
        toast.error('이미 존재하는 하위 카테고리 이름입니다.');
        return;
    }

    const promise = new Promise<void>(async (resolve, reject) => {
        try {
            const updatedSubCategories = [...categoryToUpdate.subCategories, trimmedSubName];
            await updateCategory(selectedCategoryIdForSub, { subCategories: updatedSubCategories });
            // 상태 업데이트 단순화
            await fetchData();
            setNewSubCategoryName('');
            resolve();
        } catch(err) {
            console.error("하위 카테고리 추가 오류:", err);
            reject(err);
        }
    });
    
    toast.promise(promise, {
      loading: '하위 카테고리 추가 중...',
      success: `'${trimmedSubName}' 하위 카테고리가 추가되었습니다.`,
      error: "하위 카테고리 추가에 실패했습니다.",
    });
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    
    if (type === 'CATEGORY') {
        const reordered = Array.from(categories);
        const [removed] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, removed);
        setCategories(reordered);
        const promise = updateCategoriesOrder(reordered);
        toast.promise(promise, {
            loading: '순서 저장 중...',
            success: '카테고리 순서가 저장되었습니다.',
            error: '순서 저장에 실패했습니다.'
        });
    }

    if (type === 'SUBCATEGORY') {
        const categoryId = source.droppableId.replace('subcategories-', '');
        const category = categories.find(c => c.id === categoryId);
        if (!category) return;
        
        const newSubCategories = Array.from(category.subCategories);
        const [removed] = newSubCategories.splice(source.index, 1);
        newSubCategories.splice(destination.index, 0, removed);
        
        const newCategories = categories.map(c => 
            c.id === categoryId ? { ...c, subCategories: newSubCategories } : c
        );
        setCategories(newCategories);
        
        const promise = updateCategory(categoryId, { subCategories: newSubCategories });
        toast.promise(promise, {
            loading: '순서 저장 중...',
            success: '하위 카테고리 순서가 저장되었습니다.',
            error: '순서 저장에 실패했습니다.'
        });
    }
  };

  const handleEditCategoryNameStart = (category: Category) => { setEditingCategoryId(category.id); setCurrentEditingName(category.name); setSelectedCategoryIdForSub(null); };
  const handleUpdateCategoryName = async (categoryId: string) => {
    const trimmedName = currentEditingName.trim();
    if (!trimmedName) { toast.error('카테고리 이름을 입력해주세요.'); return; }
    if (categories.some(cat => cat.name === trimmedName && cat.id !== categoryId)) { toast.error('이미 존재하는 카테고리 이름입니다.'); return; }
    const promise = updateCategory(categoryId, { name: trimmedName }).then(() => { setEditingCategoryId(null); setCurrentEditingName(''); fetchData(); });
    toast.promise(promise, { loading: '수정 중...', success: '이름이 수정되었습니다.', error: '수정 실패' });
  };
  const handleCancelEditCategoryName = () => { setEditingCategoryId(null); setCurrentEditingName(''); };
  const handleToggleSubCategoryAddForm = (categoryId: string) => { setSelectedCategoryIdForSub(categoryId === selectedCategoryIdForSub ? null : categoryId); setNewSubCategoryName(''); setEditingCategoryId(null); setEditingSubCategory(null); };
  const handleDeleteSubCategory = async (categoryId: string, subCategoryToDelete: string) => {
    if (!window.confirm(`"${subCategoryToDelete}" 하위 카테고리를 삭제하시겠습니까?`)) return;
    const categoryToUpdate = categories.find((cat) => cat.id === categoryId);
    if (categoryToUpdate) {
      const updatedSubCategories = categoryToUpdate.subCategories.filter((sub) => sub !== subCategoryToDelete);
      const promise = updateCategory(categoryId, { subCategories: updatedSubCategories }).then(fetchData);
      toast.promise(promise, { loading: '삭제 중...', success: '삭제되었습니다.', error: '삭제 실패' });
    }
  };
  const handleEditSubCategoryNameStart = (categoryId: string, oldName: string) => { setEditingSubCategory({ categoryId, oldName }); setCurrentEditingName(oldName); setEditingCategoryId(null); setSelectedCategoryIdForSub(null); };
  const handleUpdateSubCategoryName = async () => {
    if (!editingSubCategory) return;
    const trimmedName = currentEditingName.trim();
    if (!trimmedName) { toast.error('하위 카테고리 이름을 입력해주세요.'); return; }
    const categoryToUpdate = categories.find((cat) => cat.id === editingSubCategory.categoryId);
    if (categoryToUpdate) {
      if (categoryToUpdate.subCategories.some(sub => sub === trimmedName && sub !== editingSubCategory.oldName)) { toast.error('이미 존재하는 하위 카테고리 이름입니다.'); return; }
      const updatedSubCategories = categoryToUpdate.subCategories.map((sub) => (sub === editingSubCategory.oldName ? trimmedName : sub));
      const promise = updateCategory(editingSubCategory.categoryId, { subCategories: updatedSubCategories }).then(() => { setEditingSubCategory(null); setCurrentEditingName(''); fetchData(); });
      toast.promise(promise, { loading: '수정 중...', success: '이름이 수정되었습니다.', error: '수정 실패' });
    }
  };
  const handleCancelEditSubCategoryName = () => { setEditingSubCategory(null); setCurrentEditingName(''); };

  return (
    <div className="category-management-container">
      {loading && ( <div className="loading-overlay"> <Loader size={48} className="spin" /> <p>데이터 처리 중...</p> </div> )}
      {error && <div className="error-message-banner">{error}</div>}

      <div className="category-form-section section-card">
        <h3>대분류 카테고리 추가</h3>
        <form onSubmit={handleAddCategory} className="category-form">
          <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="새 대분류 카테고리 이름" disabled={loading} />
          <button type="submit" disabled={loading}><PlusCircle size={20} /> 추가</button>
        </form>
      </div>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="category-list-section section-card">
          <h3>전체 카테고리 목록 (드래그하여 순서 변경)</h3>
          
          {categories.length > 0 ? (
            <Droppable droppableId="categories" type="CATEGORY">
              {(provided) => (
                <ul className="category-list" {...provided.droppableProps} ref={provided.innerRef}>
                  {categories.map((category, index) => (
                    <Draggable key={category.id} draggableId={category.id} index={index}>
                      {(provided, snapshot) => (
                        <li 
                          ref={provided.innerRef} 
                          {...provided.draggableProps} 
                          className={`category-item ${selectedCategoryIdForSub === category.id ? 'selected' : ''} ${snapshot.isDragging ? 'dragging' : ''}`}
                        >
                          <div className="category-main-row">
                            <div {...provided.dragHandleProps} className="drag-handle">
                              <GripVertical size={20} />
                            </div>
                            {editingCategoryId === category.id ? (
                              <form onSubmit={(e) => { e.preventDefault(); handleUpdateCategoryName(category.id); }} className="inline-edit-form">
                                <input type="text" value={currentEditingName} onChange={(e) => setCurrentEditingName(e.target.value)} onBlur={() => handleUpdateCategoryName(category.id)} autoFocus disabled={loading} />
                                <button type="submit" disabled={loading}><Check size={20} /></button>
                                <button type="button" onClick={handleCancelEditCategoryName} disabled={loading}><X size={20} /></button>
                              </form>
                            ) : (
                              // ✅ [수정] 상품 개수 표시 로직 변경
                              <span className="category-name-display" onClick={() => handleToggleSubCategoryAddForm(category.id)}>
                                {category.name} ({productCounts[category.id] || 0})
                              </span>
                            )}
                            <div className="category-actions">
                              {editingCategoryId !== category.id && ( <button onClick={() => handleEditCategoryNameStart(category)} disabled={loading} className="icon-btn"><Edit size={18} /></button> )}
                              <button onClick={() => handleDeleteCategory(category.id)} disabled={loading} className="icon-btn trash-btn"><Trash2 size={18} /></button>
                            </div>
                          </div>

                          <Droppable droppableId={`subcategories-${category.id}`} type="SUBCATEGORY">
                            {(provided) => (
                                <ul className="subcategory-list" {...provided.droppableProps} ref={provided.innerRef}>
                                    {category.subCategories.map((sub, idx) => {
                                      // ✅ [추가] 하위 카테고리 키 생성
                                      const subCategoryKey = `${category.id}_${sub}`;
                                      return (
                                        <Draggable key={subCategoryKey} draggableId={subCategoryKey} index={idx}>
                                            {(provided, snapshot) => (
                                                <li
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={`subcategory-item ${snapshot.isDragging ? 'dragging' : ''}`}
                                                >
                                                    <div {...provided.dragHandleProps} className="drag-handle-sub">
                                                        <GripVertical size={16} />
                                                    </div>
                                                    {editingSubCategory?.categoryId === category.id && editingSubCategory.oldName === sub ? (
                                                        <form onSubmit={(e) => { e.preventDefault(); handleUpdateSubCategoryName(); }} className="inline-edit-form subcategory-inline-edit">
                                                            <input type="text" value={currentEditingName} onChange={(e) => setCurrentEditingName(e.target.value)} onBlur={handleUpdateSubCategoryName} autoFocus disabled={loading} />
                                                            <button type="submit" disabled={loading}><Check size={18} /></button>
                                                            <button type="button" onClick={handleCancelEditSubCategoryName} disabled={loading}><X size={18} /></button>
                                                        </form>
                                                    ) : (
                                                      // ✅ [수정] 하위 카테고리 상품 개수 표시
                                                      <span onClick={() => handleEditSubCategoryNameStart(category.id, sub)} className="subcategory-name-display">
                                                        {sub} ({productCounts[subCategoryKey] || 0})
                                                      </span>
                                                    )}
                                                    <button onClick={() => handleDeleteSubCategory(category.id, sub)} disabled={loading} className="icon-btn trash-btn"><Trash2 size={16} /></button>
                                                </li>
                                            )}
                                        </Draggable>
                                      );
                                    })}
                                    {provided.placeholder}
                                </ul>
                            )}
                          </Droppable>

                          {selectedCategoryIdForSub === category.id && (
                            <div className="add-subcategory-form-wrapper">
                                <form onSubmit={handleAddSubCategory} className="subcategory-add-form">
                                    <input type="text" value={newSubCategoryName} onChange={(e) => setNewSubCategoryName(e.target.value)} placeholder="새 하위 카테고리 이름" disabled={loading} />
                                    <button type="submit" disabled={loading}><PlusCircle size={18} /> 추가</button>
                                    <button type="button" onClick={() => handleToggleSubCategoryAddForm(category.id)} disabled={loading} className="cancel-btn icon-btn"><X size={18} /></button>
                                </form>
                            </div>
                          )}
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          ) : (
            !loading && <p className="no-data-message">등록된 카테고리가 없습니다. 위 폼을 통해 추가해주세요.</p>
          )}

        </div>
      </DragDropContext>
    </div>
  );
};

export default CategoryManagementPage;