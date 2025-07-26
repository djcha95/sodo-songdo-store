// src/components/customer/GuideTab.tsx

import React, { useState, Fragment } from 'react'; // Fragment 추가
import type { GuideItem } from '@/types';
import { PlusCircle } from 'lucide-react';
import './GuideTab.css';

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
          <p key={lineIndex} className="paragraph-item">
            {line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) => 
              part.startsWith('**') ? 
              <strong key={partIndex}>{part.slice(2, -2)}</strong> : 
              <Fragment key={partIndex}>{part}</Fragment>
            )}
          </p>
        );
      })}
    </>
  );
};


interface GuideTabProps {
  items: GuideItem[];
  isAdmin: boolean;
  updateItem: (index: number, field: keyof GuideItem, value: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
}

const GuideTab: React.FC<GuideTabProps> = ({ items = [], isAdmin, updateItem, addItem }) => {
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'content' } | null>(null);

  const handleSave = (index: number, field: keyof GuideItem, value: string) => {
    updateItem(index, field, value);
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, field: keyof GuideItem) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
            {/* --- 제목 영역 (기존과 동일) --- */}
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
              // ✅ [수정] p 태그 대신 FormattedContent 컴포넌트를 사용하여 렌더링
              <div
                className={`guide-item-content ${isAdmin ? 'editable' : ''}`}
                onClick={() => isAdmin && setEditing({ id: guide.id, field: 'content' })}
              >
                <FormattedContent text={guide.content} />
              </div>
            )}
          </div>
        ))}
      </div>
      {isAdmin && <button className="add-array-item-btn" onClick={addItem}><PlusCircle size={16}/> 이용 안내 추가</button>}
    </section>
  );
};

export default GuideTab;