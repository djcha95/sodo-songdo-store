// src/components/customer/GuideTab.tsx

import React, { useState, useCallback } from 'react';
import type { GuideItem } from '@/types';
import { PlusCircle } from 'lucide-react';
import './GuideTab.css';

interface GuideTabProps {
  items: GuideItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof GuideItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

const GuideTab: React.FC<GuideTabProps> = ({ items = [], isAdmin, updateItem, addItem, removeItem }) => {
  // ✅ [개선] 현재 수정 중인 항목의 ID와 필드를 추적하는 state
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'content' } | null>(null);

  // ✅ [개선] 변경 사항을 저장하고 수정 모드를 종료하는 함수
  const handleSave = (index: number, field: keyof GuideItem, value: string) => {
    updateItem(index, field, value);
    setEditing(null);
  };

  // ✅ [개선] Enter 키로 저장, Esc 키로 취소하는 키보드 이벤트 핸들러
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, field: keyof GuideItem) => {
    if (e.key === 'Enter' && !e.shiftKey) { // textarea에서 Shift+Enter는 줄바꿈이므로 제외
      e.preventDefault();
      handleSave(index, field, e.currentTarget.value);
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  };

  return (
    <section className="service-section text-content-section">
      <div className="guide-view-container">
        {items.map((guide, index) => (
          <div key={guide.id} className="guide-item-view">
            {/* --- 제목 영역 --- */}
            {isAdmin && editing?.id === guide.id && editing?.field === 'title' ? (
              <input
                type="text"
                defaultValue={guide.title}
                onBlur={(e) => handleSave(index, 'title', e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index, 'title')}
                className="guide-item-title-edit"
                autoFocus
              />
            ) : (
              <h3
                className={`guide-item-title ${isAdmin ? 'editable' : ''}`}
                onClick={() => isAdmin && setEditing({ id: guide.id, field: 'title' })}
              >
                {guide.title}
              </h3>
            )}

            {/* --- 내용 영역 --- */}
            {isAdmin && editing?.id === guide.id && editing?.field === 'content' ? (
              <textarea
                defaultValue={guide.content}
                onBlur={(e) => handleSave(index, 'content', e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index, 'content')}
                className="guide-item-content-edit"
                autoFocus
                rows={5}
              />
            ) : (
              <p
                className={`guide-item-content ${isAdmin ? 'editable' : ''}`}
                onClick={() => isAdmin && setEditing({ id: guide.id, field: 'content' })}
              >
                {guide.content}
              </p>
            )}
          </div>
        ))}
      </div>
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> 이용 안내 추가</button>}
    </section>
  );
};

export default GuideTab;