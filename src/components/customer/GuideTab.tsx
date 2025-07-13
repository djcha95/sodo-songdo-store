// src/components/customer/GuideTab.tsx

import React from 'react';
import type { GuideItem } from '@/types';
import { EditableField } from '@/pages/customer/StoreInfoPage';
import { PlusCircle, XCircle } from 'lucide-react';

interface GuideTabProps {
  items: GuideItem[];
  isAdmin: boolean;
  updateArrayItem: (index: number, field: keyof GuideItem, value: string, arrayName: 'usageGuide') => void;
  addArrayItem: (arrayName: 'usageGuide') => void;
  removeArrayItem: (id: string, arrayName: 'usageGuide') => void;
}

const GuideTab: React.FC<GuideTabProps> = ({ items = [], isAdmin, updateArrayItem, addArrayItem, removeArrayItem }) => {
  return (
    <section className="service-section text-content-section">
      {items.map((guide, index) => (
          <div key={guide.id} className="editable-list-item">
              {isAdmin && <button className="delete-item-btn" onClick={() => removeArrayItem(guide.id, 'usageGuide')}><XCircle size={18}/></button>}
              <EditableField value={guide.title} onSave={(v) => updateArrayItem(index, 'title', v, 'usageGuide')} isAdmin={isAdmin} className="editable-list-title"/>
              <EditableField value={guide.content} onSave={(v) => updateArrayItem(index, 'content', v, 'usageGuide')} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
          </div>
      ))}
      {isAdmin && <button className="add-array-item-btn" onClick={() => addArrayItem('usageGuide')}><PlusCircle size={16}/> 이용 안내 추가</button>}
    </section>
  );
};

export default GuideTab;