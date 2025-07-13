// src/components/customer/FaqTab.tsx

import React, { useState } from 'react';
import type { FaqItem } from '@/types';
import { EditableField } from '@/pages/customer/StoreInfoPage';
import { ChevronDown, PlusCircle, XCircle } from 'lucide-react';

interface FaqTabProps {
  items: FaqItem[];
  isAdmin: boolean;
  updateArrayItem: (index: number, field: keyof FaqItem, value: string, arrayName: 'faq') => void;
  addArrayItem: (arrayName: 'faq') => void;
  removeArrayItem: (id: string, arrayName: 'faq') => void;
}

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


const FaqTab: React.FC<FaqTabProps> = ({ items = [], isAdmin, updateArrayItem, addArrayItem, removeArrayItem }) => {
  return (
    <section className="service-section faq-section">
      {isAdmin
        ? items.map((item, index) => (
            <div key={item.id} className="editable-list-item">
                {isAdmin && <button className="delete-item-btn" onClick={() => removeArrayItem(item.id, 'faq')}><XCircle size={18}/></button>}
                <EditableField value={item.question} onSave={(v) => updateArrayItem(index, 'question', v, 'faq')} isAdmin={isAdmin} className="editable-list-title"/>
                <EditableField value={item.answer} onSave={(v) => updateArrayItem(index, 'answer', v, 'faq')} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
            </div>
          ))
        : items.map(item => <FaqItemView key={item.id} question={item.question} answer={item.answer} />)
      }
      {isAdmin && <button className="add-array-item-btn" onClick={() => addArrayItem('faq')}><PlusCircle size={16}/> FAQ 추가</button>}
    </section>
  );
};

export default FaqTab;