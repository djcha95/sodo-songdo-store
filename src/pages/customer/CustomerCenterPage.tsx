// src/pages/customer/CustomerCenterPage.tsx

import React, { useEffect, useState, useCallback, startTransition } from 'react';
import { getStoreInfo, updateStoreInfo } from '@/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext'; // ✅ [추가]
import { customerCenterTourSteps } from '@/components/customer/AppTour'; // ✅ [추가]
import type { StoreInfo, GuideItem, FaqItem } from '@/types';
// ✅ [수정] Users 아이콘 추가
import { AlertTriangle, MapPin, BookOpen, HelpCircle, Save, X, MessageSquare, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import InfoTab from '@/components/customer/InfoTab';
import GuideTab from '@/components/customer/GuideTab';
import FaqTab from '@/components/customer/FaqTab';
import isEqual from 'lodash/isEqual';
import './CustomerCenterPage.css';

const defaultUsageGuide: GuideItem[] = [
  {
    id: uuidv4(),
    title: '✨ 신뢰도 포인트 시스템 안내',
    content: `저희 소도몰은 고객님과의 신뢰를 가장 중요하게 생각합니다.\n\n고객님의 활동(정상 픽업, 로그인, 친구 초대 등)에 따라 신뢰도 포인트가 적립되며, 누적된 포인트에 따라 '공구의 신'부터 '새싹'까지 6단계의 등급이 부여됩니다.\n\n높은 등급의 고객님께는 '시크릿 상품 구매', '선주문' 등 특별한 혜택이 제공됩니다.\n\n반대로, 예약 후 픽업하지 않는 '노쇼(No-Show)' 발생 시 포인트가 크게 차감되며, 등급에 따라 '선입금 필수' 또는 '참여 제한' 등의 페널티가 적용될 수 있으니 신중한 예약을 부탁드립니다.`
  },
  {
    id: uuidv4(),
    title: '🎁 친구 초대 리워드 프로그램',
    content: `소도몰을 친구에게 추천하고 함께 포인트를 받아보세요!\n\n1. 마이페이지에서 나의 고유 초대 코드를 복사합니다.\n2. 친구에게 코드를 공유하고, 친구가 회원가입 시 해당 코드를 입력합니다.\n3. 친구가 가입 즉시 +30P, 추천인은 친구가 '첫 픽업'을 완료하는 시점에 +30P를 받게 됩니다.\n\n*신규 가입자는 가입 후 한 번만 추천인 코드를 입력할 수 있습니다.`
  },
];

const defaultFaq: FaqItem[] = [
  {
    id: uuidv4(),
    question: '포인트는 어떻게 얻을 수 있나요?',
    answer: '포인트는 정상적인 상품 픽업 완료 시, 매일 첫 로그인 시, 친구 초대 성공 시 등 다양한 활동을 통해 적립됩니다. 자세한 정책은 이용 안내를 참고해주세요.'
  },
  {
    id: uuidv4(),
    question: '포인트는 언제 소멸되나요?',
    answer: '획득한 포인트는 1년(365일)간 유효합니다. 매일 자정, 획득한 지 1년이 지난 포인트는 자동으로 소멸되니 기간 내에 사용하시는 것을 권장합니다.'
  },
  {
    id: uuidv4(),
    question: '품절된 상품의 대기 순번을 올릴 수 있나요?',
    answer: '네, 가능합니다. 마이페이지의 \'대기 목록\'에서 50 포인트를 사용하여 \'대기 순번 상승권\'을 사용하면 해당 상품의 대기 순번을 가장 위로 올릴 수 있습니다. 만약 재고가 확보되지 않아 최종 구매에 실패할 경우, 사용했던 50 포인트는 자동으로 환불됩니다.'
  },
  {
    id: uuidv4(),
    question: '주문 취소는 언제까지 가능한가요?',
    answer: '주문 취소 정책은 상품의 재고 유형(한정/무제한)과 공동구매 마감일에 따라 다릅니다. \'마이페이지 > 예약 내역\'에서 각 주문별 현재 취소 가능 상태(자유 취소/신중 취소/취소 불가)를 직접 확인하실 수 있습니다.'
  }
];

const CustomerCenterPage: React.FC = () => {
  const { isAdmin, userDocument } = useAuth(); // ✅ [수정] userDocument 추가
  const { runPageTourIfFirstTime } = useTutorial(); // ✅ [추가]
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [editableInfo, setEditableInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'guide' | 'faq'>('info');

  const hasChanges = !isEqual(storeInfo, editableInfo);

  // ✅ [추가] 페이지 첫 방문 시 튜토리얼 자동 실행
  useEffect(() => {
    if (userDocument?.hasCompletedTutorial) {
      runPageTourIfFirstTime('hasSeenCustomerCenterPage', customerCenterTourSteps);
    }
  }, [userDocument, runPageTourIfFirstTime]);

  // 데이터 로딩 및 관리 로직 (기존과 동일)
  const fetchStoreInformation = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedInfo = await getStoreInfo();
      const initialInfo: StoreInfo = fetchedInfo || {
        name: '소도몰 (SodoMall)', businessNumber: '123-45-67890', representative: '홍길동',
        address: '온라인 기반 매장입니다.', phoneNumber: '010-1234-5678', email: 'contact@sodomall.com',
        operatingHours: ['평일: 10:00 - 18:00', '주말 및 공휴일 휴무'],
        description: '신뢰 기반의 즐거운 공동구매 커뮤니티', kakaotalkChannelId: '_xotxje',
        usageGuide: defaultUsageGuide, faq: defaultFaq, latitude: undefined, longitude: undefined,
      };
      if (!initialInfo.usageGuide || initialInfo.usageGuide.length === 0) initialInfo.usageGuide = defaultUsageGuide;
      if (!initialInfo.faq || initialInfo.faq.length === 0) initialInfo.faq = defaultFaq;
      setStoreInfo(initialInfo);
      setEditableInfo({ ...initialInfo });
    } catch (err) {
      console.error("매장 정보 불러오기 오류:", err);
      setError("매장 정보를 불러오는 데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStoreInformation(); }, [fetchStoreInformation]);

  const updateField = useCallback((field: keyof StoreInfo, value: any) => { setEditableInfo(prev => prev ? { ...prev, [field]: value } : null); }, []);
  const updateGuideItem = useCallback((index: number, field: keyof GuideItem, value: string) => { setEditableInfo(prev => { if (!prev) return null; const newGuide = [...(prev.usageGuide || [])]; if (newGuide[index]) { newGuide[index] = { ...newGuide[index], [field]: value }; } return { ...prev, usageGuide: newGuide }; }); }, []);
  const addGuideItem = useCallback(() => { const newId = uuidv4(); setEditableInfo(prev => prev ? { ...prev, usageGuide: [...(prev.usageGuide || []), { id: newId, title: '새로운 안내', content: '내용을 입력하세요.' }] } : null); }, []);
  const removeGuideItem = useCallback((id: string) => { setEditableInfo(prev => prev ? { ...prev, usageGuide: (prev.usageGuide || []).filter(item => item.id !== id) } : null); }, []);
  const updateFaqItem = useCallback((index: number, field: keyof FaqItem, value: string) => { setEditableInfo(prev => { if (!prev) return null; const newFaq = [...(prev.faq || [])]; if (newFaq[index]) { newFaq[index] = { ...newFaq[index], [field]: value }; } return { ...prev, faq: newFaq }; }); }, []);
  const addFaqItem = useCallback(() => { const newId = uuidv4(); setEditableInfo(prev => prev ? { ...prev, faq: [...(prev.faq || []), { id: newId, question: '새로운 질문', answer: '답변을 입력하세요.' }] } : null); }, []);
  const removeFaqItem = useCallback((id: string) => { setEditableInfo(prev => prev ? { ...prev, faq: (prev.faq || []).filter(item => item.id !== id) } : null); }, []);
  const handleSave = async () => { if (!editableInfo) return; const promise = updateStoreInfo(editableInfo); await toast.promise(promise, { loading: '정보를 저장하는 중...', success: '성공적으로 저장되었습니다!', error: '저장 중 오류가 발생했습니다.', }); setStoreInfo({ ...editableInfo }); };
  const handleCancel = () => { if (storeInfo) setEditableInfo({ ...storeInfo }); }

  if (loading) return <div className="customer-center-page centered-message"><p>고객센터 정보를 불러오는 중...</p></div>;
  if (error || !storeInfo || !editableInfo) return <div className="customer-center-page centered-message"><div className="info-error-card"><AlertTriangle size={40} className="error-icon" /><p>{error || '정보를 불러올 수 없습니다.'}</p></div></div>;

  return (
    <div className="customer-center-page">
      <div className="customer-center-scrollable-content">
        {isAdmin && hasChanges && (
          <div className="admin-edit-controls floating">
            <button className="admin-action-btn cancel" onClick={handleCancel} title="변경 내용 취소"><X size={16} /> 취소</button>
            <button className="admin-action-btn save" onClick={handleSave} title="변경 내용 저장"><Save size={16} /> 저장</button>
          </div>
        )}

        <section className="service-section quick-links" data-tutorial-id="customer-center-quick-links"> {/* ✅ [추가] data-tutorial-id */}
          <div className="contact-buttons">
            {/* ✅ [추가] 카카오톡 채널 바로가기 버튼 */}
            <a
              href={storeInfo.kakaotalkChannelId ? `http://pf.kakao.com/${storeInfo.kakaotalkChannelId}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`contact-button primary ${!storeInfo.kakaotalkChannelId ? 'disabled' : ''}`}
              onClick={(e) => { if (!storeInfo.kakaotalkChannelId) e.preventDefault(); }}
            >
              <Users size={18} /> 채널 바로가기
            </a>
            <a
              href={storeInfo.kakaotalkChannelId ? `http://pf.kakao.com/${storeInfo.kakaotalkChannelId}/chat` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`contact-button primary ${!storeInfo.kakaotalkChannelId ? 'disabled' : ''}`}
              onClick={(e) => { if (!storeInfo.kakaotalkChannelId) e.preventDefault(); }}
            >
              <MessageSquare size={18} /> 1:1 문의
            </a>
          </div>
        </section>

        <div className="service-tabs" data-tutorial-id="customer-center-tabs"> {/* ✅ [추가] data-tutorial-id */}
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
    </div>
  );
};

export default CustomerCenterPage;