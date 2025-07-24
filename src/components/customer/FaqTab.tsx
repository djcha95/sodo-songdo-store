// src/components/customer/FaqTab.tsx

import React, { useState } from 'react';
import type { FaqItem } from '@/types';
import { ChevronDown, PlusCircle, Pencil, Check, X } from 'lucide-react';
import { Disclosure } from '@headlessui/react';
import './FaqTab.css';

interface FaqTabProps {
  items: FaqItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof FaqItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

const FaqItemView: React.FC<FaqItem & { index: number; isAdmin: boolean; updateItem: FaqTabProps['updateItem'] }> = ({ id, question, answer, index, isAdmin, updateItem }) => {
  // ✅ [개선] FAQ 항목의 수정 모드를 관리하는 state
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
        // --- 수정 모드 UI ---
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
                  <p className="faq-answer-text">{answer}</p>
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