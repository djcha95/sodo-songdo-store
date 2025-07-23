// src/components/customer/FaqTab.tsx

import React, { useState } from 'react';
import type { FaqItem } from '@/types';
import { EditableField } from '@/components/common/EditableField';
import { ChevronDown, PlusCircle, XCircle } from 'lucide-react';

interface FaqTabProps {
  items: FaqItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof FaqItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

// ✅ [개선] FaqItemView 컴포넌트의 내부 구조를 명확한 클래스와 함께 재구성
const FaqItemView: React.FC<FaqItem> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`faq-item ${isOpen ? 'open' : ''}`}>
      <button className="faq-question-button" onClick={() => setIsOpen(!isOpen)}>
        <div className="faq-question-header">
          <span className="faq-icon-q">Q</span>
          <h3 className="faq-question-text">{question}</h3>
        </div>
        <ChevronDown className="faq-chevron-icon" size={24} />
      </button>
      {isOpen && (
        <div className="faq-answer-wrapper">
          <div className="faq-answer-header">
            <span className="faq-icon-a">A</span>
            <p className="faq-answer-text">{answer}</p>
          </div>
        </div>
      )}
    </div>
  );
};


const FaqTab: React.FC<FaqTabProps> = ({ items = [], isAdmin, updateItem, addItem, removeItem }) => {
  return (
    <section className="service-section faq-section">
      <div className="faq-list">
        {isAdmin
          ? items.map((item, index) => (
              <div key={item.id} className="editable-list-item">
                  <button className="delete-item-btn" onClick={() => removeItem(item.id)}><XCircle size={18}/></button>
                  <EditableField value={item.question} onSave={(v) => updateItem(index, 'question', v)} isAdmin={isAdmin} className="editable-list-title"/>
                  <EditableField value={item.answer} onSave={(v) => updateItem(index, 'answer', v)} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
              </div>
            ))
          : items.map(item => <FaqItemView key={item.id} {...item} />)
        }
      </div>
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> FAQ 추가</button>}
    </section>
  );
};

export default FaqTab;