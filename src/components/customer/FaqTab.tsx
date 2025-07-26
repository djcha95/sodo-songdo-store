// src/components/customer/FaqTab.tsx

import React, { useState, Fragment } from 'react'; // Fragment 추가
import type { FaqItem } from '@/types';
import { ChevronDown, PlusCircle, Pencil, Check, X } from 'lucide-react';
import { Disclosure } from '@headlessui/react';
import './FaqTab.css';

// ✅ [추가] 서식을 렌더링하기 위한 헬퍼 컴포넌트
const FormattedContent: React.FC<{ text: string }> = ({ text = '' }) => {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        // `- `로 시작하는 줄을 목록 아이템으로 처리
        if (line.trim().startsWith('- ')) {
          return (
            <div key={lineIndex} className="list-item">
              <span className="list-bullet">•</span>
              <span className="list-text">
                {/* `**`를 기준으로 텍스트를 분리하여 strong 태그 적용 */}
                {line.substring(2).split(/(\*\*.*?\*\*)/g).map((part, partIndex) => 
                  part.startsWith('**') ? 
                  <strong key={partIndex}>{part.slice(2, -2)}</strong> : 
                  <Fragment key={partIndex}>{part}</Fragment>
                )}
              </span>
            </div>
          );
        }
        // 일반 텍스트 문단 처리
        return (
          <div key={lineIndex} className="paragraph-item">
            {line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) => 
              part.startsWith('**') ? 
              <strong key={partIndex}>{part.slice(2, -2)}</strong> : 
              <Fragment key={partIndex}>{part}</Fragment>
            )}
          </div>
        );
      })}
    </>
  );
};


interface FaqTabProps {
  items: FaqItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof FaqItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

const FaqItemView: React.FC<FaqItem & { index: number; isAdmin: boolean; updateItem: FaqTabProps['updateItem'] }> = ({ id, question, answer, index, isAdmin, updateItem }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState(question);
  const [editedAnswer, setEditedAnswer] = useState(answer);

  const handleSave = () => {
    updateItem(index, 'question', editedQuestion);
    updateItem(index, 'answer', editedAnswer);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedQuestion(question);
    setEditedAnswer(answer);
    setIsEditing(false);
  };

  return (
    <div className="faq-item-wrapper">
      {isEditing ? (
        // --- 수정 모드 UI (기존과 동일) ---
        <div className="faq-item-edit-view">
          <div className="faq-edit-field">
            <label>질문</label>
            <input value={editedQuestion} onChange={(e) => setEditedQuestion(e.target.value)} />
          </div>
          <div className="faq-edit-field">
            <label>답변</label>
            <textarea value={editedAnswer} onChange={(e) => setEditedAnswer(e.target.value)} rows={4} />
          </div>
          <div className="faq-edit-actions">
            <button onClick={handleCancel} className="cancel-btn"><X size={16} /> 취소</button>
            <button onClick={handleSave} className="save-btn"><Check size={16} /> 저장</button>
          </div>
        </div>
      ) : (
        // --- 일반 보기 UI ---
        <Disclosure as="div" className="faq-item">
          {({ open }) => (
            <>
              <Disclosure.Button className="faq-question-button">
                <div className="faq-question-header">
                  <span className="faq-icon-q">Q</span>
                  <h3 className="faq-question-text">{question}</h3>
                </div>
                <div className="faq-actions">
                  {isAdmin && (
                    <button className="edit-icon-btn" onClick={(e) => { e.preventDefault(); setIsEditing(true); }}>
                      <Pencil size={16} />
                    </button>
                  )}
                  <ChevronDown className={`faq-chevron-icon ${open ? 'open' : ''}`} size={22} />
                </div>
              </Disclosure.Button>

              <Disclosure.Panel as="div" className="faq-answer-wrapper">
                <div className="faq-answer-header">
                  <span className="faq-icon-a">A</span>
                   {/* ✅ [수정] p 태그 대신 FormattedContent 컴포넌트를 사용하여 렌더링 */}
                  <div className="faq-answer-text">
                    <FormattedContent text={answer} />
                  </div>
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
      )}
    </div>
  );
};

const FaqTab: React.FC<FaqTabProps> = ({ items = [], isAdmin, updateItem, addItem, removeItem }) => {
  return (
    <section className="service-section faq-section">
      <div className="faq-list">
        {items.map((item, index) => (
          <FaqItemView key={item.id} {...item} index={index} isAdmin={isAdmin} updateItem={updateItem} />
        ))}
      </div>
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> FAQ 추가</button>}
    </section>
  );
};

export default FaqTab;