// src/components/admin/BulkActionBar.tsx

import React, { useState } from 'react';
import { useAdminBulkSelection } from '../../context/AdminBulkSelectionContext';
import { updateProductsStatus, deleteProducts } from '../../firebase';
import { CheckCircle, XCircle, Trash2, Loader } from 'lucide-react';
import './BulkActionBar.css';

interface BulkActionBarProps {
  onActionComplete: () => void;
}

const BulkActionBar: React.FC<BulkActionBarProps> = ({ onActionComplete }) => {
  const { selectedIds, clearSelection } = useAdminBulkSelection();
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (action: 'publish' | 'hide' | 'delete') => {
    if (selectedIds.length === 0) return;

    let confirmMessage = '';
    switch (action) {
      case 'publish':
        confirmMessage = `${selectedIds.length}개 상품을 게시하시겠습니까?`;
        break;
      case 'hide':
        confirmMessage = `${selectedIds.length}개 상품을 숨김 처리하시겠습니까?`;
        break;
      case 'delete':
        confirmMessage = `${selectedIds.length}개 상품을 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`;
        break;
    }

    if (window.confirm(confirmMessage)) {
      setIsLoading(true);
      try {
        if (action === 'publish') {
          await updateProductsStatus(selectedIds, true);
        } else if (action === 'hide') {
          await updateProductsStatus(selectedIds, false);
        } else if (action === 'delete') {
          await deleteProducts(selectedIds);
        }
        clearSelection();
        onActionComplete();
      } catch (error) {
        console.error(`${action} 작업 실패:`, error);
        alert('작업 처리 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="bulk-action-bar">
      <div className="selection-info">
        <strong>{selectedIds.length}개</strong> 항목 선택됨
        <button onClick={() => clearSelection()} className="clear-selection-btn">선택 해제</button>
      </div>
      <div className="actions">
        {isLoading ? (
          <div className="bulk-loader"><Loader className="spin" /> 처리 중...</div>
        ) : (
          <>
            <button onClick={() => handleAction('publish')} className="action-btn publish"><CheckCircle size={16} /> 게시</button>
            <button onClick={() => handleAction('hide')} className="action-btn hide"><XCircle size={16} /> 숨김</button>
            <button onClick={() => handleAction('delete')} className="action-btn delete"><Trash2 size={16} /> 삭제</button>
          </>
        )}
      </div>
    </div>
  );
};

export default BulkActionBar;