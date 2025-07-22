// src/pages/admin/CategoryManagementPage.tsx

import { useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { addCategory, getCategories, updateCategory, deleteCategory, updateCategoriesOrder, getProductsCountByCategory } from '../../firebase';
import type { Category } from '../../types';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';
import { PlusCircle, Edit, Trash2, X, Check, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
// ✅ [추가] SodomallLoader import
import SodomallLoader from '@/components/common/SodomallLoader';
import './CategoryManagementPage.css';

const CategoryManagementPage: React.FC = () => {
  useDocumentTitle('카테고리 관리');
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [currentEditingName, setCurrentEditingName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedCategories, countsData] = await Promise.all([
        getCategories(),
        getProductsCountByCategory()
      ]);
      
      setCategories(fetchedCategories);
      setProductCounts(countsData);

    } catch (err) {
      console.error("데이터 불러오기 오류:", err);
      setError("카테고리 정보를 불러오는 데 실패했습니다.");
      toast.error("데이터를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      toast.error('카테고리 이름을 입력해주세요.');
      return;
    }
    
    if (categories.some(cat => cat.name === trimmedName)) {
        toast.error('이미 존재하는 카테고리 이름입니다.');
        return;
    }

    const promise = new Promise<void>(async (resolve, reject) => {
        try {
            const newCategory: Omit<Category, 'id'> = {
                name: trimmedName,
                order: categories.length, 
            };
            await addCategory(newCategory);
            setNewCategoryName('');
            await fetchData();
            resolve();
        } catch (err) {
            console.error("카테고리 추가 오류:", err);
            reject(err);
        }
    });

    toast.promise(promise, {
        loading: '카테고리 추가 중...',
        success: `'${trimmedName}' 카테고리가 추가되었습니다.`,
        error: '카테고리 추가에 실패했습니다.',
    });
  };

  const handleDeleteCategory = async (category: Category) => {
    const productCount = productCounts[category.name] || 0;
    const confirmMessage = productCount > 0
      ? `이 카테고리에는 ${productCount}개의 상품이 포함되어 있습니다. 정말 삭제하시겠습니까?\n포함된 상품들은 '분류 없음' 상태가 됩니다.`
      : `"${category.name}" 카테고리를 삭제하시겠습니까?`;

    if (!window.confirm(confirmMessage)) return;

    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        await deleteCategory(category.id, category.name);
        await fetchData();
        setEditingCategoryId(null);
        resolve();
      } catch (err) {
        console.error("카테고리 삭제 오류:", err);
        reject(err);
      }
    });

    toast.promise(promise, {
      loading: '카테고리 삭제 중...',
      success: `'${category.name}' 카테고리가 삭제되었습니다.`,
      error: "카테고리 삭제에 실패했습니다.",
    });
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    
    if (result.type !== 'CATEGORY') return;

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
  };

  const handleEditStart = (category: Category) => {
    setEditingCategoryId(category.id);
    setCurrentEditingName(category.name);
  };

  const handleUpdateName = async (categoryId: string) => {
    const trimmedName = currentEditingName.trim();
    if (!trimmedName) { 
      toast.error('카테고리 이름을 입력해주세요.'); 
      return;
    }
    if (categories.some(cat => cat.name === trimmedName && cat.id !== categoryId)) {
      toast.error('이미 존재하는 카테고리 이름입니다.');
      return;
    }
    
    const promise = updateCategory(categoryId, { name: trimmedName }).then(() => {
      setEditingCategoryId(null);
      setCurrentEditingName('');
      fetchData();
    });

    toast.promise(promise, { loading: '수정 중...', success: '이름이 수정되었습니다.', error: '수정 실패' });
  };

  const handleCancelEdit = () => {
    setEditingCategoryId(null);
    setCurrentEditingName('');
  };

  return (
    <div className="category-management-container">
      {/* ✅ [수정] loading 상태일 때 SodomallLoader를 사용합니다. */}
      {loading && <SodomallLoader message="데이터 처리 중..." />}
      {error && <div className="error-message-banner">{error}</div>}

      <div className="category-form-section section-card">
        <h3>새 카테고리 추가</h3>
        <form onSubmit={handleAddCategory} className="category-form">
          <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="새 카테고리 이름" disabled={loading} />
          <button type="submit" disabled={loading}><PlusCircle size={20} /> 추가</button>
        </form>
      </div>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="category-list-section section-card">
          <h3>카테고리 목록 (드래그하여 순서 변경)</h3>
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
                          className={`category-item ${snapshot.isDragging ? 'dragging' : ''}`}
                        >
                          <div className="category-main-row">
                            <div {...provided.dragHandleProps} className="drag-handle">
                              <GripVertical size={20} />
                            </div>
                            {editingCategoryId === category.id ? (
                              <form onSubmit={(e) => { e.preventDefault(); handleUpdateName(category.id); }} className="inline-edit-form">
                                <input type="text" value={currentEditingName} onChange={(e) => setCurrentEditingName(e.target.value)} onBlur={() => handleUpdateName(category.id)} autoFocus disabled={loading} />
                                <button type="submit" disabled={loading}><Check size={20} /></button>
                                <button type="button" onClick={handleCancelEdit} disabled={loading}><X size={20} /></button>
                              </form>
                            ) : (
                              <span className="category-name-display">
                                {category.name} ({productCounts[category.name] || 0})
                              </span>
                            )}
                            <div className="category-actions">
                              {editingCategoryId !== category.id && ( <button onClick={() => handleEditStart(category)} disabled={loading} className="icon-btn"><Edit size={18} /></button> )}
                              <button onClick={() => handleDeleteCategory(category)} disabled={loading} className="icon-btn trash-btn"><Trash2 size={18} /></button>
                            </div>
                          </div>
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