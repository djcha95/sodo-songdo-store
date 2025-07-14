// src/components/customer/GuideTab.tsx

import React from 'react';
import type { GuideItem } from '@/types';
// ✅ [수정] EditableField 컴포넌트의 import 경로를 올바르게 수정합니다.
import { EditableField } from '@/components/common/EditableField';
import { PlusCircle, XCircle } from 'lucide-react';

// ✅ [수정] Props 인터페이스를 간소화합니다.
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
                {/* ✅ [수정] onSave 핸들러에서 새로운 updateItem 함수를 사용합니다. */}
                <EditableField value={guide.title} onSave={(v) => updateItem(index, 'title', v)} isAdmin={isAdmin} className="editable-list-title"/>
                <EditableField value={guide.content} onSave={(v) => updateItem(index, 'content', v)} isAdmin={isAdmin} as="textarea" className="editable-list-content"/>
            </div>
        ))
      ) : (
        items.map(guide => (
          <div key={guide.id}>
            <h3>{guide.title}</h3>
            <p>{guide.content}</p>
          </div>
        ))
      )}
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> 이용 안내 추가</button>}
    </section>
  );
};

export default GuideTab;