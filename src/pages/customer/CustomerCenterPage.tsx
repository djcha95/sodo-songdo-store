// src/pages/customer/CustomerCenterPage.tsx

import React, { useEffect, useState, useCallback, startTransition } from 'react';
import { getStoreInfo, updateStoreInfo } from '@/firebase';
import { useAuth } from '@/context/AuthContext';
import type { StoreInfo, GuideItem, FaqItem } from '@/types';
import { AlertTriangle, MapPin, BookOpen, HelpCircle, Save, X, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import InfoTab from '@/components/customer/InfoTab';
import GuideTab from '@/components/customer/GuideTab';
import FaqTab from '@/components/customer/FaqTab';
import { isEqual } from 'lodash';
import './CustomerCenterPage.css';

const CustomerCenterPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [editableInfo, setEditableInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'guide' | 'faq'>('info');

  const hasChanges = !isEqual(storeInfo, editableInfo);

  const fetchStoreInformation = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedInfo = await getStoreInfo();
      // ✅ [수정] 초기 데이터 객체에 latitude와 longitude 필드를 추가합니다.
      // 이렇게 하면 Firestore에 좌표 데이터가 없더라도 컴포넌트가 정상적으로 렌더링되고,
      // 관리자는 빈 필드를 보고 값을 입력할 수 있습니다.
      const initialInfo: StoreInfo = fetchedInfo || {
        name: '',
        businessNumber: '',
        representative: '',
        address: '',
        phoneNumber: '',
        email: '',
        operatingHours: [],
        description: '',
        kakaotalkChannelId: '',
        usageGuide: [],
        faq: [],
        latitude: undefined, // 또는 null
        longitude: undefined, // 또는 null
      };
      setStoreInfo(initialInfo);
      setEditableInfo({ ...initialInfo });
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

  const updateField = useCallback((field: keyof StoreInfo, value: any) => {
    setEditableInfo(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const updateGuideItem = useCallback((index: number, field: keyof GuideItem, value: string) => {
    setEditableInfo(prev => {
      if (!prev) return null;
      const newGuide = [...(prev.usageGuide || [])];
      if (newGuide[index]) {
        newGuide[index] = { ...newGuide[index], [field]: value };
      }
      return { ...prev, usageGuide: newGuide };
    });
  }, []);

  const addGuideItem = useCallback(() => {
    const newId = uuidv4();
    setEditableInfo(prev => prev ? {
      ...prev,
      usageGuide: [...(prev.usageGuide || []), { id: newId, title: '새로운 안내', content: '내용을 입력하세요.' }]
    } : null);
  }, []);

  const removeGuideItem = useCallback((id: string) => {
    setEditableInfo(prev => prev ? {
      ...prev,
      usageGuide: (prev.usageGuide || []).filter(item => item.id !== id)
    } : null);
  }, []);

  const updateFaqItem = useCallback((index: number, field: keyof FaqItem, value: string) => {
    setEditableInfo(prev => {
      if (!prev) return null;
      const newFaq = [...(prev.faq || [])];
      if (newFaq[index]) {
        newFaq[index] = { ...newFaq[index], [field]: value };
      }
      return { ...prev, faq: newFaq };
    });
  }, []);

  const addFaqItem = useCallback(() => {
    const newId = uuidv4();
    setEditableInfo(prev => prev ? {
      ...prev,
      faq: [...(prev.faq || []), { id: newId, question: '새로운 질문', answer: '답변을 입력하세요.' }]
    } : null);
  }, []);

  const removeFaqItem = useCallback((id: string) => {
    setEditableInfo(prev => prev ? {
      ...prev,
      faq: (prev.faq || []).filter(item => item.id !== id)
    } : null);
  }, []);

  const handleSave = async () => {
    if (!editableInfo) return;
    const promise = updateStoreInfo(editableInfo);
    await toast.promise(promise, {
      loading: '정보를 저장하는 중...',
      success: '성공적으로 저장되었습니다!',
      error: '저장 중 오류가 발생했습니다.',
    });
    setStoreInfo({ ...editableInfo });
  };

  const handleCancel = () => {
    if (storeInfo) setEditableInfo({ ...storeInfo });
  }

  // --- 렌더링 로직 ---
  if (loading) return <div className="customer-service-container centered-message"><p>고객센터 정보를 불러오는 중...</p></div>;
  if (error || !storeInfo || !editableInfo) return <div className="customer-service-container centered-message"><div className="info-error-card"><AlertTriangle size={40} className="error-icon" /><p>{error || '정보를 불러올 수 없습니다.'}</p></div></div>;

  return (
    <div className="customer-service-container">
      {isAdmin && hasChanges && (
        <div className="admin-edit-controls floating">
          <button className="admin-action-btn cancel" onClick={handleCancel} title="변경 내용 취소"><X size={16} /> 취소</button>
          <button className="admin-action-btn save" onClick={handleSave} title="변경 내용 저장"><Save size={16} /> 저장</button>
        </div>
      )}

      <section className="service-section quick-links">
        <div className="contact-buttons">
          <a
            href={storeInfo.kakaotalkChannelId ? `http://pf.kakao.com/${storeInfo.kakaotalkChannelId}/chat` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`contact-button primary ${!storeInfo.kakaotalkChannelId ? 'disabled' : ''}`}
            onClick={(e) => { if (!storeInfo.kakaotalkChannelId) e.preventDefault(); }}
          >
            <MessageSquare size={18} /> 카카오톡 1:1 문의
          </a>
        </div>
      </section>

      <div className="service-tabs">
        <button onClick={() => { startTransition(() => { setActiveTab('info'); }); }} className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}><MapPin size={16} /> 매장 정보</button>
        <button onClick={() => { startTransition(() => { setActiveTab('guide'); }); }} className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`}><BookOpen size={16} /> 이용 안내</button>
        <button onClick={() => { startTransition(() => { setActiveTab('faq'); }); }} className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}><HelpCircle size={16} /> 자주 묻는 질문</button>
      </div>

      <div className="service-content">
        {activeTab === 'info' && <InfoTab editableInfo={editableInfo} updateField={updateField} isAdmin={isAdmin} />}
        {activeTab === 'guide' && <GuideTab items={editableInfo.usageGuide || []} isAdmin={isAdmin} updateItem={updateGuideItem} addItem={addGuideItem} removeItem={removeGuideItem} />}
        {activeTab === 'faq' && <FaqTab items={editableInfo.faq || []} isAdmin={isAdmin} updateItem={updateFaqItem} addItem={addFaqItem} removeItem={removeFaqItem} />}
      </div>
    </div>
  );
};

export default CustomerCenterPage;