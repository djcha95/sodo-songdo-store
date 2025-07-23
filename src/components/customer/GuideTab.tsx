// src/components/customer/GuideTab.tsx

import React from 'react';
import type { GuideItem } from '@/types';
import { EditableField } from '@/components/common/EditableField';
import { PlusCircle, XCircle } from 'lucide-react';

interface GuideTabProps {
  items: GuideItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof GuideItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

const GuideTab: React.FC<GuideTabProps> = ({ items = [], isAdmin, updateItem, addItem, removeItem }) => {
  return (
    <section className="service-section text-content-section">
      {isAdmin ? (
        items.map((guide, index) => (
            <div key={guide.id} className="editable-list-item">
                <button className="delete-item-btn" onClick={() => removeItem(guide.id)}><XCircle size={18}/></button>
                <EditableField value={guide.title} onSave={(v) => updateItem(index, 'title', v)} isAdmin={isAdmin} className="editable-list-title"/>
                <EditableField value={guide.content} onSave={(v) => updateItem(index, 'content', v)} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
            </div>
        ))
      ) : (
        // ✅ [개선] 사용자에게 보여지는 UI를 가독성 좋은 구조로 변경
        <div className="guide-view-container">
          {items.map(guide => (
            <div key={guide.id} className="guide-item-view">
              <h3 className="guide-item-title">{guide.title}</h3>
              <p className="guide-item-content">{guide.content}</p>
            </div>
          ))}
        </div>
      )}
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> 이용 안내 추가</button>}
    </section>
  );
};

export default GuideTab;