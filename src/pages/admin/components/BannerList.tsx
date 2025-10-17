// src/pages/admin/components/BannerList.tsx

import React from 'react';
import type { Banner } from '../../../root-types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Edit3, Trash2, ToggleRight, ToggleLeft, GripVertical, Calendar } from 'lucide-react';

interface BannerItemProps {
  banner: Banner;
  isCurrent: boolean;
  onEdit: (banner: Banner) => void;
  onDelete: (id: string) => void;
  onToggleActive: (banner: Banner) => void;
}

const BannerItem: React.FC<BannerItemProps> = ({ banner, isCurrent, onEdit, onDelete, onToggleActive }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 'auto',
  };

  // ✅ [수정] 데이터가 객체여도 오류가 나지 않도록 안전하게 문자열로 변환합니다.
  const displayOrder = String(banner.order ?? 'N/A');
  const displayLink = String(banner.linkTo ?? '링크 없음');
  
  // ✅ [추가] Timestamp 객체를 안전하게 날짜 문자열로 변환하는 함수
  const formatDate = (timestamp: any) => {
    // timestamp가 toDate 메서드를 가진 객체인지 확인
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    // 그렇지 않으면, 받은 값 그대로 문자열로 변환 (오류 방지)
    return String(timestamp ?? '날짜 없음');
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`banner-item ${!banner.isActive ? 'inactive' : ''} ${isCurrent ? 'editing' : ''}`}
    >
      <div className="drag-handle" {...attributes} {...listeners}>
        <GripVertical size={20} />
      </div>
      <div className="banner-thumbnail-wrapper">
        <img src={banner.imageUrl} alt={`배너 ${displayOrder}`} className="banner-thumbnail" />
        {!banner.isActive && <div className="inactive-overlay"><span>비활성</span></div>}
      </div>
      <div className="banner-info">
        <p><strong className="banner-list-order">순서: {displayOrder}</strong></p>
        <p className="banner-list-link" title={displayLink}>링크: {displayLink}</p>
        {/* ✅ [추가] 생성일자 표시 */}
        <p className="banner-list-date">
          <Calendar size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }}/>
          {formatDate(banner.createdAt)}
        </p>
      </div>
      <div className="banner-actions">
        <button
          onClick={() => onToggleActive(banner)}
          className={`action-button toggle-active-button ${banner.isActive ? 'deactivate' : 'activate'}`}
          title={banner.isActive ? '비활성화' : '배너 활성화'}
        >
          {banner.isActive ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
          <span>{banner.isActive ? '비활성화' : '활성화'}</span>
        </button>
        <button
          onClick={() => onEdit(banner)}
          className="action-button edit-button"
          title="배너 수정"
        >
          <Edit3 size={16} /><span>수정</span>
        </button>
        <button
          onClick={() => onDelete(banner.id)}
          className="action-button delete-button"
          title="배너 삭제"
        >
          <Trash2 size={16} /><span>삭제</span>
        </button>
      </div>
    </li>
  );
};


// BannerList 컴포넌트
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface BannerListProps {
  banners: Banner[];
  currentBannerId: string | null;
  onEdit: (banner: Banner) => void;
  onDelete: (id: string) => void;
  onToggleActive: (banner: Banner) => void;
  onReorder: (activeId: string, overId: string | null) => void;
}

const BannerList: React.FC<BannerListProps> = ({ banners = [], currentBannerId, onEdit, onDelete, onToggleActive, onReorder }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이상 움직여야 드래그 시작
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  return (
    <div className="banner-list-section section-card">
      <h3>
        등록된 배너 목록
        <span className="list-guide"> (드래그하여 순서 변경 가능)</span>
      </h3>
      {banners.length === 0 ? (
        <p>등록된 배너가 없습니다.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={banners.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <ul className="banner-list">
              {banners.map((banner) => (
                <BannerItem
                  key={banner.id}
                  banner={banner}
                  isCurrent={currentBannerId === banner.id}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleActive={onToggleActive}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default BannerList;