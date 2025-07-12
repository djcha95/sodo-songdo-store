// src/pages/customer/StoreInfoPage.tsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getStoreInfo, updateStoreInfo } from '@/firebase'; 
import { useAuth } from '@/context/AuthContext';
import type { StoreInfo, GuideItem, FaqItem } from '@/types'; 
import './StoreInfoPage.css';
import { AlertTriangle, MapPin, BookOpen, HelpCircle, Edit, Save, X, MessageSquare } from 'lucide-react'; // MessageCircle 제거
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import InfoTab from '@/components/customer/InfoTab'; 
import GuideTab from '@/components/customer/GuideTab';
import FaqTab from '@/components/customer/FaqTab';

export interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => void;
  isAdmin: boolean;
  as?: 'input' | 'textarea';
  className?: string;
}

export const EditableField: React.FC<EditableFieldProps> = ({ value, onSave, isAdmin, as = 'input', className = '' }) => {
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
      // ✅ [수정] 초기값에서 chatLink 제거
      const initialInfo: StoreInfo = fetchedInfo || { 
        name: '', businessNumber: '', representative: '', address: '', phoneNumber: '', email: '',
        operatingHours: [], description: '', kakaotalkChannelId: '',
        usageGuide: [], faq: [],
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
  
  useEffect(() => {
    if (storeInfo && editableInfo) {
      setHasChanges(JSON.stringify(storeInfo) !== JSON.stringify(editableInfo));
    }
  }, [storeInfo, editableInfo]);

  const updateField = (field: keyof StoreInfo, value: any) => {
    setEditableInfo(prev => prev ? { ...prev, [field]: value } : null);
  };
  
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
        return { ...prev, [arrayName]: newArray as any };
    });
  };
  
  const addArrayItem = (arrayName: 'usageGuide' | 'faq') => {
    setEditableInfo(prev => {
      if (!prev) return null;
      const newItem = arrayName === 'usageGuide' 
        ? { id: uuidv4(), title: '새로운 안내', content: '내용을 입력하세요.' }
        : { id: uuidv4(), question: '새로운 질문', answer: '답변을 입력하세요.' };
      
      const currentArray = prev[arrayName] || [];
      const newArray = [...currentArray, newItem];
      return { ...prev, [arrayName]: newArray as any };
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

      <section className="service-section quick-links">
        <div className="contact-buttons">
          {/* ✅ [수정] 카카오톡 채널 ID로 1:1 채팅 링크를 생성하고, ID가 없을 경우 비활성화합니다. */}
          <a 
            href={storeInfo.kakaotalkChannelId ? `http://pf.kakao.com/${storeInfo.kakaotalkChannelId}/chat` : '#'} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`contact-button primary ${!storeInfo.kakaotalkChannelId && 'disabled'}`}
          >
            <MessageSquare size={18}/> 카카오톡 1:1 문의
          </a>
          {/* ✅ [제거] 실시간 채팅 상담 버튼 제거 */}
        </div>
      </section>

      <div className="service-tabs">
        <button onClick={() => setActiveTab('info')} className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}><MapPin size={16}/> 매장 정보</button>
        <button onClick={() => setActiveTab('guide')} className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`}><BookOpen size={16}/> 이용 안내</button>
        <button onClick={() => setActiveTab('faq')} className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}><HelpCircle size={16}/> 자주 묻는 질문</button>
      </div>

      <div className="service-content">
        {activeTab === 'info' && <InfoTab editableInfo={editableInfo} updateField={updateField} isAdmin={isAdmin} />}
        {activeTab === 'guide' && <GuideTab items={editableInfo.usageGuide || []} isAdmin={isAdmin} updateArrayItem={updateArrayItem as any} addArrayItem={addArrayItem as any} removeArrayItem={removeArrayItem as any} />}
        {activeTab === 'faq' && <FaqTab items={editableInfo.faq || []} isAdmin={isAdmin} updateArrayItem={updateArrayItem as any} addArrayItem={addArrayItem as any} removeArrayItem={removeArrayItem as any} />}
      </div>
    </div>
  );
};

export default StoreInfoPage;