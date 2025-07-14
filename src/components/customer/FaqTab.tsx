// src/components/customer/FaqTab.tsx

import React, { useState } from 'react';
import type { FaqItem } from '@/types';
// ✅ [수정] EditableField 컴포넌트의 import 경로를 올바르게 수정합니다.
import { EditableField } from '@/components/common/EditableField';
import { ChevronDown, PlusCircle, XCircle } from 'lucide-react';

// ✅ [수정] Props 인터페이스를 간소화합니다.
interface FaqTabProps {
  items: FaqItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof FaqItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

interface FaqItemViewProps {
  question: string;
  answer: React.ReactNode;
}

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


const FaqTab: React.FC<FaqTabProps> = ({ items = [], isAdmin, updateItem, addItem, removeItem }) => {
  return (
    <section className="service-section faq-section">
      {isAdmin
        ? items.map((item, index) => (
            <div key={item.id} className="editable-list-item">
                <button className="delete-item-btn" onClick={() => removeItem(item.id)}><XCircle size={18}/></button>
                {/* ✅ [수정] onSave 핸들러에서 새로운 updateItem 함수를 사용합니다. */}
                <EditableField value={item.question} onSave={(v) => updateItem(index, 'question', v)} isAdmin={isAdmin} className="editable-list-title"/>
                <EditableField value={item.answer} onSave={(v) => updateItem(index, 'answer', v)} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
            </div>
          ))
        : items.map(item => <FaqItemView key={item.id} question={item.question} answer={item.answer} />)
      }
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> FAQ 추가</button>}
    </section>
  );
};

export default FaqTab;