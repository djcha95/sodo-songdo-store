// src/pages/customer/StoreInfoPage.tsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getStoreInfo, updateStoreInfo } from '@/firebase';
import { useAuth } from '@/context/AuthContext';
import type { StoreInfo, GuideItem, FaqItem } from '@/types';
import './StoreInfoPage.css';
import { AlertTriangle, MapPin, ChevronDown, BookOpen, HelpCircle, Edit, Save, PlusCircle, XCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

// --- 하위 컴포넌트: 즉시 수정을 위한 컴포넌트 ---
interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => void;
  isAdmin: boolean;
  as?: 'input' | 'textarea';
  className?: string;
}

const EditableField: React.FC<EditableFieldProps> = ({ value, onSave, isAdmin, as = 'input', className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);
  
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (currentValue !== value) {
      onSave(currentValue);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && as === 'input') {
      handleSave();
    } else if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };
  
  if (!isAdmin) {
    return <span className={className}>{value}</span>;
  }
  
  if (isEditing) {
    const commonProps = {
      ref: inputRef as any,
      value: currentValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCurrentValue(e.target.value),
      onBlur: handleSave,
      onKeyDown: handleKeyDown,
      className: "inline-edit-input"
    };
    return as === 'textarea' 
      ? <textarea {...commonProps} rows={3} /> 
      : <input {...commonProps} />;
  }
  
  return (
    <span className={`${className} editable`} onClick={() => setIsEditing(true)}>
      {value || '(내용 없음)'}
      <Edit size={12} className="edit-pencil-icon"/>
    </span>
  );
};

// --- 하위 컴포넌트: FAQ (보기 전용) ---
interface FaqItemViewProps { question: string; answer: React.ReactNode; }
const FaqItemView: React.FC<FaqItemViewProps> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={`faq-item ${isOpen ? 'open' : ''}`}>
      <button className="faq-question" onClick={() => setIsOpen(!isOpen)}>
        <span>{question}</span>
        <ChevronDown className="faq-icon" size={20} />
      </button>
      {isOpen && <div className="faq-answer">{answer}</div>}
    </div>
  );
};


// --- 메인 컴포넌트 ---
const StoreInfoPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [editableInfo, setEditableInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('info');
  const [hasChanges, setHasChanges] = useState(false);

  const fetchStoreInformation = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedInfo = await getStoreInfo();
      const initialInfo = fetchedInfo || { 
        name: '', businessNumber: '', representative: '', address: '', phoneNumber: '', email: '',
        operatingHours: [], description: '', kakaotalkChannelId: '', usageGuide: [], faq: [],
      };
      setStoreInfo(initialInfo);
      setEditableInfo(JSON.parse(JSON.stringify(initialInfo)));
    } catch (err) {
      console.error("매장 정보 불러오기 오류:", err);
      setError("매장 정보를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStoreInformation();
  }, [fetchStoreInformation]);
  
  // 변경사항이 있는지 확인
  useEffect(() => {
    setHasChanges(JSON.stringify(storeInfo) !== JSON.stringify(editableInfo));
  }, [storeInfo, editableInfo]);


  const updateField = (field: keyof StoreInfo, value: any) => {
    setEditableInfo(prev => prev ? { ...prev, [field]: value } : null);
  };
  
  // [수정] 타입스크립트 오류 해결을 위해 함수 오버로딩 적용
  type UpdateArrayItem = {
    (index: number, field: keyof GuideItem, value: string, arrayName: 'usageGuide'): void;
    (index: number, field: keyof FaqItem, value: string, arrayName: 'faq'): void;
  };

  const updateArrayItem: UpdateArrayItem = (index: number, field: any, value: string, arrayName: 'usageGuide' | 'faq') => {
    setEditableInfo(prev => {
        if (!prev) return null;
        const currentArray = prev[arrayName] || [];
        const newArray = [...currentArray];
        if (newArray[index]) {
            newArray[index] = { ...newArray[index], [field]: value };
        }
        return { ...prev, [arrayName]: newArray };
    });
  };
  
  const addArrayItem = (arrayName: 'usageGuide' | 'faq') => {
    setEditableInfo(prev => {
      if (!prev) return null;
      const newItem = arrayName === 'usageGuide' 
        ? { id: uuidv4(), title: '새로운 안내', content: '내용을 입력하세요.' }
        : { id: uuidv4(), question: '새로운 질문', answer: '답변을 입력하세요.' };
      const newArray = [...(prev[arrayName] || []), newItem];
      return { ...prev, [arrayName]: newArray };
    });
  };

  const removeArrayItem = (id: string, arrayName: 'usageGuide' | 'faq') => {
    setEditableInfo(prev => {
      if (!prev) return null;
      const currentArray = prev[arrayName] || [];
      const newArray = currentArray.filter(item => item.id !== id);
      return { ...prev, [arrayName]: newArray };
    });
  };

  const handleSave = async () => {
    if (!editableInfo) return;
    const promise = updateStoreInfo(editableInfo);
    await toast.promise(promise, {
      loading: '정보를 저장하는 중...',
      success: '성공적으로 저장되었습니다!',
      error: '저장 중 오류가 발생했습니다.',
    });
    setStoreInfo(JSON.parse(JSON.stringify(editableInfo)));
    setHasChanges(false);
  };
  
  const handleCancel = () => {
    setEditableInfo(JSON.parse(JSON.stringify(storeInfo)));
    setHasChanges(false);
  }

  if (loading) return <div className="customer-service-container centered-message"><p>고객센터 정보를 불러오는 중...</p></div>;
  if (error || !storeInfo || !editableInfo) return <div className="customer-service-container centered-message"><div className="info-error-card"><AlertTriangle size={40} className="error-icon" /><p>{error || '정보를 불러올 수 없습니다.'}</p></div></div>;
  

  return (
    <div className="customer-service-container">
        {isAdmin && hasChanges && (
            <div className="admin-edit-controls floating">
                <button className="admin-action-btn cancel" onClick={handleCancel}><X size={16}/> 취소</button>
                <button className="admin-action-btn save" onClick={handleSave}><Save size={16}/> 변경사항 저장</button>
            </div>
        )}

      <div className="service-tabs">
        <button onClick={() => setActiveTab('info')} className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}><MapPin size={16}/> 매장 정보</button>
        <button onClick={() => setActiveTab('guide')} className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`}><BookOpen size={16}/> 이용 안내</button>
        <button onClick={() => setActiveTab('faq')} className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}><HelpCircle size={16}/> 자주 묻는 질문</button>
      </div>

      <div className="service-content">
        {activeTab === 'info' && (
          <section className="service-section">
            <div className="info-item"><span className="info-label">상호</span><EditableField value={editableInfo.name} onSave={(v) => updateField('name', v)} isAdmin={isAdmin} className="info-value"/></div>
            <div className="info-item"><span className="info-label">한 줄 설명</span><EditableField value={editableInfo.description} onSave={(v) => updateField('description', v)} isAdmin={isAdmin} as="textarea" className="info-value"/></div>
            <div className="info-item"><span className="info-label">주소</span><EditableField value={editableInfo.address} onSave={(v) => updateField('address', v)} isAdmin={isAdmin} className="info-value"/></div>
            <div className="info-item"><span className="info-label">연락처</span><EditableField value={editableInfo.phoneNumber} onSave={(v) => updateField('phoneNumber', v)} isAdmin={isAdmin} className="info-value"/></div>
            <div className="info-item"><span className="info-label">이메일</span><EditableField value={editableInfo.email} onSave={(v) => updateField('email', v)} isAdmin={isAdmin} className="info-value"/></div>
            <div className="info-item"><span className="info-label">카카오톡 채널 ID</span><EditableField value={editableInfo.kakaotalkChannelId || ''} onSave={(v) => updateField('kakaotalkChannelId', v)} isAdmin={isAdmin} className="info-value"/></div>
            <div className="info-item"><span className="info-label">운영 시간</span><EditableField value={editableInfo.operatingHours.join('\n')} onSave={(v) => updateField('operatingHours', v.split('\n'))} isAdmin={isAdmin} as="textarea" className="info-value operating-hours-list"/></div>
          </section>
        )}
        {activeTab === 'guide' && (
          <section className="service-section text-content-section">
            {editableInfo.usageGuide?.map((guide, index) => (
                <div key={guide.id} className="editable-list-item">
                    {isAdmin && <button className="delete-item-btn" onClick={() => removeArrayItem(guide.id, 'usageGuide')}><XCircle size={18}/></button>}
                    <EditableField value={guide.title} onSave={(v) => updateArrayItem(index, 'title', v, 'usageGuide')} isAdmin={isAdmin} className="editable-list-title"/>
                    <EditableField value={guide.content} onSave={(v) => updateArrayItem(index, 'content', v, 'usageGuide')} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
                </div>
            ))}
            {isAdmin && <button className="add-array-item-btn" onClick={() => addArrayItem('usageGuide')}><PlusCircle size={16}/> 이용 안내 추가</button>}
          </section>
        )}
        {activeTab === 'faq' && (
          <section className="service-section faq-section">
            {isAdmin 
              ? editableInfo.faq?.map((item, index) => (
                  <div key={item.id} className="editable-list-item">
                      {isAdmin && <button className="delete-item-btn" onClick={() => removeArrayItem(item.id, 'faq')}><XCircle size={18}/></button>}
                      <EditableField value={item.question} onSave={(v) => updateArrayItem(index, 'question', v, 'faq')} isAdmin={isAdmin} className="editable-list-title"/>
                      <EditableField value={item.answer} onSave={(v) => updateArrayItem(index, 'answer', v, 'faq')} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
                  </div>
                ))
              : storeInfo.faq?.map(item => <FaqItemView key={item.id} question={item.question} answer={item.answer} />)
            }
            {isAdmin && <button className="add-array-item-btn" onClick={() => addArrayItem('faq')}><PlusCircle size={16}/> FAQ 추가</button>}
          </section>
        )}
      </div>
    </div>
  );
};

export default StoreInfoPage;