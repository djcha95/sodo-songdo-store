// src/pages/admin/CategoryManagementPage.tsx

import { useState, useEffect } from 'react';
import { addCategory, getCategories, updateCategory, deleteCategory } from '../../firebase';
import type { Category } from '../../types';
import { PlusCircle, Edit, Trash2, X, Check, Loader } from 'lucide-react';
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트
import './CategoryManagementPage.css';

const CategoryManagementPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newSubCategoryName, setNewSubCategoryName] = useState<string>('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingSubCategory, setEditingSubCategory] = useState<{ categoryId: string; oldName: string; } | null>(null);
  const [currentEditingName, setCurrentEditingName] = useState<string>('');
  const [selectedCategoryIdForSub, setSelectedCategoryIdForSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedCategories = await getCategories();
      setCategories(fetchedCategories);
    } catch (err) {
      console.error("카테고리 불러오기 오류:", err);
      setError("카테고리 정보를 불러오는 데 실패했습니다.");
      toast.error("카테고리 정보를 불러오는 데 실패했습니다."); // [추가] toast 알림
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      toast.error('대분류 카테고리 이름을 입력해주세요.'); // [수정] toast 알림
      return;
    }
    
    if (categories.some(cat => cat.name === trimmedName)) {
        toast.error('이미 존재하는 대분류 카테고리 이름입니다.'); // [수정] toast 알림
        return;
    }

    setLoading(true);
    try {
      const newCategory: Omit<Category, 'id'> = {
        name: trimmedName,
        subCategories: []
      };
      await addCategory(newCategory);
      setNewCategoryName('');
      await fetchCategories();
      toast.success(`'${trimmedName}' 카테고리가 성공적으로 추가되었습니다.`); // [추가] toast 알림
    } catch (err) {
      console.error("카테고리 추가 오류:", err);
      setError("카테고리 추가에 실패했습니다.");
      toast.error("카테고리 추가에 실패했습니다."); // [추가] toast 알림
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategoryNameStart = (category: Category) => {
    setEditingCategoryId(category.id);
    setCurrentEditingName(category.name);
    setSelectedCategoryIdForSub(null);
  };

  const handleUpdateCategoryName = async (categoryId: string) => {
    const trimmedName = currentEditingName.trim();
    if (!trimmedName) {
      toast.error('카테고리 이름을 입력해주세요.'); // [수정] toast 알림
      return;
    }

    // 이름 중복 확인
    if (categories.some(cat => cat.name === trimmedName && cat.id !== categoryId)) {
        toast.error('이미 존재하는 카테고리 이름입니다.'); // [수정] toast 알림
        return;
    }

    setLoading(true);
    try {
      await updateCategory(categoryId, { name: trimmedName });
      setEditingCategoryId(null);
      setCurrentEditingName('');
      await fetchCategories();
      toast.success('카테고리 이름이 성공적으로 수정되었습니다.'); // [추가] toast 알림
    } catch (err) {
      console.error("카테고리 이름 수정 오류:", err);
      setError("카테고리 이름 수정에 실패했습니다.");
      toast.error("카테고리 이름 수정에 실패했습니다."); // [추가] toast 알림
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditCategoryName = () => {
    setEditingCategoryId(null);
    setCurrentEditingName('');
  };

  const handleDeleteCategory = async (categoryId: string) => {
    // [수정] window.confirm 대신 toast.promise를 활용한 확정/취소 메시지
    toast.promise(
      new Promise(async (resolve, reject) => {
        if (!window.confirm('이 대분류 카테고리와 모든 하위 카테고리를 삭제하시겠습니까? 관련된 상품들의 카테고리도 수동으로 업데이트해야 할 수 있습니다.')) {
          return reject(new Error('삭제 취소'));
        }
        try {
          await deleteCategory(categoryId);
          setEditingCategoryId(null);
          setSelectedCategoryIdForSub(null);
          await fetchCategories();
          resolve('삭제 성공');
        } catch (err) {
          console.error("카테고리 삭제 오류:", err);
          reject(new Error("카테고리 삭제에 실패했습니다."));
        }
      }),
      {
        loading: '카테고리 삭제 중...',
        success: '카테고리가 성공적으로 삭제되었습니다.',
        error: (err) => err.message,
      }
    );
  };

  const handleToggleSubCategoryAddForm = (categoryId: string) => {
    setSelectedCategoryIdForSub(categoryId === selectedCategoryIdForSub ? null : categoryId);
    setNewSubCategoryName(''); // 폼 토글 시 입력 필드 초기화
    setEditingCategoryId(null); // 대분류 편집 모드 비활성화
    setEditingSubCategory(null); // 하위 카테고리 편집 모드 비활성화
  };

  const handleAddSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSubName = newSubCategoryName.trim();
    if (!selectedCategoryIdForSub || !trimmedSubName) {
      toast.error('하위 카테고리 이름을 입력해주세요.'); // [수정] toast 알림
      return;
    }

    setLoading(true);
    try {
      const categoryToUpdate = categories.find((cat: Category) => cat.id === selectedCategoryIdForSub);
      if (categoryToUpdate) {
        if (categoryToUpdate.subCategories.includes(trimmedSubName)) {
            toast.error('이미 존재하는 하위 카테고리 이름입니다.'); // [수정] toast 알림
            setLoading(false);
            return;
        }
        const updatedSubCategories = [...categoryToUpdate.subCategories, trimmedSubName];
        await updateCategory(selectedCategoryIdForSub, { subCategories: updatedSubCategories });
        setNewSubCategoryName('');
        await fetchCategories();
        toast.success(`'${trimmedSubName}' 하위 카테고리가 추가되었습니다.`); // [추가] toast 알림
      }
    } catch (err) {
      console.error("하위 카테고리 추가 오류:", err);
      setError("하위 카테고리 추가에 실패했습니다.");
      toast.error("하위 카테고리 추가에 실패했습니다."); // [추가] toast 알림
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubCategory = async (categoryId: string, subCategoryToDelete: string) => {
    // [수정] window.confirm 대신 toast.promise를 활용한 확정/취소 메시지
    toast.promise(
      new Promise(async (resolve, reject) => {
        if (!window.confirm(`"${subCategoryToDelete}" 하위 카테고리를 삭제하시겠습니까?`)) {
          return reject(new Error('삭제 취소'));
        }
        try {
          const categoryToUpdate = categories.find((cat: Category) => cat.id === categoryId);
          if (categoryToUpdate) {
            const updatedSubCategories = categoryToUpdate.subCategories.filter(
              (sub: string) => sub !== subCategoryToDelete
            );
            await updateCategory(categoryId, { subCategories: updatedSubCategories });
            await fetchCategories();
            resolve('삭제 성공');
          } else {
            reject(new Error('카테고리를 찾을 수 없습니다.'));
          }
        } catch (err) {
          console.error("하위 카테고리 삭제 오류:", err);
          reject(new Error("하위 카테고리 삭제에 실패했습니다."));
        }
      }),
      {
        loading: '하위 카테고리 삭제 중...',
        success: '하위 카테고리가 성공적으로 삭제되었습니다.',
        error: (err) => err.message,
      }
    );
  };

  const handleEditSubCategoryNameStart = (categoryId: string, oldName: string) => {
    setEditingSubCategory({ categoryId, oldName });
    setCurrentEditingName(oldName);
    setEditingCategoryId(null);
    setSelectedCategoryIdForSub(null);
  };

  const handleUpdateSubCategoryName = async () => {
    if (!editingSubCategory) return;

    const trimmedName = currentEditingName.trim();
    if (!trimmedName) {
      toast.error('하위 카테고리 이름을 입력해주세요.'); // [수정] toast 알림
      return;
    }

    setLoading(true);
    try {
      const categoryToUpdate = categories.find((cat: Category) => cat.id === editingSubCategory.categoryId);
      if (categoryToUpdate) {
        // 하위 카테고리 이름 중복 확인
        if (categoryToUpdate.subCategories.some(sub => sub === trimmedName && sub !== editingSubCategory.oldName)) {
            toast.error('이미 존재하는 하위 카테고리 이름입니다.'); // [수정] toast 알림
            setLoading(false);
            return;
        }

        const updatedSubCategories = categoryToUpdate.subCategories.map((sub: string) =>
          sub === editingSubCategory.oldName ? trimmedName : sub
        );
        await updateCategory(editingSubCategory.categoryId, { subCategories: updatedSubCategories });
        setEditingSubCategory(null);
        setCurrentEditingName('');
        await fetchCategories();
        toast.success('하위 카테고리 이름이 성공적으로 수정되었습니다.'); // [추가] toast 알림
      }
    } catch (err) {
      console.error("하위 카테고리 이름 수정 오류:", err);
      setError("하위 카테고리 이름 수정에 실패했습니다.");
      toast.error("하위 카테고리 이름 수정에 실패했습니다."); // [추가] toast 알림
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditSubCategoryName = () => {
    setEditingSubCategory(null);
    setCurrentEditingName('');
  };

  return (
    <div className="category-management-container">
      {loading && (
        <div className="loading-overlay">
          <Loader size={48} className="spin" />
          <p>데이터를 불러오는 중...</p>
        </div>
      )}
      {error && <div className="error-message-banner">{error}</div>} {/* 오류 메시지 배너는 유지 */}

      <div className="category-form-section section-card">
        <h3>대분류 카테고리 추가</h3>
        <form onSubmit={handleAddCategory} className="category-form">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="새 대분류 카테고리 이름"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            <PlusCircle size={20} /> 추가
          </button>
        </form>
      </div>

      <div className="category-list-section section-card">
        <h3>전체 카테고리 목록</h3>
        {categories.length === 0 && !loading && !error ? (
          <p className="no-data-message">등록된 카테고리가 없습니다. 위 폼을 통해 추가해주세요.</p>
        ) : (
          <ul className="category-list">
            {categories.map((category: Category) => (
              <li key={category.id} className={`category-item ${selectedCategoryIdForSub === category.id ? 'selected' : ''}`}>
                <div className="category-main-row">
                  {editingCategoryId === category.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleUpdateCategoryName(category.id); }} className="inline-edit-form">
                      <input
                        type="text"
                        value={currentEditingName}
                        onChange={(e) => setCurrentEditingName(e.target.value)}
                        onBlur={() => handleUpdateCategoryName(category.id)}
                        autoFocus
                        disabled={loading}
                      />
                      <button type="submit" disabled={loading}><Check size={20} /></button>
                      <button type="button" onClick={handleCancelEditCategoryName} disabled={loading}><X size={20} /></button>
                    </form>
                  ) : (
                    <span className="category-name-display" onClick={() => handleToggleSubCategoryAddForm(category.id)}>
                      {category.name} ({category.subCategories.length})
                    </span>
                  )}

                  <div className="category-actions">
                    {editingCategoryId !== category.id && (
                        <button onClick={() => handleEditCategoryNameStart(category)} disabled={loading} className="icon-btn"><Edit size={18} /></button>
                    )}
                    <button onClick={() => handleDeleteCategory(category.id)} disabled={loading} className="icon-btn trash-btn"><Trash2 size={18} /></button>
                  </div>
                </div>

                {selectedCategoryIdForSub === category.id && (
                    <div className="add-subcategory-form-wrapper">
                        <form onSubmit={handleAddSubCategory} className="subcategory-add-form">
                            <input
                                type="text"
                                value={newSubCategoryName}
                                onChange={(e) => setNewSubCategoryName(e.target.value)}
                                placeholder="새 하위 카테고리 이름"
                                disabled={loading}
                            />
                            <button type="submit" disabled={loading}><PlusCircle size={18} /> 추가</button>
                            <button type="button" onClick={() => handleToggleSubCategoryAddForm(category.id)} disabled={loading} className="cancel-btn icon-btn"><X size={18} /></button>
                        </form>
                    </div>
                )}

                {category.subCategories.length > 0 && (
                  <ul className="subcategory-list">
                    {category.subCategories.map((sub: string, idx: number) => (
                      <li key={idx} className="subcategory-item">
                        {editingSubCategory?.categoryId === category.id && editingSubCategory.oldName === sub ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleUpdateSubCategoryName(); }} className="inline-edit-form subcategory-inline-edit">
                                <input
                                    type="text"
                                    value={currentEditingName}
                                    onChange={(e) => setCurrentEditingName(e.target.value)}
                                    onBlur={handleUpdateSubCategoryName}
                                    autoFocus
                                    disabled={loading}
                                />
                                <button type="submit" disabled={loading}><Check size={18} /></button>
                                <button type="button" onClick={handleCancelEditSubCategoryName} disabled={loading}><X size={18} /></button>
                            </form>
                        ) : (
                            <span onClick={() => handleEditSubCategoryNameStart(category.id, sub)} className="subcategory-name-display">
                                {sub}
                            </span>
                        )}
                        <button onClick={() => handleDeleteSubCategory(category.id, sub)} disabled={loading} className="icon-btn trash-btn"><Trash2 size={16} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CategoryManagementPage;