// src/components/customer/FaqTab.tsx

import React, { useState, Fragment } from 'react';
import type { FaqItem } from '@/types';
import { ChevronDown, PlusCircle, Pencil, Check, X } from 'lucide-react';
import { Disclosure } from '@headlessui/react';
import './FaqTab.css';

const FormattedContent: React.FC<{ text: string }> = ({ text = '' }) => {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        if (line.trim().startsWith('- ')) {
          return (
            <div key={lineIndex} className="list-item">
              <span className="list-bullet">•</span>
              <span className="list-text">
                {line.substring(2).split(/(\*\*.*?\*\*)/g).map((part, partIndex) => 
                  part.startsWith('**') ? 
                  <strong key={partIndex}>{part.slice(2, -2)}</strong> : 
                  <Fragment key={partIndex}>{part}</Fragment>
                )}
              </span>
            </div>
          );
        }
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

const FaqItemView: React.FC<FaqItem & { index: number; isAdmin: boolean; updateItem: FaqTabProps['updateItem'] }> = ({  question, answer, index, isAdmin, updateItem }) => {
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
        <Disclosure as="div" className="faq-item">
          {({ open }) => (
            <>
              {/* ✅ [수정 1] 바깥쪽 버튼을 div로 변경하여 버튼 중첩 오류를 해결합니다. */}
              <Disclosure.Button as="div" className="faq-question-button">
                <div className="faq-question-header">
                  <span className="faq-icon-q">Q</span>
                  <h3 className="faq-question-text">{question}</h3>
                </div>
                <div className="faq-actions">
                  {isAdmin && (
                    // ✅ [수정 2] 수정 버튼 클릭 시 이벤트 버블링을 막아, FAQ가 펼쳐지는 현상을 방지합니다.
                    <button className="edit-icon-btn" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                      <Pencil size={16} />
                    </button>
                  )}
                  <ChevronDown className={`faq-chevron-icon ${open ? 'open' : ''}`} size={22} />
                </div>
              </Disclosure.Button>

              <Disclosure.Panel as="div" className="faq-answer-wrapper">
                <div className="faq-answer-header">
                  <span className="faq-icon-a">A</span>
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

const FaqTab: React.FC<FaqTabProps> = ({ items = [], isAdmin, updateItem, addItem }) => {  return (
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